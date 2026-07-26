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
	notExists,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { customAlphabet, nanoid } from 'nanoid';
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
	withTransientD1WriteReconciliation
} from '$lib/server/db/retry';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import { getEnv } from '$lib/server/infrastructure/env';
import {
	ErrorCode,
	OrderError,
	PaymentError,
	getErrorMessage,
	isAppError,
	toErrorResponseBody
} from '$lib/server/infrastructure/errors';
import { mediaPresetUrl } from '$lib/server/infrastructure/media';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow,
	uniqueStrings
} from '$lib/server/foundation/utils';
import { address as addressTable, type Address } from '../addresses/addresses.drizzle';
import { createAddressSnapshot, validateCheckoutAddress } from '../addresses/addresses.service';
import type { AddressSnapshot, CheckoutAddressDTO } from '../addresses/addresses.types';
import { user as userTable } from '../auth/auth.drizzle';
import { getCheckoutBagForOrderTx } from '../bag/bag.service';
import { bag as bagTable } from '../bag/bag.drizzle';
import {
	prepareInventorySaleBatch,
	prepareInventorySaleRestoreBatch
} from '../inventory/inventory.service';
import {
	publishNotificationWakeups,
	publishPreparedNotificationWakeups,
	prepareNotificationOutboxInsert,
	loadPreparedNotificationOutboxRows,
	type PreparedNotificationOutboxInsert
} from '../notifications/outbox/outbox.service';
import type { NotificationOutboxDTO } from '../notifications/outbox/outbox.types';
import { getManualReviewReason } from '../payments/payments.logic';
import {
	preparePromoUsageBatch,
	resolveStoredPromotionForBagTx,
	validatePromoCodeForBagTx
} from '../promotions/promotions.service';
import {
	calculateShippingQuoteTx,
	createShippingMethodSnapshot
} from '../shipping/shipping.service';
import {
	insertOrderItemSchema,
	insertOrderSchema,
	insertOrderStatusHistorySchema,
	insertPaymentSchema,
	CHECKOUT_PAYMENT_METHODS,
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
import { buildOrderNumber, shouldSendOrderStatusSms } from './orders.logic';
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
export type OrdersTx = Db;
type QueryExecutor = Db;
export type OrdersBatchItem = Parameters<Db['batch']>[0][number];

const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const orderNumberSuffix = customAlphabet(ORDER_NUMBER_ALPHABET, 5);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CLEANUP_DEFAULT_LIMIT = 50;
const CLEANUP_MAX_LIMIT = 200;
const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
const ANONYMOUS_EMAIL_DOMAIN = '@anon.caroclothing.lk';

export type ConfirmedCheckoutPaymentInput = {
	status: Extract<PaymentStatus, 'pending' | 'captured'>;
	transactionId?: string | null;
	gatewayResponse?: unknown;
	paidAt?: Date | null;
};

export type PreparedConfirmedOrder = {
	orderId: string;
	paymentId: string;
	order: OrderDTO;
	statements: [OrdersBatchItem, ...OrdersBatchItem[]];
	notifications: PreparedNotificationOutboxInsert[];
};

const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending: ['confirmed', 'cancelled'],
	confirmed: ['processing', 'cancelled'],
	processing: ['shipped', 'cancelled'],
	shipped: ['delivered'],
	delivered: ['refunded'],
	cancelled: [],
	refunded: []
};

const ACCOUNT_DELETION_BLOCKING_ORDER_STATUSES = [
	'pending',
	'confirmed',
	'processing',
	'shipped'
] as const satisfies readonly OrderStatus[];

export async function findAccountDeletionBlockingOrderTx(
	db: OrdersTx,
	userId: string
): Promise<Pick<Order, 'id' | 'orderNumber' | 'status'> | null> {
	const [blockingOrder] = await db
		.select({
			id: order.id,
			orderNumber: order.orderNumber,
			status: order.status
		})
		.from(order)
		.where(
			and(
				eq(order.userId, normalizeId(userId, 'userId')),
				inArray(order.status, ACCOUNT_DELETION_BLOCKING_ORDER_STATUSES)
			)
		)
		.orderBy(asc(order.createdAt))
		.limit(1);

	return blockingOrder ?? null;
}

