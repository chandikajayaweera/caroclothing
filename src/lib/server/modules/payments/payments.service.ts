import {
	and,
	count,
	desc,
	eq,
	exists,
	gt,
	inArray,
	isNotNull,
	isNull,
	sql,
	type SQL
} from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import {
	guardBatchCondition,
	guardPreviousBatchChanges,
	isD1BatchGuardError
} from '$lib/server/db/batch';
import {
	isTransientD1Error,
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation,
	withTransientD1WriteRetry
} from '$lib/server/db/retry';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import { getEnv } from '$lib/server/infrastructure/env';
import {
	ErrorCode,
	PaymentError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import type { ServiceActor, ServiceContext } from '$lib/server/foundation/context';
import {
	resolveNow,
	removeUndefinedValues,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset
} from '$lib/server/foundation/utils';
import {
	payment as paymentTable,
	paymentAttempt as paymentAttemptTable,
	paymentWebhookLog as paymentWebhookLogTable,
	insertPaymentSchema,
	updatePaymentSchema,
	CHECKOUT_PAYMENT_METHODS,
	type Payment,
	type PaymentAttempt,
	type PaymentAttemptStatus,
	type NewPaymentAttempt,
	type PaymentMethod,
	type NewPayment,
	type PaymentStatus
} from './payments.drizzle';
import { bag as bagTable } from '../bag/bag.drizzle';
import { user as userTable } from '../auth/auth.drizzle';
import { order as orderTable, type Order, type OrderStatus } from '../orders/orders.drizzle';
import {
	prepareConfirmedOrderFromBag,
	prepareOrderConfirmationNotificationInserts,
	prepareOrderStatusTransition,
	previewOrderFromBag
} from '../orders/orders.service';
import {
	prepareNotificationOutboxInsert,
	publishPreparedNotificationWakeups,
	type PreparedNotificationOutboxInsert
} from '../notifications/outbox/outbox.service';
import {
	createPayPalFxQuote as buildPayPalFxQuote,
	decideCapturedOrderAction,
	generatePayHereCheckoutHash,
	getGatewayMetadata,
	getManualReviewReason,
	mapPayHereStatus,
	mergeGatewayEnvelope,
	resolvePublicPaymentEmail,
	sanitizePayHereWebhookPayload,
	verifyPayHereWebhookSignature,
	type GatewayMetadata,
	type PayPalFxQuote
} from './payments.logic';
import type {
	CapturePayPalPaymentInput,
	CheckoutPaymentAttemptDTO,
	CheckoutPaymentMethodDTO,
	CreateCheckoutPaymentSessionInput,
	CreateCheckoutPaymentSessionResult,
	PaymentDTO,
	CreatePaymentSessionInput,
	CreatePaymentSessionResult,
	PaymentDashboardSummaryDTO,
	PaymentDashboardDTO,
	PaymentGatewayResult,
	PaymentAttemptCheckoutInput,
	ProcessPayHereWebhookInput,
	ValidateCheckoutPaymentSelectionInput,
	ValidatedCheckoutPaymentSelection,
	ListPaymentsOptions,
	PaymentListResult,
	RecordPaymentInput,
	RecordRefundInput
} from './payments.types';

type Db = ReturnType<typeof getDb>;
export type PaymentsTx = Db;
export type PaymentsBatchItem = Parameters<Db['batch']>[0][number];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const PAYMENT_PROVIDER_TIMEOUT_MS = 10_000;
const PAYMENT_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const checkoutPaymentMethodSet = new Set<string>(CHECKOUT_PAYMENT_METHODS);

// ---------------------------------------------------------------------------
// CORE EXPORTS
// ---------------------------------------------------------------------------

export function prepareAccountPaymentAnonymization(
	db: PaymentsTx,
	input: { userId: string; now?: Date }
): readonly [PaymentsBatchItem, PaymentsBatchItem] {
	const userId = normalizeGatewayId(input.userId, 'userId');
	const now = input.now ?? new Date();
	const accountOrderIds = db
		.select({ id: orderTable.id })
		.from(orderTable)
		.where(eq(orderTable.userId, userId));
	const cancellable = eq(paymentAttemptTable.status, 'pending');

	return [
		db
			.update(paymentAttemptTable)
			.set({
				userId: sql<string>`'[deleted-account]:' || ${paymentAttemptTable.id}`,
				bagId: sql<string>`'[deleted-account]:' || ${paymentAttemptTable.id}`,
				status: sql<PaymentAttemptStatus>`CASE
					WHEN ${cancellable} THEN 'cancelled'
					ELSE ${paymentAttemptTable.status}
				END`,
				checkoutInput: sql<Record<string, true>>`json('{"redacted":true}')`,
				billingEmail: null,
				providerResponse: null,
				failureReason: sql<string | null>`CASE
					WHEN ${cancellable} THEN 'Account deleted before payment completed.'
					ELSE ${paymentAttemptTable.failureReason}
				END`,
				updatedAt: now
			})
			.where(eq(paymentAttemptTable.userId, userId)),
		db
			.update(paymentTable)
			.set({
				gatewayResponse: null,
				updatedAt: now
			})
			.where(inArray(paymentTable.orderId, accountOrderIds))
	];
}

export function listAvailableCheckoutPaymentMethods(
	ctx: ServiceContext
): CheckoutPaymentMethodDTO[] {
	void ctx;
	const env = getEnv();
	const methods: CheckoutPaymentMethodDTO[] = [];

	if (hasPayHereConfiguration(env)) {
		methods.push({
			id: 'payhere',
			title: 'Credit or debit card',
			description: 'Continue to PayHere and pay securely in LKR.',
			kind: 'online',
			badge: 'Recommended',
			requiresBillingEmail: true
		});
	}

	methods.push({
		id: 'cash_on_delivery',
		title: 'Cash on delivery',
		description: 'Your order is confirmed now. Pay in cash when it arrives.',
		kind: 'offline',
		requiresBillingEmail: false
	});

	if (hasPayPalConfiguration(env)) {
		methods.push({
			id: 'paypal',
			title: 'PayPal',
			description: 'Pay through PayPal in USD using a locked checkout exchange quote.',
			kind: 'online',
			requiresBillingEmail: false,
			clientConfig: {
				clientId: env.PAYPAL_CLIENT_ID!,
				sdkUrl: getPayPalSdkUrl(env.PAYPAL_IS_SANDBOX === 'true')
			}
		});
	}

	return methods;
}

export async function validateCheckoutPaymentSelection(
	ctx: ServiceContext,
	input: ValidateCheckoutPaymentSelectionInput
): Promise<ValidatedCheckoutPaymentSelection> {
	const actor = requireActor(ctx.actor);
	const method = assertCheckoutPaymentMethodAvailable(ctx, input.method);

	if (method !== 'payhere') {
		return { method, billingEmail: null };
	}

	const [customer] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, actor.id))
			.limit(1)
	);
	const billingEmail =
		resolvePublicPaymentEmail(input.billingEmail) ?? resolvePublicPaymentEmail(customer?.email);

	if (!billingEmail) {
		throw new PaymentError(
			'Enter a valid billing email to continue with card payment.',
			ErrorCode.VALIDATION_ERROR,
			{ field: 'billingEmail' }
		);
	}

	return { method, billingEmail };
}

