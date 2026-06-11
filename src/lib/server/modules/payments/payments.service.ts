import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import { getEnv } from '$lib/server/infrastructure/env';
import { ErrorCode, PaymentError, getErrorMessage } from '$lib/server/infrastructure/errors';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	resolveNow,
	removeUndefinedValues,
	normalizeLimit,
	normalizeOffset
} from '$lib/server/foundation/utils';
import {
	payment as paymentTable,
	paymentWebhookLog as paymentWebhookLogTable,
	insertPaymentSchema,
	updatePaymentSchema,
	CHECKOUT_PAYMENT_METHODS,
	type Payment,
	type PaymentMethod,
	type NewPayment,
	type PaymentStatus
} from './payments.drizzle';
import { user as userTable } from '../auth/auth.drizzle';
import { order as orderTable, type OrderStatus } from '../orders/orders.drizzle';
import {
	transitionOrderStatusTx,
	enqueuePaymentUpdateNotificationTx
} from '../orders/orders.service';
import { publishNotificationQueueMessages } from '../notifications/outbox/outbox.service';
import type { NotificationOutboxDTO } from '../notifications/outbox/outbox.types';
import {
	createPayPalFxQuote as buildPayPalFxQuote,
	decideCapturedOrderAction,
	generatePayHereCheckoutHash,
	getGatewayMetadata,
	getManualReviewReason,
	mapPayHereStatus,
	mergeGatewayEnvelope,
	resolvePublicPaymentEmail,
	verifyPayHereWebhookSignature,
	type GatewayMetadata,
	type PayPalFxQuote
} from './payments.logic';
import type {
	CapturePayPalReturnInput,
	CheckoutPaymentMethodDTO,
	PaymentDTO,
	CreatePaymentSessionInput,
	CreatePaymentSessionResult,
	PaymentDashboardSummaryDTO,
	PaymentGatewayResult,
	ProcessPayHereWebhookInput,
	ValidateCheckoutPaymentSelectionInput,
	ValidatedCheckoutPaymentSelection,
	ListPaymentsOptions,
	PaymentListResult,
	RecordPaymentInput,
	RecordRefundInput
} from './payments.types';

type Db = ReturnType<typeof getDb>;
export type PaymentsTx = Parameters<Parameters<Db['transaction']>[0]>[0];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const PAYMENT_PROVIDER_TIMEOUT_MS = 10_000;
const checkoutPaymentMethodSet = new Set<string>(CHECKOUT_PAYMENT_METHODS);

// ---------------------------------------------------------------------------
// CORE EXPORTS
// ---------------------------------------------------------------------------

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
			requiresBillingEmail: false
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

	const [customer] = await getDb()
		.select({ email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, actor.id))
		.limit(1);
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