export function prepareAccountDeletionOrderGuard(
	db: OrdersTx,
	userId: string
): ReturnType<typeof guardBatchCondition> {
	const normalizedUserId = normalizeId(userId, 'userId');
	const blockingOrderExists = db
		.select({ id: order.id })
		.from(order)
		.where(
			and(
				eq(order.userId, normalizedUserId),
				inArray(order.status, ACCOUNT_DELETION_BLOCKING_ORDER_STATUSES)
			)
		);

	return guardBatchCondition(db, notExists(blockingOrderExists));
}

export async function listAccountOrderIdsForDeletionTx(
	db: OrdersTx,
	userId: string
): Promise<string[]> {
	const rows = await db
		.select({ id: order.id })
		.from(order)
		.where(eq(order.userId, normalizeId(userId, 'userId')));
	return rows.map((row) => row.id);
}

export function prepareAccountOrderAnonymization(
	db: OrdersTx,
	input: { userId: string; now?: Date }
): OrdersBatchItem {
	const userId = normalizeId(input.userId, 'userId');
	const now = resolveNow(null, input.now);
	return db
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
}

export async function previewOrderFromBag(
	ctx: ServiceContext,
	input: PreviewOrderFromBagInput
): Promise<OrderPreviewDTO> {
	try {
		return await buildOrderPreviewTx(getDb(), ctx, {
			...input,
			now: resolveNow(ctx, input.now)
		});
	} catch (error) {
		throw mapOrderPersistenceError(error);
	}
}

export async function placeOrderFromBag(
	ctx: ServiceContext,
	input: PlaceOrderFromBagInput
): Promise<OrderDTO> {
	try {
		if (input.paymentMethod !== 'cash_on_delivery') {
			throw new PaymentError(
				'Online checkout must be completed through a verified payment attempt.',
				ErrorCode.INVALID_PAYMENT_METHOD,
				{ method: input.paymentMethod }
			);
		}

		const db = getDb();
		const prepared = await prepareConfirmedOrderFromBag(db, ctx, input, { status: 'pending' });
		await commitOrderBatchWithReconciliation(db, prepared.statements, async () => {
			const [committedPayment] = await db
				.select({ id: payment.id })
				.from(payment)
				.where(and(eq(payment.id, prepared.paymentId), eq(payment.orderId, prepared.orderId)))
				.limit(1);
			return Boolean(committedPayment);
		});
		await publishPreparedNotificationWakeups(ctx, db, prepared.notifications);
		return hydrateCommittedOrderOrFallback(db, prepared.orderId, prepared.order);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new OrderError(
				'Checkout changed or stock is no longer available. Review your bag and try again.',
				ErrorCode.CONFLICT
			);
		}
		throw mapOrderPersistenceError(error);
	}
}