export async function createCheckoutPaymentSession(
	ctx: ServiceContext,
	input: CreateCheckoutPaymentSessionInput
): Promise<CreateCheckoutPaymentSessionResult> {
	const actor = requireActor(ctx.actor);
	const env = getEnv();
	const now = resolveNow(ctx);
	const method = assertCheckoutPaymentMethodAvailable(ctx, input.paymentMethod);
	if (method === 'cash_on_delivery') {
		throw new PaymentError(
			'Cash on delivery does not require a payment session.',
			ErrorCode.PAYMENT_ALREADY_PROCESSED
		);
	}

	const preview = await previewOrderFromBag(ctx, {
		sessionToken: input.sessionToken,
		shippingAddress: input.shippingAddress,
		shippingMethodId: input.shippingMethodId,
		now
	});
	if (!preview.canCheckout || !preview.bag.userId) {
		throw new PaymentError('Checkout is no longer available.', ErrorCode.CHECKOUT_SESSION_EXPIRED, {
			blockingReasons: preview.blockingReasons
		});
	}

	const checkoutInput: PaymentAttemptCheckoutInput = {
		sessionToken: input.sessionToken,
		shippingAddress: input.shippingAddress,
		shippingMethodId: input.shippingMethodId,
		paymentMethod: method,
		customerNote: input.customerNote
	};
	const attemptId = nanoid();
	const expiresAt =
		preview.bag.checkoutExpiresAt ?? new Date(now.getTime() + PAYMENT_ATTEMPT_TTL_MS);
	let billingEmail: string | null = null;

	if (method === 'payhere') {
		const [customer] = await getDb()
			.select({ email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, actor.id))
			.limit(1);
		billingEmail =
			resolvePublicPaymentEmail(input.billingEmail) ??
			resolvePublicPaymentEmail(customer?.email) ??
			null;
		if (!billingEmail) {
			throw new PaymentError(
				'Enter a valid billing email to continue with card payment.',
				ErrorCode.VALIDATION_ERROR,
				{ field: 'billingEmail' }
			);
		}
	}

	const existingAttempt = await findPendingCheckoutPaymentAttempt(preview.bag.id);
	if (existingAttempt) {
		if (existingAttempt.expiresAt.getTime() <= now.getTime()) {
			const db = getDb();
			const failureReason = 'Checkout expired before provider setup completed.';
			await withTransientD1WriteReconciliation(
				async () => {
					const [cancelledAttempt] = await db
						.update(paymentAttemptTable)
						.set({
							status: 'cancelled',
							failureReason,
							updatedAt: now
						})
						.where(
							and(
								eq(paymentAttemptTable.id, existingAttempt.id),
								eq(paymentAttemptTable.status, 'pending')
							)
						)
						.returning({ id: paymentAttemptTable.id });
					if (!cancelledAttempt) {
						throw new PaymentError(
							'The previous payment session changed while checkout was being prepared. Refresh checkout before trying again.',
							ErrorCode.CONFLICT,
							{ attemptId: existingAttempt.id }
						);
					}
				},
				async () => {
					const [current] = await db
						.select({
							status: paymentAttemptTable.status,
							failureReason: paymentAttemptTable.failureReason,
							updatedAt: paymentAttemptTable.updatedAt
						})
						.from(paymentAttemptTable)
						.where(eq(paymentAttemptTable.id, existingAttempt.id))
						.limit(1);
					return current?.status === 'cancelled' &&
						current.failureReason === failureReason &&
						current.updatedAt.getTime() === now.getTime()
						? { committed: true, value: undefined }
						: { committed: false };
				}
			);
		} else {
			return resumePendingCheckoutPaymentSession({
				env,
				attempt: existingAttempt,
				checkoutInput,
				shippingAddress: preview.shippingAddressSnapshot,
				amount: preview.totalAmount,
				billingEmail,
				now
			});
		}
	}

	let providerMetadata: GatewayMetadata = {};
	if (method === 'paypal') {
		const quote = await createPayPalFxQuote(preview.totalAmount, now);
		providerMetadata = {
			paypalFxQuote: quote,
			paypalRequestIds: {
				// PayPal recommends UUIDs and limits PayPal-Request-Id to 38 single-byte characters.
				create: crypto.randomUUID(),
				capture: crypto.randomUUID()
			}
		};
	}

	try {
		const db = getDb();
		const attemptValues: NewPaymentAttempt = {
			id: attemptId,
			userId: preview.bag.userId,
			bagId: preview.bag.id,
			method,
			status: 'pending',
			amount: preview.totalAmount,
			currency: 'LKR',
			checkoutInput,
			billingEmail,
			providerResponse:
				Object.keys(providerMetadata).length > 0
					? mergeGatewayEnvelope(null, { metadata: providerMetadata })
					: null,
			expiresAt,
			createdAt: now,
			updatedAt: now
		};
		const checkoutBagStillValid = db
			.select({ id: bagTable.id })
			.from(bagTable)
			.where(
				and(
					eq(bagTable.id, preview.bag.id),
					eq(bagTable.userId, preview.bag.userId),
					isNotNull(bagTable.checkoutStartedAt),
					gt(bagTable.checkoutExpiresAt, now),
					eq(bagTable.checkoutExpiresAt, expiresAt)
				)
			);
		await withTransientD1WriteReconciliation(
			() =>
				db.batch([
					db.insert(paymentAttemptTable).values(attemptValues),
					...guardBatchCondition(db, exists(checkoutBagStillValid))
				]),
			async () => {
				const [row] = await db
					.select({ id: paymentAttemptTable.id })
					.from(paymentAttemptTable)
					.where(eq(paymentAttemptTable.id, attemptId))
					.limit(1);
				return row ? { committed: true, value: undefined } : { committed: false };
			}
		);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new PaymentError(
				'Checkout changed before the payment session could be saved. Refresh checkout and try again.',
				ErrorCode.CHECKOUT_SESSION_EXPIRED
			);
		}
		if (isUniqueConstraintError(getErrorMessage(error))) {
			const racedAttempt = await findPendingCheckoutPaymentAttempt(preview.bag.id);
			if (racedAttempt && racedAttempt.expiresAt.getTime() > now.getTime()) {
				return resumePendingCheckoutPaymentSession({
					env,
					attempt: racedAttempt,
					checkoutInput,
					shippingAddress: preview.shippingAddressSnapshot,
					amount: preview.totalAmount,
					billingEmail,
					now
				});
			}
		}
		throw error;
	}

	try {
		if (method === 'payhere') {
			const { merchantId, merchantSecret } = getPayHereConfiguration(env);
			const [customer] = await getDb()
				.select({ name: userTable.name })
				.from(userTable)
				.where(eq(userTable.id, actor.id))
				.limit(1);
			if (!customer) {
				throw new PaymentError('Customer details could not be loaded.', ErrorCode.INTERNAL_ERROR);
			}
			const customerFields = buildPayHereCustomerFields(preview.shippingAddressSnapshot, {
				name: customer.name,
				email: billingEmail!
			});
			const amount = formatPayHereAmount(preview.totalAmount);

			return {
				attemptId,
				method,
				paymentData: {
					sandbox: env.PAYHERE_IS_SANDBOX === 'true',
					merchant_id: merchantId,
					notify_url: `${env.PUBLIC_APP_URL}/api/payments/webhooks/payhere`,
					order_id: attemptId,
					items: `Checkout ${attemptId.slice(0, 8)}`,
					first_name: customerFields.firstName,
					last_name: customerFields.lastName,
					email: customerFields.email,
					phone: customerFields.phone,
					address: customerFields.address,
					city: customerFields.city,
					country: customerFields.country,
					currency: 'LKR',
					amount,
					hash: generatePayHereCheckoutHash(merchantId, attemptId, amount, 'LKR', merchantSecret)
				}
			};
		}

		const paypalOrderId = await ensurePayPalOrderForAttempt(
			env,
			{
				id: attemptId,
				userId: preview.bag.userId,
				bagId: preview.bag.id,
				method: 'paypal',
				status: 'pending',
				amount: preview.totalAmount,
				currency: 'LKR',
				checkoutInput,
				billingEmail,
				providerOrderId: null,
				providerResponse: mergeGatewayEnvelope(null, { metadata: providerMetadata }),
				orderId: null,
				failureReason: null,
				expiresAt,
				createdAt: now,
				updatedAt: now
			},
			now
		);

		return { attemptId, method, paypalOrderId };
	} catch (error) {
		await recordPaymentAttemptSetupFailure(attemptId, method, error, now);
		throw error;
	}
}

async function findPendingCheckoutPaymentAttempt(bagId: string): Promise<PaymentAttempt | null> {
	const [row] = await getDb()
		.select()
		.from(paymentAttemptTable)
		.where(and(eq(paymentAttemptTable.bagId, bagId), eq(paymentAttemptTable.status, 'pending')))
		.limit(1);

	return row ?? null;
}

async function resumePendingCheckoutPaymentSession(input: {
	env: ReturnType<typeof getEnv>;
	attempt: PaymentAttempt;
	checkoutInput: PaymentAttemptCheckoutInput;
	shippingAddress: Parameters<typeof buildPayHereCustomerFields>[0];
	amount: number;
	billingEmail: string | null;
	now: Date;
}): Promise<CreateCheckoutPaymentSessionResult> {
	const { attempt } = input;
	const sameIntent = JSON.stringify(attempt.checkoutInput) === JSON.stringify(input.checkoutInput);
	const sameBillingEmail =
		attempt.method !== 'payhere' || attempt.billingEmail === input.billingEmail;

	if (
		attempt.method !== input.checkoutInput.paymentMethod ||
		attempt.amount !== input.amount ||
		!sameIntent ||
		!sameBillingEmail
	) {
		throw new PaymentError(
			'An active payment session already exists for this checkout. Complete it or wait for it to expire before changing payment details.',
			ErrorCode.CONFLICT,
			{ attemptId: attempt.id }
		);
	}

	if (attempt.method === 'paypal') {
		const paypalOrderId = await ensurePayPalOrderForAttempt(input.env, attempt, input.now);
		return { attemptId: attempt.id, method: 'paypal', paypalOrderId };
	}

	if (!attempt.billingEmail) {
		throw new PaymentError(
			'The existing PayHere session is missing its billing email.',
			ErrorCode.PAYMENT_FAILED,
			{ attemptId: attempt.id }
		);
	}

	const [customer] = await getDb()
		.select({ name: userTable.name })
		.from(userTable)
		.where(eq(userTable.id, attempt.userId))
		.limit(1);
	if (!customer) {
		throw new PaymentError('Customer details could not be loaded.', ErrorCode.INTERNAL_ERROR);
	}
	const { merchantId, merchantSecret } = getPayHereConfiguration(input.env);
	const customerFields = buildPayHereCustomerFields(input.shippingAddress, {
		name: customer.name,
		email: attempt.billingEmail
	});
	const amount = formatPayHereAmount(attempt.amount);

	return {
		attemptId: attempt.id,
		method: 'payhere',
		paymentData: {
			sandbox: input.env.PAYHERE_IS_SANDBOX === 'true',
			merchant_id: merchantId,
			notify_url: `${input.env.PUBLIC_APP_URL}/api/payments/webhooks/payhere`,
			order_id: attempt.id,
			items: `Checkout ${attempt.id.slice(0, 8)}`,
			first_name: customerFields.firstName,
			last_name: customerFields.lastName,
			email: customerFields.email,
			phone: customerFields.phone,
			address: customerFields.address,
			city: customerFields.city,
			country: customerFields.country,
			currency: 'LKR',
			amount,
			hash: generatePayHereCheckoutHash(merchantId, attempt.id, amount, 'LKR', merchantSecret)
		}
	};
}

async function ensurePayPalOrderForAttempt(
	env: ReturnType<typeof getEnv>,
	attempt: PaymentAttempt,
	now: Date
): Promise<string> {
	if (attempt.providerOrderId) return attempt.providerOrderId;

	const metadata = getGatewayMetadata(attempt.providerResponse);
	const quote = metadata.paypalFxQuote;
	const requestId = metadata.paypalRequestIds?.create;
	if (!quote || !requestId) {
		throw new PaymentError(
			'The PayPal payment session is missing its locked exchange quote.',
			ErrorCode.PAYMENT_FAILED,
			{ attemptId: attempt.id }
		);
	}

	const { clientId, clientSecret } = getPayPalConfiguration(env);
	const isSandbox = env.PAYPAL_IS_SANDBOX === 'true';
	const token = await getPayPalAccessToken(clientId, clientSecret, isSandbox);
	const paypalOrderId = await createPayPalOrder(
		token,
		attempt.id,
		attempt.id,
		quote.usdAmount,
		requestId,
		isSandbox,
		env.PUBLIC_APP_URL,
		env.PUBLIC_APP_NAME,
		`/checkout/payment/${attempt.id}`
	);

	try {
		const [updated] = await withTransientD1WriteRetry(() =>
			getDb()
				.update(paymentAttemptTable)
				.set({ providerOrderId: paypalOrderId, failureReason: null, updatedAt: now })
				.where(
					and(eq(paymentAttemptTable.id, attempt.id), eq(paymentAttemptTable.status, 'pending'))
				)
				.returning({ providerOrderId: paymentAttemptTable.providerOrderId })
		);
		if (updated?.providerOrderId === paypalOrderId) return paypalOrderId;
	} catch (error) {
		if (!isTransientD1Error(error)) throw error;
	}

	const persisted = await withTransientD1ReadRetry(() =>
		findPendingCheckoutPaymentAttempt(attempt.bagId)
	);
	if (persisted?.id === attempt.id && persisted.providerOrderId === paypalOrderId) {
		return paypalOrderId;
	}

	throw new PaymentError(
		'The PayPal session changed while provider setup was being saved.',
		ErrorCode.CONFLICT,
		{ attemptId: attempt.id }
	);
}

