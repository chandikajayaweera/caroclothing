import { and, asc, desc, eq, inArray, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { InventoryError, ErrorCode } from '$lib/server/modules/errors';
import { inventory, inventoryMovement } from '$lib/server/modules/inventory/inventory.drizzle';
import {
	ORDER_STATUSES,
	order,
	orderItem,
	orderStatusHistory,
	payment,
	type Order,
	type OrderStatus,
	type OrderStatusHistory
} from './orders.drizzle';
import {
	assertCanAccessOrder,
	assertOrderPermission,
	assertValidStatusTransition,
	getStatusTimestampPatch,
	isAdmin,
	normalizeLimit,
	normalizeOffset,
	orderNotFound,
	parseOrderInput,
	statusHistoryNotFound,
	type OrderServiceActor
} from './service-utils';

const transitionOrderStatusInputSchema = z.object({
	status: z.enum(ORDER_STATUSES),
	note: z.string().max(500).optional().nullable()
});

const shipOrderInputSchema = z.object({
	trackingNumber: z.string().max(100).optional().nullable(),
	trackingCarrier: z.string().max(100).optional().nullable(),
	trackingUrl: z.string().url().optional().nullable(),
	note: z.string().max(500).optional().nullable()
});

const appendStatusHistoryInputSchema = z.object({
	orderId: z.string().min(1),
	fromStatus: z.enum(ORDER_STATUSES).optional().nullable(),
	toStatus: z.enum(ORDER_STATUSES),
	changedBy: z.string().min(1).optional().nullable(),
	note: z.string().max(500).optional().nullable()
});

export type TransitionOrderStatusInput = z.infer<typeof transitionOrderStatusInputSchema>;
export type ShipOrderInput = z.infer<typeof shipOrderInputSchema>;
export type AppendStatusHistoryInput = z.infer<typeof appendStatusHistoryInputSchema>;

export type OrderStatusMutationOptions = {
	actor: OrderServiceActor;
};

export type ListOrderStatusHistoryOptions = OrderStatusMutationOptions & {
	orderId?: string;
	limit?: number;
	offset?: number;
};

export type CancelExpiredPendingOrdersOptions = OrderStatusMutationOptions & {
	now?: Date;
	limit?: number;
};

const PAYMENT_SETTLED_STATUSES = ['authorized', 'captured'] as const;

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export async function listOrderStatusHistory(
	options: ListOrderStatusHistoryOptions
): Promise<OrderStatusHistory[]> {
	assertOrderPermission(options.actor, 'order', 'read');

	const filters: SQL[] = [];
	if (options.orderId) {
		const targetOrder = await getOrderForStatusMutation(options.orderId, options.actor, 'read');
		filters.push(eq(orderStatusHistory.orderId, targetOrder.id));
	}

	if (isAdmin(options.actor) || options.orderId) {
		return getDb()
			.select()
			.from(orderStatusHistory)
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(desc(orderStatusHistory.createdAt))
			.limit(normalizeLimit(options.limit))
			.offset(normalizeOffset(options.offset));
	}

	const rows = await getDb()
		.select({ history: orderStatusHistory })
		.from(orderStatusHistory)
		.innerJoin(order, eq(orderStatusHistory.orderId, order.id))
		.where(and(eq(order.userId, options.actor.id), ...(filters.length ? filters : [])))
		.orderBy(desc(orderStatusHistory.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));

	return rows.map((row) => row.history);
}

export async function getOrderStatusHistoryById(
	id: string,
	options: OrderStatusMutationOptions
): Promise<OrderStatusHistory> {
	assertOrderPermission(options.actor, 'order', 'read');

	const [row] = await getDb()
		.select()
		.from(orderStatusHistory)
		.where(eq(orderStatusHistory.id, id))
		.limit(1);

	if (!row) statusHistoryNotFound({ id });
	await getOrderForStatusMutation(row.orderId, options.actor, 'read');
	return row;
}

export async function appendOrderStatusHistory(
	input: AppendStatusHistoryInput,
	options: OrderStatusMutationOptions
): Promise<OrderStatusHistory> {
	assertOrderPermission(options.actor, 'order', 'create');

	const parsed = parseOrderInput(appendStatusHistoryInputSchema, input, 'order status history');
	await getOrderForStatusMutation(parsed.orderId, options.actor, 'read');

	const [created] = await getDb()
		.insert(orderStatusHistory)
		.values({
			...parsed,
			changedBy: parsed.changedBy ?? options.actor.id
		})
		.returning();

	return created;
}

export async function transitionOrderStatus(
	id: string,
	input: TransitionOrderStatusInput,
	options: OrderStatusMutationOptions
): Promise<Order> {
	const targetOrder = await getOrderForStatusMutation(id, options.actor, 'update');
	const parsed = parseOrderInput(
		transitionOrderStatusInputSchema,
		input,
		'order status transition'
	);

	if (targetOrder.status === parsed.status) return targetOrder;
	assertValidStatusTransition(targetOrder.status, parsed.status);

	return getDb().transaction(async (tx) => {
		if (parsed.status === 'confirmed') {
			await consumeReservedInventoryForOrder(tx, targetOrder.id);
		}

		if (parsed.status === 'cancelled') {
			if (targetOrder.status === 'pending')
				await releaseReservedInventoryForOrder(tx, targetOrder.id);
			if (targetOrder.status === 'confirmed' || targetOrder.status === 'processing') {
				await restoreSoldInventoryForOrder(tx, targetOrder.id);
			}
		}

		const [updated] = await tx
			.update(order)
			.set({
				status: parsed.status,
				...(parsed.status === 'confirmed' || parsed.status === 'cancelled'
					? { paymentExpiresAt: null }
					: {}),
				...getStatusTimestampPatch(parsed.status)
			})
			.where(eq(order.id, targetOrder.id))
			.returning();

		await tx.insert(orderStatusHistory).values({
			orderId: targetOrder.id,
			fromStatus: targetOrder.status,
			toStatus: parsed.status,
			changedBy: options.actor.id,
			note: parsed.note ?? null
		});

		return updated ?? targetOrder;
	});
}

export async function confirmOrder(
	id: string,
	options: OrderStatusMutationOptions
): Promise<Order> {
	return transitionOrderStatus(id, { status: 'confirmed', note: 'Order confirmed' }, options);
}

export async function markOrderProcessing(
	id: string,
	options: OrderStatusMutationOptions
): Promise<Order> {
	return transitionOrderStatus(id, { status: 'processing', note: 'Order processing' }, options);
}

export async function shipOrder(
	id: string,
	input: ShipOrderInput,
	options: OrderStatusMutationOptions
): Promise<Order> {
	const targetOrder = await getOrderForStatusMutation(id, options.actor, 'update');
	const parsed = parseOrderInput(shipOrderInputSchema, input, 'order shipment');
	assertValidStatusTransition(targetOrder.status, 'shipped');

	return getDb().transaction(async (tx) => {
		const [updated] = await tx
			.update(order)
			.set({
				status: 'shipped',
				trackingNumber: parsed.trackingNumber,
				trackingCarrier: parsed.trackingCarrier,
				trackingUrl: parsed.trackingUrl,
				...getStatusTimestampPatch('shipped')
			})
			.where(eq(order.id, targetOrder.id))
			.returning();

		await tx.insert(orderStatusHistory).values({
			orderId: targetOrder.id,
			fromStatus: targetOrder.status,
			toStatus: 'shipped',
			changedBy: options.actor.id,
			note: parsed.note ?? 'Order shipped'
		});

		return updated ?? targetOrder;
	});
}

export async function markOrderDelivered(
	id: string,
	options: OrderStatusMutationOptions
): Promise<Order> {
	return transitionOrderStatus(id, { status: 'delivered', note: 'Order delivered' }, options);
}

export async function cancelOrder(
	id: string,
	options: OrderStatusMutationOptions & { note?: string | null }
): Promise<Order> {
	return transitionOrderStatus(
		id,
		{ status: 'cancelled', note: options.note ?? 'Order cancelled' },
		options
	);
}

export async function cancelExpiredPendingOrders(
	options: CancelExpiredPendingOrdersOptions
): Promise<Order[]> {
	assertOrderPermission(options.actor, 'order', 'update');

	const now = options.now ?? new Date();
	const expiredOrders = await getDb()
		.select()
		.from(order)
		.where(
			and(
				eq(order.status, 'pending'),
				isNotNull(order.paymentExpiresAt),
				lte(order.paymentExpiresAt, now)
			)
		)
		.orderBy(asc(order.paymentExpiresAt))
		.limit(normalizeLimit(options.limit));
	const cancelled: Order[] = [];

	for (const expiredOrder of expiredOrders) {
		const updated = await cancelExpiredPendingOrder(expiredOrder.id, now, options.actor);
		if (updated) cancelled.push(updated);
	}

	return cancelled;
}

export async function refundOrder(
	id: string,
	options: OrderStatusMutationOptions & { note?: string | null }
): Promise<Order> {
	return transitionOrderStatus(
		id,
		{ status: 'refunded', note: options.note ?? 'Order refunded' },
		options
	);
}

async function cancelExpiredPendingOrder(
	id: string,
	now: Date,
	actor: OrderServiceActor
): Promise<Order | null> {
	return getDb().transaction(async (tx) => {
		const [targetOrder] = await tx.select().from(order).where(eq(order.id, id)).limit(1);
		if (!targetOrder) return null;
		if (targetOrder.status !== 'pending') return null;
		if (!targetOrder.paymentExpiresAt || targetOrder.paymentExpiresAt.getTime() > now.getTime()) {
			return null;
		}

		if (await hasSettledPaymentForOrder(tx, targetOrder.id)) {
			await tx.update(order).set({ paymentExpiresAt: null }).where(eq(order.id, targetOrder.id));
			return null;
		}

		const [updated] = await tx
			.update(order)
			.set({
				status: 'cancelled',
				paymentExpiresAt: null,
				...getStatusTimestampPatch('cancelled', now)
			})
			.where(
				and(
					eq(order.id, targetOrder.id),
					eq(order.status, 'pending'),
					isNotNull(order.paymentExpiresAt),
					lte(order.paymentExpiresAt, now),
					sql`not exists (
						select 1 from ${payment}
						where ${payment.orderId} = ${order.id}
						and ${payment.status} in ('authorized', 'captured')
					)`
				)
			)
			.returning();

		if (!updated) return null;

		await releaseReservedInventoryForOrder(tx, targetOrder.id);
		await tx.insert(orderStatusHistory).values({
			orderId: targetOrder.id,
			fromStatus: targetOrder.status,
			toStatus: 'cancelled',
			changedBy: actor.id,
			note: 'Payment window expired'
		});

		return updated;
	});
}

async function hasSettledPaymentForOrder(tx: DbTransaction, orderId: string): Promise<boolean> {
	const [row] = await tx
		.select({ id: payment.id })
		.from(payment)
		.where(and(eq(payment.orderId, orderId), inArray(payment.status, PAYMENT_SETTLED_STATUSES)))
		.limit(1);

	return !!row;
}

async function getOrderForStatusMutation(
	id: string,
	actor: OrderServiceActor,
	action: 'read' | 'update'
): Promise<Order> {
	const [targetOrder] = await getDb().select().from(order).where(eq(order.id, id)).limit(1);
	if (!targetOrder) orderNotFound({ id });

	assertCanAccessOrder(targetOrder, actor, action);
	return targetOrder;
}

async function consumeReservedInventoryForOrder(
	tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
	orderId: string
): Promise<void> {
	const items = await tx
		.select()
		.from(orderItem)
		.where(eq(orderItem.orderId, orderId))
		.orderBy(asc(orderItem.id));

	for (const item of items) {
		if (!item.variantId) continue;

		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, item.variantId))
			.limit(1);

		if (!row || !row.trackInventory) continue;
		if (row.allowBackorder && row.quantity === 0) continue;
		if (row.reservedQuantity < item.quantity) {
			throw new InventoryError(
				'Reserved stock is lower than the order item quantity.',
				ErrorCode.INVALID_INVENTORY_MOVEMENT,
				{
					orderId,
					variantId: item.variantId,
					requestedQuantity: item.quantity,
					reservedQuantity: row.reservedQuantity
				}
			);
		}

		const nextQuantity = row.quantity - item.quantity;
		if (nextQuantity < 0) {
			throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, {
				orderId,
				variantId: item.variantId,
				requestedQuantity: item.quantity,
				availableQuantity: row.quantity
			});
		}

		await tx
			.update(inventory)
			.set({
				quantity: nextQuantity,
				reservedQuantity: row.reservedQuantity - item.quantity
			})
			.where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovement).values({
			variantId: item.variantId,
			type: 'sale',
			quantityDelta: -item.quantity,
			quantityAfter: nextQuantity,
			referenceId: orderId,
			note: 'Order confirmed'
		});
	}
}

