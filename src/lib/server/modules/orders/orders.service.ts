import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	like,
	lte,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { getDb } from '$lib/server/db';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import { getEnv } from '$lib/server/infrastructure/env';
import {
	ErrorCode,
	OrderError,
	PaymentError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import { mediaPresetUrl } from '$lib/server/infrastructure/media';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow
} from '$lib/server/foundation/utils';
import { address as addressTable, type Address } from '../addresses/addresses.drizzle';
import { createAddressSnapshot, validateCheckoutAddress } from '../addresses/addresses.service';
import type { AddressSnapshot, CheckoutAddressDTO } from '../addresses/addresses.types';
import { user as userTable } from '../auth/auth.drizzle';
import {
	deleteBagAfterOrderPlacementTx,
	getCheckoutBagForOrderTx,
	type BagTx
} from '../bag/bag.service';
import {
	recordInventorySaleTx,
	releaseInventoryReservationTx,
	reserveInventoryTx,
	restoreInventorySaleTx,
	type InventoryTx
} from '../inventory/inventory.service';
import {
	enqueueOrderConfirmationEmailTx,
	enqueueOrderConfirmationSmsTx,
	enqueueOrderStatusUpdateSmsTx,
	enqueuePaymentUpdateSmsTx,
	enqueueShippingUpdateEmailTx,
	publishNotificationWakeups,
	type NotificationOutboxTx
} from '../notifications/outbox/outbox.service';
import type { NotificationOutboxDTO } from '../notifications/outbox/outbox.types';
import { getManualReviewReason } from '../payments/payments.logic';
import {
	recordPromoUsageTx,
	validatePromoCodeForBagTx,
	type PromotionsTx
} from '../promotions/promotions.service';
import { promoCode } from '../promotions/promotions.drizzle';
import {
	calculateShippingQuoteTx,
	createShippingMethodSnapshot
} from '../shipping/shipping.service';
import type { ShippingTx } from '../shipping/shipping.service';
import {
	insertOrderItemSchema,
	insertOrderSchema,
	insertOrderStatusHistorySchema,
	insertPaymentSchema,
	CHECKOUT_PAYMENT_METHODS,
	ONLINE_PAYMENT_METHODS,
	order,
	orderItem,
	orderStatusHistory,
	payment,
	updateOrderSchema,
	type InsertOrderItem,
	type InsertOrderStatusHistory,
	type NewOrder,
	type NewOrderItem,
	type NewOrderStatusHistory,
	type NewPayment,
	type Order,
	type OrderItem,
	type OrderStatus,
	type OrderStatusHistory,
	type Payment,
	type PaymentStatus
} from './orders.drizzle';
import {
	buildOrderNumber,
	shouldSendOrderStatusSms,
	shouldSendPaymentStatusSms
} from './orders.logic';
import type {
	CancelExpiredPendingOrdersInput,
	CancelExpiredPendingOrdersResult,
	CancelOrderInput,
	CheckoutShippingAddressInput,
	GetOrderInput,
	ListMyOrdersOptions,
	ListOrdersOptions,
	OrderDTO,
	OrderItemDTO,
	OrderListResult,
	OrderLookup,
	OrderPreviewDTO,
	OrderPreviewItemDTO,
	OrderStatusHistoryDTO,
	OrderSummaryDTO,
	PaymentDTO,
	PlaceOrderFromBagInput,
	PreviewOrderFromBagInput,
	TransitionOrderStatusInput,
	UpdateOrderFulfillmentInput
} from './orders.types';

type Db = ReturnType<typeof getDb>;
export type OrdersTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | OrdersTx;

const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const orderNumberSuffix = customAlphabet(ORDER_NUMBER_ALPHABET, 5);
const ONLINE_PAYMENT_HOLD_MS = 30 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CLEANUP_DEFAULT_LIMIT = 50;
const CLEANUP_MAX_LIMIT = 200;
const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
const ANONYMOUS_EMAIL_DOMAIN = '@anon.caroclothing.lk';

const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending: ['confirmed', 'cancelled'],
	confirmed: ['processing', 'cancelled'],
	processing: ['shipped', 'cancelled'],
	shipped: ['delivered'],
	delivered: ['refunded'],
	cancelled: [],
	refunded: []
};

export async function anonymizeOrdersForAccountDeletionTx(
	tx: OrdersTx,
	input: { userId: string; now?: Date }
): Promise<number> {
	const userId = normalizeId(input.userId, 'userId');
	const now = resolveNow(null, input.now);
	const anonymized = await tx
		.update(order)
		.set({
			userId: null,
			shippingAddressId: null,
			shippingAddressSnapshot: null,
			trackingNumber: null,
			trackingCarrier: null,
			trackingUrl: null,
			customerNote: null,
			adminNote: null,
			updatedAt: now
		})
		.where(eq(order.userId, userId))
		.returning({ id: order.id });

	return anonymized.length;
}

