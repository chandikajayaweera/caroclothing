import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { PaymentError, ErrorCode } from '$lib/server/modules/errors';
import {
	PAYMENT_STATUSES,
	insertPaymentBaseSchema,
	order,
	payment,
	updatePaymentSchema,
	type Order,
	type Payment
} from './orders.drizzle';
import {
	assertCanAccessOrder,
	assertNonEmptyUpdate,
	assertOrderPermission,
	invalidPayment,
	isAdmin,
	isOnlinePaymentMethod,
	normalizeLimit,
	normalizeOffset,
	orderNotFound,
	parsePaymentInput,
	paymentNotFound,
	resolvePaymentExpiresAt,
	roundMoney,
	wrapPaymentPersistenceError,
	type OrderServiceActor
} from './service-utils';

const createPaymentInputSchema = insertPaymentBaseSchema
	.omit({
		id: true,
		createdAt: true,
		updatedAt: true
	})
	.refine((d) => d.refundAmount == null || d.refundAmount <= d.amount, {
		message: 'refundAmount cannot exceed amount',
		path: ['refundAmount']
	});

const updatePaymentInputSchema = updatePaymentSchema.omit({
	id: true,
	orderId: true,
	amount: true,
	currency: true,
	method: true,
	createdAt: true,
	updatedAt: true
});

const refundPaymentInputSchema = z.object({
	refundAmount: z.number().positive(),
	transactionId: z.string().max(255).optional().nullable(),
	gatewayResponse: z.string().optional().nullable()
});

export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentInputSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentInputSchema>;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const PAYMENT_SETTLED_STATUSES: PaymentStatus[] = ['authorized', 'captured'];

export type PaymentMutationOptions = {
	actor: OrderServiceActor;
};

export type ListPaymentsOptions = PaymentMutationOptions & {
	orderId?: string;
	status?: PaymentStatus | PaymentStatus[];
	transactionId?: string;
	limit?: number;
	offset?: number;
};

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export async function listPayments(options: ListPaymentsOptions): Promise<Payment[]> {
	assertOrderPermission(options.actor, 'payment', 'read');

	if (options.orderId) {
		const targetOrder = await getOrderForPayment(options.orderId, options.actor, 'read');
		const filters = buildPaymentFilters({ ...options, orderId: targetOrder.id });

		return getDb()
			.select()
			.from(payment)
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(desc(payment.createdAt))
			.limit(normalizeLimit(options.limit))
			.offset(normalizeOffset(options.offset));
	}

	if (isAdmin(options.actor)) {
		const filters = buildPaymentFilters(options);
		return getDb()
			.select()
			.from(payment)
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(desc(payment.createdAt))
			.limit(normalizeLimit(options.limit))
			.offset(normalizeOffset(options.offset));
	}

	const filters = buildPaymentFilters(options);
	const rows = await getDb()
		.select({ payment })
		.from(payment)
		.innerJoin(order, eq(payment.orderId, order.id))
		.where(and(eq(order.userId, options.actor.id), ...(filters.length ? filters : [])))
		.orderBy(desc(payment.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));

	return rows.map((row) => row.payment);
}

export async function getPaymentById(
	id: string,
	options: PaymentMutationOptions
): Promise<Payment> {
	assertOrderPermission(options.actor, 'payment', 'read');

	const [row] = await getDb().select().from(payment).where(eq(payment.id, id)).limit(1);
	if (!row) paymentNotFound({ id });

	await getOrderForPayment(row.orderId, options.actor, 'read');
	return row;
}

export async function createPayment(
	input: CreatePaymentInput,
	options: PaymentMutationOptions
): Promise<Payment> {
	assertOrderPermission(options.actor, 'payment', 'create');

	const parsed = parsePaymentInput(createPaymentInputSchema, input, 'payment');
	const targetOrder = await getOrderForPayment(parsed.orderId, options.actor, 'read');

	if (roundMoney(parsed.amount) > roundMoney(targetOrder.totalAmount)) {
		throw new PaymentError('Payment amount cannot exceed order total.', ErrorCode.PAYMENT_FAILED, {
			orderId: targetOrder.id,
			amount: parsed.amount,
			totalAmount: targetOrder.totalAmount
		});
	}

	try {
		return await getDb().transaction(async (tx) => {
			const now = new Date();
			const [created] = await tx
				.insert(payment)
				.values({
					...parsed,
					paidAt: parsed.status === 'captured' ? (parsed.paidAt ?? now) : parsed.paidAt
				})
				.returning();

			await syncOrderPaymentExpiryForPayment(tx, created, created.status, now);
			return created;
		});
	} catch (error) {
		wrapPaymentPersistenceError(error, 'Unable to create payment.');
	}
}

export async function updatePayment(
	id: string,
	input: UpdatePaymentInput,
	options: PaymentMutationOptions
): Promise<Payment> {
	assertOrderPermission(options.actor, 'payment', 'update');

	const existing = await getPaymentById(id, options);
	const parsed = parsePaymentInput(updatePaymentInputSchema, input, 'payment');
	assertNonEmptyUpdate(parsed, 'payment');
	assertRefundAmount(existing, parsed.refundAmount);

	return getDb().transaction(async (tx) => {
		const now = new Date();
		const [updated] = await tx
			.update(payment)
			.set({
				...parsed,
				refundedAt: parsed.refundAmount ? (parsed.refundedAt ?? now) : parsed.refundedAt
			})
			.where(eq(payment.id, id))
			.returning();

		const nextPayment = updated ?? existing;
		if (parsed.status) {
			await syncOrderPaymentExpiryForPayment(tx, nextPayment, parsed.status, now);
		}

		return nextPayment;
	});
}