export async function createPaymentSession(
	ctx: ServiceContext,
	input: CreatePaymentSessionInput
): Promise<CreatePaymentSessionResult> {
	const db = getDb();
	const env = getEnv();
	const now = resolveNow(ctx);
	const method = assertCheckoutPaymentMethodAvailable(ctx, input.method);

	if (method === 'cash_on_delivery') {
		throw new PaymentError(
			'Cash on delivery does not require a payment session.',
			ErrorCode.PAYMENT_ALREADY_PROCESSED
		);
	}

	// Load order
	const [orderRow] = await db.select().from(orderTable).where(eq(orderTable.id, input.orderId));
	if (!orderRow) {
		throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
			orderId: input.orderId
		});
	}

	requireOwnerOrAdmin(ctx.actor, orderRow.userId);

	if (orderRow.status !== 'pending') {
		throw new PaymentError(
			'Payment can no longer be started for this order.',
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

	// Inside transaction, record or update payment row
	const paymentDto = await db.transaction(async (tx) => {
		const existingPayment = await tx
			.select()
			.from(paymentTable)
			.where(eq(paymentTable.orderId, orderRow.id))
			.orderBy(desc(paymentTable.createdAt))
			.limit(1)
			.then((rows) => rows[0]);

		if (existingPayment) {
			if (
				existingPayment.status === 'captured' ||
				existingPayment.status === 'partially_refunded' ||
				existingPayment.status === 'refunded'
			) {
				throw new PaymentError(
					'This payment has already been processed.',
					ErrorCode.PAYMENT_ALREADY_PROCESSED,
					{ paymentId: existingPayment.id, status: existingPayment.status }
				);
			}
			if (existingPayment.method !== method) {
				throw new PaymentError(
					'The payment method cannot be changed for this order.',
					ErrorCode.INVALID_PAYMENT_METHOD,
					{
						orderId: orderRow.id,
						currentMethod: existingPayment.method,
						requestedMethod: method
					}
				);
			}

			const [updated] = await tx
				.update(paymentTable)
				.set({
					status: 'pending',
					bankSlipR2Key: input.bankSlipR2Key ?? null,
					bankReference: input.bankReference ?? null,
					amount: orderRow.totalAmount,
					updatedAt: now
				})
				.where(eq(paymentTable.id, existingPayment.id))
				.returning();
			return toPaymentDTO(updated, orderRow.status);
		} else {
			const [created] = await tx
				.insert(paymentTable)
				.values({
					orderId: orderRow.id,
					amount: orderRow.totalAmount,
					currency: 'LKR',
					method,
					status: 'pending',
					bankSlipR2Key: input.bankSlipR2Key ?? null,
					bankReference: input.bankReference ?? null
				})
				.returning();
			return toPaymentDTO(created, orderRow.status);
		}
	});

	if (method === 'payhere') {
		const { merchantId, merchantSecret } = getPayHereConfiguration(env);
		const isSandbox = env.PAYHERE_IS_SANDBOX === 'true';
		const checkoutUrl = isSandbox
			? 'https://sandbox.payhere.lk/pay/checkout'
			: 'https://www.payhere.lk/pay/checkout';

		if (!orderRow.userId) {
			throw new PaymentError(
				'PayHere checkout requires an order linked to a customer account.',
				ErrorCode.VALIDATION_ERROR,
				{ orderId: orderRow.id }
			);
		}

		const [customer] = await db
			.select({
				name: userTable.name,
				email: userTable.email
			})
			.from(userTable)
			.where(eq(userTable.id, orderRow.userId))
			.limit(1);

		if (!customer) {
			throw new PaymentError(
				'Customer details could not be loaded for PayHere checkout.',
				ErrorCode.INTERNAL_ERROR,
				{
					orderId: orderRow.id,
					userId: orderRow.userId
				}
			);
		}

		const existingMetadata = getGatewayMetadata(paymentDto.gatewayResponse);
		const billingEmail =
			resolvePublicPaymentEmail(input.billingEmail) ??
			resolvePublicPaymentEmail(existingMetadata.billingEmail) ??
			resolvePublicPaymentEmail(customer.email);
		if (!billingEmail) {
			throw new PaymentError(
				'Enter a valid billing email to continue with card payment.',
				ErrorCode.VALIDATION_ERROR,
				{ field: 'billingEmail', orderId: orderRow.id }
			);
		}

		const customerFields = buildPayHereCustomerFields(orderRow.shippingAddressSnapshot, {
			name: customer.name,
			email: billingEmail
		});
		await db
			.update(paymentTable)
			.set({
				gatewayResponse: mergeGatewayEnvelope(paymentDto.gatewayResponse, {
					metadata: { ...existingMetadata, billingEmail }
				}),
				updatedAt: now
			})
			.where(eq(paymentTable.id, paymentDto.id));
		const formattedAmount = formatPayHereAmount(paymentDto.amount);
		const hash = generatePayHereCheckoutHash(
			merchantId,
			orderRow.id,
			formattedAmount,
			paymentDto.currency,
			merchantSecret
		);

		return {
			paymentId: paymentDto.id,
			method,
			redirectUrl: checkoutUrl,
			paymentData: {
				merchant_id: merchantId,
				return_url: `${env.PUBLIC_APP_URL}/checkout/confirmation/${orderRow.id}`,
				cancel_url: `${env.PUBLIC_APP_URL}/checkout/confirmation/${orderRow.id}?payment=cancelled`,
				notify_url: `${env.PUBLIC_APP_URL}/api/payments/webhooks/payhere`,
				order_id: orderRow.id,
				items: `Order ${orderRow.orderNumber}`,
				first_name: customerFields.firstName,
				last_name: customerFields.lastName,
				email: customerFields.email,
				phone: customerFields.phone,
				address: customerFields.address,
				city: customerFields.city,
				country: customerFields.country,
				currency: paymentDto.currency,
				amount: formattedAmount,
				hash: hash
			}
		};
	}

	if (method === 'paypal') {
		const clientId = env.PAYPAL_CLIENT_ID!;
		const clientSecret = env.PAYPAL_CLIENT_SECRET!;
		const isSandbox = env.PAYPAL_IS_SANDBOX === 'true';
		const existingMetadata = getGatewayMetadata(paymentDto.gatewayResponse);
		const quote =
			existingMetadata.paypalFxQuote ?? (await createPayPalFxQuote(paymentDto.amount, now));
		const requestIds = existingMetadata.paypalRequestIds ?? {
			create: `${paymentDto.id}-create`,
			capture: `${paymentDto.id}-capture`
		};
		const nextMetadata: GatewayMetadata = {
			...existingMetadata,
			paypalFxQuote: quote,
			paypalRequestIds: requestIds
		};

		const token = await getPayPalAccessToken(clientId, clientSecret, isSandbox);
		const { id: paypalOrderId, approveUrl } = await createPayPalOrder(
			token,
			orderRow.id,
			orderRow.orderNumber,
			quote.usdAmount,
			requestIds.create,
			isSandbox,
			env.PUBLIC_APP_URL
		);

		await db
			.update(paymentTable)
			.set({
				transactionId: paypalOrderId,
				gatewayResponse: mergeGatewayEnvelope(paymentDto.gatewayResponse, {
					metadata: nextMetadata
				}),
				updatedAt: now
			})
			.where(eq(paymentTable.id, paymentDto.id));

		return {
			paymentId: paymentDto.id,
			method,
			redirectUrl: approveUrl
		};
	}

	throw new PaymentError(`Unsupported payment method: ${method}`, ErrorCode.INVALID_PAYMENT_METHOD);
}

export async function processPayHereWebhook(
	ctx: ServiceContext,
	input: ProcessPayHereWebhookInput
): Promise<PaymentGatewayResult> {
	const env = getEnv();
	const { merchantId, merchantSecret } = getPayHereConfiguration(env);
	const payload = input.payload;
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
			providerResponse: payload,
			note: 'PayHere payment captured.',
			now: resolveNow(ctx)
		});
		await writeWebhookLog('payhere', payload, 'processed', null);
		return result;
	} catch (error) {
		const message = getErrorMessage(error);
		await writeWebhookLog(
			'payhere',
			payload,
			message.includes('signature') ? 'signature_mismatch' : 'failed',
			message
		);
		throw error;
	}
}