export async function prepareConfirmedOrderFromBag(
	db: Db,
	ctx: ServiceContext,
	input: PlaceOrderFromBagInput,
	paymentInput: ConfirmedCheckoutPaymentInput
): Promise<PreparedConfirmedOrder> {
	const now = resolveNow(ctx, input.now);
	if (!checkoutPaymentMethodSet.has(input.paymentMethod)) {
		throw new PaymentError(
			'This payment method is not available at checkout.',
			ErrorCode.INVALID_PAYMENT_METHOD,
			{ method: input.paymentMethod }
		);
	}
	const preview = await buildOrderPreviewTx(db, ctx, { ...input, now });

	assertCheckoutReady(preview);

	const orderId = nanoid();
	const orderNumber = await generateUniqueOrderNumberTx(db, now);
	const orderValues: NewOrder = {
		...parseNewOrder({
			id: orderId,
			orderNumber,
			userId: preview.bag.userId,
			status: 'confirmed',
			paymentExpiresAt: null,
			subtotal: preview.subtotal,
			discountAmount: preview.discountAmount,
			shippingAmount: preview.shippingAmount,
			totalAmount: preview.totalAmount,
			promotionId: preview.promoValidation?.promotionId ?? null,
			promoCodeId: preview.promoValidation?.promoCodeId ?? null,
			promoCodeSnapshot: preview.promoValidation?.snapshot ?? null,
			shippingMethodId: preview.shippingQuote.shippingMethodId,
			shippingAddressId: preview.shippingAddressId,
			shippingMethodSnapshot: preview.shippingMethodSnapshot,
			shippingAddressSnapshot: preview.shippingAddressSnapshot,
			customerNote: normalizeNullableText(input.customerNote, 'customerNote', 1000)
		}),
		confirmedAt: now,
		createdAt: now,
		updatedAt: now
	};

	const createdItems: OrderItem[] = [];
	for (const previewItem of preview.items) {
		const orderItemId = nanoid();
		const parsedItem = parseNewOrderItem({
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
		const itemValues: OrderItem = {
			id: orderItemId,
			orderId,
			variantId: parsedItem.variantId ?? null,
			productId: parsedItem.productId ?? null,
			productName: parsedItem.productName,
			variantSize: parsedItem.variantSize,
			variantColor: parsedItem.variantColor,
			productImageR2Key: parsedItem.productImageR2Key ?? null,
			quantity: parsedItem.quantity,
			unitPrice: parsedItem.unitPrice,
			totalPrice: parsedItem.totalPrice
		};
		createdItems.push(itemValues);
	}

	const paymentId = nanoid();
	const parsedPayment = parseNewPayment({
		id: paymentId,
		orderId,
		amount: preview.totalAmount,
		currency: 'LKR',
		method: input.paymentMethod,
		status: paymentInput.status,
		transactionId: paymentInput.transactionId ?? null,
		gatewayResponse: paymentInput.gatewayResponse ?? null,
		refundAmount: null
	});
	const paymentValues: Payment = {
		id: paymentId,
		orderId,
		amount: parsedPayment.amount,
		currency: parsedPayment.currency ?? 'LKR',
		method: parsedPayment.method,
		status: parsedPayment.status ?? paymentInput.status,
		transactionId: parsedPayment.transactionId ?? null,
		gatewayResponse: parsedPayment.gatewayResponse ?? null,
		refundAmount: parsedPayment.refundAmount ?? null,
		refundedAt: null,
		paidAt: paymentInput.paidAt ?? (paymentInput.status === 'captured' ? now : null),
		createdAt: now,
		updatedAt: now
	};
	const historyId = nanoid();
	const parsedHistory = parseNewOrderStatusHistory({
		orderId,
		fromStatus: null,
		toStatus: 'confirmed',
		changedBy: actorChangedBy(ctx),
		note:
			input.paymentMethod === 'cash_on_delivery'
				? 'Cash on delivery order confirmed at placement.'
				: `${input.paymentMethod === 'paypal' ? 'PayPal' : 'PayHere'} payment captured.`
	});
	const createdHistory: OrderStatusHistory = {
		id: historyId,
		orderId,
		fromStatus: parsedHistory.fromStatus ?? null,
		toStatus: parsedHistory.toStatus,
		changedBy: parsedHistory.changedBy ?? null,
		note: parsedHistory.note ?? null,
		createdAt: now
	};
	const placedOrder = toOrderDTO(orderValues as Order, {
		items: createdItems,
		payments: [paymentValues],
		statusHistory: [createdHistory],
		includeItems: true,
		includePayments: true,
		includeStatusHistory: true
	});
	const notifications = await prepareOrderConfirmationNotificationInserts(db, placedOrder);
	const ownerCondition = preview.bag.userId
		? eq(bagTable.userId, preview.bag.userId)
		: isNull(bagTable.userId);
	const checkoutGuard = guardBatchCondition(
		db,
		sql`EXISTS (
				SELECT 1 FROM ${bagTable}
				WHERE ${bagTable.id} = ${preview.bag.id}
					AND ${ownerCondition}
					AND ${bagTable.updatedAt} = ${preview.bag.updatedAt.getTime()}
					AND ${bagTable.checkoutExpiresAt} > ${now.getTime()}
			)`
	);
	const statements: [OrdersBatchItem, ...OrdersBatchItem[]] = [
		checkoutGuard[0],
		checkoutGuard[1],
		db.insert(order).values(orderValues),
		db.insert(orderItem).values(createdItems)
	];

	for (const item of createdItems) {
		if (!item.variantId) continue;
		statements.push(
			...prepareInventorySaleBatch(db, {
				variantId: item.variantId,
				quantity: item.quantity,
				referenceId: item.id,
				now,
				note: `Order ${orderNumber} confirmed.`
			})
		);
	}

	if (preview.promoValidation) {
		statements.push(
			...preparePromoUsageBatch(db, {
				promotionId: preview.promoValidation.promotionId,
				promoCodeId: preview.promoValidation.promoCodeId,
				orderId,
				userId: preview.bag.userId,
				discountAmount: preview.discountAmount,
				now
			})
		);
	}

	statements.push(
		db.insert(payment).values(paymentValues),
		db.insert(orderStatusHistory).values(createdHistory),
		db.delete(bagTable).where(eq(bagTable.id, preview.bag.id)),
		...guardPreviousBatchChanges(db),
		...notifications.map((item) => item.statement)
	);

	return { orderId, paymentId, order: placedOrder, statements, notifications };
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

	try {
		const db = getDb();
		const prepared = await prepareOrderStatusTransition(db, ctx, input);
		await commitOrderBatchWithReconciliation(db, prepared.statements, async () => {
			const [committedHistory] = await db
				.select({ id: orderStatusHistory.id })
				.from(orderStatusHistory)
				.where(eq(orderStatusHistory.id, prepared.historyId))
				.limit(1);
			return Boolean(committedHistory);
		});
		await publishPreparedNotificationWakeups(ctx, db, prepared.notifications);
		return hydrateCommittedOrderOrFallback(db, prepared.order.id, prepared.order);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new OrderError(
				'Order status changed before the transition completed.',
				ErrorCode.CONFLICT,
				{ orderId: input.orderId, toStatus: input.toStatus }
			);
		}
		throw mapOrderPersistenceError(error);
	}
}

export async function prepareOrderStatusTransition(
	db: Db,
	ctx: ServiceContext,
	input: TransitionOrderStatusInput,
	options: { includeNotifications?: boolean } = {}
): Promise<{
	order: OrderDTO;
	historyId: string;
	statements: [OrdersBatchItem, ...OrdersBatchItem[]];
	notifications: PreparedNotificationOutboxInsert[];
}> {
	const now = resolveNow(ctx, input.now);
	const orderId = normalizeId(input.orderId, 'orderId');
	const existing = await loadOrderByIdTx(db, orderId);
	const toStatus = input.toStatus;

	assertStatusTransition(existing.status, toStatus);
	const updateValues = parseOrderUpdate({
		status: toStatus,
		...statusTimestampValues(toStatus, now)
	});
	const updateStatement = db
		.update(order)
		.set(updateValues)
		.where(and(eq(order.id, orderId), eq(order.status, existing.status)));
	const historyValues: NewOrderStatusHistory = {
		id: nanoid(),
		...parseNewOrderStatusHistory({
			orderId,
			fromStatus: existing.status,
			toStatus,
			changedBy: actorChangedBy(ctx),
			note: normalizeNullableText(input.note, 'note', 500)
		}),
		createdAt: now
	};
	const updated: Order = {
		...existing,
		...updateValues,
		status: toStatus,
		updatedAt: now
	};
	const items = await loadOrderItemsTx(db, orderId);
	const payments = await loadPaymentsForOrderTx(db, orderId);
	const statusHistory = await loadOrderStatusHistoryForOrderTx(db, orderId);
	const orderDto = toOrderDTO(updated, {
		items,
		payments,
		statusHistory: [
			...statusHistory,
			{
				id: historyValues.id!,
				orderId,
				fromStatus: historyValues.fromStatus ?? null,
				toStatus: historyValues.toStatus,
				changedBy: historyValues.changedBy ?? null,
				note: historyValues.note ?? null,
				createdAt: now
			}
		],
		includeItems: true,
		includePayments: true,
		includeStatusHistory: true
	});
	const notifications =
		options.includeNotifications === false
			? []
			: await prepareOrderStatusTransitionNotificationInserts(db, orderDto);
	const guard = guardPreviousBatchChanges(db);
	const statements: [OrdersBatchItem, ...OrdersBatchItem[]] = [updateStatement, guard[0], guard[1]];

	if (toStatus === 'confirmed') {
		for (const item of items) {
			if (!item.variantId) continue;
			statements.push(
				...prepareInventorySaleBatch(db, {
					variantId: item.variantId,
					quantity: item.quantity,
					referenceId: item.id,
					now,
					note: `Order ${existing.orderNumber} confirmed.`
				})
			);
		}
	} else if (
		toStatus === 'cancelled' &&
		(existing.status === 'confirmed' || existing.status === 'processing')
	) {
		for (const item of items) {
			if (!item.variantId) continue;
			statements.push(
				...prepareInventorySaleRestoreBatch(db, {
					variantId: item.variantId,
					quantity: item.quantity,
					referenceId: item.id,
					now,
					note: `Order ${existing.orderNumber} cancelled.`,
					type: 'cancelled'
				})
			);
		}
	}

	statements.push(
		db.insert(orderStatusHistory).values(historyValues),
		...notifications.map((item) => item.statement)
	);
	return { order: orderDto, historyId: historyValues.id!, statements, notifications };
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
		const db = getDb();
		const existing = await loadOrderByIdTx(db, orderId);
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
			return hydrateOrderTx(db, existing, {
				includeItems: true,
				includePayments: true,
				includeStatusHistory: true
			});
		}

		const updated: Order = { ...existing, ...updateValues, updatedAt: now };
		const orderDto = await hydrateOrderTx(db, updated, {
			includeItems: true,
			includePayments: true,
			includeStatusHistory: true
		});
		const preparedNotifications = shouldEnqueueShippingUpdateForFulfillment(existing, updated)
			? await prepareOrderStatusTransitionNotificationInserts(db, orderDto)
			: [];
		const updateStatement = db
			.update(order)
			.set(updateValues)
			.where(
				and(
					eq(order.id, orderId),
					eq(order.status, existing.status),
					eq(order.updatedAt, existing.updatedAt)
				)
			);
		const statements: [OrdersBatchItem, ...OrdersBatchItem[]] = [
			updateStatement,
			...guardPreviousBatchChanges(db),
			...preparedNotifications.map((item) => item.statement)
		];
		await commitOrderBatchWithReconciliation(db, statements, async () => {
			const current = await loadOrderByIdTx(db, orderId);
			return (
				current.updatedAt.getTime() === now.getTime() &&
				current.status === updated.status &&
				current.trackingNumber === updated.trackingNumber &&
				current.trackingCarrier === updated.trackingCarrier &&
				current.trackingUrl === updated.trackingUrl &&
				current.adminNote === updated.adminNote
			);
		});
		await publishPreparedNotificationWakeups(ctx, db, preparedNotifications);
		return hydrateCommittedOrderOrFallback(db, orderId, orderDto);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new OrderError(
				'Order changed while fulfillment details were being saved.',
				ErrorCode.CONFLICT,
				{ orderId }
			);
		}
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
				const prepared = await prepareOrderStatusTransition(db, ctx, {
					orderId: row.id,
					toStatus: 'cancelled',
					note: 'Payment window expired.',
					now
				});
				await commitOrderBatchWithReconciliation(db, prepared.statements, async () => {
					const [committedHistory] = await db
						.select({ id: orderStatusHistory.id })
						.from(orderStatusHistory)
						.where(eq(orderStatusHistory.id, prepared.historyId))
						.limit(1);
					return Boolean(committedHistory);
				});
				const committed = await hydrateCommittedOrderOrFallback(db, row.id, prepared.order);
				orders.push(committed);
				orderIds.push(row.id);
				try {
					notificationsToPublish.push(
						...(await withTransientD1ReadRetry(() =>
							loadPreparedNotificationOutboxRows(db, prepared.notifications)
						))
					);
				} catch (notificationError) {
					console.error('[orders] Failed to load committed expiry notification wakeups:', {
						orderId: row.id,
						error: getErrorMessage(notificationError)
					});
				}
			} catch (err) {
				if (isD1BatchGuardError(err) || (isAppError(err) && err.code === ErrorCode.CONFLICT)) {
					skippedCount += 1;
					console.warn(`Skipped stale expired order ${row.id}:`, {
						error: getErrorMessage(err)
					});
					continue;
				}

				failedCount += 1;
				failedOrderIds.push(row.id);
				console.error(`[orders] Failed to cancel expired order ${row.id}:`, {
					error: getErrorMessage(err)
				});
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

async function buildOrderPreviewTx(
	tx: OrdersTx,
	ctx: ServiceContext,
	input: PreviewOrderFromBagInput & { now: Date }
): Promise<OrderPreviewDTO> {
	const bag = await getCheckoutBagForOrderTx(tx, ctx, {
		sessionToken: input.sessionToken,
		now: input.now
	});
	const blockingReasons = [...bag.blockingReasons];

	if (bag.items.length === 0) {
		throw new OrderError('Bag is empty.', ErrorCode.EMPTY_BAG);
	}

	const shippingAddress = await resolveCheckoutShippingAddressTx(tx, ctx, input.shippingAddress);
	const shippingQuote = await calculateShippingQuoteTx(tx, {
		shippingMethodId: input.shippingMethodId,
		district: shippingAddress.address.district,
		subtotal: bag.subtotal,
		activeOnly: true
	});
	const promoValidation = input.promoCode
		? await validatePromoCodeForBagTx(tx, {
				code: input.promoCode,
				userId: bag.userId,
				subtotal: bag.subtotal,
				now: input.now
			})
		: await resolveStoredPromotionForBagTx(tx, {
				promotionId: bag.promotionId,
				promoCodeId: bag.promoCodeId,
				userId: bag.userId,
				subtotal: bag.subtotal,
				now: input.now
			});
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
	const totalRows = await (where ? countQuery.where(where) : countQuery);
	const rows = await (where ? listQuery.where(where) : listQuery);
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
	const items = await loadOrderItemsTx(db, row.id);
	const payments = options.includePayments ? await loadPaymentsForOrderTx(db, row.id) : [];
	const statusHistory = options.includeStatusHistory
		? await loadOrderStatusHistoryForOrderTx(db, row.id)
		: [];

	return toOrderDTO(row, {
		items,
		payments,
		statusHistory,
		includeItems: options.includeItems ?? false,
		includePayments: options.includePayments ?? false,
		includeStatusHistory: options.includeStatusHistory ?? false
	});
}

async function commitOrderBatchWithReconciliation(
	db: Db,
	statements: Parameters<Db['batch']>[0],
	isCommitted: () => Promise<boolean>
): Promise<void> {
	await withTransientD1WriteReconciliation(
		async () => {
			await db.batch(statements);
		},
		async () =>
			(await isCommitted()) ? { committed: true, value: undefined } : { committed: false }
	);
}

async function hydrateCommittedOrderOrFallback(
	db: QueryExecutor,
	orderId: string,
	fallback: OrderDTO
): Promise<OrderDTO> {
	try {
		return await withTransientD1ReadRetry(async () =>
			hydrateOrderTx(db, await loadOrderByIdTx(db, orderId), {
				includeItems: true,
				includePayments: true,
				includeStatusHistory: true
			})
		);
	} catch (error) {
		if (!isTransientD1Error(error)) throw error;
		console.error('[orders] Returning committed order snapshot after D1 hydration failure:', {
			orderId,
			error: getErrorMessage(error)
		});
		return fallback;
	}
}

export async function prepareOrderConfirmationNotificationInserts(
	db: Db,
	orderDto: OrderDTO
): Promise<PreparedNotificationOutboxInsert[]> {
	if (!orderDto.shippingAddressSnapshot) return [];

	const prepared: PreparedNotificationOutboxInsert[] = [];
	if (orderDto.userId && orderDto.items?.length) {
		const recipient = await loadOrderEmailRecipientTx(
			db,
			orderDto.userId,
			orderDto.shippingAddressSnapshot.recipientName
		);
		if (recipient) {
			prepared.push(
				prepareNotificationOutboxInsert(db, {
					idempotencyKey: `order:${orderDto.id}:confirmation:email`,
					type: 'order_confirmation',
					channel: 'email',
					recipient: recipient.email,
					recipientUserId: recipient.userId,
					aggregateType: 'order',
					aggregateId: orderDto.id,
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

	prepared.push(
		prepareNotificationOutboxInsert(db, {
			idempotencyKey: `order:${orderDto.id}:confirmation:sms`,
			type: 'order_confirmation',
			channel: 'sms',
			recipient: orderDto.shippingAddressSnapshot.phone,
			recipientUserId: orderDto.userId,
			aggregateType: 'order',
			aggregateId: orderDto.id,
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

	return prepared;
}

async function prepareOrderStatusTransitionNotificationInserts(
	db: Db,
	orderDto: OrderDTO
): Promise<PreparedNotificationOutboxInsert[]> {
	if (!orderDto.shippingAddressSnapshot) return [];

	if (orderDto.status === 'shipped' && orderDto.trackingNumber && orderDto.userId) {
		const recipient = await loadOrderEmailRecipientTx(
			db,
			orderDto.userId,
			orderDto.shippingAddressSnapshot.recipientName
		);
		if (!recipient) return [];
		return [
			prepareNotificationOutboxInsert(db, {
				idempotencyKey: `order:${orderDto.id}:shipping_update:email`,
				type: 'shipping_update',
				channel: 'email',
				recipient: recipient.email,
				recipientUserId: recipient.userId,
				aggregateType: 'order',
				aggregateId: orderDto.id,
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
		];
	}

	if (!shouldEnqueueOrderStatusSms(orderDto.status)) return [];
	return [
		prepareNotificationOutboxInsert(db, {
			idempotencyKey: `order:${orderDto.id}:status:${orderDto.status}:sms`,
			type: 'order_status_update',
			channel: 'sms',
			recipient: orderDto.shippingAddressSnapshot.phone,
			recipientUserId: orderDto.userId,
			aggregateType: 'order',
			aggregateId: orderDto.id,
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
		})
	];
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
		promotionId: row.promotionId,
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
	rethrowTransientD1Error(error);

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new OrderError('Order already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new OrderError('Related order record not found.', ErrorCode.NOT_FOUND);
	}

	if (isCheckConstraintError(message)) {
		throw new OrderError('Invalid order data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}

const checkoutPaymentMethodSet = new Set<string>(CHECKOUT_PAYMENT_METHODS);

export async function getOrderAnalytics(ctx: ServiceContext): Promise<{
	totalSales: number;
	pendingFulfillmentCount: number;
	openOrdersCount: number;
	unpaidHoldsCount: number;
}> {
	requireAdmin(ctx.actor);

	const db = getDb();
	const [summary] = await db
		.select({
			totalSales: sql<number>`coalesce(sum(case when ${order.status} <> 'cancelled' then ${order.totalAmount} else 0 end), 0)`,
			pendingFulfillmentCount: sql<number>`coalesce(sum(case when ${order.status} in ('confirmed', 'processing') then 1 else 0 end), 0)`,
			openOrdersCount: sql<number>`coalesce(sum(case when ${order.status} in ('pending', 'confirmed', 'processing', 'shipped') then 1 else 0 end), 0)`,
			unpaidHoldsCount: sql<number>`coalesce(sum(case when ${order.status} = 'pending' then 1 else 0 end), 0)`
		})
		.from(order);

	return {
		totalSales: Number(summary?.totalSales ?? 0),
		pendingFulfillmentCount: Number(summary?.pendingFulfillmentCount ?? 0),
		openOrdersCount: Number(summary?.openOrdersCount ?? 0),
		unpaidHoldsCount: Number(summary?.unpaidHoldsCount ?? 0)
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
	const orderIds = uniqueStrings(input.orderIds.map((orderId) => normalizeId(orderId, 'orderId')));
	if (orderIds.length === 0) {
		throw new OrderError('Select at least one order.', ErrorCode.VALIDATION_ERROR);
	}
	if (orderIds.length > 50) {
		throw new OrderError(
			'Bulk status updates are limited to 50 orders at a time.',
			ErrorCode.VALIDATION_ERROR,
			{ selectedCount: orderIds.length }
		);
	}
	const orderNumberRows = await getDb()
		.select({ id: order.id, orderNumber: order.orderNumber })
		.from(order)
		.where(inArray(order.id, orderIds));
	const orderNumberById = new Map(orderNumberRows.map((row) => [row.id, row.orderNumber]));

	const results: Array<{
		orderId: string;
		orderNumber?: string;
		success: boolean;
		error?: string;
	}> = [];
	let successCount = 0;
	let failureCount = 0;

	for (const orderId of orderIds) {
		try {
			await transitionOrderStatus(ctx, {
				orderId,
				toStatus: input.toStatus,
				note: input.note ?? 'Transitioned via bulk action.'
			});

			results.push({
				orderId,
				orderNumber: orderNumberById.get(orderId),
				success: true
			});
			successCount++;
		} catch (error) {
			results.push({
				orderId,
				success: false,
				error: toErrorResponseBody(error).message
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
