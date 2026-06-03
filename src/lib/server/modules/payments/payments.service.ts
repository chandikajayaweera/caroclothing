import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import crypto from 'crypto';
import { getDb } from '$lib/server/db';
import { requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import { getEnv } from '$lib/server/infrastructure/env';
import { ErrorCode, PaymentError } from '$lib/server/infrastructure/errors';
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
	type Payment,
	type NewPayment,
	type PaymentStatus
} from './payments.drizzle';
import { order as orderTable } from '../orders/orders.drizzle';
import {
	transitionOrderStatusTx,
	enqueuePaymentUpdateNotificationTx
} from '../orders/orders.service';
import { publishNotificationQueueMessages } from '../notifications/outbox/outbox.service';
import type {
	PaymentDTO,
	CreatePaymentSessionInput,
	CreatePaymentSessionResult,
	ProcessWebhookInput,
	ProcessWebhookResult,
	ListPaymentsOptions,
	PaymentListResult,
	RecordPaymentInput,
	RecordRefundInput
} from './payments.types';

type Db = ReturnType<typeof getDb>;
export type PaymentsTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | PaymentsTx;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// CORE EXPORTS
// ---------------------------------------------------------------------------

export async function createPaymentSession(
	ctx: ServiceContext,
	input: CreatePaymentSessionInput
): Promise<CreatePaymentSessionResult> {
	const db = getDb();
	const env = getEnv();

	// Load order
	const [orderRow] = await db.select().from(orderTable).where(eq(orderTable.id, input.orderId));
	if (!orderRow) {
		throw new PaymentError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
			orderId: input.orderId
		});
	}

	requireOwnerOrAdmin(ctx.actor, orderRow.userId);

	// Inside transaction, record or update payment row
	const paymentDto = await db.transaction(async (tx) => {
		const existingPayment = await tx
			.select()
			.from(paymentTable)
			.where(and(eq(paymentTable.orderId, orderRow.id), eq(paymentTable.status, 'pending')))
			.limit(1)
			.then((rows) => rows[0]);

		if (existingPayment) {
			// Update payment method and values
			const [updated] = await tx
				.update(paymentTable)
				.set({
					method: input.method,
					bankSlipR2Key: input.bankSlipR2Key ?? null,
					bankReference: input.bankReference ?? null,
					amount: orderRow.totalAmount,
					updatedAt: new Date()
				})
				.where(eq(paymentTable.id, existingPayment.id))
				.returning();
			return toPaymentDTO(updated);
		} else {
			// Create new payment row
			const [created] = await tx
				.insert(paymentTable)
				.values({
					orderId: orderRow.id,
					amount: orderRow.totalAmount,
					currency: 'LKR',
					method: input.method,
					status: 'pending',
					bankSlipR2Key: input.bankSlipR2Key ?? null,
					bankReference: input.bankReference ?? null
				})
				.returning();
			return toPaymentDTO(created);
		}
	});

	// Build Gateway Actions
	if (input.method === 'bank_transfer' || input.method === 'cash_on_delivery') {
		return {
			paymentId: paymentDto.id,
			method: input.method
		};
	}

	if (input.method === 'payhere') {
		const merchantId = env.PAYHERE_MERCHANT_ID || '1215800'; // Default sandbox merchant id
		const merchantSecret = env.PAYHERE_MERCHANT_SECRET || 'sandbox_secret';
		const isSandbox = env.PAYHERE_IS_SANDBOX === 'true';
		const checkoutUrl = isSandbox
			? 'https://sandbox.payhere.lk/pay/checkout'
			: 'https://www.payhere.lk/pay/checkout';

		const hash = generatePayHereHash(
			merchantId,
			orderRow.id,
			paymentDto.amount,
			paymentDto.currency,
			merchantSecret
		);

		return {
			paymentId: paymentDto.id,
			method: input.method,
			redirectUrl: checkoutUrl,
			paymentData: {
				merchant_id: merchantId,
				return_url: `${env.PUBLIC_APP_URL}/checkout/confirmation/${orderRow.id}`,
				cancel_url: `${env.PUBLIC_APP_URL}/checkout?payment=cancelled`,
				notify_url: `${env.PUBLIC_APP_URL}/api/payments/webhooks/payhere`,
				order_id: orderRow.id,
				items: `Order ${orderRow.orderNumber}`,
				currency: paymentDto.currency,
				amount: paymentDto.amount.toString(),
				hash: hash
			}
		};
	}

	if (input.method === 'paypal') {
		const clientId = env.PAYPAL_CLIENT_ID;
		const clientSecret = env.PAYPAL_CLIENT_SECRET;
		const isSandbox = env.PAYPAL_IS_SANDBOX === 'true';

		if (!clientId || !clientSecret) {
			// Sandbox fallback for local development if keys not set
			return {
				paymentId: paymentDto.id,
				method: input.method,
				redirectUrl: `${env.PUBLIC_APP_URL}/checkout/confirmation/${orderRow.id}?mock_paypal=success`
			};
		}

		// Dynamic currency exchange from LKR to USD
		const rate = await getLkrToUsdRate();
		// All monetary values are whole LKR integer amounts. No floats.
		const convertedAmount = paymentDto.amount * rate;

		const token = await getPayPalAccessToken(clientId, clientSecret, isSandbox);
		const { id: paypalOrderId, approveUrl } = await createPayPalOrder(
			token,
			orderRow.orderNumber,
			convertedAmount,
			isSandbox,
			env.PUBLIC_APP_URL
		);

		// Record the PayPal order ID in transactionId
		await db
			.update(paymentTable)
			.set({ transactionId: paypalOrderId })
			.where(eq(paymentTable.id, paymentDto.id));

		return {
			paymentId: paymentDto.id,
			method: input.method,
			redirectUrl: approveUrl
		};
	}

	if (input.method === 'paykoko') {
		// Mock/sandbox paykoko redirect url since it does not have direct SDK
		const mockRedirectUrl = `https://sandbox.paykoko.com/checkout?merchant_id=${env.PAYKOKO_API_KEY || 'demo'}&order_id=${orderRow.id}&amount=${paymentDto.amount}`;
		return {
			paymentId: paymentDto.id,
			method: input.method,
			redirectUrl: mockRedirectUrl
		};
	}

	if (input.method === 'mintpay') {
		// Mock/sandbox mintpay redirect url
		const mockRedirectUrl = `https://sandbox.mintpay.lk/checkout?merchant_id=${env.MINTPAY_API_KEY || 'demo'}&order_id=${orderRow.id}&amount=${paymentDto.amount}`;
		return {
			paymentId: paymentDto.id,
			method: input.method,
			redirectUrl: mockRedirectUrl
		};
	}

	throw new PaymentError(`Unsupported payment method: ${input.method}`, ErrorCode.VALIDATION_ERROR);
}