export async function capturePayPalReturn(
	ctx: ServiceContext,
	input: CapturePayPalReturnInput
): Promise<PaymentGatewayResult> {
	const env = getEnv();
	const paypalOrderId = normalizeGatewayId(input.paypalOrderId, 'paypalOrderId');
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

	if (
		paymentRow.status === 'captured' ||
		paymentRow.status === 'partially_refunded' ||
		paymentRow.status === 'refunded'
	) {
		const [orderRow] = await getDb()
			.select({ status: orderTable.status })
			.from(orderTable)
			.where(eq(orderTable.id, paymentRow.orderId))
			.limit(1);
		return toGatewayResult(toPaymentDTO(paymentRow, orderRow?.status ?? null));
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
	const capturedAmount = readPayPalCaptureAmount(capture);
	if (
		capture.status !== 'COMPLETED' ||
		capturedAmount.currency !== 'USD' ||
		capturedAmount.value !== quote.usdAmount
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
		providerResponse: {
			capture,
			payerId: input.payerId ?? null
		},
		note: 'PayPal payment captured.',
		now: resolveNow(ctx)
	});
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
	let notification: NotificationOutboxDTO | null = null;
	const result = await getDb().transaction(async (tx) => {
		const [paymentRow] = await tx
			.select()
			.from(paymentTable)
			.where(eq(paymentTable.id, input.paymentId))
			.limit(1);
		if (!paymentRow) {
			throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, {
				paymentId: input.paymentId
			});
		}

		const [orderRow] = await tx
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
		let nextOrderStatus = orderRow.status;
		let manualReviewReason: string | null = getManualReviewReason(paymentRow.gatewayResponse);

		if (!terminalPayment && input.status === 'captured') {
			if (captureAction === 'confirm') {
				const confirmed = await transitionOrderStatusTx(tx, ctx, {
					orderId: orderRow.id,
					toStatus: 'confirmed',
					note: input.note,
					now: input.now
				});
				nextOrderStatus = confirmed.status;
			} else if (captureAction === 'cancel_and_review') {
				const cancelled = await transitionOrderStatusTx(tx, ctx, {
					orderId: orderRow.id,
					toStatus: 'cancelled',
					note: 'Payment arrived after the checkout window expired.',
					now: input.now
				});
				nextOrderStatus = cancelled.status;
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
		const changed =
			nextStatus !== paymentRow.status ||
			input.transactionId !== paymentRow.transactionId ||
			manualReviewReason !== getManualReviewReason(paymentRow.gatewayResponse);
		const [updated] = await tx
			.update(paymentTable)
			.set({
				status: nextStatus,
				transactionId: input.transactionId ?? paymentRow.transactionId,
				gatewayResponse,
				paidAt: nextStatus === 'captured' ? (paymentRow.paidAt ?? input.now) : paymentRow.paidAt,
				updatedAt: input.now
			})
			.where(eq(paymentTable.id, paymentRow.id))
			.returning();
		if (!updated) {
			throw new PaymentError('Payment update failed.', ErrorCode.INTERNAL_ERROR);
		}

		const dto = toPaymentDTO(updated, nextOrderStatus);
		if (changed && !dto.requiresManualReview) {
			notification = await enqueuePaymentUpdateNotificationTx(
				tx as unknown as Parameters<typeof enqueuePaymentUpdateNotificationTx>[0],
				dto
			);
		}
		return dto;
	});

	if (notification) {
		await publishNotificationQueueMessages(ctx, [notification]);
	}
	return toGatewayResult(result);
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

	const [totalCountRow] = await db.select({ count: count() }).from(paymentTable).where(whereClause);
	const total = totalCountRow?.count ?? 0;

	const rows = await db
		.select({
			payment: paymentTable,
			orderStatus: orderTable.status
		})
		.from(paymentTable)
		.leftJoin(orderTable, eq(orderTable.id, paymentTable.orderId))
		.where(whereClause)
		.orderBy(desc(paymentTable.createdAt))
		.limit(limit)
		.offset(offset);

	return {
		items: rows.map((row) => toPaymentDTO(row.payment, row.orderStatus)),
		total,
		limit,
		offset
	};
}

export async function getPaymentDashboardSummary(
	ctx: ServiceContext
): Promise<PaymentDashboardSummaryDTO> {
	requireAdmin(ctx.actor);
	const db = getDb();
	const [totals] = await db
		.select({
			totalVolume: sql<number>`coalesce(sum(${paymentTable.amount}), 0)`,
			totalCaptured: sql<number>`coalesce(sum(case when ${paymentTable.status} in ('captured', 'partially_refunded', 'refunded') then ${paymentTable.amount} else 0 end), 0)`,
			totalPending: sql<number>`coalesce(sum(case when ${paymentTable.status} = 'pending' then ${paymentTable.amount} else 0 end), 0)`,
			totalRefunded: sql<number>`coalesce(sum(${paymentTable.refundAmount}), 0)`
		})
		.from(paymentTable);
	const gatewayRows = await db
		.select({ gatewayResponse: paymentTable.gatewayResponse })
		.from(paymentTable);

	return {
		totalVolume: Number(totals?.totalVolume ?? 0),
		totalCaptured: Number(totals?.totalCaptured ?? 0),
		totalPending: Number(totals?.totalPending ?? 0),
		totalRefunded: Number(totals?.totalRefunded ?? 0),
		manualReviewCount: gatewayRows.filter((row) => getManualReviewReason(row.gatewayResponse))
			.length
	};
}

export async function getPayment(ctx: ServiceContext, id: string): Promise<PaymentDTO> {
	const db = getDb();
	const [row] = await db.select().from(paymentTable).where(eq(paymentTable.id, id));
	if (!row) {
		throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, { id });
	}

	const [orderRow] = await db.select().from(orderTable).where(eq(orderTable.id, row.orderId));
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
	let notificationsToPublish: NonNullable<
		Awaited<ReturnType<typeof enqueuePaymentUpdateNotificationTx>>
	>[] = [];
	try {
		const result = await getDb().transaction(async (tx) => {
			const paymentDto = await recordPaymentTx(tx, ctx, input);
			const notification = await enqueuePaymentUpdateNotificationTx(
				tx as unknown as Parameters<typeof enqueuePaymentUpdateNotificationTx>[0],
				paymentDto
			);
			if (notification) notificationsToPublish = [notification];
			return paymentDto;
		});
		await publishNotificationQueueMessages(ctx, notificationsToPublish);
		return result;
	} catch (error) {
		throw mapPaymentPersistenceError(error);
	}
}

