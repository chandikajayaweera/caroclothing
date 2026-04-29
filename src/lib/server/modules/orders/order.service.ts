import { and, asc, desc, eq, gte, inArray, like, lte, sql, type SQL } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import {
	SRI_LANKA_DISTRICTS,
	address,
	type Address
} from '$lib/server/modules/addresses/addresses.drizzle';
import { ErrorCode, OrderError } from '$lib/server/modules/errors';
import { inventory, inventoryMovement } from '$lib/server/modules/inventory/inventory.drizzle';
import {
	releaseInventoryReservation,
	reserveInventory
} from '$lib/server/modules/inventory/inventory.service';
import {
	product,
	productImage,
	productVariant
} from '$lib/server/modules/products/products.drizzle';
import {
	assertPromoCodeApplicable,
	calculatePromoDiscount,
	getPromoCodeById,
	toPromoCodeSnapshot
} from '$lib/server/modules/promotions/code.service';
import { getShippingRateForMethod } from '$lib/server/modules/shipping/rate.service';
import {
	PAYMENT_METHODS,
	order,
	orderItem,
	orderStatusHistory,
	payment,
	updateOrderSchema,
	type Order,
	type OrderItem,
	type OrderStatus,
	type OrderStatusHistory,
	type Payment
} from './orders.drizzle';
import {
	assertCanAccessOrder,
	assertCanCreateOrderForUser,
	assertNonEmptyUpdate,
	assertOrderMutable,
	isAdmin,
	normalizeLimit,
	normalizeOffset,
	orderNotFound,
	parseOrderInput,
	resolvePaymentExpiresAt,
	roundMoney,
	toJsonSnapshot,
	wrapOrderPersistenceError,
	type OrderServiceActor
} from './service-utils';

const orderNumberSuffix = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 5);

const orderLineInputSchema = z.object({
	variantId: z.string().min(1),
	quantity: z.number().int().positive().max(99)
});

const shippingAddressSnapshotSchema = z
	.object({
		recipientName: z.string().min(1),
		phone: z.string().min(1),
		addressLine1: z.string().min(1),
		addressLine2: z.string().optional().nullable(),
		city: z.string().min(1),
		district: z.enum(SRI_LANKA_DISTRICTS),
		postalCode: z.string().optional().nullable()
	})
	.passthrough();

const promoCodeSnapshotSchema = z.record(z.string(), z.unknown());

const createOrderInputSchema = z
	.object({
		userId: z.string().min(1).optional().nullable(),
		items: z.array(orderLineInputSchema).min(1),
		shippingAddressId: z.string().min(1).optional().nullable(),
		shippingAddressSnapshot: shippingAddressSnapshotSchema.optional().nullable(),
		shippingMethodId: z.string().min(1).optional().nullable(),
		shippingAmount: z.number().min(0).optional(),
		promoCodeId: z.string().min(1).optional().nullable(),
		promoCodeSnapshot: promoCodeSnapshotSchema.optional().nullable(),
		discountAmount: z.number().min(0).optional(),
		paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
		paymentExpiresAt: z.number().int().positive().optional().nullable(),
		customerNote: z.string().max(1000).optional().nullable(),
		reserveInventory: z.boolean().optional()
	})
	.refine((input) => !(input.shippingAddressId && input.shippingAddressSnapshot), {
		message: 'Provide either shippingAddressId or shippingAddressSnapshot, not both.',
		path: ['shippingAddressSnapshot']
	});

const updateOrderInputSchema = updateOrderSchema
	.pick({
		trackingNumber: true,
		trackingCarrier: true,
		trackingUrl: true,
		customerNote: true,
		adminNote: true
	})
	.extend({
		customerNote: z.string().max(1000).optional().nullable(),
		adminNote: z.string().max(1000).optional().nullable(),
		trackingCarrier: z.string().max(100).optional().nullable()
	});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderInputSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type ShippingAddressSnapshot = z.infer<typeof shippingAddressSnapshotSchema>;