export async function setPaymentStatus(
	id: string,
	status: PaymentStatus,
	options: PaymentMutationOptions & {
		transactionId?: string | null;
		gatewayResponse?: string | null;
	}
): Promise<Payment> {
	if (!PAYMENT_STATUSES.includes(status)) invalidPayment({ status });

	return updatePayment(
		id,
		{
			status,
			transactionId: options.transactionId,
			gatewayResponse: options.gatewayResponse,
			paidAt: status === 'captured' ? new Date() : undefined
		},
		options
	);
}

export async function authorizePayment(
	id: string,
	options: PaymentMutationOptions & {
		transactionId?: string | null;
		gatewayResponse?: string | null;
	}
): Promise<Payment> {
	return setPaymentStatus(id, 'authorized', options);
}

export async function capturePayment(
	id: string,
	options: PaymentMutationOptions & {
		transactionId?: string | null;
		gatewayResponse?: string | null;
	}
): Promise<Payment> {
	return setPaymentStatus(id, 'captured', options);
}

export async function failPayment(
	id: string,
	options: PaymentMutationOptions & {
		transactionId?: string | null;
		gatewayResponse?: string | null;
	}
): Promise<Payment> {
	return setPaymentStatus(id, 'failed', options);
}

export async function refundPayment(
	id: string,
	input: RefundPaymentInput,
	options: PaymentMutationOptions
): Promise<Payment> {
	assertOrderPermission(options.actor, 'payment', 'update');

	const existing = await getPaymentById(id, options);
	const parsed = parsePaymentInput(refundPaymentInputSchema, input, 'payment refund');
	assertRefundAmount(existing, parsed.refundAmount);

	const status: PaymentStatus =
		roundMoney(parsed.refundAmount) >= roundMoney(existing.amount)
			? 'refunded'
			: 'partially_refunded';

	const [updated] = await getDb()
		.update(payment)
		.set({
			status,
			refundAmount: parsed.refundAmount,
			refundedAt: new Date(),
			transactionId: parsed.transactionId ?? existing.transactionId,
			gatewayResponse: parsed.gatewayResponse ?? existing.gatewayResponse
		})
		.where(eq(payment.id, id))
		.returning();

	return updated ?? existing;
}

export async function deletePayment(id: string, options: PaymentMutationOptions): Promise<Payment> {
	assertOrderPermission(options.actor, 'payment', 'delete');

	const existing = await getPaymentById(id, options);
	const [deleted] = await getDb().delete(payment).where(eq(payment.id, id)).returning();

	return deleted ?? existing;
}

async function syncOrderPaymentExpiryForPayment(
	tx: DbTransaction,
	targetPayment: Payment,
	status: PaymentStatus,
	now: Date
): Promise<void> {
	const [targetOrder] = await tx
		.select()
		.from(order)
		.where(eq(order.id, targetPayment.orderId))
		.limit(1);

	if (!targetOrder || targetOrder.status !== 'pending') return;

	if (await hasSettledPaymentForOrder(tx, targetOrder.id)) {
		await tx.update(order).set({ paymentExpiresAt: null }).where(eq(order.id, targetOrder.id));
		return;
	}

	await tx
		.update(order)
		.set({
			paymentExpiresAt: resolvePaymentExpiresAtForStatus(targetPayment.method, status, now)
		})
		.where(eq(order.id, targetOrder.id));
}

async function hasSettledPaymentForOrder(tx: DbTransaction, orderId: string): Promise<boolean> {
	const [row] = await tx
		.select({ id: payment.id })
		.from(payment)
		.where(and(eq(payment.orderId, orderId), inArray(payment.status, PAYMENT_SETTLED_STATUSES)))
		.limit(1);

	return !!row;
}

function resolvePaymentExpiresAtForStatus(
	method: Payment['method'],
	status: PaymentStatus,
	now: Date
): Date | null {
	if (status === 'failed') return isOnlinePaymentMethod(method) ? now : null;
	if (PAYMENT_SETTLED_STATUSES.includes(status)) return null;
	return resolvePaymentExpiresAt({ paymentMethod: method, now });
}

async function getOrderForPayment(
	orderId: string,
	actor: OrderServiceActor,
	action: 'read' | 'update'
): Promise<Order> {
	const [targetOrder] = await getDb().select().from(order).where(eq(order.id, orderId)).limit(1);
	if (!targetOrder) orderNotFound({ orderId });

	assertCanAccessOrder(targetOrder, actor, action);
	return targetOrder;
}

function assertRefundAmount(existing: Payment, refundAmount: number | null | undefined): void {
	if (refundAmount == null) return;
	if (roundMoney(refundAmount) <= roundMoney(existing.amount)) return;

	throw new PaymentError('Refund amount cannot exceed payment amount.', ErrorCode.REFUND_FAILED, {
		paymentId: existing.id,
		amount: existing.amount,
		refundAmount
	});
}

function buildPaymentFilters(options: ListPaymentsOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.orderId) filters.push(eq(payment.orderId, options.orderId));
	if (options.transactionId) filters.push(eq(payment.transactionId, options.transactionId));
	if (options.status) {
		const statuses = Array.isArray(options.status) ? options.status : [options.status];
		filters.push(inArray(payment.status, statuses));
	}

	return filters;
}