export async function recordPaymentTx(
	tx: PaymentsTx,
	ctx: ServiceContext,
	input: RecordPaymentInput
): Promise<PaymentDTO> {
	const now = resolveNow(ctx);
	const nextStatus = input.status;

	assertRecordablePaymentStatus(nextStatus);

	const [orderRow] = await tx.select().from(orderTable).where(eq(orderTable.id, input.orderId));
	if (!orderRow) {
		throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
			orderId: input.orderId
		});
	}

	// Fetch existing payment
	const existing = input.paymentId
		? await tx
				.select()
				.from(paymentTable)
				.where(eq(paymentTable.id, input.paymentId))
				.limit(1)
				.then((rows) => rows[0])
		: await tx
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

	let row: Payment;
	if (existing) {
		assertPaymentStatusTransition(existing.status, nextStatus);

		const [updated] = await tx
			.update(paymentTable)
			.set(
				parsePaymentUpdate({
					status: nextStatus,
					transactionId: input.transactionId,
					gatewayResponse: 'gatewayResponse' in input ? (input.gatewayResponse ?? null) : undefined,
					paidAt: nextStatus === 'captured' ? (input.paidAt ?? now) : input.paidAt
				})
			)
			.where(eq(paymentTable.id, existing.id))
			.returning();

		if (!updated) {
			throw new PaymentError('Payment update failed.', ErrorCode.INTERNAL_ERROR);
		}
		row = updated;
	} else {
		const createdValues = parseNewPayment({
			orderId: orderRow.id,
			amount: input.amount ?? orderRow.totalAmount,
			currency: 'LKR',
			method: input.method ?? 'payhere',
			status: nextStatus,
			transactionId: input.transactionId ?? null,
			gatewayResponse: input.gatewayResponse ?? null,
			refundAmount: null,
			bankSlipR2Key: input.bankSlipR2Key ?? null,
			bankReference: input.bankReference ?? null
		});

		const [created] = await tx.insert(paymentTable).values(createdValues).returning();
		if (!created) {
			throw new PaymentError('Payment insertion failed.', ErrorCode.INTERNAL_ERROR);
		}
		row = created;
	}

	// If capturing payment, transition order to confirmed
	if (nextStatus === 'captured' && orderRow.status === 'pending') {
		await transitionOrderStatusTx(tx, ctx, {
			orderId: orderRow.id,
			toStatus: 'confirmed',
			note: 'Payment successfully captured.'
		});
	}

	return toPaymentDTO(
		row,
		nextStatus === 'captured' && orderRow.status === 'pending' ? 'confirmed' : orderRow.status
	);
}