export type OrderMutationOptions = {
	actor: OrderServiceActor;
};

export type CreateOrderOptions = {
	actor?: OrderServiceActor | null;
	now?: Date;
	allowPriceOverride?: boolean;
};

export type ListOrdersOptions = {
	actor: OrderServiceActor;
	userId?: string | null;
	status?: OrderStatus | OrderStatus[];
	orderNumber?: string;
	createdFrom?: Date;
	createdTo?: Date;
	limit?: number;
	offset?: number;
};

export type OrderDetails = Order & {
	items: OrderItem[];
	payments: Payment[];
	statusHistory: OrderStatusHistory[];
};

type BuiltOrderItem = Omit<OrderItem, 'id' | 'orderId'>;
type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export async function listOrders(options: ListOrdersOptions): Promise<Order[]> {
	const filters = buildOrderFilters(options);

	return getDb()
		.select()
		.from(order)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(order.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getOrderById(id: string, options: OrderMutationOptions): Promise<Order> {
	const [row] = await getDb().select().from(order).where(eq(order.id, id)).limit(1);
	if (!row) orderNotFound({ id });

	assertCanAccessOrder(row, options.actor, 'read');
	return row;
}

export async function getOrderByNumber(
	orderNumber: string,
	options: OrderMutationOptions
): Promise<Order> {
	const [row] = await getDb()
		.select()
		.from(order)
		.where(eq(order.orderNumber, orderNumber))
		.limit(1);

	if (!row) orderNotFound({ orderNumber });
	assertCanAccessOrder(row, options.actor, 'read');
	return row;
}

export async function getOrderDetailsById(
	id: string,
	options: OrderMutationOptions
): Promise<OrderDetails> {
	const targetOrder = await getOrderById(id, options);
	return buildOrderDetails(targetOrder);
}

export async function getOrderDetailsByNumber(
	orderNumber: string,
	options: OrderMutationOptions
): Promise<OrderDetails> {
	const targetOrder = await getOrderByNumber(orderNumber, options);
	return buildOrderDetails(targetOrder);
}

export async function createOrder(
	input: CreateOrderInput,
	options: CreateOrderOptions = {}
): Promise<OrderDetails> {
	const parsed = parseOrderInput(createOrderInputSchema, input, 'order');
	const userId =
		parsed.userId ?? (options.actor && !isAdmin(options.actor) ? options.actor.id : null);

	assertCanCreateOrderForUser(userId, options.actor);

	const now = options.now ?? new Date();
	const orderNumber = generateOrderNumber(now);
	const paymentExpiresAt = resolvePaymentExpiresAt({
		paymentMethod: parsed.paymentMethod,
		paymentExpiresAt: parsed.paymentExpiresAt,
		now
	});
	const builtItems = await buildOrderItems(parsed.items);
	const subtotal = roundMoney(builtItems.reduce((sum, item) => sum + item.totalPrice, 0));
	const canOverridePricing = canOverrideOrderPricing(options);
	const shipping = await resolveShippingSnapshotAndAmount(
		parsed,
		subtotal,
		options.actor,
		canOverridePricing
	);
	const promoPricing = await resolvePromoCodePricing(parsed, subtotal, userId, canOverridePricing);
	const discountAmount = roundMoney(promoPricing.discountAmount);

	if (discountAmount > subtotal) {
		throw new OrderError('Discount amount cannot exceed subtotal.', ErrorCode.VALIDATION_ERROR, {
			subtotal,
			discountAmount
		});
	}

	const shippingAmount = roundMoney(shipping.amount);
	const totalAmount = roundMoney(Math.max(subtotal - discountAmount + shippingAmount, 0));
	const reservedLines: OrderLineInput[] = [];

	try {
		if (parsed.reserveInventory !== false) {
			for (const item of parsed.items) {
				const reservedQuantity = await reserveInventory(item.variantId, {
					quantity: item.quantity,
					referenceId: orderNumber,
					note: 'Reserved for order placement'
				});

				if (reservedQuantity > 0) {
					reservedLines.push({ variantId: item.variantId, quantity: reservedQuantity });
				}
			}
		}

		return await getDb().transaction(async (tx) => {
			const [createdOrder] = await tx
				.insert(order)
				.values({
					orderNumber,
					userId,
					status: 'pending',
					paymentExpiresAt,
					subtotal,
					discountAmount,
					shippingAmount,
					totalAmount,
					promoCodeId: parsed.promoCodeId ?? null,
					promoCodeSnapshot: toJsonSnapshot(promoPricing.snapshot),
					shippingMethodId: parsed.shippingMethodId ?? null,
					shippingAddressId: shipping.addressId,
					shippingAddressSnapshot: toJsonSnapshot(shipping.snapshot),
					customerNote: parsed.customerNote ?? null
				})
				.returning();

			const createdItems = await tx
				.insert(orderItem)
				.values(builtItems.map((item) => ({ ...item, orderId: createdOrder.id })))
				.returning();

			const [initialHistory] = await tx
				.insert(orderStatusHistory)
				.values({
					orderId: createdOrder.id,
					fromStatus: null,
					toStatus: 'pending',
					changedBy: options.actor?.id ?? null,
					note: 'Order created'
				})
				.returning();

			return {
				...createdOrder,
				items: createdItems,
				payments: [],
				statusHistory: [initialHistory]
			};
		});
	} catch (error) {
		await releaseReservedLines(reservedLines, orderNumber);
		wrapOrderPersistenceError(error, 'Order number already exists.');
	}
}

export async function updateOrder(
	id: string,
	input: UpdateOrderInput,
	options: OrderMutationOptions
): Promise<Order> {
	const targetOrder = await getOrderById(id, options);
	assertCanAccessOrder(targetOrder, options.actor, 'update');

	const parsed = parseOrderInput(updateOrderInputSchema, input, 'order');
	assertNonEmptyUpdate(parsed, 'order');

	const [updated] = await getDb().update(order).set(parsed).where(eq(order.id, id)).returning();
	return updated ?? targetOrder;
}

export async function deleteOrder(id: string, options: OrderMutationOptions): Promise<Order> {
	const targetOrder = await getOrderById(id, options);
	assertCanAccessOrder(targetOrder, options.actor, 'delete');
	assertOrderMutable(targetOrder);

	return getDb().transaction(async (tx) => {
		await releaseReservedInventoryForDeletedOrder(tx, targetOrder);

		const [deleted] = await tx.delete(order).where(eq(order.id, id)).returning();
		return deleted ?? targetOrder;
	});
}

async function buildOrderDetails(targetOrder: Order): Promise<OrderDetails> {
	const [items, payments, statusHistory] = await Promise.all([
		getDb()
			.select()
			.from(orderItem)
			.where(eq(orderItem.orderId, targetOrder.id))
			.orderBy(asc(orderItem.id)),
		getDb().select().from(payment).where(eq(payment.orderId, targetOrder.id)),
		getDb()
			.select()
			.from(orderStatusHistory)
			.where(eq(orderStatusHistory.orderId, targetOrder.id))
			.orderBy(asc(orderStatusHistory.createdAt))
	]);

	return {
		...targetOrder,
		items,
		payments,
		statusHistory
	};
}

async function buildOrderItems(items: OrderLineInput[]): Promise<BuiltOrderItem[]> {
	const builtItems: BuiltOrderItem[] = [];

	for (const item of items) {
		const [row] = await getDb()
			.select({ product, variant: productVariant })
			.from(productVariant)
			.innerJoin(product, eq(productVariant.productId, product.id))
			.where(eq(productVariant.id, item.variantId))
			.limit(1);

		if (!row) {
			throw new OrderError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
				variantId: item.variantId
			});
		}

		if (!row.product.isActive || !row.variant.isActive) {
			throw new OrderError('Product variant is unavailable.', ErrorCode.VARIANT_UNAVAILABLE, {
				variantId: item.variantId
			});
		}

		const unitPrice = row.variant.priceOverride ?? row.product.basePrice;
		const totalPrice = roundMoney(unitPrice * item.quantity);
		const imageR2Key = await findPrimaryImageKey(row.product.id, row.variant.id);

		builtItems.push({
			variantId: row.variant.id,
			productId: row.product.id,
			productName: row.product.name,
			variantSku: row.variant.sku,
			variantSize: row.variant.size,
			variantColor: row.variant.color,
			productImageR2Key: imageR2Key,
			quantity: item.quantity,
			unitPrice,
			totalPrice
		});
	}

	return builtItems;
}