async function recordPaymentAttemptSetupFailure(
	attemptId: string,
	method: Extract<PaymentMethod, 'payhere' | 'paypal'>,
	error: unknown,
	now: Date
): Promise<void> {
	const failureReason = getErrorMessage(error).slice(0, 1000);
	try {
		await withTransientD1WriteRetry(() =>
			getDb()
				.update(paymentAttemptTable)
				.set({
					// A PayPal request carries a stable provider idempotency key. Keep the
					// attempt resumable after a timeout instead of creating a second order.
					status: method === 'paypal' ? 'pending' : 'failed',
					failureReason,
					updatedAt: now
				})
				.where(
					and(eq(paymentAttemptTable.id, attemptId), eq(paymentAttemptTable.status, 'pending'))
				)
		);
	} catch (persistenceError) {
		console.error('[payments] Failed to persist payment-session setup failure:', {
			attemptId,
			error: getErrorMessage(persistenceError)
		});
	}
}

export async function getCheckoutPaymentAttempt(
	ctx: ServiceContext,
	attemptId: string
): Promise<CheckoutPaymentAttemptDTO> {
	const id = normalizeGatewayId(attemptId, 'attemptId');
	const [row] = await withTransientD1ReadRetry(() =>
		getDb().select().from(paymentAttemptTable).where(eq(paymentAttemptTable.id, id)).limit(1)
	);
	if (!row) {
		throw new PaymentError('Payment attempt not found.', ErrorCode.PAYMENT_NOT_FOUND, {
			attemptId: id
		});
	}
	requireOwnerOrAdmin(ctx.actor, row.userId);
	return toCheckoutPaymentAttemptDTO(row);
}

export async function createPaymentSession(
	ctx: ServiceContext,
	input: CreatePaymentSessionInput
): Promise<CreatePaymentSessionResult> {
	void ctx;
	void input;
	throw new PaymentError(
		'Order-first online payment sessions are retired. Start payment from the active checkout instead.',
		ErrorCode.PAYMENT_ALREADY_PROCESSED
	);
}

export async function processPayHereWebhook(
	ctx: ServiceContext,
	input: ProcessPayHereWebhookInput
): Promise<PaymentGatewayResult> {
	const env = getEnv();
	const { merchantId, merchantSecret } = getPayHereConfiguration(env);
	const payload = input.payload;
	const auditPayload = sanitizePayHereWebhookPayload(payload);
	void input.headers;

	try {
		const orderId = readRequiredGatewayString(payload, 'order_id');
		const providerPaymentId = readRequiredGatewayString(payload, 'payment_id');
		const providerMerchantId = readRequiredGatewayString(payload, 'merchant_id');
		const amount = readRequiredGatewayString(payload, 'payhere_amount');
		const currency = readRequiredGatewayString(payload, 'payhere_currency');
		const statusCode = readRequiredGatewayString(payload, 'status_code');
		const signature = readRequiredGatewayString(payload, 'md5sig');

		if (
			providerMerchantId !== merchantId ||
			!verifyPayHereWebhookSignature({
				merchantId: providerMerchantId,
				orderId,
				amount,
				currency,
				statusCode,
				merchantSecret,
				signature
			})
		) {
			throw new PaymentError(
				'PayHere webhook signature verification failed.',
				ErrorCode.VALIDATION_ERROR
			);
		}

		const [attemptRow] = await getDb()
			.select()
			.from(paymentAttemptTable)
			.where(and(eq(paymentAttemptTable.id, orderId), eq(paymentAttemptTable.method, 'payhere')))
			.limit(1);
		if (attemptRow) {
			if (currency !== attemptRow.currency || amount !== formatPayHereAmount(attemptRow.amount)) {
				throw new PaymentError(
					'PayHere webhook amount or currency does not match the checkout attempt.',
					ErrorCode.VALIDATION_ERROR,
					{
						attemptId: attemptRow.id,
						expectedAmount: formatPayHereAmount(attemptRow.amount),
						expectedCurrency: attemptRow.currency
					}
				);
			}

			let result: PaymentGatewayResult;
			if (statusCode === '2') {
				result = await finalizeCapturedPaymentAttempt(ctx, attemptRow, {
					transactionId: providerPaymentId,
					providerResponse: auditPayload,
					now: resolveNow(ctx)
				});
			} else {
				const attemptStatus =
					statusCode === '-1' ? 'cancelled' : statusCode === '0' ? 'pending' : 'failed';
				const now = resolveNow(ctx);
				const failureReason =
					attemptStatus === 'pending'
						? null
						: (readOptionalGatewayString(payload, 'status_message') ??
							'Payment was not completed.');
				const db = getDb();
				const updatedAttempt = await withTransientD1WriteReconciliation<PaymentAttempt | null>(
					async () => {
						const [row] = await db
							.update(paymentAttemptTable)
							.set({
								status: attemptStatus,
								providerOrderId: providerPaymentId,
								providerResponse: auditPayload,
								failureReason,
								updatedAt: now
							})
							.where(
								and(
									eq(paymentAttemptTable.id, attemptRow.id),
									eq(paymentAttemptTable.status, 'pending')
								)
							)
							.returning();
						return row ?? null;
					},
					async () => {
						const [current] = await db
							.select()
							.from(paymentAttemptTable)
							.where(eq(paymentAttemptTable.id, attemptRow.id))
							.limit(1);
						return current?.status === attemptStatus &&
							current.providerOrderId === providerPaymentId &&
							current.failureReason === failureReason &&
							current.updatedAt.getTime() === now.getTime()
							? { committed: true, value: current }
							: { committed: false };
					}
				);
				result = updatedAttempt
					? toPaymentAttemptGatewayResult(updatedAttempt)
					: await loadPaymentAttemptGatewayResult(attemptRow.id);
			}

			await writeWebhookLog('payhere', auditPayload, 'processed', null);
			return result;
		}

		const [paymentRow] = await getDb()
			.select()
			.from(paymentTable)
			.where(and(eq(paymentTable.orderId, orderId), eq(paymentTable.method, 'payhere')))
			.orderBy(desc(paymentTable.createdAt))
			.limit(1);
		if (!paymentRow) {
			throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, {
				orderId
			});
		}

		if (currency !== paymentRow.currency || amount !== formatPayHereAmount(paymentRow.amount)) {
			throw new PaymentError(
				'PayHere webhook amount or currency does not match the order.',
				ErrorCode.VALIDATION_ERROR,
				{
					orderId,
					expectedAmount: formatPayHereAmount(paymentRow.amount),
					expectedCurrency: paymentRow.currency
				}
			);
		}

		const result = await applyGatewayPaymentResult(ctx, {
			paymentId: paymentRow.id,
			status: mapPayHereStatus(statusCode),
			transactionId: providerPaymentId,
			providerResponse: auditPayload,
			note: 'PayHere payment captured.',
			now: resolveNow(ctx)
		});
		await writeWebhookLog('payhere', auditPayload, 'processed', null);
		return result;
	} catch (error) {
		const message = getErrorMessage(error);
		await writeWebhookLog(
			'payhere',
			auditPayload,
			message.includes('signature') ? 'signature_mismatch' : 'failed',
			message
		);
		throw error;
	}
}