export async function processWebhook(
	ctx: ServiceContext,
	input: ProcessWebhookInput
): Promise<ProcessWebhookResult> {
	const db = getDb();
	const env = getEnv();

	let logStatus = 'processed';
	let logError = '';
	let paymentId = '';
	let orderId = '';
	let finalStatus: PaymentStatus = 'pending';

	try {
		if (input.gateway === 'payhere') {
			const merchant_id =
				typeof input.payload.merchant_id === 'string' ? input.payload.merchant_id : '';
			const order_id = typeof input.payload.order_id === 'string' ? input.payload.order_id : '';
			const payment_id =
				typeof input.payload.payment_id === 'string' ? input.payload.payment_id : '';
			const payhere_amount =
				typeof input.payload.payhere_amount === 'string' ? input.payload.payhere_amount : '';
			const payhere_currency =
				typeof input.payload.payhere_currency === 'string' ? input.payload.payhere_currency : '';
			const status_code =
				typeof input.payload.status_code === 'string' ? input.payload.status_code : '';
			const md5sig = typeof input.payload.md5sig === 'string' ? input.payload.md5sig : '';

			orderId = order_id;

			// Verify MD5 Signature
			const merchantSecret = env.PAYHERE_MERCHANT_SECRET || 'sandbox_secret';
			const hashedSecret = crypto
				.createHash('md5')
				.update(merchantSecret)
				.digest('hex')
				.toUpperCase();
			const localSigInput =
				merchant_id + order_id + payhere_amount + payhere_currency + status_code + hashedSecret;
			const localSig = crypto.createHash('md5').update(localSigInput).digest('hex').toUpperCase();

			if (localSig !== md5sig) {
				logStatus = 'signature_mismatch';
				throw new PaymentError(
					'PayHere IPN signature verification failed.',
					ErrorCode.VALIDATION_ERROR
				);
			}

			// Map status code (2 = success)
			if (status_code === '2') {
				finalStatus = 'captured';
			} else if (status_code === '0') {
				finalStatus = 'pending';
			} else if (status_code === '-1' || status_code === '-2') {
				finalStatus = 'failed';
			} else {
				finalStatus = 'failed';
			}

			// Process database updates inside transaction
			await db.transaction(async (tx) => {
				const paymentRow = await tx
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.orderId, order_id))
					.limit(1)
					.then((rows) => rows[0]);

				if (!paymentRow) {
					throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND);
				}

				paymentId = paymentRow.id;

				// Update payment status
				await tx
					.update(paymentTable)
					.set({
						status: finalStatus,
						transactionId: payment_id,
						gatewayResponse: input.payload,
						paidAt: finalStatus === 'captured' ? new Date() : null,
						updatedAt: new Date()
					})
					.where(eq(paymentTable.id, paymentRow.id));

				if (finalStatus === 'captured') {
					await transitionOrderStatusTx(tx, ctx, {
						orderId: order_id,
						toStatus: 'confirmed',
						note: 'PayHere payment captured.'
					});
				}
			});
		} else if (input.gateway === 'paypal-return') {
			// PayPal returns redirect back to return_url
			const paypalOrderId = typeof input.payload.token === 'string' ? input.payload.token : ''; // PayPal Order ID is passed as 'token'

			const paymentRow = await db
				.select()
				.from(paymentTable)
				.where(eq(paymentTable.transactionId, paypalOrderId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!paymentRow) {
				throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND);
			}

			paymentId = paymentRow.id;
			orderId = paymentRow.orderId;

			const clientId = env.PAYPAL_CLIENT_ID;
			const clientSecret = env.PAYPAL_CLIENT_SECRET;
			const isSandbox = env.PAYPAL_IS_SANDBOX === 'true';

			if (clientId && clientSecret) {
				// Live call to capture PayPal Order
				const token = await getPayPalAccessToken(clientId, clientSecret, isSandbox);
				const captureRes = (await capturePayPalOrder(token, paypalOrderId, isSandbox)) as {
					status?: string;
				};

				const status = captureRes.status;
				if (status === 'COMPLETED') {
					finalStatus = 'captured';
				} else {
					finalStatus = 'failed';
				}

				await db.transaction(async (tx) => {
					await tx
						.update(paymentTable)
						.set({
							status: finalStatus,
							gatewayResponse: captureRes,
							paidAt: finalStatus === 'captured' ? new Date() : null,
							updatedAt: new Date()
						})
						.where(eq(paymentTable.id, paymentRow.id));

					if (finalStatus === 'captured') {
						await transitionOrderStatusTx(tx, ctx, {
							orderId: orderId,
							toStatus: 'confirmed',
							note: 'PayPal payment captured.'
						});
					}
				});
			} else {
				// Mock mode capture success for local sandbox
				finalStatus = 'captured';
				await db.transaction(async (tx) => {
					await tx
						.update(paymentTable)
						.set({
							status: finalStatus,
							gatewayResponse: { mock: true },
							paidAt: new Date(),
							updatedAt: new Date()
						})
						.where(eq(paymentTable.id, paymentRow.id));

					await transitionOrderStatusTx(tx, ctx, {
						orderId: orderId,
						toStatus: 'confirmed',
						note: 'Mock PayPal payment captured.'
					});
				});
			}
		} else if (input.gateway === 'paykoko' || input.gateway === 'mintpay') {
			// Mock direct webhook confirmations
			const payloadOrderId = typeof input.payload.orderId === 'string' ? input.payload.orderId : '';
			orderId = payloadOrderId;

			await db.transaction(async (tx) => {
				const paymentRow = await tx
					.select()
					.from(paymentTable)
					.where(eq(paymentTable.orderId, payloadOrderId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!paymentRow) {
					throw new PaymentError('Payment record not found.', ErrorCode.PAYMENT_NOT_FOUND);
				}

				paymentId = paymentRow.id;
				finalStatus = 'captured';

				await tx
					.update(paymentTable)
					.set({
						status: finalStatus,
						transactionId:
							typeof input.payload.transactionId === 'string'
								? input.payload.transactionId
								: 'mock_tx_id',
						gatewayResponse: input.payload,
						paidAt: new Date(),
						updatedAt: new Date()
					})
					.where(eq(paymentTable.id, paymentRow.id));

				await transitionOrderStatusTx(tx, ctx, {
					orderId: orderId,
					toStatus: 'confirmed',
					note: `${input.gateway} payment captured.`
				});
			});
		} else {
			throw new PaymentError(
				`Unknown gateway webhook: ${input.gateway}`,
				ErrorCode.VALIDATION_ERROR
			);
		}
	} catch (error) {
		logStatus = logStatus === 'processed' ? 'failed' : logStatus;
		logError = error instanceof Error ? error.message : 'Unknown webhook processing error';
		console.error(`Webhook error (${input.gateway}):`, error);
	}

	// Write raw audit webhook logs
	try {
		await db.insert(paymentWebhookLogTable).values({
			gateway: input.gateway,
			payload: input.payload,
			status: logStatus,
			errorMessage: logError || null
		});
	} catch (logErr) {
		console.error('Failed to write payment webhook audit log:', logErr);
	}

	return {
		success: logStatus === 'processed',
		paymentId: paymentId || undefined,
		orderId: orderId || undefined,
		status: finalStatus,
		errorMessage: logError || undefined
	};
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
		.select()
		.from(paymentTable)
		.where(whereClause)
		.orderBy(desc(paymentTable.createdAt))
		.limit(limit)
		.offset(offset);

	return {
		items: rows.map(toPaymentDTO),
		total,
		limit,
		offset
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

	return toPaymentDTO(row);
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

	return toPaymentDTO(row);
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

	return toPaymentDTO(updated);
}