async function findPrimaryImageKey(productId: string, variantId: string): Promise<string | null> {
	const [variantImage] = await getDb()
		.select({ r2Key: productImage.r2Key })
		.from(productImage)
		.where(and(eq(productImage.variantId, variantId), eq(productImage.isPrimary, true)))
		.orderBy(asc(productImage.position))
		.limit(1);

	if (variantImage) return variantImage.r2Key;

	const [primaryProductImage] = await getDb()
		.select({ r2Key: productImage.r2Key })
		.from(productImage)
		.where(
			and(
				eq(productImage.productId, productId),
				sql`${productImage.variantId} IS NULL`,
				eq(productImage.isPrimary, true)
			)
		)
		.orderBy(asc(productImage.position))
		.limit(1);

	return primaryProductImage?.r2Key ?? null;
}

async function resolveShippingSnapshotAndAmount(
	input: CreateOrderInput,
	subtotal: number,
	actor: OrderServiceActor | null | undefined,
	canOverridePricing: boolean
): Promise<{ addressId: string | null; snapshot: ShippingAddressSnapshot | null; amount: number }> {
	const snapshot = input.shippingAddressId
		? await loadAddressSnapshot(input.shippingAddressId, actor)
		: (input.shippingAddressSnapshot ?? null);
	const overrideAmount = canOverridePricing ? input.shippingAmount : undefined;

	if (!input.shippingMethodId) {
		if (!canOverridePricing) {
			throw new OrderError('Shipping method is required.', ErrorCode.VALIDATION_ERROR, {
				field: 'shippingMethodId'
			});
		}

		return {
			addressId: input.shippingAddressId ?? null,
			snapshot,
			amount: overrideAmount ?? 0
		};
	}

	if (overrideAmount !== undefined) {
		return {
			addressId: input.shippingAddressId ?? null,
			snapshot,
			amount: overrideAmount
		};
	}

	if (!snapshot?.district) {
		throw new OrderError(
			'Shipping district is required to calculate shipping.',
			ErrorCode.INVALID_SHIPPING_ADDRESS,
			{
				shippingMethodId: input.shippingMethodId
			}
		);
	}

	const rate = await getShippingRateForMethod({
		shippingMethodId: input.shippingMethodId,
		district: snapshot.district,
		subtotal
	});

	return {
		addressId: input.shippingAddressId ?? null,
		snapshot,
		amount: rate.price
	};
}