export async function capturePayPalPayment(
	ctx: ServiceContext,
	input: CapturePayPalPaymentInput
): Promise<PaymentGatewayResult> {
	requireActor(ctx.actor);
	const env = getEnv();
	const paypalOrderId = normalizeGatewayId(input.paypalOrderId, 'paypalOrderId');
	const [attemptRow] = await getDb()
		.select()
		.from(paymentAttemptTable)
		.where(
			and(
				eq(paymentAttemptTable.providerOrderId, paypalOrderId),
				eq(paymentAttemptTable.method, 'paypal')
			)
		)
		.limit(1);

	if (attemptRow) {
		requireOwnerOrAdmin(ctx.actor, attemptRow.userId);
		if (attemptRow.status === 'captured' && attemptRow.orderId) {
			const [capturedPayment] = await getDb()
				.select({ id: paymentTable.id })
				.from(paymentTable)
				.where(eq(paymentTable.orderId, attemptRow.orderId))
				.limit(1);
			return {
				success: true,
				paymentId: capturedPayment?.id,
				orderId: attemptRow.orderId,
				status: 'captured'
			};
		}
		if (attemptRow.status !== 'pending') {
			throw new PaymentError(
				'This payment attempt can no longer be completed.',
				ErrorCode.PAYMENT_ALREADY_PROCESSED,
				{ attemptId: attemptRow.id, status: attemptRow.status }
			);
		}
		const captureStartedAt = resolveNow(ctx);
		if (attemptRow.expiresAt.getTime() <= captureStartedAt.getTime()) {
			const db = getDb();
			const failureReason = 'Checkout expired before PayPal capture started.';
			const cancelledAttempt = await withTransientD1WriteReconciliation<boolean>(
				async () => {
					const [row] = await db
						.update(paymentAttemptTable)
						.set({
							status: 'cancelled',
							failureReason,
							updatedAt: captureStartedAt
						})
						.where(
							and(
								eq(paymentAttemptTable.id, attemptRow.id),
								eq(paymentAttemptTable.status, 'pending')
							)
						)
						.returning({ id: paymentAttemptTable.id });
					return Boolean(row);
				},
				async () => {
					const [current] = await db
						.select({
							status: paymentAttemptTable.status,
							failureReason: paymentAttemptTable.failureReason,
							updatedAt: paymentAttemptTable.updatedAt
						})
						.from(paymentAttemptTable)
						.where(eq(paymentAttemptTable.id, attemptRow.id))
						.limit(1);
					return current?.status === 'cancelled' &&
						current.failureReason === failureReason &&
						current.updatedAt.getTime() === captureStartedAt.getTime()
						? { committed: true, value: true }
						: { committed: false };
				}
			);
			if (!cancelledAttempt) {
				return loadPaymentAttemptGatewayResult(attemptRow.id);
			}
			throw new PaymentError(
				'The checkout expired before PayPal capture started.',
				ErrorCode.CHECKOUT_SESSION_EXPIRED,
				{ attemptId: attemptRow.id }
			);
		}

		const metadata = getGatewayMetadata(attemptRow.providerResponse);
		const quote = metadata.paypalFxQuote;
		const captureRequestId = metadata.paypalRequestIds?.capture;
		if (!quote || !captureRequestId) {
			throw new PaymentError(
				'The PayPal payment session is missing its locked exchange quote.',
				ErrorCode.PAYMENT_FAILED,
				{ attemptId: attemptRow.id }
			);
		}

		const { clientId, clientSecret } = getPayPalConfiguration(env);
		const isSandbox = env.PAYPAL_IS_SANDBOX === 'true';
		const accessToken = await getPayPalAccessToken(clientId, clientSecret, isSandbox);
		const capture = await capturePayPalOrder(
			accessToken,
			paypalOrderId,
			captureRequestId,
			isSandbox
		);
		const capturedPayment = readPayPalCapture(capture);
		if (
			capture.status !== 'COMPLETED' ||
			capturedPayment.status !== 'COMPLETED' ||
			capturedPayment.currency !== 'USD' ||
			capturedPayment.value !== quote.usdAmount
		) {
			throw new PaymentError(
				'PayPal did not confirm the expected payment amount.',
				ErrorCode.PAYMENT_FAILED,
				{
					attemptId: attemptRow.id,
					expectedCurrency: 'USD',
					expectedAmount: quote.usdAmount,
					providerStatus: capture.status
				}
			);
		}

		return finalizeCapturedPaymentAttempt(ctx, attemptRow, {
			transactionId: capturedPayment.id,
			providerResponse: createPayPalCaptureAudit(capture.status, capturedPayment),
			now: resolveNow(ctx)
		});
	}

	const [paymentRow] = await getDb()
		.select()
		.from(paymentTable)
		.where(and(eq(paymentTable.transactionId, paypalOrderId), eq(paymentTable.method, 'paypal')))
		.limit(1);

	if (!paymentRow) {
		throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, {
			paypalOrderId
		});
	}
	const [orderRow] = await getDb()
		.select()
		.from(orderTable)
		.where(eq(orderTable.id, paymentRow.orderId))
		.limit(1);
	if (!orderRow) {
		throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
			orderId: paymentRow.orderId
		});
	}
	requireOwnerOrAdmin(ctx.actor, orderRow.userId);

	if (
		paymentRow.status === 'captured' ||
		paymentRow.status === 'partially_refunded' ||
		paymentRow.status === 'refunded'
	) {
		return toGatewayResult(toPaymentDTO(paymentRow, orderRow.status));
	}
	const now = resolveNow(ctx);
	if (orderRow.status !== 'pending') {
		throw new PaymentError(
			'Payment can no longer be captured for this order.',
			ErrorCode.PAYMENT_ALREADY_PROCESSED,
			{ orderId: orderRow.id, orderStatus: orderRow.status }
		);
	}
	if (orderRow.paymentExpiresAt && orderRow.paymentExpiresAt.getTime() <= now.getTime()) {
		throw new PaymentError(
			'The payment window for this order has expired.',
			ErrorCode.PAYMENT_FAILED,
			{
				orderId: orderRow.id,
				paymentExpiresAt: orderRow.paymentExpiresAt.toISOString()
			}
		);
	}

	const metadata = getGatewayMetadata(paymentRow.gatewayResponse);
	const quote = metadata.paypalFxQuote;
	const captureRequestId = metadata.paypalRequestIds?.capture;
	if (!quote || !captureRequestId) {
		throw new PaymentError(
			'The PayPal payment session is missing its locked exchange quote.',
			ErrorCode.PAYMENT_FAILED,
			{ paymentId: paymentRow.id }
		);
	}

	const { clientId, clientSecret } = getPayPalConfiguration(env);
	const isSandbox = env.PAYPAL_IS_SANDBOX === 'true';
	const accessToken = await getPayPalAccessToken(clientId, clientSecret, isSandbox);
	const capture = await capturePayPalOrder(accessToken, paypalOrderId, captureRequestId, isSandbox);
	const capturedPayment = readPayPalCapture(capture);
	if (
		capture.status !== 'COMPLETED' ||
		capturedPayment.status !== 'COMPLETED' ||
		capturedPayment.currency !== 'USD' ||
		capturedPayment.value !== quote.usdAmount
	) {
		throw new PaymentError(
			'PayPal did not confirm the expected payment amount.',
			ErrorCode.PAYMENT_FAILED,
			{
				paymentId: paymentRow.id,
				expectedCurrency: 'USD',
				expectedAmount: quote.usdAmount,
				providerStatus: capture.status
			}
		);
	}

	return applyGatewayPaymentResult(ctx, {
		paymentId: paymentRow.id,
		status: 'captured',
		transactionId: paypalOrderId,
		providerResponse: createPayPalCaptureAudit(capture.status, capturedPayment),
		note: 'PayPal payment captured.',
		now
	});
}

async function finalizeCapturedPaymentAttempt(
	ctx: ServiceContext,
	attempt: PaymentAttempt,
	input: { transactionId: string; providerResponse: unknown; now: Date }
): Promise<PaymentGatewayResult> {
	try {
		const db = getDb();
		const [currentAttempt] = await db
			.select()
			.from(paymentAttemptTable)
			.where(eq(paymentAttemptTable.id, attempt.id))
			.limit(1);
		if (!currentAttempt) {
			throw new PaymentError('Payment attempt not found.', ErrorCode.PAYMENT_NOT_FOUND, {
				attemptId: attempt.id
			});
		}
		if (currentAttempt.status === 'captured' && currentAttempt.orderId) {
			const [existingPayment] = await db
				.select({ id: paymentTable.id })
				.from(paymentTable)
				.where(eq(paymentTable.orderId, currentAttempt.orderId))
				.limit(1);
			return {
				success: true,
				paymentId: existingPayment?.id,
				orderId: currentAttempt.orderId,
				status: 'captured'
			};
		}
		if (currentAttempt.status !== 'pending') {
			throw new PaymentError(
				'This payment attempt can no longer create an order.',
				ErrorCode.PAYMENT_ALREADY_PROCESSED,
				{ attemptId: currentAttempt.id, status: currentAttempt.status }
			);
		}
		if (currentAttempt.expiresAt.getTime() <= input.now.getTime()) {
			throw new PaymentError(
				'Payment completed after the checkout expired. Support review is required.',
				ErrorCode.PAYMENT_FAILED,
				{ attemptId: currentAttempt.id }
			);
		}

		const [customer] = await db
			.select({ id: userTable.id, role: userTable.role, isAnonymous: userTable.isAnonymous })
			.from(userTable)
			.where(eq(userTable.id, currentAttempt.userId))
			.limit(1);
		if (!customer) {
			throw new PaymentError('Checkout customer no longer exists.', ErrorCode.PAYMENT_FAILED, {
				attemptId: currentAttempt.id
			});
		}

		const checkoutInput = currentAttempt.checkoutInput as PaymentAttemptCheckoutInput;
		const customerActor: ServiceActor = {
			id: customer.id,
			role: customer.role,
			isAnonymous: customer.isAnonymous
		};
		const prepared = await prepareConfirmedOrderFromBag(
			db,
			{ ...ctx, actor: customerActor, now: input.now },
			{ ...checkoutInput, paymentMethod: currentAttempt.method, now: input.now },
			{
				status: 'captured',
				transactionId: input.transactionId,
				gatewayResponse: mergeGatewayEnvelope(currentAttempt.providerResponse, {
					provider: input.providerResponse,
					metadata: getGatewayMetadata(currentAttempt.providerResponse)
				}),
				paidAt: input.now
			}
		);
		if (prepared.order.totalAmount !== currentAttempt.amount) {
			throw new PaymentError(
				'Checkout total changed before payment completed. Support review is required.',
				ErrorCode.PAYMENT_FAILED,
				{
					attemptId: currentAttempt.id,
					paidAmount: currentAttempt.amount,
					currentAmount: prepared.order.totalAmount
				}
			);
		}

		const attemptUpdate = db
			.update(paymentAttemptTable)
			.set({
				status: 'captured',
				providerOrderId: currentAttempt.providerOrderId ?? input.transactionId,
				providerResponse: input.providerResponse,
				orderId: prepared.orderId,
				failureReason: null,
				updatedAt: input.now
			})
			.where(
				and(
					eq(paymentAttemptTable.id, currentAttempt.id),
					eq(paymentAttemptTable.status, 'pending'),
					eq(paymentAttemptTable.amount, currentAttempt.amount),
					eq(paymentAttemptTable.bagId, currentAttempt.bagId)
				)
			);
		const statements = [
			...prepared.statements,
			attemptUpdate,
			...guardPreviousBatchChanges(db)
		] as [(typeof prepared.statements)[number], ...(typeof prepared.statements)[number][]];
		await commitCapturedPaymentAttemptBatch(db, statements, currentAttempt.id, prepared.orderId);
		await publishPreparedNotificationWakeups(ctx, db, prepared.notifications);
		return {
			success: true,
			paymentId: prepared.paymentId,
			orderId: prepared.orderId,
			status: 'captured'
		};
	} catch (error) {
		const reason = isD1BatchGuardError(error)
			? 'Checkout changed or stock was no longer available during payment capture.'
			: getErrorMessage(error);
		const db = getDb();
		const providerOrderId = attempt.providerOrderId ?? input.transactionId;
		const providerResponse = mergeGatewayEnvelope(attempt.providerResponse, {
			provider: input.providerResponse,
			metadata: getGatewayMetadata(attempt.providerResponse)
		});
		const durableAttempt = await withTransientD1WriteReconciliation<PaymentAttempt>(
			async () => {
				const [updated] = await db
					.update(paymentAttemptTable)
					.set({
						status: 'review_required',
						providerOrderId,
						providerResponse,
						failureReason: reason,
						updatedAt: input.now
					})
					.where(
						and(
							eq(paymentAttemptTable.id, attempt.id),
							inArray(paymentAttemptTable.status, ['pending', 'failed', 'cancelled'])
						)
					)
					.returning();
				if (updated) return updated;

				const [current] = await db
					.select()
					.from(paymentAttemptTable)
					.where(eq(paymentAttemptTable.id, attempt.id))
					.limit(1);
				if (current?.status === 'captured') return current;
				throw new PaymentError(
					'Payment attempt changed before manual-review state could be saved.',
					ErrorCode.CONFLICT,
					{ attemptId: attempt.id, status: current?.status }
				);
			},
			async () => {
				const [current] = await db
					.select()
					.from(paymentAttemptTable)
					.where(eq(paymentAttemptTable.id, attempt.id))
					.limit(1);
				if (current?.status === 'captured') {
					return { committed: true, value: current };
				}
				return current?.status === 'review_required' &&
					current.providerOrderId === providerOrderId &&
					current.failureReason === reason &&
					current.updatedAt.getTime() === input.now.getTime()
					? { committed: true, value: current }
					: { committed: false };
			}
		);
		if (durableAttempt.status === 'captured') {
			return loadPaymentAttemptGatewayResult(durableAttempt.id);
		}

		return {
			success: false,
			status: 'captured',
			requiresManualReview: true,
			errorMessage: reason
		};
	}
}