async function releaseReservedInventoryForOrder(
	tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
	orderId: string
): Promise<void> {
	const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, orderId));

	for (const item of items) {
		if (!item.variantId) continue;

		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, item.variantId))
			.limit(1);

		if (!row || !row.trackInventory) continue;

		const releasedQuantity = Math.min(item.quantity, row.reservedQuantity);
		if (releasedQuantity <= 0) continue;

		await tx
			.update(inventory)
			.set({ reservedQuantity: row.reservedQuantity - releasedQuantity })
			.where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovement).values({
			variantId: item.variantId,
			type: 'cancelled',
			quantityDelta: releasedQuantity,
			quantityAfter: row.quantity,
			referenceId: orderId,
			note: 'Order cancelled before confirmation'
		});
	}
}

async function restoreSoldInventoryForOrder(
	tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
	orderId: string
): Promise<void> {
	const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, orderId));

	for (const item of items) {
		if (!item.variantId) continue;

		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, item.variantId))
			.limit(1);

		if (!row || !row.trackInventory) continue;

		const nextQuantity = row.quantity + item.quantity;
		await tx.update(inventory).set({ quantity: nextQuantity }).where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovement).values({
			variantId: item.variantId,
			type: 'cancelled',
			quantityDelta: item.quantity,
			quantityAfter: nextQuantity,
			referenceId: orderId,
			note: 'Order cancelled after confirmation'
		});
	}
}
