import { and, asc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { OrderError, ErrorCode } from '$lib/server/modules/errors';
import {
	insertOrderItemBaseSchema,
	order,
	orderItem,
	type Order,
	type OrderItem
} from './orders.drizzle';
import {
	assertCanAccessOrder,
	assertNonEmptyUpdate,
	assertOrderMutable,
	assertOrderPermission,
	isAdmin,
	normalizeLimit,
	normalizeOffset,
	orderItemNotFound,
	orderNotFound,
	parseOrderInput,
	roundMoney,
	wrapOrderPersistenceError,
	type OrderServiceActor
} from './service-utils';

const createOrderItemInputSchema = insertOrderItemBaseSchema
	.omit({
		id: true
	})
	.refine((d) => Math.abs(d.totalPrice - d.quantity * d.unitPrice) < 0.01, {
		message: 'totalPrice must equal quantity x unitPrice',
		path: ['totalPrice']
	});

const updateOrderItemInputSchema = z.object({
	productName: z.string().min(1).max(255).optional(),
	variantSku: z.string().min(1).max(100).optional(),
	variantSize: z.string().min(1).max(10).optional(),
	variantColor: z.string().min(1).max(50).optional(),
	productImageR2Key: z.string().min(1).max(512).optional().nullable(),
	quantity: z.number().int().positive().optional(),
	unitPrice: z.number().positive().optional()
});

export type CreateOrderItemInput = z.infer<typeof createOrderItemInputSchema>;
export type UpdateOrderItemInput = z.infer<typeof updateOrderItemInputSchema>;

export type OrderItemMutationOptions = {
	actor: OrderServiceActor;
};

export type ListOrderItemsOptions = OrderItemMutationOptions & {
	orderId?: string;
	variantId?: string;
	productId?: string;
	limit?: number;
	offset?: number;
};

export async function listOrderItems(options: ListOrderItemsOptions): Promise<OrderItem[]> {
	assertOrderPermission(options.actor, 'order', 'read');
	const filters: SQL[] = [];

	if (options.orderId) {
		const targetOrder = await getOrderForItemMutation(options.orderId, options.actor, 'read');
		filters.push(eq(orderItem.orderId, targetOrder.id));
	}
	if (options.variantId) filters.push(eq(orderItem.variantId, options.variantId));
	if (options.productId) filters.push(eq(orderItem.productId, options.productId));

	if (isAdmin(options.actor) || options.orderId) {
		return getDb()
			.select()
			.from(orderItem)
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(asc(orderItem.id))
			.limit(normalizeLimit(options.limit))
			.offset(normalizeOffset(options.offset));
	}

	const rows = await getDb()
		.select({ item: orderItem })
		.from(orderItem)
		.innerJoin(order, eq(orderItem.orderId, order.id))
		.where(and(eq(order.userId, options.actor.id), ...(filters.length ? filters : [])))
		.orderBy(asc(orderItem.id))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));

	return rows.map((row) => row.item);
}

export async function getOrderItemById(
	id: string,
	options: OrderItemMutationOptions
): Promise<OrderItem> {
	const [row] = await getDb().select().from(orderItem).where(eq(orderItem.id, id)).limit(1);
	if (!row) orderItemNotFound({ id });

	await getOrderForItemMutation(row.orderId, options.actor, 'read');
	return row;
}

export async function createOrderItem(
	input: CreateOrderItemInput,
	options: OrderItemMutationOptions
): Promise<OrderItem> {
	const parsed = parseOrderInput(createOrderItemInputSchema, input, 'order item');
	const targetOrder = await getOrderForItemMutation(parsed.orderId, options.actor, 'update');
	assertOrderMutable(targetOrder);

	try {
		const [created] = await getDb()
			.insert(orderItem)
			.values({ ...parsed, totalPrice: roundMoney(parsed.quantity * parsed.unitPrice) })
			.returning();

		await recalculateOrderTotals(targetOrder.id);
		return created;
	} catch (error) {
		wrapOrderPersistenceError(error, 'Unable to create order item.');
	}
}

export async function updateOrderItem(
	id: string,
	input: UpdateOrderItemInput,
	options: OrderItemMutationOptions
): Promise<OrderItem> {
	const existing = await getOrderItemById(id, options);
	const targetOrder = await getOrderForItemMutation(existing.orderId, options.actor, 'update');
	assertOrderMutable(targetOrder);

	const parsed = parseOrderInput(updateOrderItemInputSchema, input, 'order item');
	assertNonEmptyUpdate(parsed, 'order item');

	const quantity = parsed.quantity ?? existing.quantity;
	const unitPrice = parsed.unitPrice ?? existing.unitPrice;

	const [updated] = await getDb()
		.update(orderItem)
		.set({
			...parsed,
			totalPrice: roundMoney(quantity * unitPrice)
		})
		.where(eq(orderItem.id, id))
		.returning();

	if (!updated) orderItemNotFound({ id });
	await recalculateOrderTotals(targetOrder.id);
	return updated;
}

export async function deleteOrderItem(
	id: string,
	options: OrderItemMutationOptions
): Promise<OrderItem> {
	const existing = await getOrderItemById(id, options);
	const targetOrder = await getOrderForItemMutation(existing.orderId, options.actor, 'update');
	assertOrderMutable(targetOrder);

	const siblingItems = await getDb()
		.select({ id: orderItem.id })
		.from(orderItem)
		.where(eq(orderItem.orderId, targetOrder.id));

	if (siblingItems.length <= 1) {
		throw new OrderError('An order must keep at least one item.', ErrorCode.VALIDATION_ERROR, {
			orderId: targetOrder.id
		});
	}

	const [deleted] = await getDb().delete(orderItem).where(eq(orderItem.id, id)).returning();
	if (!deleted) orderItemNotFound({ id });

	await recalculateOrderTotals(targetOrder.id);
	return deleted;
}

async function getOrderForItemMutation(
	orderId: string,
	actor: OrderServiceActor,
	action: 'read' | 'update'
): Promise<Order> {
	const [targetOrder] = await getDb().select().from(order).where(eq(order.id, orderId)).limit(1);
	if (!targetOrder) orderNotFound({ orderId });

	assertCanAccessOrder(targetOrder, actor, action);
	return targetOrder;
}

async function recalculateOrderTotals(orderId: string): Promise<void> {
	const [targetOrder] = await getDb().select().from(order).where(eq(order.id, orderId)).limit(1);
	if (!targetOrder) orderNotFound({ orderId });

	const items = await getDb().select().from(orderItem).where(eq(orderItem.orderId, orderId));
	const subtotal = roundMoney(items.reduce((sum, item) => sum + item.totalPrice, 0));
	const discountAmount = Math.min(targetOrder.discountAmount, subtotal);
	const totalAmount = roundMoney(
		Math.max(subtotal - discountAmount + targetOrder.shippingAmount, 0)
	);

	await getDb()
		.update(order)
		.set({
			subtotal,
			discountAmount,
			totalAmount
		})
		.where(eq(order.id, orderId));
}