async function commitCapturedPaymentAttemptBatch(
	db: Db,
	statements: Parameters<Db['batch']>[0],
	attemptId: string,
	orderId: string
): Promise<void> {
	await withTransientD1WriteReconciliation(
		async () => {
			await db.batch(statements);
		},
		async () => {
			const [persisted] = await db
				.select({
					status: paymentAttemptTable.status,
					orderId: paymentAttemptTable.orderId
				})
				.from(paymentAttemptTable)
				.where(eq(paymentAttemptTable.id, attemptId))
				.limit(1);
			if (persisted?.status === 'captured' && persisted.orderId === orderId) {
				return { committed: true, value: undefined };
			}
			if (persisted && persisted.status !== 'pending') {
				throw new PaymentError(
					'Payment attempt changed while the captured order was being committed.',
					ErrorCode.CONFLICT,
					{ attemptId, status: persisted.status, orderId: persisted.orderId }
				);
			}
			return { committed: false };
		}
	);
}

function toPaymentAttemptGatewayResult(attempt: PaymentAttempt): PaymentGatewayResult {
	if (attempt.status === 'captured' && attempt.orderId) {
		return { success: true, orderId: attempt.orderId, status: 'captured' };
	}

	if (attempt.status === 'review_required') {
		return {
			success: false,
			orderId: attempt.orderId ?? undefined,
			status: 'captured',
			requiresManualReview: true,
			errorMessage: attempt.failureReason ?? 'Payment requires support review.'
		};
	}

	return {
		success: false,
		status: attempt.status === 'pending' ? 'pending' : 'failed',
		errorMessage:
			attempt.status === 'pending'
				? undefined
				: (attempt.failureReason ?? 'Payment was not completed.')
	};
}

async function loadPaymentAttemptGatewayResult(attemptId: string): Promise<PaymentGatewayResult> {
	const [attempt] = await getDb()
		.select()
		.from(paymentAttemptTable)
		.where(eq(paymentAttemptTable.id, attemptId))
		.limit(1);
	if (!attempt) {
		throw new PaymentError('Payment attempt not found.', ErrorCode.PAYMENT_NOT_FOUND, {
			attemptId
		});
	}

	const result = toPaymentAttemptGatewayResult(attempt);
	if (attempt.status !== 'captured' || !attempt.orderId) return result;

	const [capturedPayment] = await getDb()
		.select({ id: paymentTable.id })
		.from(paymentTable)
		.where(eq(paymentTable.orderId, attempt.orderId))
		.limit(1);

	return { ...result, paymentId: capturedPayment?.id };
}

type ApplyGatewayPaymentResultInput = {
	paymentId: string;
	status: PaymentStatus;
	transactionId: string | null;
	providerResponse: unknown;
	note: string;
	now: Date;
};

async function applyGatewayPaymentResult(
	ctx: ServiceContext,
	input: ApplyGatewayPaymentResultInput
): Promise<PaymentGatewayResult> {
	const db = getDb();
	const [paymentRow] = await db
		.select()
		.from(paymentTable)
		.where(eq(paymentTable.id, input.paymentId))
		.limit(1);
	if (!paymentRow) {
		throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, {
			paymentId: input.paymentId
		});
	}

	const [orderRow] = await db
		.select()
		.from(orderTable)
		.where(eq(orderTable.id, paymentRow.orderId))
		.limit(1);
	if (!orderRow) {
		throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
			orderId: paymentRow.orderId
		});
	}

	const terminalPayment =
		paymentRow.status === 'captured' ||
		paymentRow.status === 'partially_refunded' ||
		paymentRow.status === 'refunded';
	const nextStatus = terminalPayment ? paymentRow.status : input.status;
	const captureAction =
		input.status === 'captured'
			? decideCapturedOrderAction(orderRow.status, orderRow.paymentExpiresAt, input.now)
			: 'none';
	let manualReviewReason: string | null = getManualReviewReason(paymentRow.gatewayResponse);

	if (terminalPayment && input.status !== paymentRow.status) {
		manualReviewReason = `Provider reported ${input.status} after payment reached ${paymentRow.status}. Manual review required.`;
	}
	if (
		terminalPayment &&
		paymentRow.transactionId &&
		input.transactionId &&
		input.transactionId !== paymentRow.transactionId
	) {
		manualReviewReason = `Provider reported transaction ${input.transactionId} after ${paymentRow.transactionId} was finalized. Manual review required.`;
	}

	let preparedTransition: Awaited<ReturnType<typeof prepareOrderStatusTransition>> | null = null;
	if (!terminalPayment && input.status === 'captured') {
		if (captureAction === 'confirm') {
			preparedTransition = await prepareOrderStatusTransition(
				db,
				ctx,
				{
					orderId: orderRow.id,
					toStatus: 'confirmed',
					note: input.note,
					now: input.now
				},
				{ includeNotifications: false }
			);
		} else if (captureAction === 'cancel_and_review') {
			preparedTransition = await prepareOrderStatusTransition(
				db,
				ctx,
				{
					orderId: orderRow.id,
					toStatus: 'cancelled',
					note: 'Payment arrived after the checkout window expired.',
					now: input.now
				},
				{ includeNotifications: false }
			);
			manualReviewReason =
				'Payment captured after the checkout window expired. Refund review required.';
		} else if (captureAction === 'review') {
			manualReviewReason = `Payment captured while order was ${orderRow.status}. Refund review required.`;
		}
	}

	const currentMetadata = getGatewayMetadata(paymentRow.gatewayResponse);
	const gatewayResponse = mergeGatewayEnvelope(paymentRow.gatewayResponse, {
		provider: input.providerResponse,
		metadata: {
			...currentMetadata,
			...(manualReviewReason
				? {
						manualReview: {
							required: true as const,
							reason: manualReviewReason,
							createdAt: currentMetadata.manualReview?.createdAt ?? input.now.toISOString()
						}
					}
				: {})
		}
	});
	const nextTransactionId =
		terminalPayment && paymentRow.transactionId
			? paymentRow.transactionId
			: (input.transactionId ?? paymentRow.transactionId);
	const changed =
		nextStatus !== paymentRow.status ||
		nextTransactionId !== paymentRow.transactionId ||
		manualReviewReason !== getManualReviewReason(paymentRow.gatewayResponse);
	const nextOrderStatus = preparedTransition?.order.status ?? orderRow.status;
	const updatedPayment: Payment = {
		...paymentRow,
		status: nextStatus,
		transactionId: nextTransactionId,
		gatewayResponse,
		paidAt: nextStatus === 'captured' ? (paymentRow.paidAt ?? input.now) : paymentRow.paidAt,
		updatedAt: input.now
	};
	const paymentDto = toPaymentDTO(updatedPayment, nextOrderStatus);
	let preparedNotifications: PreparedNotificationOutboxInsert[] =
		preparedTransition?.notifications ?? [];
	if (changed && preparedTransition?.order.status === 'confirmed') {
		preparedNotifications = await prepareOrderConfirmationNotificationInserts(
			db,
			preparedTransition.order
		);
	} else if (changed && !preparedTransition) {
		preparedNotifications = preparePaymentUpdateNotificationInserts(db, paymentDto, orderRow);
	}

	const paymentUpdate = db
		.update(paymentTable)
		.set({
			status: nextStatus,
			transactionId: nextTransactionId,
			gatewayResponse,
			paidAt: updatedPayment.paidAt,
			updatedAt: input.now
		})
		.where(
			and(
				eq(paymentTable.id, paymentRow.id),
				eq(paymentTable.status, paymentRow.status),
				eq(paymentTable.updatedAt, paymentRow.updatedAt)
			)
		);
	const paymentGuard = guardPreviousBatchChanges(db);
	const statements: [Parameters<Db['batch']>[0][number], ...Parameters<Db['batch']>[0][number][]] =
		[paymentUpdate, paymentGuard[0], paymentGuard[1]];
	if (preparedTransition) statements.push(...preparedTransition.statements);
	if (preparedTransition?.order.status === 'confirmed') {
		statements.push(...preparedNotifications.map((item) => item.statement));
	} else if (!preparedTransition) {
		statements.push(...preparedNotifications.map((item) => item.statement));
	}

	try {
		await withTransientD1WriteReconciliation(
			async () => {
				await db.batch(statements);
			},
			async () => {
				const [current] = await db
					.select({
						status: paymentTable.status,
						transactionId: paymentTable.transactionId,
						updatedAt: paymentTable.updatedAt
					})
					.from(paymentTable)
					.where(eq(paymentTable.id, paymentRow.id))
					.limit(1);
				return current &&
					current.status === nextStatus &&
					current.transactionId === nextTransactionId &&
					current.updatedAt.getTime() === input.now.getTime()
					? { committed: true, value: undefined }
					: { committed: false };
			}
		);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new PaymentError(
				'Payment or order state changed while the gateway result was being applied.',
				ErrorCode.CONFLICT,
				{ paymentId: paymentRow.id }
			);
		}
		throw error;
	}
	await publishPreparedNotificationWakeups(ctx, db, preparedNotifications);
	return toGatewayResult(paymentDto);
}