async function loadAddressSnapshot(
	addressId: string,
	actor: OrderServiceActor | null | undefined
): Promise<ShippingAddressSnapshot> {
	const [row] = await getDb().select().from(address).where(eq(address.id, addressId)).limit(1);
	if (!row) {
		throw new OrderError('Shipping address not found.', ErrorCode.INVALID_SHIPPING_ADDRESS, {
			addressId
		});
	}

	assertCanUseAddress(row, actor);
	return addressToSnapshot(row);
}

function assertCanUseAddress(row: Address, actor: OrderServiceActor | null | undefined): void {
	if (!row.userId) return;
	if (actor && (isAdmin(actor) || actor.id === row.userId)) return;

	throw new OrderError(
		'You cannot use this shipping address.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			addressId: row.id
		}
	);
}

function addressToSnapshot(row: Address): ShippingAddressSnapshot {
	return {
		recipientName: row.recipientName,
		phone: row.phone,
		addressLine1: row.addressLine1,
		addressLine2: row.addressLine2,
		city: row.city,
		district: row.district,
		postalCode: row.postalCode,
		label: row.label
	};
}

async function resolvePromoCodePricing(
	input: CreateOrderInput,
	subtotal: number,
	userId: string | null,
	canOverridePricing: boolean
): Promise<{ snapshot: Record<string, unknown> | null; discountAmount: number }> {
	const overrideDiscountAmount = canOverridePricing ? input.discountAmount : undefined;

	if (!input.promoCodeId) {
		return {
			snapshot: canOverridePricing ? (input.promoCodeSnapshot ?? null) : null,
			discountAmount: roundMoney(overrideDiscountAmount ?? 0)
		};
	}

	const code = await getPromoCodeById(input.promoCodeId);
	const snapshot =
		canOverridePricing && input.promoCodeSnapshot
			? input.promoCodeSnapshot
			: toPromoCodeSnapshot(code);

	if (overrideDiscountAmount !== undefined) {
		return {
			snapshot,
			discountAmount: roundMoney(overrideDiscountAmount)
		};
	}

	await assertPromoCodeApplicable(code, { subtotal, userId });
	return {
		snapshot,
		discountAmount: calculatePromoDiscount(code, subtotal)
	};
}