export async function recordRefund(
	ctx: ServiceContext,
	input: RecordRefundInput
): Promise<PaymentDTO> {
	requireAdmin(ctx.actor);
	let notificationsToPublish: NonNullable<
		Awaited<ReturnType<typeof enqueuePaymentUpdateNotificationTx>>
	>[] = [];
	try {
		const result = await getDb().transaction(async (tx) => {
			const paymentDto = await recordRefundTx(tx, ctx, input);
			const notification = await enqueuePaymentUpdateNotificationTx(
				tx as unknown as Parameters<typeof enqueuePaymentUpdateNotificationTx>[0],
				paymentDto
			);
			if (notification) notificationsToPublish = [notification];
			return paymentDto;
		});
		await publishNotificationQueueMessages(ctx, notificationsToPublish);
		return result;
	} catch (error) {
		throw mapPaymentPersistenceError(error);
	}
}

export async function recordRefundTx(
	tx: PaymentsTx,
	ctx: ServiceContext,
	input: RecordRefundInput
): Promise<PaymentDTO> {
	const now = resolveNow(ctx);
	const paymentId = input.paymentId;

	const [existing] = await tx.select().from(paymentTable).where(eq(paymentTable.id, paymentId));
	if (!existing) {
		throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND, { paymentId });
	}

	if (existing.status !== 'captured' && existing.status !== 'partially_refunded') {
		throw new PaymentError(
			`Cannot refund payment in status ${existing.status}.`,
			ErrorCode.VALIDATION_ERROR
		);
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

	const [updated] = await tx
		.update(paymentTable)
		.set({
			status: finalStatus,
			refundAmount: nextRefunded,
			refundedAt: now,
			gatewayResponse: input.gatewayResponse ?? existing.gatewayResponse,
			updatedAt: now
		})
		.where(eq(paymentTable.id, paymentId))
		.returning();

	if (!updated) {
		throw new PaymentError('Payment refund update failed.', ErrorCode.INTERNAL_ERROR);
	}

	// Update order status if fully refunded
	if (finalStatus === 'refunded') {
		const [orderRow] = await tx
			.select()
			.from(orderTable)
			.where(eq(orderTable.id, existing.orderId));
		if (orderRow && orderRow.status !== 'refunded') {
			await transitionOrderStatusTx(tx, ctx, {
				orderId: orderRow.id,
				toStatus: 'refunded',
				note: 'All payments fully refunded.'
			});
		}
	}

	const [orderRow] = await tx
		.select({ status: orderTable.status })
		.from(orderTable)
		.where(eq(orderTable.id, existing.orderId))
		.limit(1);
	return toPaymentDTO(
		updated,
		finalStatus === 'refunded' ? 'refunded' : (orderRow?.status ?? null)
	);
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
		gatewayResponse: row.gatewayResponse,
		refundAmount: row.refundAmount,
		refundedAt: row.refundedAt,
		paidAt: row.paidAt,
		bankSlipR2Key: row.bankSlipR2Key,
		bankReference: row.bankReference,
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
	return error instanceof PaymentError
		? error
		: new PaymentError(
				error instanceof Error ? error.message : 'Database error',
				ErrorCode.INTERNAL_ERROR
			);
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
	appUrl: string
): Promise<{ id: string; approveUrl: string }> {
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
			purchase_units: [
				{
					reference_id: orderNumber,
					amount: {
						currency_code: 'USD',
						value: usdAmount
					}
				}
			],
			application_context: {
				brand_name: 'Caro Clothing',
				landing_page: 'NO_PREFERENCE',
				user_action: 'PAY_NOW',
				return_url: `${appUrl}/api/payments/paypal/return?orderId=${encodeURIComponent(orderId)}`,
				cancel_url: `${appUrl}/checkout/confirmation/${orderId}?payment=cancelled`
			}
		})
	});
	if (!res.ok) {
		console.error('[payments] PayPal order creation failed:', { status: res.status, orderId });
		throw new PaymentError('PayPal could not start the payment.', ErrorCode.PAYMENT_FAILED);
	}
	const data = (await res.json()) as { id?: string; links?: { rel: string; href: string }[] };
	const approveLink = data.links?.find(
		(l: { rel: string; href: string }) => l.rel === 'approve' || l.rel === 'payer-action'
	);
	if (!data.id || !approveLink) {
		throw new PaymentError('PayPal could not start the payment.', ErrorCode.PAYMENT_FAILED);
	}
	return { id: data.id, approveUrl: approveLink.href };
}

type PayPalCaptureResponse = {
	status?: string;
	purchase_units?: Array<{
		payments?: {
			captures?: Array<{
				id?: string;
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

function readPayPalCaptureAmount(capture: PayPalCaptureResponse): {
	currency: string;
	value: string;
} {
	const amount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
	if (!amount?.currency_code || !amount.value) {
		throw new PaymentError(
			'PayPal did not return captured amount details.',
			ErrorCode.PAYMENT_FAILED
		);
	}
	return { currency: amount.currency_code, value: amount.value };
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

async function writeWebhookLog(
	gateway: string,
	payload: Record<string, unknown>,
	status: string,
	errorMessage: string | null
): Promise<void> {
	try {
		await getDb().insert(paymentWebhookLogTable).values({
			gateway,
			payload,
			status,
			errorMessage
		});
	} catch (error) {
		console.error('[payments] Failed to write webhook audit log:', {
			gateway,
			error: getErrorMessage(error)
		});
	}
}
