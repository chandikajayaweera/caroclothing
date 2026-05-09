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
	type SQL
} from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { getDb } from '$lib/server/db';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/modules/auth/guards';
import {
	ErrorCode,
	OrderError,
	PaymentError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';
import { mediaUrl } from '$lib/server/modules/media/utils';
import type { ServiceContext } from '$lib/server/modules/service-context';
import { address as addressTable, type Address } from '../addresses/addresses.drizzle';
import { createAddressSnapshot, validateCheckoutAddress } from '../addresses/addresses.service';
import type { AddressSnapshot, CheckoutAddressDTO } from '../addresses/addresses.types';
import {
	deleteCartAfterOrderPlacementTx,
	getCheckoutCartForOrderTx,
	type CartTx
} from '../cart/cart.service';
import {
	recordInventorySaleTx,
	releaseInventoryReservationTx,
	reserveInventoryTx,
	restoreInventorySaleTx,
	type InventoryTx
} from '../inventory/inventory.service';
import {
	recordPromoUsageTx,
	validatePromoCodeForCartTx,
	type PromotionsTx
} from '../promotions/promotions.service';
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
	ONLINE_PAYMENT_METHODS,
	order,
	orderItem,
	orderStatusHistory,
	payment,
	updateOrderSchema,
	updatePaymentSchema,
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
	type Payment
} from './orders.drizzle';
import type {
	CancelExpiredPendingOrdersInput,
	CancelExpiredPendingOrdersResult,
	CancelOrderInput,
	CheckoutShippingAddressInput,
	GetOrderInput,
	GetPaymentInput,
	ListMyOrdersOptions,
	ListOrdersOptions,
	ListPaymentsOptions,
	OrderDTO,
	OrderItemDTO,
	OrderListResult,
	OrderLookup,
	OrderPreviewDTO,
	OrderPreviewItemDTO,
	OrderStatusHistoryDTO,
	OrderSummaryDTO,
	PaymentDTO,
	PaymentListResult,
	PaymentStatus,
	PlaceOrderFromCartInput,
	PreviewOrderFromCartInput,
	RecordablePaymentStatus,
	RecordPaymentInput,
	RecordRefundInput,
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

const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending: ['confirmed', 'cancelled'],
	confirmed: ['processing', 'cancelled'],
	processing: ['shipped', 'cancelled'],
	shipped: ['delivered'],
	delivered: ['refunded'],
	cancelled: [],
	refunded: []
};
const RECORDABLE_PAYMENT_STATUSES = [
	'pending',
	'authorized',
	'captured',
	'failed'
] as const satisfies readonly PaymentStatus[];
const recordablePaymentStatusSet = new Set<PaymentStatus>(RECORDABLE_PAYMENT_STATUSES);
const ALLOWED_PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
	pending: ['pending', 'authorized', 'captured', 'failed'],
	authorized: ['authorized', 'captured', 'failed'],
	captured: ['captured'],
	failed: ['failed', 'pending', 'authorized', 'captured'],
	refunded: ['refunded'],
	partially_refunded: ['partially_refunded', 'refunded']
};