export async function previewOrderFromBag(
	ctx: ServiceContext,
	input: PreviewOrderFromBagInput
): Promise<OrderPreviewDTO> {
	try {
		return await getDb().transaction(async (tx) =>
			buildOrderPreviewTx(tx, ctx, {
				...input,
				now: resolveNow(ctx, input.now)
			})
		);
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function placeOrderFromBag(
	ctx: ServiceContext,
	input: PlaceOrderFromBagInput
): Promise<OrderDTO> {
	let notificationsToPublish: NotificationOutboxDTO[] = [];

	try {
		const placedOrder = await getDb().transaction(async (tx) => {
			const orderDto = await placeOrderFromBagTx(tx, ctx, input);
			if (orderDto.status === 'confirmed') {
				notificationsToPublish = await enqueueOrderConfirmationNotificationsTx(tx, orderDto);
			}
			return orderDto;
		});
		await publishNotificationWakeups(ctx, notificationsToPublish);
		return placedOrder;
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function placeOrderFromBagTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	input: PlaceOrderFromBagInput
): Promise<OrderDTO> {
	const now = resolveNow(ctx, input.now);
	if (!checkoutPaymentMethodSet.has(input.paymentMethod)) {
		throw new PaymentError(
			'This payment method is not available at checkout.',
			ErrorCode.INVALID_PAYMENT_METHOD,
			{ method: input.paymentMethod }
		);
	}
	const preview = await buildOrderPreviewTx(tx, ctx, { ...input, now });

	assertCheckoutReady(preview);

	const orderId = crypto.randomUUID();
	const orderNumber = await generateUniqueOrderNumberTx(tx, now);
	const paymentExpiresAt = onlinePaymentMethodSet.has(input.paymentMethod)
		? new Date(now.getTime() + ONLINE_PAYMENT_HOLD_MS)
		: null;
	const orderValues = parseNewOrder({
		id: orderId,
		orderNumber,
		userId: preview.bag.userId,
		status: 'pending',
		paymentExpiresAt,
		subtotal: preview.subtotal,
		discountAmount: preview.discountAmount,
		shippingAmount: preview.shippingAmount,
		totalAmount: preview.totalAmount,
		promoCodeId: preview.promoValidation?.promoCodeId ?? null,
		promoCodeSnapshot: preview.promoValidation?.snapshot ?? null,
		shippingMethodId: preview.shippingQuote.shippingMethodId,
		shippingAddressId: preview.shippingAddressId,
		shippingMethodSnapshot: preview.shippingMethodSnapshot,
		shippingAddressSnapshot: preview.shippingAddressSnapshot,
		customerNote: normalizeNullableText(input.customerNote, 'customerNote', 1000)
	});

	const [createdOrder] = await tx.insert(order).values(orderValues).returning();
	if (!createdOrder) {
		throw new OrderError('Order was not created.', ErrorCode.INTERNAL_ERROR);
	}

	const createdItems: OrderItem[] = [];
	for (const previewItem of preview.items) {
		const orderItemId = crypto.randomUUID();
		const itemValues = parseNewOrderItem({
			id: orderItemId,
			orderId,
			variantId: previewItem.variantId,
			productId: previewItem.productId,
			productName: previewItem.productName,
			variantSize: previewItem.variantSize,
			variantColor: previewItem.variantColor,
			productImageR2Key: previewItem.productImageR2Key,
			quantity: previewItem.quantity,
			unitPrice: previewItem.unitPrice,
			totalPrice: previewItem.totalPrice
		});
		const [createdItem] = await tx.insert(orderItem).values(itemValues).returning();
		if (!createdItem) {
			throw new OrderError('Order item was not created.', ErrorCode.INTERNAL_ERROR);
		}

		const released = await releaseInventoryReservationTx(tx as InventoryTx, {
			variantId: previewItem.variantId,
			quantity: previewItem.quantity,
			referenceId: previewItem.bagItemId,
			now
		});

		if (released.releasedQuantity > 0) {
			await reserveInventoryTx(tx as InventoryTx, {
				variantId: previewItem.variantId,
				quantity: released.releasedQuantity,
				referenceId: orderItemId,
				now
			});
		}

		const quantityStillNeeded = previewItem.quantity - released.releasedQuantity;
		if (quantityStillNeeded > 0) {
			await reserveInventoryTx(tx as InventoryTx, {
				variantId: previewItem.variantId,
				quantity: quantityStillNeeded,
				referenceId: orderItemId,
				now
			});
		}

		createdItems.push(createdItem);
	}

	const paymentValues = parseNewPayment({
		orderId,
		amount: preview.totalAmount,
		currency: 'LKR',
		method: input.paymentMethod,
		status: 'pending',
		transactionId: null,
		gatewayResponse: null,
		refundAmount: null
	});
	const [createdPayment] = await tx.insert(payment).values(paymentValues).returning();
	if (!createdPayment) {
		throw new PaymentError('Payment was not created.', ErrorCode.INTERNAL_ERROR);
	}

	const createdHistory = await insertOrderStatusHistoryTx(tx, {
		orderId,
		fromStatus: null,
		toStatus: 'pending',
		changedBy: actorChangedBy(ctx),
		note: 'Order placed.'
	});

	if (preview.promoValidation) {
		await recordPromoUsageTx(tx as PromotionsTx, {
			promoCodeId: preview.promoValidation.promoCodeId,
			orderId,
			userId: preview.bag.userId,
			discountAmount: preview.discountAmount,
			now
		});
	}

	await deleteBagAfterOrderPlacementTx(tx as BagTx, { bagId: preview.bag.id });

	const placedOrder = toOrderDTO(createdOrder, {
		items: createdItems,
		payments: [createdPayment],
		statusHistory: [createdHistory],
		includeItems: true,
		includePayments: true,
		includeStatusHistory: true
	});

	if (input.paymentMethod !== 'cash_on_delivery') {
		return placedOrder;
	}

	return transitionOrderStatusTx(tx, ctx, {
		orderId,
		toStatus: 'confirmed',
		note: 'Cash on delivery order confirmed at placement.',
		now
	});
}

export async function getOrder(ctx: ServiceContext, input: GetOrderInput): Promise<OrderDTO> {
	const row = await loadOrderByLookupTx(getDb(), input.lookup);
	requireOrderOwnerOrAdmin(ctx, row.userId);

	return hydrateOrderTx(getDb(), row, {
		includeItems: input.includeItems ?? true,
		includePayments: input.includePayments ?? true,
		includeStatusHistory: input.includeStatusHistory ?? true
	});
}

export async function listMyOrders(
	ctx: ServiceContext,
	options: ListMyOrdersOptions = {}
): Promise<OrderListResult> {
	const actor = requireActor(ctx.actor);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildOrderListWhere({ ...options, userId: actor.id }, ctx);
	return listOrdersTx(getDb(), where, limit, offset);
}

export async function listOrders(
	ctx: ServiceContext,
	options: ListOrdersOptions = {}
): Promise<OrderListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildOrderListWhere(options, ctx);
	return listOrdersTx(getDb(), where, limit, offset);
}

export async function transitionOrderStatus(
	ctx: ServiceContext,
	input: TransitionOrderStatusInput
): Promise<OrderDTO> {
	requireAdmin(ctx.actor);
	let notificationsToPublish: NotificationOutboxDTO[] = [];

	try {
		const updatedOrder = await getDb().transaction(async (tx) => {
			const orderDto = await transitionOrderStatusTx(tx, ctx, input);
			notificationsToPublish = await enqueueOrderStatusTransitionNotificationsTx(tx, orderDto);
			return orderDto;
		});
		await publishNotificationWakeups(ctx, notificationsToPublish);
		return updatedOrder;
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function transitionOrderStatusTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	input: TransitionOrderStatusInput
): Promise<OrderDTO> {
	const now = resolveNow(ctx, input.now);
	const orderId = normalizeId(input.orderId, 'orderId');
	const existing = await loadOrderByIdTx(tx, orderId);
	const toStatus = input.toStatus;

	assertStatusTransition(existing.status, toStatus);
	await applyInventoryForStatusTransitionTx(tx, existing, toStatus, now);

	const [updated] = await tx
		.update(order)
		.set(parseOrderUpdate({ status: toStatus, ...statusTimestampValues(toStatus, now) }))
		.where(and(eq(order.id, orderId), eq(order.status, existing.status)))
		.returning();

	if (!updated) {
		throw new OrderError(
			'Order status changed before the transition completed.',
			ErrorCode.CONFLICT,
			{
				orderId,
				expectedStatus: existing.status,
				toStatus
			}
		);
	}

	await insertOrderStatusHistoryTx(tx, {
		orderId,
		fromStatus: existing.status,
		toStatus,
		changedBy: actorChangedBy(ctx),
		note: normalizeNullableText(input.note, 'note', 500)
	});

	return hydrateOrderTx(tx, updated, {
		includeItems: true,
		includePayments: true,
		includeStatusHistory: true
	});
}

export async function cancelOrder(ctx: ServiceContext, input: CancelOrderInput): Promise<OrderDTO> {
	requireAdmin(ctx.actor);

	return transitionOrderStatus(ctx, {
		orderId: input.orderId,
		toStatus: 'cancelled',
		note: input.reason ?? 'Order cancelled.',
		now: input.now
	});
}

export async function updateOrderFulfillment(
	ctx: ServiceContext,
	input: UpdateOrderFulfillmentInput
): Promise<OrderDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx, input.now);
	const orderId = normalizeId(input.orderId, 'orderId');
	let notificationsToPublish: NotificationOutboxDTO[] = [];

	try {
		const updatedOrder = await getDb().transaction(async (tx) => {
			const existing = await loadOrderByIdTx(tx, orderId);
			if (isTerminalOrderStatus(existing.status)) {
				throw new OrderError('Terminal orders cannot be modified.', ErrorCode.CANNOT_MODIFY_ORDER, {
					orderId,
					status: existing.status
				});
			}

			const values = parseOrderUpdate({
				trackingNumber: normalizeNullableText(input.trackingNumber, 'trackingNumber', 100),
				trackingCarrier: normalizeNullableText(input.trackingCarrier, 'trackingCarrier', 100),
				trackingUrl: normalizeNullableText(input.trackingUrl, 'trackingUrl', 255),
				adminNote: normalizeNullableText(input.adminNote, 'adminNote', 1000),
				updatedAt: now
			});
			const updateValues = removeUndefinedValues(values);

			if (Object.keys(updateValues).length === 0) {
				return hydrateOrderTx(tx, existing, {
					includeItems: true,
					includePayments: true,
					includeStatusHistory: true
				});
			}

			const [updated] = await tx
				.update(order)
				.set(updateValues)
				.where(eq(order.id, orderId))
				.returning();

			if (!updated) {
				throw new OrderError('Order not found.', ErrorCode.ORDER_NOT_FOUND, { orderId });
			}

			const orderDto = await hydrateOrderTx(tx, updated, {
				includeItems: true,
				includePayments: true,
				includeStatusHistory: true
			});

			if (shouldEnqueueShippingUpdateForFulfillment(existing, updated)) {
				notificationsToPublish = await enqueueShippingUpdateNotificationsTx(tx, orderDto);
			}

			return orderDto;
		});
		await publishNotificationWakeups(ctx, notificationsToPublish);
		return updatedOrder;
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function cancelExpiredPendingOrders(
	ctx: ServiceContext,
	input: CancelExpiredPendingOrdersInput = {}
): Promise<CancelExpiredPendingOrdersResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const limit = normalizeLimit(input.limit, CLEANUP_DEFAULT_LIMIT, CLEANUP_MAX_LIMIT);
	const notificationsToPublish: NotificationOutboxDTO[] = [];
	const orders: OrderDTO[] = [];
	const orderIds: string[] = [];
	const failedOrderIds: string[] = [];
	let skippedCount = 0;
	let failedCount = 0;

	try {
		const db = getDb();
		const rows = await db
			.select()
			.from(order)
			.where(and(eq(order.status, 'pending'), lte(order.paymentExpiresAt, now)))
			.orderBy(asc(order.paymentExpiresAt), asc(order.createdAt))
			.limit(limit);

		for (const row of rows) {
			try {
				const result = await db.transaction(async (tx) => {
					const cancelledOrder = await cancelExpiredPendingOrderByIdTx(tx, ctx, row.id, now);
					if (!cancelledOrder) return null;
					const notification = await enqueueOrderStatusUpdateNotificationTx(tx, cancelledOrder);
					return { cancelledOrder, notification };
				});

				if (!result) {
					skippedCount += 1;
					continue;
				}

				orders.push(result.cancelledOrder);
				orderIds.push(row.id);
				if (result.notification) {
					notificationsToPublish.push(result.notification);
				}
			} catch (err) {
				if (isAppError(err) && err.code === ErrorCode.CONFLICT) {
					skippedCount += 1;
					console.warn(`Skipped stale expired order ${row.id}:`, err);
					continue;
				}

				failedCount += 1;
				failedOrderIds.push(row.id);
				console.error(`[orders] Failed to cancel expired order ${row.id}:`, err);
			}
		}

		await publishNotificationWakeups(ctx, notificationsToPublish);

		return {
			cancelledCount: orders.length,
			orderIds,
			orders,
			skippedCount,
			failedCount,
			failedOrderIds
		};
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function insertOrderStatusHistoryTx(
	tx: OrdersTx,
	input: InsertOrderStatusHistory
): Promise<OrderStatusHistory> {
	const values = parseNewOrderStatusHistory(input);
	const [created] = await tx.insert(orderStatusHistory).values(values).returning();

	if (!created) {
		throw new OrderError('Order status history was not created.', ErrorCode.INTERNAL_ERROR);
	}

	return created;
}

async function buildOrderPreviewTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	input: PreviewOrderFromBagInput & { now: Date }
): Promise<OrderPreviewDTO> {
	const bag = await getCheckoutBagForOrderTx(tx as BagTx, ctx, {
		sessionToken: input.sessionToken,
		now: input.now
	});
	const blockingReasons = [...bag.blockingReasons];

	if (bag.items.length === 0) {
		throw new OrderError('Bag is empty.', ErrorCode.EMPTY_BAG);
	}

	const shippingAddress = await resolveCheckoutShippingAddressTx(tx, ctx, input.shippingAddress);
	const shippingQuote = await calculateShippingQuoteTx(tx as ShippingTx, {
		shippingMethodId: input.shippingMethodId,
		district: shippingAddress.address.district,
		subtotal: bag.subtotal,
		activeOnly: true
	});
	let appliedPromoCode: string | null = input.promoCode ?? null;
	if (!appliedPromoCode && bag.promoCodeId) {
		const [promoRow] = await tx
			.select({ code: promoCode.code })
			.from(promoCode)
			.where(eq(promoCode.id, bag.promoCodeId))
			.limit(1);
		if (promoRow) {
			appliedPromoCode = promoRow.code;
		}
	}

	const promoValidation = appliedPromoCode
		? await validatePromoCodeForBagTx(tx as PromotionsTx, {
				code: appliedPromoCode,
				userId: bag.userId,
				subtotal: bag.subtotal,
				now: input.now
			})
		: null;
	const discountAmount = promoValidation?.discountAmount ?? 0;
	const shippingAmount = shippingQuote.price;
	const totalAmount = bag.subtotal - discountAmount + shippingAmount;
	const items = bag.items.map(toPreviewItemDTO);

	return {
		bag,
		items,
		shippingAddressId: shippingAddress.addressId,
		shippingAddress: shippingAddress.address,
		shippingAddressSnapshot: shippingAddress.snapshot,
		shippingQuote,
		shippingMethodSnapshot: createShippingMethodSnapshot(shippingQuote),
		promoValidation,
		subtotal: bag.subtotal,
		discountAmount,
		shippingAmount,
		totalAmount,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

async function cancelExpiredPendingOrderByIdTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	orderId: string,
	now: Date
): Promise<OrderDTO | null> {
	const [row] = await tx
		.select({ id: order.id })
		.from(order)
		.where(
			and(eq(order.id, orderId), eq(order.status, 'pending'), lte(order.paymentExpiresAt, now))
		)
		.limit(1);

	if (!row) return null;

	return transitionOrderStatusTx(tx, ctx, {
		orderId: row.id,
		toStatus: 'cancelled',
		note: 'Payment window expired.',
		now
	});
}

async function applyInventoryForStatusTransitionTx(
	tx: OrdersTx,
	row: Order,
	toStatus: OrderStatus,
	now: Date
): Promise<void> {
	if (toStatus !== 'confirmed' && toStatus !== 'cancelled') return;

	const items = await loadOrderItemsTx(tx, row.id);

	for (const item of items) {
		if (!item.variantId) continue;

		if (toStatus === 'confirmed') {
			await recordInventorySaleTx(tx as InventoryTx, {
				variantId: item.variantId,
				quantity: item.quantity,
				referenceId: item.id,
				now,
				note: `Order ${row.orderNumber} confirmed.`
			});
			continue;
		}

		if (row.status === 'pending') {
			await releaseInventoryReservationTx(tx as InventoryTx, {
				variantId: item.variantId,
				quantity: item.quantity,
				referenceId: item.id,
				now
			});
		} else if (row.status === 'confirmed' || row.status === 'processing') {
			await restoreInventorySaleTx(tx as InventoryTx, {
				variantId: item.variantId,
				quantity: item.quantity,
				referenceId: item.id,
				now,
				note: `Order ${row.orderNumber} cancelled.`,
				type: 'cancelled'
			});
		}
	}
}

async function resolveCheckoutShippingAddressTx(
	tx: QueryExecutor,
	ctx: ServiceContext,
	input: CheckoutShippingAddressInput
): Promise<{
	addressId: string | null;
	address: CheckoutAddressDTO;
	snapshot: AddressSnapshot;
}> {
	if ('addressId' in input) {
		const actor = requireActor(ctx.actor);
		const addressId = normalizeId(input.addressId, 'addressId');
		const [row] = await tx
			.select()
			.from(addressTable)
			.where(eq(addressTable.id, addressId))
			.limit(1);

		if (!row) {
			throw new OrderError('Address not found.', ErrorCode.ADDRESS_NOT_FOUND, { addressId });
		}

		requireOwnerOrAdmin(actor, row.userId);

		const checkoutAddress = addressRowToCheckoutAddress(row);
		return {
			addressId: row.id,
			address: checkoutAddress,
			snapshot: {
				...createAddressSnapshot(checkoutAddress),
				addressId: row.id
			}
		};
	}

	const checkoutAddress = validateCheckoutAddress(input);
	return {
		addressId: null,
		address: checkoutAddress,
		snapshot: createAddressSnapshot(checkoutAddress)
	};
}

async function listOrdersTx(
	db: QueryExecutor,
	where: SQL | undefined,
	limit: number,
	offset: number
): Promise<OrderListResult> {
	const countQuery = db.select({ total: count() }).from(order);
	const listQuery = db
		.select()
		.from(order)
		.orderBy(desc(order.createdAt), desc(order.id))
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		where ? countQuery.where(where) : countQuery,
		where ? listQuery.where(where) : listQuery
	]);
	const itemsByOrderId = await loadOrderItemsByOrderId(
		db,
		rows.map((row) => row.id)
	);

	return {
		items: rows.map((row) => toOrderSummaryDTO(row, itemsByOrderId.get(row.id) ?? [])),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

async function hydrateOrderTx(
	db: QueryExecutor,
	row: Order,
	options: {
		includeItems?: boolean;
		includePayments?: boolean;
		includeStatusHistory?: boolean;
	}
): Promise<OrderDTO> {
	const [items, payments, statusHistory] = await Promise.all([
		loadOrderItemsTx(db, row.id),
		options.includePayments ? loadPaymentsForOrderTx(db, row.id) : Promise.resolve([]),
		options.includeStatusHistory
			? loadOrderStatusHistoryForOrderTx(db, row.id)
			: Promise.resolve([])
	]);

	return toOrderDTO(row, {
		items,
		payments,
		statusHistory,
		includeItems: options.includeItems ?? false,
		includePayments: options.includePayments ?? false,
		includeStatusHistory: options.includeStatusHistory ?? false
	});
}

export async function enqueueOrderConfirmationNotificationsTx(
	tx: OrdersTx,
	orderDto: OrderDTO
): Promise<NotificationOutboxDTO[]> {
	if (!orderDto.shippingAddressSnapshot) {
		return [];
	}

	const notifications: NotificationOutboxDTO[] = [];

	if (orderDto.userId && orderDto.items?.length) {
		const recipient = await loadOrderEmailRecipientTx(
			tx,
			orderDto.userId,
			orderDto.shippingAddressSnapshot.recipientName
		);

		if (recipient) {
			notifications.push(
				await enqueueOrderConfirmationEmailTx(tx as NotificationOutboxTx, {
					orderId: orderDto.id,
					recipientUserId: recipient.userId,
					payload: {
						email: recipient.email,
						customerName: recipient.customerName,
						orderId: orderDto.id,
						orderNumber: orderDto.orderNumber,
						orderDate: formatEmailDate(orderDto.createdAt),
						items: orderDto.items.map(toOrderEmailItem),
						subtotal: formatCurrency(orderDto.subtotal),
						shipping: formatCurrency(orderDto.shippingAmount),
						total: formatCurrency(orderDto.totalAmount),
						shippingAddress: formatAddressSnapshot(orderDto.shippingAddressSnapshot),
						estimatedDelivery: orderDto.shippingMethodSnapshot?.etaText,
						orderUrl: buildOrderUrl(orderDto)
					},
					metadata: { orderNumber: orderDto.orderNumber },
					now: orderDto.updatedAt
				})
			);
		}
	}

	notifications.push(
		await enqueueOrderConfirmationSmsTx(tx as NotificationOutboxTx, {
			orderId: orderDto.id,
			recipientUserId: orderDto.userId,
			payload: {
				to: orderDto.shippingAddressSnapshot.phone,
				customerName: orderDto.shippingAddressSnapshot.recipientName,
				orderId: orderDto.id,
				orderNumber: orderDto.orderNumber,
				total: formatCurrency(orderDto.totalAmount),
				orderUrl: buildOrderUrl(orderDto)
			},
			metadata: { orderNumber: orderDto.orderNumber },
			now: orderDto.updatedAt
		})
	);

	return notifications;
}

export async function enqueueOrderConfirmationNotificationsForOrderTx(
	tx: OrdersTx,
	orderId: string
): Promise<NotificationOutboxDTO[]> {
	const orderRow = await loadOrderByIdTx(tx, orderId);
	const orderDto = await hydrateOrderTx(tx, orderRow, {
		includeItems: true,
		includePayments: true,
		includeStatusHistory: false
	});
	return enqueueOrderConfirmationNotificationsTx(tx, orderDto);
}

async function enqueueShippingUpdateNotificationsTx(
	tx: OrdersTx,
	orderDto: OrderDTO
): Promise<NotificationOutboxDTO[]> {
	if (!orderDto.shippingAddressSnapshot || !orderDto.trackingNumber) return [];

	const notifications: NotificationOutboxDTO[] = [];

	if (orderDto.userId) {
		const recipient = await loadOrderEmailRecipientTx(
			tx,
			orderDto.userId,
			orderDto.shippingAddressSnapshot.recipientName
		);

		if (recipient) {
			notifications.push(
				await enqueueShippingUpdateEmailTx(tx as NotificationOutboxTx, {
					orderId: orderDto.id,
					recipientUserId: recipient.userId,
					payload: {
						email: recipient.email,
						customerName: recipient.customerName,
						orderId: orderDto.id,
						orderNumber: orderDto.orderNumber,
						trackingNumber: orderDto.trackingNumber,
						trackingUrl: orderDto.trackingUrl ?? undefined,
						carrier:
							orderDto.trackingCarrier ?? orderDto.shippingMethodSnapshot?.carrier ?? undefined,
						estimatedDelivery: orderDto.shippingMethodSnapshot?.etaText,
						orderUrl: buildOrderUrl(orderDto)
					},
					metadata: { orderNumber: orderDto.orderNumber },
					now: orderDto.updatedAt
				})
			);
		}
	}

	return notifications;
}

async function enqueueOrderStatusTransitionNotificationsTx(
	tx: OrdersTx,
	orderDto: OrderDTO
): Promise<NotificationOutboxDTO[]> {
	if (orderDto.status === 'shipped' && orderDto.trackingNumber) {
		return enqueueShippingUpdateNotificationsTx(tx, orderDto);
	}

	const notification = await enqueueOrderStatusUpdateNotificationTx(tx, orderDto);
	return notification ? [notification] : [];
}

export async function enqueuePaymentUpdateNotificationTx(
	tx: OrdersTx,
	paymentDto: PaymentDTO
): Promise<NotificationOutboxDTO | null> {
	const orderRow = await loadOrderByIdTx(tx, paymentDto.orderId);
	const orderDto = await hydrateOrderTx(tx, orderRow, {
		includeItems: false,
		includePayments: false,
		includeStatusHistory: false
	});

	if (!orderDto.shippingAddressSnapshot || !shouldSendPaymentStatusSms(paymentDto.status)) {
		return null;
	}

	return enqueuePaymentUpdateSmsTx(tx as NotificationOutboxTx, {
		orderId: orderDto.id,
		paymentId: paymentDto.id,
		recipientUserId: orderDto.userId,
		payload: {
			to: orderDto.shippingAddressSnapshot.phone,
			orderId: orderDto.id,
			orderNumber: orderDto.orderNumber,
			status: paymentDto.status,
			statusLabel: paymentDto.requiresManualReview
				? `${formatPaymentStatus(paymentDto.status)}; support review required`
				: formatPaymentStatus(paymentDto.status),
			amount: formatCurrency(paymentDto.amount),
			paymentUrl: buildOrderUrl(orderDto)
		},
		metadata: { orderNumber: orderDto.orderNumber, paymentId: paymentDto.id },
		now: paymentDto.updatedAt
	});
}

async function enqueueOrderStatusUpdateNotificationTx(
	tx: OrdersTx,
	orderDto: OrderDTO
): Promise<NotificationOutboxDTO | null> {
	if (!orderDto.shippingAddressSnapshot || !shouldEnqueueOrderStatusSms(orderDto.status)) {
		return null;
	}

	return enqueueOrderStatusUpdateSmsTx(tx as NotificationOutboxTx, {
		orderId: orderDto.id,
		recipientUserId: orderDto.userId,
		payload: {
			to: orderDto.shippingAddressSnapshot.phone,
			orderId: orderDto.id,
			orderNumber: orderDto.orderNumber,
			status: orderDto.status,
			statusLabel: formatOrderStatus(orderDto.status),
			orderUrl: buildOrderUrl(orderDto)
		},
		metadata: { orderNumber: orderDto.orderNumber },
		now: orderDto.updatedAt
	});
}

async function loadOrderEmailRecipientTx(
	tx: QueryExecutor,
	userId: string,
	fallbackName: string
): Promise<{ userId: string; email: string; customerName: string } | null> {
	const [row] = await tx
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email
		})
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	const email = resolvePublicEmail(row?.email ?? null);
	if (!row || !email) return null;

	return {
		userId: row.id,
		email,
		customerName: normalizeCustomerName(row.name, fallbackName)
	};
}

function shouldEnqueueShippingUpdateForFulfillment(existing: Order, updated: Order): boolean {
	if (updated.status !== 'shipped' || !updated.trackingNumber) return false;
	return existing.status === 'shipped' && !existing.trackingNumber;
}

function shouldEnqueueOrderStatusSms(status: OrderStatus): boolean {
	return shouldSendOrderStatusSms(status);
}

function toOrderEmailItem(item: OrderItemDTO): { name: string; quantity: number; price: string } {
	const variantLabel = [item.variantSize, item.variantColor].filter(Boolean).join(' / ');
	return {
		name: variantLabel ? `${item.productName} (${variantLabel})` : item.productName,
		quantity: item.quantity,
		price: formatCurrency(item.totalPrice)
	};
}

function formatAddressSnapshot(snapshot: AddressSnapshot): string {
	return [
		snapshot.recipientName,
		snapshot.addressLine1,
		snapshot.addressLine2,
		snapshot.city,
		snapshot.district,
		snapshot.postalCode,
		snapshot.country
	]
		.filter(Boolean)
		.join(', ');
}

function formatCurrency(value: number): string {
	return `LKR ${value.toLocaleString('en-LK')}`;
}

function formatPaymentStatus(status: PaymentStatus): string {
	if (status === 'captured') return 'paid';
	if (status === 'partially_refunded') return 'partially refunded';
	return status.replace(/_/g, ' ');
}

function formatOrderStatus(status: OrderStatus): string {
	return status.replace(/_/g, ' ');
}

function buildOrderUrl(orderDto: OrderDTO): string {
	const baseUrl = getEnv().PUBLIC_APP_URL.replace(/\/+$/, '');
	return `${baseUrl}/view-order/${encodeURIComponent(orderDto.orderNumber)}`;
}

function formatEmailDate(value: Date): string {
	return value.toLocaleDateString('en-LK', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

function normalizeCustomerName(name: string | null | undefined, fallbackName: string): string {
	const normalizedName = name?.trim();
	if (normalizedName) return normalizedName;

	const normalizedFallback = fallbackName.trim();
	return normalizedFallback || 'Customer';
}

function resolvePublicEmail(email: string | null): string | null {
	if (!email || isInternalTempEmail(email)) return null;
	return email;
}

function isInternalTempEmail(email: string): boolean {
	const normalizedEmail = email.trim().toLowerCase();
	return (
		normalizedEmail.endsWith(PHONE_EMAIL_DOMAIN) || normalizedEmail.endsWith(ANONYMOUS_EMAIL_DOMAIN)
	);
}

function toOrderDTO(
	row: Order,
	relations: {
		items: OrderItem[];
		payments: Payment[];
		statusHistory: OrderStatusHistory[];
		includeItems?: boolean;
		includePayments?: boolean;
		includeStatusHistory?: boolean;
	}
): OrderDTO {
	return removeUndefinedValues({
		id: row.id,
		orderNumber: row.orderNumber,
		userId: row.userId,
		status: row.status,
		paymentExpiresAt: row.paymentExpiresAt,
		subtotal: row.subtotal,
		discountAmount: row.discountAmount,
		shippingAmount: row.shippingAmount,
		totalAmount: row.totalAmount,
		promoCodeId: row.promoCodeId,
		promoCodeSnapshot: row.promoCodeSnapshot,
		shippingMethodId: row.shippingMethodId,
		shippingAddressId: row.shippingAddressId,
		shippingMethodSnapshot: row.shippingMethodSnapshot,
		shippingAddressSnapshot: row.shippingAddressSnapshot,
		trackingNumber: row.trackingNumber,
		trackingCarrier: row.trackingCarrier,
		trackingUrl: row.trackingUrl,
		customerNote: row.customerNote,
		adminNote: row.adminNote,
		confirmedAt: row.confirmedAt,
		shippedAt: row.shippedAt,
		deliveredAt: row.deliveredAt,
		cancelledAt: row.cancelledAt,
		refundedAt: row.refundedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		itemCount: relations.items.reduce((total, item) => total + item.quantity, 0),
		isTerminal: isTerminalOrderStatus(row.status),
		availableTransitions: ALLOWED_STATUS_TRANSITIONS[row.status],
		items: relations.includeItems ? relations.items.map(toOrderItemDTO) : undefined,
		payments: relations.includePayments ? relations.payments.map(toPaymentDTO) : undefined,
		statusHistory: relations.includeStatusHistory
			? relations.statusHistory.map(toOrderStatusHistoryDTO)
			: undefined
	}) as OrderDTO;
}

function toOrderSummaryDTO(row: Order, items: OrderItem[]): OrderSummaryDTO {
	const dto = toOrderDTO(row, {
		items,
		payments: [],
		statusHistory: [],
		includeItems: true,
		includePayments: false,
		includeStatusHistory: false
	});
	const firstImageKey = items.find((item) => item.productImageR2Key)?.productImageR2Key ?? null;

	return {
		...dto,
		firstItemImageUrl: firstImageKey ? mediaPresetUrl(firstImageKey, 'thumb160') : null
	};
}

function toOrderItemDTO(row: OrderItem): OrderItemDTO {
	return {
		id: row.id,
		orderId: row.orderId,
		variantId: row.variantId,
		productId: row.productId,
		productName: row.productName,
		variantSize: row.variantSize,
		variantColor: row.variantColor,
		productImageR2Key: row.productImageR2Key,
		imageUrl: row.productImageR2Key ? mediaPresetUrl(row.productImageR2Key, 'thumb160') : null,
		quantity: row.quantity,
		unitPrice: row.unitPrice,
		totalPrice: row.totalPrice
	};
}

function toPaymentDTO(row: Payment): PaymentDTO {
	const reviewReason = getManualReviewReason(row.gatewayResponse);
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
		requiresManualReview: Boolean(reviewReason),
		reviewReason,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function toOrderStatusHistoryDTO(row: OrderStatusHistory): OrderStatusHistoryDTO {
	return {
		id: row.id,
		orderId: row.orderId,
		fromStatus: row.fromStatus,
		toStatus: row.toStatus,
		changedBy: row.changedBy,
		note: row.note,
		createdAt: row.createdAt
	};
}

function toPreviewItemDTO(item: OrderPreviewDTO['bag']['items'][number]): OrderPreviewItemDTO {
	return {
		bagItemId: item.id,
		productId: requireSnapshotString(item.productId, 'productId'),
		variantId: requireSnapshotString(item.variantId, 'variantId'),
		productName: requireSnapshotString(item.productName, 'productName'),
		variantSize: requireSnapshotString(item.size, 'variantSize'),
		variantColor: requireSnapshotString(item.color, 'variantColor'),
		productImageR2Key: item.productImageR2Key,
		imageUrl: item.imageUrl,
		quantity: item.quantity,
		unitPrice: item.unitPrice,
		totalPrice: item.lineTotal,
		availabilityStatus: item.availabilityStatus,
		isBackorder: item.isBackorder
	};
}

function parseNewOrder(
	input: Omit<NewOrder, 'paymentExpiresAt'> & { paymentExpiresAt?: Date | null }
): NewOrder {
	const result = insertOrderSchema.safeParse({
		...input,
		paymentExpiresAt: dateToTimestampMs(input.paymentExpiresAt)
	});

	if (!result.success) {
		throw new OrderError('Invalid order data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return removeUndefinedValues({
		...result.data,
		id: input.id,
		paymentExpiresAt: timestampMsToDate(result.data.paymentExpiresAt)
	}) as NewOrder;
}

function parseNewOrderItem(input: NewOrderItem): NewOrderItem {
	const result = insertOrderItemSchema.safeParse({
		orderId: input.orderId,
		variantId: input.variantId,
		productId: input.productId,
		productName: input.productName,
		variantSize: input.variantSize,
		variantColor: input.variantColor,
		productImageR2Key: input.productImageR2Key,
		quantity: input.quantity,
		unitPrice: input.unitPrice,
		totalPrice: input.totalPrice
	} satisfies InsertOrderItem);

	if (!result.success) {
		throw new OrderError('Invalid order item data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		id: input.id,
		...result.data
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

function parseNewOrderStatusHistory(input: InsertOrderStatusHistory): NewOrderStatusHistory {
	const result = insertOrderStatusHistorySchema.safeParse(input);

	if (!result.success) {
		throw new OrderError('Invalid order status history.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseOrderUpdate(
	input: Partial<
		NewOrder & {
			confirmedAt?: Date | null;
			shippedAt?: Date | null;
			deliveredAt?: Date | null;
			cancelledAt?: Date | null;
			refundedAt?: Date | null;
			paymentExpiresAt?: Date | null;
		}
	>
): Partial<NewOrder> {
	const result = updateOrderSchema.safeParse({
		...input,
		confirmedAt: dateToTimestampMs(input.confirmedAt),
		shippedAt: dateToTimestampMs(input.shippedAt),
		deliveredAt: dateToTimestampMs(input.deliveredAt),
		cancelledAt: dateToTimestampMs(input.cancelledAt),
		refundedAt: dateToTimestampMs(input.refundedAt),
		paymentExpiresAt: dateToTimestampMs(input.paymentExpiresAt)
	});

	if (!result.success) {
		throw new OrderError('Invalid order update.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return removeUndefinedValues({
		...result.data,
		confirmedAt: timestampMsToDate(result.data.confirmedAt),
		shippedAt: timestampMsToDate(result.data.shippedAt),
		deliveredAt: timestampMsToDate(result.data.deliveredAt),
		cancelledAt: timestampMsToDate(result.data.cancelledAt),
		refundedAt: timestampMsToDate(result.data.refundedAt),
		paymentExpiresAt: timestampMsToDate(result.data.paymentExpiresAt),
		updatedAt: input.updatedAt
	}) as Partial<NewOrder>;
}

async function loadOrderByLookupTx(db: QueryExecutor, lookup: OrderLookup): Promise<Order> {
	if ('id' in lookup && lookup.id) return loadOrderByIdTx(db, lookup.id);

	const rawOrderNumber = 'orderNumber' in lookup ? lookup.orderNumber : undefined;
	if (!rawOrderNumber) {
		throw new OrderError('Order lookup is required.', ErrorCode.VALIDATION_ERROR);
	}

	const orderNumber = normalizeId(rawOrderNumber, 'orderNumber');
	const [row] = await db.select().from(order).where(eq(order.orderNumber, orderNumber)).limit(1);

	if (!row) {
		throw new OrderError('Order not found.', ErrorCode.ORDER_NOT_FOUND, { orderNumber });
	}

	return row;
}

async function loadOrderByIdTx(db: QueryExecutor, orderId: string): Promise<Order> {
	const normalizedId = normalizeId(orderId, 'orderId');
	const [row] = await db.select().from(order).where(eq(order.id, normalizedId)).limit(1);

	if (!row) {
		throw new OrderError('Order not found.', ErrorCode.ORDER_NOT_FOUND, { orderId: normalizedId });
	}

	return row;
}

async function loadOrderItemsTx(db: QueryExecutor, orderId: string): Promise<OrderItem[]> {
	return db
		.select()
		.from(orderItem)
		.where(eq(orderItem.orderId, normalizeId(orderId, 'orderId')))
		.orderBy(asc(orderItem.id));
}

async function loadOrderItemsByOrderId(
	db: QueryExecutor,
	orderIds: string[]
): Promise<Map<string, OrderItem[]>> {
	if (orderIds.length === 0) return new Map();

	const rows = await db
		.select()
		.from(orderItem)
		.where(inArray(orderItem.orderId, orderIds))
		.orderBy(asc(orderItem.id));
	const groups = new Map<string, OrderItem[]>();

	for (const row of rows) {
		const current = groups.get(row.orderId) ?? [];
		current.push(row);
		groups.set(row.orderId, current);
	}

	return groups;
}

async function loadPaymentsForOrderTx(db: QueryExecutor, orderId: string): Promise<Payment[]> {
	return db
		.select()
		.from(payment)
		.where(eq(payment.orderId, normalizeId(orderId, 'orderId')))
		.orderBy(desc(payment.createdAt));
}

async function loadOrderStatusHistoryForOrderTx(
	db: QueryExecutor,
	orderId: string
): Promise<OrderStatusHistory[]> {
	return db
		.select()
		.from(orderStatusHistory)
		.where(eq(orderStatusHistory.orderId, normalizeId(orderId, 'orderId')))
		.orderBy(asc(orderStatusHistory.createdAt));
}

async function generateUniqueOrderNumberTx(tx: QueryExecutor, now: Date): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const candidate = buildOrderNumber(now, orderNumberSuffix());
		const [existing] = await tx
			.select({ id: order.id })
			.from(order)
			.where(eq(order.orderNumber, candidate))
			.limit(1);

		if (!existing) return candidate;
	}

	throw new OrderError('Could not generate a unique order number.', ErrorCode.INTERNAL_ERROR);
}

function buildOrderListWhere(options: ListOrdersOptions, ctx: ServiceContext): SQL | undefined {
	const conditions: SQL[] = [];
	const now = resolveNow(ctx);

	if (options.status) conditions.push(eq(order.status, options.status));
	if (options.userId !== undefined) {
		if (options.userId === null) conditions.push(isNull(order.userId));
		else conditions.push(eq(order.userId, normalizeId(options.userId, 'userId')));
	}
	if (options.query) {
		const term = `%${sanitizeLikeTerm(options.query)}%`;
		conditions.push(or(like(order.orderNumber, term), like(order.trackingNumber, term)) as SQL);
	}
	if (options.createdFrom) conditions.push(gte(order.createdAt, options.createdFrom));
	if (options.createdTo) conditions.push(lte(order.createdAt, options.createdTo));
	if (options.paymentExpiredOnly) {
		conditions.push(eq(order.status, 'pending'));
		conditions.push(lte(order.paymentExpiresAt, now));
	}
	if (options.orderIds && options.orderIds.length > 0) {
		conditions.push(inArray(order.id, options.orderIds));
	}

	return conditions.length > 0 ? (and(...conditions) as SQL) : undefined;
}

function assertCheckoutReady(preview: OrderPreviewDTO): void {
	if (preview.items.length === 0) {
		throw new OrderError('Bag is empty.', ErrorCode.EMPTY_BAG);
	}

	if (!preview.canCheckout) {
		throw new OrderError('Bag cannot be checked out.', ErrorCode.CANNOT_MODIFY_ORDER, {
			blockingReasons: preview.blockingReasons
		});
	}
}

function assertStatusTransition(fromStatus: OrderStatus, toStatus: OrderStatus): void {
	if (!ALLOWED_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
		throw new OrderError('Invalid order status transition.', ErrorCode.INVALID_ORDER_STATUS, {
			fromStatus,
			toStatus
		});
	}
}

function statusTimestampValues(status: OrderStatus, now: Date): Partial<NewOrder> {
	if (status === 'confirmed') return { confirmedAt: now, paymentExpiresAt: null };
	if (status === 'shipped') return { shippedAt: now };
	if (status === 'delivered') return { deliveredAt: now };
	if (status === 'cancelled') return { cancelledAt: now, paymentExpiresAt: null };
	if (status === 'refunded') return { refundedAt: now };
	return {};
}

function isTerminalOrderStatus(status: OrderStatus): boolean {
	return status === 'cancelled' || status === 'refunded';
}

function addressRowToCheckoutAddress(row: Address): CheckoutAddressDTO {
	return validateCheckoutAddress({
		recipientName: row.recipientName,
		phone: row.phone,
		addressLine1: row.addressLine1,
		addressLine2: row.addressLine2,
		city: row.city,
		district: row.district,
		postalCode: row.postalCode
	});
}

function actorChangedBy(ctx: ServiceContext): string | null {
	const actor = ctx.actor;
	if (!actor || actor.id.startsWith('system:')) return null;
	return actor.id;
}

function requireOrderOwnerOrAdmin(ctx: ServiceContext, ownerUserId: string | null): void {
	const actor = ctx.actor;

	if (actor && 'isAnonymous' in actor && actor.isAnonymous && ownerUserId === actor.id) {
		return;
	}

	requireOwnerOrAdmin(actor, ownerUserId);
}

function requireSnapshotString(value: string | null | undefined, field: string): string {
	if (!value) {
		throw new OrderError(
			'Bag item is missing order snapshot data.',
			ErrorCode.CANNOT_MODIFY_ORDER,
			{
				field
			}
		);
	}

	return value;
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new OrderError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function normalizeNullableText(
	value: string | null | undefined,
	field: string,
	maxLength: number
): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const normalized = value.trim();
	if (normalized.length === 0) return null;
	if (normalized.length > maxLength) {
		throw new OrderError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			[field]: value,
			maxLength
		});
	}

	return normalized;
}

function dateToTimestampMs(value: Date | null | undefined): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return value.getTime();
}

function timestampMsToDate(value: number | null | undefined): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return new Date(value);
}

function sanitizeLikeTerm(value: string): string {
	return value.trim().replace(/[%_]/g, '');
}

function mapOrderPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);
	const normalized = message.toLowerCase();

	if (isUniqueConstraintError(message)) {
		throw new OrderError('Order already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new OrderError('Related order record not found.', ErrorCode.NOT_FOUND);
	}

	if (normalized.includes('check constraint failed')) {
		throw new OrderError('Invalid order data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}

const onlinePaymentMethodSet = new Set<string>(ONLINE_PAYMENT_METHODS);
const checkoutPaymentMethodSet = new Set<string>(CHECKOUT_PAYMENT_METHODS);

export async function getOrderAnalytics(ctx: ServiceContext): Promise<{
	totalSales: number;
	pendingFulfillmentCount: number;
	openOrdersCount: number;
	unpaidHoldsCount: number;
}> {
	requireAdmin(ctx.actor);

	const db = getDb();

	const [salesResult] = await db
		.select({
			total: sql<number>`COALESCE(SUM(${order.totalAmount}), 0)`
		})
		.from(order)
		.where(sql`${order.status} <> 'cancelled'`);

	const [pendingFulfillmentResult] = await db
		.select({
			count: count()
		})
		.from(order)
		.where(inArray(order.status, ['confirmed', 'processing']));

	const [openOrdersResult] = await db
		.select({
			count: count()
		})
		.from(order)
		.where(inArray(order.status, ['pending', 'confirmed', 'processing', 'shipped']));

	const [unpaidHoldsResult] = await db
		.select({
			count: count()
		})
		.from(order)
		.where(eq(order.status, 'pending'));

	return {
		totalSales: Number(salesResult?.total ?? 0),
		pendingFulfillmentCount: Number(pendingFulfillmentResult?.count ?? 0),
		openOrdersCount: Number(openOrdersResult?.count ?? 0),
		unpaidHoldsCount: Number(unpaidHoldsResult?.count ?? 0)
	};
}

export async function bulkTransitionOrderStatus(
	ctx: ServiceContext,
	input: { orderIds: string[]; toStatus: OrderStatus; note?: string }
): Promise<{
	successCount: number;
	failureCount: number;
	results: Array<{ orderId: string; orderNumber?: string; success: boolean; error?: string }>;
}> {
	requireAdmin(ctx.actor);

	const results: Array<{
		orderId: string;
		orderNumber?: string;
		success: boolean;
		error?: string;
	}> = [];
	let successCount = 0;
	let failureCount = 0;

	for (const orderId of input.orderIds) {
		try {
			const existing = await getDb()
				.select({ orderNumber: order.orderNumber })
				.from(order)
				.where(eq(order.id, orderId))
				.then((rows) => rows[0]);

			await transitionOrderStatus(ctx, {
				orderId,
				toStatus: input.toStatus,
				note: input.note ?? 'Transitioned via bulk action.'
			});

			results.push({
				orderId,
				orderNumber: existing?.orderNumber,
				success: true
			});
			successCount++;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			results.push({
				orderId,
				success: false,
				error: message
			});
			failureCount++;
		}
	}

	return {
		successCount,
		failureCount,
		results
	};
}

export async function listAllOrdersForExport(
	ctx: ServiceContext,
	options: Omit<ListOrdersOptions, 'limit' | 'offset'>
): Promise<OrderSummaryDTO[]> {
	requireAdmin(ctx.actor);
	const db = getDb();
	const where = buildOrderListWhere(options, ctx);

	const listQuery = db.select().from(order).orderBy(desc(order.createdAt), desc(order.id));

	const rows = await (where ? listQuery.where(where) : listQuery);

	const itemsByOrderId = await loadOrderItemsByOrderId(
		db,
		rows.map((row) => row.id)
	);

	return rows.map((row) => toOrderSummaryDTO(row, itemsByOrderId.get(row.id) ?? []));
}