function preparePaymentUpdateNotificationInserts(
	db: Db,
	paymentDto: PaymentDTO,
	orderRow: Order
): PreparedNotificationOutboxInsert[] {
	if (paymentDto.status !== 'refunded' || !orderRow.shippingAddressSnapshot) return [];
	const baseUrl = getEnv().PUBLIC_APP_URL.replace(/\/+$/, '');
	return [
		prepareNotificationOutboxInsert(db, {
			idempotencyKey: `order:${orderRow.id}:payment:${paymentDto.id}:${paymentDto.status}:sms`,
			type: 'payment_update',
			channel: 'sms',
			recipient: orderRow.shippingAddressSnapshot.phone,
			recipientUserId: orderRow.userId,
			aggregateType: 'order',
			aggregateId: orderRow.id,
			payload: {
				to: orderRow.shippingAddressSnapshot.phone,
				orderId: orderRow.id,
				orderNumber: orderRow.orderNumber,
				status: paymentDto.status,
				statusLabel: 'refunded',
				amount: `LKR ${paymentDto.amount.toLocaleString('en-LK')}`,
				paymentUrl: `${baseUrl}/view-order/${encodeURIComponent(orderRow.orderNumber)}`
			},
			metadata: { orderNumber: orderRow.orderNumber, paymentId: paymentDto.id },
			now: paymentDto.updatedAt
		})
	];
}

// ---------------------------------------------------------------------------
// ADMIN & DIRECT WRITE APIS
// ---------------------------------------------------------------------------

export async function listPayments(
	ctx: ServiceContext,
	options: ListPaymentsOptions
): Promise<PaymentListResult> {
	requireAdmin(ctx.actor);

	const db = getDb();
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);

	const conditions: SQL[] = [];
	if (options.orderId) conditions.push(eq(paymentTable.orderId, options.orderId));
	if (options.status) conditions.push(eq(paymentTable.status, options.status));
	if (options.method) conditions.push(eq(paymentTable.method, options.method));

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const [totalCountRows, rows] = await withTransientD1ReadRetry(() =>
		db.batch([
			db.select({ count: count() }).from(paymentTable).where(whereClause),
			db
				.select({
					payment: paymentTable,
					orderStatus: orderTable.status
				})
				.from(paymentTable)
				.leftJoin(orderTable, eq(orderTable.id, paymentTable.orderId))
				.where(whereClause)
				.orderBy(desc(paymentTable.createdAt))
				.limit(limit)
				.offset(offset)
		])
	);

	return {
		items: rows.map((row) => toPaymentDTO(row.payment, row.orderStatus)),
		total: totalCountRows[0]?.count ?? 0,
		limit,
		offset
	};
}

export async function getPaymentDashboard(
	ctx: ServiceContext,
	options: ListPaymentsOptions = {}
): Promise<PaymentDashboardDTO> {
	requireAdmin(ctx.actor);

	const db = getDb();
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const whereClause = buildPaymentListWhere(options);
	const [totalRows, rows, summaryRows] = await withTransientD1ReadRetry(() =>
		db.batch([
			db.select({ count: count() }).from(paymentTable).where(whereClause),
			db
				.select({
					payment: paymentTable,
					orderStatus: orderTable.status
				})
				.from(paymentTable)
				.leftJoin(orderTable, eq(orderTable.id, paymentTable.orderId))
				.where(whereClause)
				.orderBy(desc(paymentTable.createdAt))
				.limit(limit)
				.offset(offset),
			paymentDashboardSummaryQuery(db)
		])
	);

	return {
		payments: {
			items: rows.map((row) => toPaymentDTO(row.payment, row.orderStatus)),
			total: totalRows[0]?.count ?? 0,
			limit,
			offset
		},
		stats: toPaymentDashboardSummaryDTO(summaryRows[0])
	};
}

export async function getPaymentDashboardSummary(
	ctx: ServiceContext
): Promise<PaymentDashboardSummaryDTO> {
	requireAdmin(ctx.actor);
	const [totals] = await withTransientD1ReadRetry(() => paymentDashboardSummaryQuery(getDb()));
	return toPaymentDashboardSummaryDTO(totals);
}

function paymentDashboardSummaryQuery(db: Db) {
	return db
		.select({
			totalVolume: sql<number>`coalesce(sum(${paymentTable.amount}), 0)`,
			totalCaptured: sql<number>`coalesce(sum(case when ${paymentTable.status} in ('captured', 'partially_refunded', 'refunded') then ${paymentTable.amount} else 0 end), 0)`,
			totalPending: sql<number>`coalesce(sum(case when ${paymentTable.status} = 'pending' then ${paymentTable.amount} else 0 end), 0)`,
			totalRefunded: sql<number>`coalesce(sum(${paymentTable.refundAmount}), 0)`,
			manualReviewCount: sql<number>`coalesce(sum(case when json_extract(${paymentTable.gatewayResponse}, '$.metadata.manualReview.required') = 1 then 1 else 0 end), 0)`
		})
		.from(paymentTable);
}

function toPaymentDashboardSummaryDTO(
	totals:
		| {
				totalVolume: number;
				totalCaptured: number;
				totalPending: number;
				totalRefunded: number;
				manualReviewCount: number;
		  }
		| undefined
): PaymentDashboardSummaryDTO {
	return {
		totalVolume: Number(totals?.totalVolume ?? 0),
		totalCaptured: Number(totals?.totalCaptured ?? 0),
		totalPending: Number(totals?.totalPending ?? 0),
		totalRefunded: Number(totals?.totalRefunded ?? 0),
		manualReviewCount: Number(totals?.manualReviewCount ?? 0)
	};
}

function buildPaymentListWhere(options: ListPaymentsOptions): SQL | undefined {
	const conditions: SQL[] = [];
	if (options.orderId) conditions.push(eq(paymentTable.orderId, options.orderId));
	if (options.status) conditions.push(eq(paymentTable.status, options.status));
	if (options.method) conditions.push(eq(paymentTable.method, options.method));
	return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getPayment(ctx: ServiceContext, id: string): Promise<PaymentDTO> {
	const db = getDb();
	const [row] = await withTransientD1ReadRetry(() =>
		db.select().from(paymentTable).where(eq(paymentTable.id, id))
	);
	if (!row) {
		throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, { id });
	}

	const [orderRow] = await withTransientD1ReadRetry(() =>
		db.select().from(orderTable).where(eq(orderTable.id, row.orderId))
	);
	if (orderRow) {
		requireOwnerOrAdmin(ctx.actor, orderRow.userId);
	} else {
		requireAdmin(ctx.actor);
	}

	return toPaymentDTO(row, orderRow?.status ?? null);
}