export async function previewOrderFromCart(
	ctx: ServiceContext,
	input: PreviewOrderFromCartInput
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

export async function placeOrderFromCart(
	ctx: ServiceContext,
	input: PlaceOrderFromCartInput
): Promise<OrderDTO> {
	try {
		return await getDb().transaction(async (tx) => placeOrderFromCartTx(tx, ctx, input));
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function placeOrderFromCartTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	input: PlaceOrderFromCartInput
): Promise<OrderDTO> {
	const now = resolveNow(ctx, input.now);
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
		userId: preview.cart.userId,
		status: 'pending',
		paymentExpiresAt,
		subtotal: preview.subtotal,
		discountAmount: preview.discountAmount,
		shippingAmount: preview.shippingAmount,
		totalAmount: preview.totalAmount,
		promoCodeId: preview.promoValidation?.promoCodeId ?? null,
		promoCodeSnapshot: stringifyJson(preview.promoValidation?.snapshot ?? null),
		shippingMethodId: preview.shippingQuote.shippingMethodId,
		shippingAddressId: preview.shippingAddressId,
		shippingMethodSnapshot: stringifyJson(preview.shippingMethodSnapshot),
		shippingAddressSnapshot: stringifyJson(preview.shippingAddressSnapshot),
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
			variantSku: previewItem.variantSku,
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
			referenceId: previewItem.cartItemId,
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
			userId: preview.cart.userId,
			discountAmount: preview.discountAmount,
			now
		});
	}

	await deleteCartAfterOrderPlacementTx(tx as CartTx, { cartId: preview.cart.id });

	return toOrderDTO(createdOrder, {
		items: createdItems,
		payments: [createdPayment],
		statusHistory: [createdHistory],
		includeItems: true,
		includePayments: true,
		includeStatusHistory: true
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
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const where = buildOrderListWhere({ ...options, userId: actor.id }, ctx);
	return listOrdersTx(getDb(), where, limit, offset);
}

export async function listOrders(
	ctx: ServiceContext,
	options: ListOrdersOptions = {}
): Promise<OrderListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const where = buildOrderListWhere(options, ctx);
	return listOrdersTx(getDb(), where, limit, offset);
}