// ---------------------------------------------------------------------------
// DATA TRANSFER OBJECTS & MAPS
// ---------------------------------------------------------------------------

function toPaymentDTO(row: Payment): PaymentDTO {
	return {
		id: row.id,
		orderId: row.orderId,
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

function generatePayHereHash(
	merchantId: string,
	orderId: string,
	amount: number,
	currency: string,
	merchantSecret: string
): string {
	const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
	// Format to 2 decimal places as required by PayHere
	const formattedAmount = amount.toFixed(2);
	const input = merchantId + orderId + formattedAmount + currency + hashedSecret;
	return crypto.createHash('md5').update(input).digest('hex').toUpperCase();
}

async function getLkrToUsdRate(): Promise<number> {
	try {
		const res = await fetch('https://open.er-api.com/v6/latest/LKR');
		if (!res.ok) throw new Error('Failed to fetch exchange rate');
		const data = (await res.json()) as { rates?: Record<string, number> };
		const rate = data.rates?.USD;
		if (!rate) throw new Error('USD rate not found in response');
		return rate;
	} catch (e) {
		console.error('Exchange rate fetch failed:', e);
		return 0.0033; // Fallback hardcoded rate (approx 1 LKR = 0.0033 USD)
	}
}

async function getPayPalAccessToken(
	clientId: string,
	clientSecret: string,
	isSandbox: boolean
): Promise<string> {
	const host = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
	const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	const res = await fetch(`${host}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`PayPal OAuth failed: ${errorText}`);
	}
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

async function createPayPalOrder(
	accessToken: string,
	orderNumber: string,
	usdAmount: number,
	isSandbox: boolean,
	appUrl: string
): Promise<{ id: string; approveUrl: string }> {
	const host = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
	const res = await fetch(`${host}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			intent: 'CAPTURE',
			purchase_units: [
				{
					reference_id: orderNumber,
					amount: {
						currency_code: 'USD',
						value: usdAmount.toFixed(2)
					}
				}
			],
			application_context: {
				brand_name: 'Caro Clothing',
				landing_page: 'NO_PREFERENCE',
				user_action: 'PAY_NOW',
				return_url: `${appUrl}/api/payments/webhooks/paypal/return`,
				cancel_url: `${appUrl}/checkout?payment=cancelled`
			}
		})
	});
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`PayPal Order creation failed: ${errorText}`);
	}
	const data = (await res.json()) as { id: string; links?: { rel: string; href: string }[] };
	const approveLink = data.links?.find(
		(l: { rel: string; href: string }) => l.rel === 'approve' || l.rel === 'payer-action'
	);
	if (!approveLink) {
		throw new Error('PayPal approval link not found');
	}
	return { id: data.id, approveUrl: approveLink.href };
}

async function capturePayPalOrder(
	accessToken: string,
	paypalOrderId: string,
	isSandbox: boolean
): Promise<unknown> {
	const host = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
	const res = await fetch(`${host}/v2/checkout/orders/${paypalOrderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`PayPal Capture failed: ${errorText}`);
	}
	return await res.json();
}