export async function recordPayment(
	ctx: ServiceContext,
	input: RecordPaymentInput
): Promise<PaymentDTO> {
	requireAdmin(ctx.actor);
	const db = getDb();
	const now = resolveNow(ctx);
	const nextStatus = input.status;
	assertRecordablePaymentStatus(nextStatus);

	try {
		const [orderRow] = await db
			.select()
			.from(orderTable)
			.where(eq(orderTable.id, input.orderId))
			.limit(1);
		if (!orderRow) {
			throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
				orderId: input.orderId
			});
		}
		const existing = input.paymentId
			? await db
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.id, input.paymentId))
					.limit(1)
					.then((rows) => rows[0])
			: await db
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.orderId, orderRow.id))
					.orderBy(desc(paymentTable.createdAt))
					.limit(1)
					.then((rows) => rows[0]);
		if (existing && existing.orderId !== orderRow.id) {
			throw new PaymentError('Payment does not belong to the order.', ErrorCode.PAYMENT_NOT_FOUND, {
				orderId: orderRow.id,
				paymentId: existing.id
			});
		}

		let paymentRow: Payment;
		let paymentStatement: Parameters<Db['batch']>[0][number];
		let guardPaymentUpdate = false;
		if (existing) {
			assertPaymentStatusTransition(existing.status, nextStatus);
			const updateValues = parsePaymentUpdate({
				status: nextStatus,
				transactionId: input.transactionId,
				gatewayResponse: 'gatewayResponse' in input ? (input.gatewayResponse ?? null) : undefined,
				paidAt: nextStatus === 'captured' ? (input.paidAt ?? now) : input.paidAt,
				updatedAt: now
			});
			paymentRow = { ...existing, ...updateValues, status: nextStatus, updatedAt: now };
			paymentStatement = db
				.update(paymentTable)
				.set(updateValues)
				.where(
					and(
						eq(paymentTable.id, existing.id),
						eq(paymentTable.status, existing.status),
						eq(paymentTable.updatedAt, existing.updatedAt)
					)
				);
			guardPaymentUpdate = true;
		} else {
			const paymentId = nanoid();
			const created = parseNewPayment({
				id: paymentId,
				orderId: orderRow.id,
				amount: input.amount ?? orderRow.totalAmount,
				currency: 'LKR',
				method: input.method ?? 'payhere',
				status: nextStatus,
				transactionId: input.transactionId ?? null,
				gatewayResponse: input.gatewayResponse ?? null,
				refundAmount: null
			});
			paymentRow = {
				id: paymentId,
				orderId: orderRow.id,
				amount: created.amount,
				currency: created.currency ?? 'LKR',
				method: created.method,
				status: created.status ?? nextStatus,
				transactionId: created.transactionId ?? null,
				gatewayResponse: created.gatewayResponse ?? null,
				refundAmount: created.refundAmount ?? null,
				refundedAt: null,
				paidAt: nextStatus === 'captured' ? (input.paidAt ?? now) : (input.paidAt ?? null),
				createdAt: now,
				updatedAt: now
			};
			paymentStatement = db.insert(paymentTable).values(paymentRow);
		}

		const preparedTransition =
			nextStatus === 'captured' && orderRow.status === 'pending'
				? await prepareOrderStatusTransition(
						db,
						ctx,
						{
							orderId: orderRow.id,
							toStatus: 'confirmed',
							note: 'Payment successfully captured.',
							now
						},
						{ includeNotifications: false }
					)
				: null;
		const paymentDto = toPaymentDTO(
			paymentRow,
			preparedTransition?.order.status ?? orderRow.status
		);
		const preparedNotifications = preparedTransition
			? await prepareOrderConfirmationNotificationInserts(db, preparedTransition.order)
			: preparePaymentUpdateNotificationInserts(db, paymentDto, orderRow);
		const statements: [
			Parameters<Db['batch']>[0][number],
			...Parameters<Db['batch']>[0][number][]
		] = [paymentStatement];
		if (guardPaymentUpdate) statements.push(...guardPreviousBatchChanges(db));
		if (preparedTransition) statements.push(...preparedTransition.statements);
		statements.push(...preparedNotifications.map((item) => item.statement));
		const committed = await withTransientD1WriteReconciliation<Payment>(
			async () => {
				await db.batch(statements);
				const [row] = await db
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.id, paymentRow.id))
					.limit(1);
				if (!row) {
					throw new PaymentError('Payment was not saved.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.id, paymentRow.id))
					.limit(1);
				return row && row.status === paymentRow.status && row.updatedAt.getTime() === now.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);

		await publishPreparedNotificationWakeups(ctx, db, preparedNotifications);
		return toPaymentDTO(committed, preparedTransition?.order.status ?? orderRow.status);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new PaymentError(
				'Payment or order state changed while the update was being saved.',
				ErrorCode.CONFLICT,
				{ orderId: input.orderId }
			);
		}
		throw mapPaymentPersistenceError(error);
	}
}

export async function recordRefund(
	ctx: ServiceContext,
	input: RecordRefundInput
): Promise<PaymentDTO> {
	requireAdmin(ctx.actor);
	const db = getDb();
	const now = resolveNow(ctx);

	try {
		const [existing] = await db
			.select()
			.from(paymentTable)
			.where(eq(paymentTable.id, input.paymentId))
			.limit(1);
		if (!existing) {
			throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, {
				paymentId: input.paymentId
			});
		}
		if (existing.status !== 'captured' && existing.status !== 'partially_refunded') {
			throw new PaymentError(
				`Cannot refund payment in status ${existing.status}.`,
				ErrorCode.VALIDATION_ERROR
			);
		}
		const [orderRow] = await db
			.select()
			.from(orderTable)
			.where(eq(orderTable.id, existing.orderId))
			.limit(1);
		if (!orderRow) {
			throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
				orderId: existing.orderId
			});
		}

		const currentRefunded = existing.refundAmount ?? 0;
		const nextRefunded = currentRefunded + input.refundAmount;
		if (nextRefunded > existing.amount) {
			throw new PaymentError(
				`Total refund amount ${nextRefunded} exceeds original payment amount ${existing.amount}.`,
				ErrorCode.VALIDATION_ERROR
			);
		}
		const finalStatus: PaymentStatus =
			nextRefunded === existing.amount ? 'refunded' : 'partially_refunded';
		const updated: Payment = {
			...existing,
			status: finalStatus,
			refundAmount: nextRefunded,
			refundedAt: now,
			gatewayResponse: input.gatewayResponse ?? existing.gatewayResponse,
			updatedAt: now
		};
		const paymentUpdate = db
			.update(paymentTable)
			.set({
				status: finalStatus,
				refundAmount: nextRefunded,
				refundedAt: now,
				gatewayResponse: updated.gatewayResponse,
				updatedAt: now
			})
			.where(
				and(
					eq(paymentTable.id, existing.id),
					eq(paymentTable.status, existing.status),
					existing.refundAmount === null
						? isNull(paymentTable.refundAmount)
						: eq(paymentTable.refundAmount, existing.refundAmount),
					eq(paymentTable.updatedAt, existing.updatedAt)
				)
			);
		const preparedTransition =
			finalStatus === 'refunded' && orderRow.status !== 'refunded'
				? await prepareOrderStatusTransition(
						db,
						ctx,
						{
							orderId: orderRow.id,
							toStatus: 'refunded',
							note: 'All payments fully refunded.',
							now
						},
						{ includeNotifications: false }
					)
				: null;
		const dto = toPaymentDTO(updated, preparedTransition?.order.status ?? orderRow.status);
		const preparedNotifications = preparePaymentUpdateNotificationInserts(db, dto, orderRow);
		const guard = guardPreviousBatchChanges(db);
		const statements: [
			Parameters<Db['batch']>[0][number],
			...Parameters<Db['batch']>[0][number][]
		] = [paymentUpdate, guard[0], guard[1]];
		if (preparedTransition) statements.push(...preparedTransition.statements);
		statements.push(...preparedNotifications.map((item) => item.statement));
		const committed = await withTransientD1WriteReconciliation<Payment>(
			async () => {
				await db.batch(statements);
				const [row] = await db
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.id, existing.id))
					.limit(1);
				if (!row) {
					throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, {
						paymentId: existing.id
					});
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.id, existing.id))
					.limit(1);
				return row &&
					row.status === finalStatus &&
					row.refundAmount === nextRefunded &&
					row.updatedAt.getTime() === now.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);
		await publishPreparedNotificationWakeups(ctx, db, preparedNotifications);
		return toPaymentDTO(committed, preparedTransition?.order.status ?? orderRow.status);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new PaymentError(
				'Payment or order state changed while the refund was being saved.',
				ErrorCode.CONFLICT,
				{ paymentId: input.paymentId }
			);
		}
		throw mapPaymentPersistenceError(error);
	}
}

// ---------------------------------------------------------------------------
// DATA TRANSFER OBJECTS & MAPS
// ---------------------------------------------------------------------------