async function releaseReservedLines(lines: OrderLineInput[], referenceId: string): Promise<void> {
	await Promise.allSettled(
		lines.map((line) =>
			releaseInventoryReservation(line.variantId, {
				quantity: line.quantity,
				referenceId,
				note: 'Released after order placement failure'
			})
		)
	);
}

async function releaseReservedInventoryForDeletedOrder(
	tx: DbTransaction,
	targetOrder: Order
): Promise<void> {
	const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, targetOrder.id));

	for (const item of items) {
		if (!item.variantId) continue;

		const reservedForOrder = await getReservedQuantityForOrderLine(
			tx,
			item.variantId,
			targetOrder.orderNumber
		);
		const quantityToRelease = Math.min(item.quantity, reservedForOrder);
		if (quantityToRelease <= 0) continue;

		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, item.variantId))
			.limit(1);

		if (!row || !row.trackInventory) continue;

		const releasedQuantity = Math.min(quantityToRelease, row.reservedQuantity);
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
			referenceId: targetOrder.orderNumber,
			note: 'Order deleted before confirmation'
		});
	}
}

async function getReservedQuantityForOrderLine(
	tx: DbTransaction,
	variantId: string,
	referenceId: string
): Promise<number> {
	const [row] = await tx
		.select({
			quantity: sql<number>`coalesce(sum(abs(${inventoryMovement.quantityDelta})), 0)`
		})
		.from(inventoryMovement)
		.where(
			and(
				eq(inventoryMovement.variantId, variantId),
				eq(inventoryMovement.referenceId, referenceId),
				eq(inventoryMovement.type, 'reserved')
			)
		);

	return Number(row?.quantity ?? 0);
}

function buildOrderFilters(options: ListOrdersOptions): SQL[] {
	const filters: SQL[] = [];

	if (!isAdmin(options.actor)) filters.push(eq(order.userId, options.actor.id));
	if (isAdmin(options.actor) && options.userId) filters.push(eq(order.userId, options.userId));
	if (isAdmin(options.actor) && options.userId === null) filters.push(sql`${order.userId} IS NULL`);
	if (options.status) {
		const statuses = Array.isArray(options.status) ? options.status : [options.status];
		filters.push(inArray(order.status, statuses));
	}
	if (options.orderNumber) filters.push(like(order.orderNumber, `%${options.orderNumber}%`));
	if (options.createdFrom) filters.push(gte(order.createdAt, options.createdFrom));
	if (options.createdTo) filters.push(lte(order.createdAt, options.createdTo));

	return filters;
}

function generateOrderNumber(now = new Date()): string {
	const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
	return `CARO-${datePart}-${orderNumberSuffix()}`;
}

function canOverrideOrderPricing(options: CreateOrderOptions): boolean {
	return options.allowPriceOverride === true || isAdmin(options.actor);
}