export async function transitionOrderStatus(
	ctx: ServiceContext,
	input: TransitionOrderStatusInput
): Promise<OrderDTO> {
	requireAdmin(ctx.actor);

	try {
		return await getDb().transaction(async (tx) => transitionOrderStatusTx(tx, ctx, input));
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
		.where(eq(order.id, orderId))
		.returning();

	if (!updated) {
		throw new OrderError('Order not found.', ErrorCode.ORDER_NOT_FOUND, { orderId });
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

	try {
		return await getDb().transaction(async (tx) => {
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

			return hydrateOrderTx(tx, updated, {
				includeItems: true,
				includePayments: true,
				includeStatusHistory: true
			});
		});
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function listPayments(
	ctx: ServiceContext,
	options: ListPaymentsOptions = {}
): Promise<PaymentListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const where = buildPaymentListWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(payment);
	const listQuery = db
		.select()
		.from(payment)
		.orderBy(desc(payment.createdAt))
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		where ? countQuery.where(where) : countQuery,
		where ? listQuery.where(where) : listQuery
	]);

	return {
		items: rows.map(toPaymentDTO),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function getPayment(ctx: ServiceContext, input: GetPaymentInput): Promise<PaymentDTO> {
	requireAdmin(ctx.actor);
	const row = await loadPaymentByIdTx(getDb(), input.paymentId);
	return toPaymentDTO(row);
}

export async function recordPayment(
	ctx: ServiceContext,
	input: RecordPaymentInput
): Promise<PaymentDTO> {
	requireAdmin(ctx.actor);

	try {
		return await getDb().transaction(async (tx) => recordPaymentTx(tx, ctx, input));
	} catch (error) {
		throw mapPaymentPersistenceError(error);
	}
}

export async function recordRefund(
	ctx: ServiceContext,
	input: RecordRefundInput
): Promise<PaymentDTO> {
	requireAdmin(ctx.actor);

	try {
		return await getDb().transaction(async (tx) => {
			const paymentRow = await loadPaymentByIdTx(tx, input.paymentId);
			const orderRow = await loadOrderByIdTx(tx, paymentRow.orderId);
			const refundAmount = normalizeMoney(input.refundAmount, 'refundAmount');

			if (refundAmount > paymentRow.amount) {
				throw new PaymentError('Refund amount exceeds payment amount.', ErrorCode.REFUND_FAILED, {
					paymentId: paymentRow.id,
					amount: paymentRow.amount,
					refundAmount
				});
			}

			const status: PaymentStatus =
				refundAmount === paymentRow.amount ? 'refunded' : 'partially_refunded';
			const [updated] = await tx
				.update(payment)
				.set(
					parsePaymentUpdate({
						status,
						refundAmount,
						refundedAt: resolveNow(ctx, input.now),
						gatewayResponse:
							'gatewayResponse' in input ? stringifyJson(input.gatewayResponse ?? null) : undefined
					})
				)
				.where(eq(payment.id, paymentRow.id))
				.returning();

			if (!updated) {
				throw new PaymentError('Payment not found.', ErrorCode.PAYMENT_NOT_FOUND, {
					paymentId: paymentRow.id
				});
			}

			if (status === 'refunded' && orderRow.status === 'delivered') {
				await transitionOrderStatusTx(tx, ctx, {
					orderId: orderRow.id,
					toStatus: 'refunded',
					note: 'Payment refunded.',
					now: input.now
				});
			}

			return toPaymentDTO(updated);
		});
	} catch (error) {
		throw mapPaymentPersistenceError(error);
	}
}

export async function cancelExpiredPendingOrders(
	ctx: ServiceContext,
	input: CancelExpiredPendingOrdersInput = {}
): Promise<CancelExpiredPendingOrdersResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const limit = normalizeLimit(input.limit, CLEANUP_DEFAULT_LIMIT, CLEANUP_MAX_LIMIT);

	try {
		return await getDb().transaction(async (tx) => {
			const rows = await tx
				.select()
				.from(order)
				.where(and(eq(order.status, 'pending'), lte(order.paymentExpiresAt, now)))
				.orderBy(asc(order.paymentExpiresAt), asc(order.createdAt))
				.limit(limit);
			const orders: OrderDTO[] = [];

			for (const row of rows) {
				orders.push(
					await transitionOrderStatusTx(tx, ctx, {
						orderId: row.id,
						toStatus: 'cancelled',
						note: 'Payment window expired.',
						now
					})
				);
			}

			return {
				cancelledCount: orders.length,
				orderIds: orders.map((item) => item.id),
				orders
			};
		});
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
	input: PreviewOrderFromCartInput & { now: Date }
): Promise<OrderPreviewDTO> {
	const cart = await getCheckoutCartForOrderTx(tx as CartTx, ctx, {
		sessionToken: input.sessionToken,
		now: input.now
	});
	const blockingReasons = [...cart.blockingReasons];

	if (cart.items.length === 0) {
		throw new OrderError('Cart is empty.', ErrorCode.EMPTY_CART);
	}

	const shippingAddress = await resolveCheckoutShippingAddressTx(tx, ctx, input.shippingAddress);
	const shippingQuote = await calculateShippingQuoteTx(tx as ShippingTx, {
		shippingMethodId: input.shippingMethodId,
		district: shippingAddress.address.district,
		subtotal: cart.subtotal,
		activeOnly: true
	});
	const promoValidation = input.promoCode
		? await validatePromoCodeForCartTx(tx as PromotionsTx, {
				code: input.promoCode,
				userId: cart.userId,
				subtotal: cart.subtotal,
				now: input.now
			})
		: null;
	const discountAmount = promoValidation?.discountAmount ?? 0;
	const shippingAmount = shippingQuote.price;
	const totalAmount = cart.subtotal - discountAmount + shippingAmount;
	const items = cart.items.map(toPreviewItemDTO);

	return {
		cart,
		items,
		shippingAddressId: shippingAddress.addressId,
		shippingAddress: shippingAddress.address,
		shippingAddressSnapshot: shippingAddress.snapshot,
		shippingQuote,
		shippingMethodSnapshot: createShippingMethodSnapshot(shippingQuote),
		promoValidation,
		subtotal: cart.subtotal,
		discountAmount,
		shippingAmount,
		totalAmount,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

async function recordPaymentTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	input: RecordPaymentInput
): Promise<PaymentDTO> {
	const now = resolveNow(ctx, input.now);
	const nextStatus = input.status;

	assertRecordablePaymentStatus(nextStatus);

	const orderRow = await loadOrderByIdTx(tx, input.orderId);
	const existing = input.paymentId
		? await loadPaymentByIdTx(tx, input.paymentId)
		: await loadLatestPaymentForOrderTx(tx, orderRow.id);

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
			.update(payment)
			.set(
				parsePaymentUpdate({
					status: nextStatus,
					transactionId: input.transactionId,
					gatewayResponse:
						'gatewayResponse' in input ? stringifyJson(input.gatewayResponse ?? null) : undefined,
					paidAt: shouldSetPaidAt(nextStatus) ? (input.paidAt ?? now) : input.paidAt
				})
			)
			.where(eq(payment.id, existing.id))
			.returning();

		if (!updated) {
			throw new PaymentError('Payment not found.', ErrorCode.PAYMENT_NOT_FOUND, {
				paymentId: existing.id
			});
		}
		row = updated;
	} else {
		if (!input.method || input.amount === undefined) {
			throw new PaymentError('Payment method and amount are required.', ErrorCode.VALIDATION_ERROR);
		}

		const [created] = await tx
			.insert(payment)
			.values(
				parseNewPayment({
					orderId: orderRow.id,
					amount: input.amount,
					currency: 'LKR',
					method: input.method,
					status: nextStatus,
					transactionId: input.transactionId ?? null,
					gatewayResponse:
						'gatewayResponse' in input ? stringifyJson(input.gatewayResponse ?? null) : null,
					refundAmount: null
				})
			)
			.returning();

		if (!created) {
			throw new PaymentError('Payment was not created.', ErrorCode.INTERNAL_ERROR);
		}

		row = created;
	}

	if (shouldConfirmOrderFromPayment(nextStatus) && orderRow.status === 'pending') {
		await transitionOrderStatusTx(tx, ctx, {
			orderId: orderRow.id,
			toStatus: 'confirmed',
			note: `Payment ${nextStatus}.`,
			now
		});
	}

	return toPaymentDTO(row);
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
		promoCodeSnapshot: parseNullableJson(row.promoCodeSnapshot),
		shippingMethodId: row.shippingMethodId,
		shippingAddressId: row.shippingAddressId,
		shippingMethodSnapshot: parseNullableJson(row.shippingMethodSnapshot),
		shippingAddressSnapshot: parseNullableJson(row.shippingAddressSnapshot),
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
		includeItems: false,
		includePayments: false,
		includeStatusHistory: false
	});
	const firstImageKey = items.find((item) => item.productImageR2Key)?.productImageR2Key ?? null;

	return {
		...dto,
		firstItemImageUrl: firstImageKey ? mediaUrl(firstImageKey) : null
	};
}

function toOrderItemDTO(row: OrderItem): OrderItemDTO {
	return {
		id: row.id,
		orderId: row.orderId,
		variantId: row.variantId,
		productId: row.productId,
		productName: row.productName,
		variantSku: row.variantSku,
		variantSize: row.variantSize,
		variantColor: row.variantColor,
		productImageR2Key: row.productImageR2Key,
		imageUrl: row.productImageR2Key ? mediaUrl(row.productImageR2Key) : null,
		quantity: row.quantity,
		unitPrice: row.unitPrice,
		totalPrice: row.totalPrice
	};
}

function toPaymentDTO(row: Payment): PaymentDTO {
	return {
		id: row.id,
		orderId: row.orderId,
		amount: row.amount,
		currency: row.currency,
		method: row.method,
		status: row.status,
		transactionId: row.transactionId,
		gatewayResponse: parseNullableJson(row.gatewayResponse),
		refundAmount: row.refundAmount,
		refundedAt: row.refundedAt,
		paidAt: row.paidAt,
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

function toPreviewItemDTO(item: OrderPreviewDTO['cart']['items'][number]): OrderPreviewItemDTO {
	return {
		cartItemId: item.id,
		productId: requireSnapshotString(item.productId, 'productId'),
		variantId: requireSnapshotString(item.variantId, 'variantId'),
		productName: requireSnapshotString(item.productName, 'productName'),
		variantSku: requireSnapshotString(item.variantSku, 'variantSku'),
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
		variantSku: input.variantSku,
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

async function loadLatestPaymentForOrderTx(
	db: QueryExecutor,
	orderId: string
): Promise<Payment | null> {
	const [row] = await db
		.select()
		.from(payment)
		.where(eq(payment.orderId, normalizeId(orderId, 'orderId')))
		.orderBy(desc(payment.createdAt))
		.limit(1);

	return row ?? null;
}

async function loadPaymentByIdTx(db: QueryExecutor, paymentId: string): Promise<Payment> {
	const normalizedId = normalizeId(paymentId, 'paymentId');
	const [row] = await db.select().from(payment).where(eq(payment.id, normalizedId)).limit(1);

	if (!row) {
		throw new PaymentError('Payment not found.', ErrorCode.PAYMENT_NOT_FOUND, {
			paymentId: normalizedId
		});
	}

	return row;
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
		const candidate = `CARO-${formatOrderNumberDate(now)}-${orderNumberSuffix()}`;
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

	return conditions.length > 0 ? (and(...conditions) as SQL) : undefined;
}

function buildPaymentListWhere(options: ListPaymentsOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.orderId)
		conditions.push(eq(payment.orderId, normalizeId(options.orderId, 'orderId')));
	if (options.status) conditions.push(eq(payment.status, options.status));
	if (options.method) conditions.push(eq(payment.method, options.method));

	return conditions.length > 0 ? (and(...conditions) as SQL) : undefined;
}

function assertCheckoutReady(preview: OrderPreviewDTO): void {
	if (preview.items.length === 0) {
		throw new OrderError('Cart is empty.', ErrorCode.EMPTY_CART);
	}

	if (!preview.canCheckout) {
		throw new OrderError('Cart cannot be checked out.', ErrorCode.CANNOT_MODIFY_ORDER, {
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

function assertRecordablePaymentStatus(
	status: PaymentStatus
): asserts status is RecordablePaymentStatus {
	if (!recordablePaymentStatusSet.has(status)) {
		throw new PaymentError(
			'Refund payment statuses must be recorded with recordRefund.',
			ErrorCode.VALIDATION_ERROR,
			{ status }
		);
	}
}

function assertPaymentStatusTransition(
	fromStatus: PaymentStatus,
	toStatus: RecordablePaymentStatus
): void {
	if (!ALLOWED_PAYMENT_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
		throw new PaymentError(
			'Invalid payment status transition.',
			ErrorCode.PAYMENT_ALREADY_PROCESSED,
			{
				fromStatus,
				toStatus
			}
		);
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

function shouldSetPaidAt(status: RecordablePaymentStatus): boolean {
	return status === 'authorized' || status === 'captured';
}

function shouldConfirmOrderFromPayment(status: RecordablePaymentStatus): boolean {
	return status === 'authorized' || status === 'captured';
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
			'Cart item is missing order snapshot data.',
			ErrorCode.CANNOT_MODIFY_ORDER,
			{
				field
			}
		);
	}

	return value;
}

function normalizeMoney(value: number, field: string): number {
	if (!Number.isInteger(value) || value <= 0) {
		throw new PaymentError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
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

function normalizeLimit(
	limit: number | undefined,
	defaultLimit = DEFAULT_LIMIT,
	maxLimit = MAX_LIMIT
): number {
	if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
	return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

function normalizeOffset(offset: number | undefined): number {
	if (offset === undefined || !Number.isFinite(offset)) return 0;
	return Math.max(Math.trunc(offset), 0);
}

function resolveNow(ctx: ServiceContext, now?: Date): Date {
	return now ?? ctx.now ?? new Date();
}

function formatOrderNumberDate(now: Date): string {
	return now.toISOString().slice(0, 10).replace(/-/g, '');
}

function stringifyJson(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return JSON.stringify(value);
}

function parseNullableJson(value: string | null): unknown | null {
	if (value === null) return null;

	try {
		return JSON.parse(value);
	} catch {
		throw new OrderError('Stored order JSON is invalid.', ErrorCode.INTERNAL_ERROR);
	}
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

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
	) as T;
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

function mapPaymentPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);
	const normalized = message.toLowerCase();

	if (isForeignKeyConstraintError(message)) {
		throw new PaymentError('Related payment record not found.', ErrorCode.NOT_FOUND);
	}

	if (normalized.includes('check constraint failed')) {
		throw new PaymentError('Invalid payment data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}

function isUniqueConstraintError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('unique constraint failed') || normalized.includes('constraint_unique')
	);
}

function isForeignKeyConstraintError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('foreign key constraint failed') ||
		normalized.includes('constraint_foreign')
	);
}

const onlinePaymentMethodSet = new Set<string>(ONLINE_PAYMENT_METHODS);