function toPaymentDTO(row: Payment, orderStatus: OrderStatus | null = null): PaymentDTO {
	const reviewReason = getManualReviewReason(row.gatewayResponse);
	return {
		id: row.id,
		orderId: row.orderId,
		orderStatus,
		amount: row.amount,
		currency: row.currency,
		method: row.method,
		status: row.status,
		transactionId: row.transactionId,
		refundAmount: row.refundAmount,
		refundedAt: row.refundedAt,
		paidAt: row.paidAt,
		requiresManualReview: Boolean(reviewReason),
		reviewReason,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function parseNewPayment(input: NewPayment): NewPayment {
	const result = insertPaymentSchema.safeParse(input);

	if (!result.success) {
		throw new PaymentError('Invalid payment data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return removeUndefinedValues({
		...result.data,
		id: input.id
	}) as NewPayment;
}

function parsePaymentUpdate(
	input: Partial<
		NewPayment & {
			refundedAt?: Date | null;
			paidAt?: Date | null;
		}
	>
): Partial<NewPayment> {
	const result = updatePaymentSchema.safeParse({
		...input,
		refundedAt: dateToTimestampMs(input.refundedAt),
		paidAt: dateToTimestampMs(input.paidAt)
	});

	if (!result.success) {
		throw new PaymentError('Invalid payment update.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return removeUndefinedValues({
		...result.data,
		refundedAt: timestampMsToDate(result.data.refundedAt),
		paidAt: timestampMsToDate(result.data.paidAt),
		updatedAt: input.updatedAt
	}) as Partial<NewPayment>;
}

function assertRecordablePaymentStatus(status: PaymentStatus) {
	if (status === 'refunded' || status === 'partially_refunded') {
		throw new PaymentError(
			`Status ${status} must be recorded through the refund API.`,
			ErrorCode.VALIDATION_ERROR
		);
	}
}

function assertPaymentStatusTransition(from: PaymentStatus, to: PaymentStatus) {
	if (from === 'refunded') {
		throw new PaymentError(
			'Cannot update payment from refunded status.',
			ErrorCode.VALIDATION_ERROR
		);
	}
	if (from === 'captured' && to !== 'refunded' && to !== 'partially_refunded') {
		throw new PaymentError(
			'Cannot transition captured payment to non-refund status.',
			ErrorCode.VALIDATION_ERROR
		);
	}
}

function dateToTimestampMs(d: Date | null | undefined): number | null | undefined {
	if (d === undefined) return undefined;
	if (d === null) return null;
	return d.getTime();
}

function timestampMsToDate(ts: number | null | undefined): Date | null {
	if (ts === undefined || ts === null) return null;
	return new Date(ts);
}

function mapPaymentPersistenceError(error: unknown): Error {
	if (isAppError(error)) return error;
	rethrowTransientD1Error(error);
	return new PaymentError('Database operation failed.', ErrorCode.INTERNAL_ERROR, {
		cause: getErrorMessage(error)
	});
}

// ---------------------------------------------------------------------------
// GATEWAY CLIENT HELPERS
// ---------------------------------------------------------------------------

function hasPayHereConfiguration(env: ReturnType<typeof getEnv>): boolean {
	return Boolean(env.PAYHERE_MERCHANT_ID?.trim() && env.PAYHERE_MERCHANT_SECRET?.trim());
}

function hasPayPalConfiguration(env: ReturnType<typeof getEnv>): boolean {
	return Boolean(env.PAYPAL_CLIENT_ID?.trim() && env.PAYPAL_CLIENT_SECRET?.trim());
}

function getPayPalSdkUrl(isSandbox: boolean): string {
	return isSandbox
		? 'https://www.sandbox.paypal.com/web-sdk/v6/core'
		: 'https://www.paypal.com/web-sdk/v6/core';
}

function assertCheckoutPaymentMethodAvailable(
	ctx: ServiceContext,
	method: PaymentMethod
): CheckoutPaymentMethodDTO['id'] {
	if (!checkoutPaymentMethodSet.has(method)) {
		throw new PaymentError(
			'This payment method is not available at checkout.',
			ErrorCode.INVALID_PAYMENT_METHOD,
			{ method }
		);
	}

	const available = listAvailableCheckoutPaymentMethods(ctx).find((item) => item.id === method);
	if (!available) {
		throw new PaymentError(
			'This payment method is not configured.',
			ErrorCode.INVALID_PAYMENT_METHOD,
			{ method }
		);
	}
	return available.id;
}

function getPayHereConfiguration(env: ReturnType<typeof getEnv>): {
	merchantId: string;
	merchantSecret: string;
} {
	const merchantId = env.PAYHERE_MERCHANT_ID?.trim();
	const merchantSecret = env.PAYHERE_MERCHANT_SECRET?.trim();

	if (!merchantId || !merchantSecret) {
		throw new PaymentError(
			'PayHere payment is not configured. Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET.',
			ErrorCode.INTERNAL_ERROR
		);
	}

	return { merchantId, merchantSecret };
}

function getPayPalConfiguration(env: ReturnType<typeof getEnv>): {
	clientId: string;
	clientSecret: string;
} {
	const clientId = env.PAYPAL_CLIENT_ID?.trim();
	const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) {
		throw new PaymentError('PayPal payment is not configured.', ErrorCode.INTERNAL_ERROR);
	}
	return { clientId, clientSecret };
}

function formatPayHereAmount(amount: number): string {
	return amount.toFixed(2);
}

function buildPayHereCustomerFields(
	addressSnapshot: (typeof orderTable.$inferSelect)['shippingAddressSnapshot'],
	customer: { name: string; email: string }
): {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	address: string;
	city: string;
	country: string;
} {
	if (!addressSnapshot) {
		throw new PaymentError(
			'The order is missing the shipping address required by PayHere.',
			ErrorCode.VALIDATION_ERROR
		);
	}

	const fullName = addressSnapshot.recipientName.trim() || customer.name.trim();
	const nameParts = fullName.split(/\s+/).filter(Boolean);
	const firstName = nameParts.shift();
	const lastName = nameParts.join(' ') || firstName;
	const email = customer.email.trim();
	const phone = addressSnapshot.phone.trim();
	const address = [addressSnapshot.addressLine1, addressSnapshot.addressLine2]
		.map((part) => part?.trim())
		.filter((part): part is string => Boolean(part))
		.join(', ');
	const city = addressSnapshot.city.trim();

	if (!firstName || !lastName || !email || !phone || !address || !city) {
		throw new PaymentError(
			'The order is missing customer details required by PayHere.',
			ErrorCode.VALIDATION_ERROR
		);
	}

	return {
		firstName,
		lastName,
		email,
		phone,
		address,
		city,
		country: addressSnapshot.country
	};
}

async function createPayPalFxQuote(lkrAmount: number, now: Date): Promise<PayPalFxQuote> {
	try {
		const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/LKR');
		if (!res.ok) {
			throw new Error(`Exchange rate provider returned ${res.status}.`);
		}
		const data = (await res.json()) as { rates?: Record<string, number> };
		const rate = data.rates?.USD;
		if (!rate) throw new Error('USD rate was missing.');
		return buildPayPalFxQuote(lkrAmount, rate, now, 'open.er-api.com');
	} catch (error) {
		console.error('[payments] PayPal exchange quote failed:', {
			error: getErrorMessage(error)
		});
		throw new PaymentError(
			'PayPal is temporarily unavailable because an exchange quote could not be obtained.',
			ErrorCode.PAYMENT_FAILED
		);
	}
}

async function getPayPalAccessToken(
	clientId: string,
	clientSecret: string,
	isSandbox: boolean
): Promise<string> {
	const host = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
	const credentials = btoa(`${clientId}:${clientSecret}`);
	const res = await fetchWithTimeout(`${host}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});
	if (!res.ok) {
		console.error('[payments] PayPal OAuth failed:', { status: res.status });
		throw new PaymentError('PayPal is temporarily unavailable.', ErrorCode.PAYMENT_FAILED);
	}
	const data = (await res.json()) as { access_token?: string };
	if (!data.access_token) {
		throw new PaymentError('PayPal is temporarily unavailable.', ErrorCode.PAYMENT_FAILED);
	}
	return data.access_token;
}

async function createPayPalOrder(
	accessToken: string,
	orderId: string,
	orderNumber: string,
	usdAmount: string,
	requestId: string,
	isSandbox: boolean,
	appUrl: string,
	appName: string,
	returnPath: string
): Promise<string> {
	const host = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
	const res = await fetchWithTimeout(`${host}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': requestId
		},
		body: JSON.stringify({
			intent: 'CAPTURE',
			payment_source: {
				paypal: {
					experience_context: {
						brand_name: appName,
						shipping_preference: 'NO_SHIPPING',
						user_action: 'PAY_NOW',
						return_url: `${appUrl}${returnPath}`,
						cancel_url: `${appUrl}${returnPath}?payment=cancelled`
					}
				}
			},
			purchase_units: [
				{
					reference_id: orderNumber,
					amount: {
						currency_code: 'USD',
						value: usdAmount
					}
				}
			]
		})
	});
	if (!res.ok) {
		console.error('[payments] PayPal order creation failed:', { status: res.status, orderId });
		throw new PaymentError('PayPal could not start the payment.', ErrorCode.PAYMENT_FAILED);
	}
	const data = (await res.json()) as { id?: string };
	if (!data.id) {
		throw new PaymentError('PayPal could not start the payment.', ErrorCode.PAYMENT_FAILED);
	}
	return data.id;
}

type PayPalCaptureResponse = {
	status?: string;
	purchase_units?: Array<{
		payments?: {
			captures?: Array<{
				id?: string;
				status?: string;
				amount?: {
					currency_code?: string;
					value?: string;
				};
			}>;
		};
	}>;
};

async function capturePayPalOrder(
	accessToken: string,
	paypalOrderId: string,
	requestId: string,
	isSandbox: boolean
): Promise<PayPalCaptureResponse> {
	const host = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
	const res = await fetchWithTimeout(`${host}/v2/checkout/orders/${paypalOrderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': requestId
		}
	});
	if (!res.ok) {
		console.error('[payments] PayPal capture failed:', {
			status: res.status,
			paypalOrderId
		});
		throw new PaymentError('PayPal could not confirm the payment.', ErrorCode.PAYMENT_FAILED);
	}
	return (await res.json()) as PayPalCaptureResponse;
}

function readPayPalCapture(capture: PayPalCaptureResponse): {
	id: string;
	status: string;
	currency: string;
	value: string;
} {
	const capturedPayment = capture.purchase_units?.[0]?.payments?.captures?.[0];
	const amount = capturedPayment?.amount;
	if (!capturedPayment?.id || !capturedPayment.status || !amount?.currency_code || !amount.value) {
		throw new PaymentError(
			'PayPal did not return complete capture details.',
			ErrorCode.PAYMENT_FAILED
		);
	}
	return {
		id: capturedPayment.id,
		status: capturedPayment.status,
		currency: amount.currency_code,
		value: amount.value
	};
}

function createPayPalCaptureAudit(
	orderStatus: string | undefined,
	capture: ReturnType<typeof readPayPalCapture>
): Record<string, unknown> {
	return {
		orderStatus: orderStatus ?? null,
		capture: {
			id: capture.id,
			status: capture.status,
			currency: capture.currency,
			value: capture.value
		}
	};
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), PAYMENT_PROVIDER_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

function readRequiredGatewayString(payload: Record<string, unknown>, field: string): string {
	const value = payload[field];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new PaymentError(
			`Payment provider payload is missing ${field}.`,
			ErrorCode.VALIDATION_ERROR,
			{ field }
		);
	}
	return value.trim();
}

function readOptionalGatewayString(payload: Record<string, unknown>, field: string): string | null {
	const value = payload[field];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeGatewayId(value: string, field: string): string {
	const normalized = value.trim();
	if (!normalized || normalized.length > 255) {
		throw new PaymentError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { field });
	}
	return normalized;
}

function toGatewayResult(payment: PaymentDTO): PaymentGatewayResult {
	return {
		success: true,
		paymentId: payment.id,
		orderId: payment.orderId,
		status: payment.status,
		requiresManualReview: payment.requiresManualReview
	};
}

function toCheckoutPaymentAttemptDTO(row: PaymentAttempt): CheckoutPaymentAttemptDTO {
	return {
		id: row.id,
		method: row.method,
		status: row.status,
		amount: row.amount,
		currency: row.currency,
		orderId: row.orderId,
		failureReason: row.failureReason,
		expiresAt: row.expiresAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

async function writeWebhookLog(
	gateway: string,
	payload: Record<string, unknown>,
	status: string,
	errorMessage: string | null
): Promise<void> {
	try {
		const db = getDb();
		const id = nanoid();
		const auditPayload = gateway === 'payhere' ? sanitizePayHereWebhookPayload(payload) : {};
		await withTransientD1WriteReconciliation(
			() =>
				db.insert(paymentWebhookLogTable).values({
					id,
					gateway,
					payload: auditPayload,
					status,
					errorMessage
				}),
			async () => {
				const [row] = await db
					.select({ id: paymentWebhookLogTable.id })
					.from(paymentWebhookLogTable)
					.where(eq(paymentWebhookLogTable.id, id))
					.limit(1);
				return row ? { committed: true, value: undefined } : { committed: false };
			}
		);
	} catch (error) {
		console.error('[payments] Failed to write webhook audit log:', {
			gateway,
			error: getErrorMessage(error)
		});
	}
}
