import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, productVariant, r2KeySchema } from '../products/products.drizzle';
import { address } from '../addresses/addresses.drizzle';
import { promoCode, promotion } from '../promotions/promotions.drizzle';
import { shippingMethod } from '../shipping/shipping.drizzle';
import type { AddressSnapshot } from '../addresses/addresses.types';
import type { PromoCodeSnapshot } from '../promotions/promotions.types';
import type { ShippingMethodSnapshot } from '../shipping/shipping.types';
import { payment } from '../payments/payments.drizzle';

// ---------------------------------------------------------------------------
// ORDER STATUS ENUM
// Transition rules (enforced at application layer):
//   pending → confirmed | cancelled
//   confirmed → processing | cancelled
//   processing → shipped | cancelled
//   shipped → delivered
//   delivered → refunded
//   cancelled → (terminal)
//   refunded → (terminal)
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
	'pending',
	'confirmed',
	'processing',
	'shipped',
	'delivered',
	'cancelled',
	'refunded'
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ---------------------------------------------------------------------------
// PAYMENT METHODS
// Covers all popular Sri Lankan payment options.
// ---------------------------------------------------------------------------

export {
	CHECKOUT_PAYMENT_METHODS,
	PAYMENT_METHODS,
	PAYMENT_STATUSES,
	ONLINE_PAYMENT_METHODS,
	OFFLINE_PAYMENT_METHODS
} from '../payments/payments.drizzle';
export type { PaymentMethod, PaymentStatus } from '../payments/payments.drizzle';

// ---------------------------------------------------------------------------
// ORDERS
//
// All monetary values are whole LKR integer amounts. No floats.
//
// Address denormalization strategy:
//   - shippingAddressId = FK to the live address row (for UI "where did this go?")
//   - shippingAddressSnapshot = JSON snapshot at order-placement time (immutable history)
// The snapshot is the source of truth for fulfilment; the FK is for convenience.
//
// Promo code is similarly snapshotted so price history is accurate even if
// the code is later deactivated or changed.
// Shipping method is also snapshotted so historical orders keep carrier/name/ETA.
//
// NOTE: Table is named 'orders' (not 'order') to avoid the SQL reserved keyword.
// The TypeScript export remains `order` for minimal import churn.
// ---------------------------------------------------------------------------

export const order = sqliteTable(
	// FIX: was 'order' — reserved SQL keyword
	'orders',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		// Human-readable order number shown to customers and used in support.
		// Format: YYMMDD-XXXXX. Generated at the application layer.
		orderNumber: text('order_number').notNull().unique(),
		// null if placed by a guest
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		status: text('status', { enum: ORDER_STATUSES }).default('pending').notNull(),
		// null = no automatic payment expiry. Online payment methods set a short hold.
		paymentExpiresAt: integer('payment_expires_at', { mode: 'timestamp_ms' }),

		// ── Pricing breakdown ──────────────────────────────────────────────────
		subtotal: integer('subtotal').notNull(),
		discountAmount: integer('discount_amount').default(0).notNull(),
		shippingAmount: integer('shipping_amount').default(0).notNull(),
		totalAmount: integer('total_amount').notNull(),

		// ── Promo ─────────────────────────────────────────────────────────────
		promotionId: text('promotion_id').references(() => promotion.id, {
			onDelete: 'set null'
		}),
		promoCodeId: text('promo_code_id').references(() => promoCode.id, {
			onDelete: 'set null'
		}),
		// JSON snapshot: { code, discountType, discountValue } — immutable history
		promoCodeSnapshot: text('promo_code_snapshot', { mode: 'json' }).$type<PromoCodeSnapshot>(),

		// ── Shipping ──────────────────────────────────────────────────────────
		shippingMethodId: text('shipping_method_id').references(() => shippingMethod.id, {
			onDelete: 'set null'
		}),
		shippingAddressId: text('shipping_address_id').references(() => address.id, {
			onDelete: 'set null'
		}),
		// JSON snapshot: { name, carrier, price, estimatedDaysMin, estimatedDaysMax }
		shippingMethodSnapshot: text('shipping_method_snapshot', {
			mode: 'json'
		}).$type<ShippingMethodSnapshot>(),
		// JSON snapshot: full address at order time — used for fulfilment, never changes
		shippingAddressSnapshot: text('shipping_address_snapshot', {
			mode: 'json'
		}).$type<AddressSnapshot>(),

		// ── Tracking ──────────────────────────────────────────────────────────
		trackingNumber: text('tracking_number'),
		trackingCarrier: text('tracking_carrier'),
		trackingUrl: text('tracking_url'),

		// ── Notes ─────────────────────────────────────────────────────────────
		customerNote: text('customer_note'),
		adminNote: text('admin_note'),

		// ── Timestamps for key lifecycle events ───────────────────────────────
		confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
		shippedAt: integer('shipped_at', { mode: 'timestamp_ms' }),
		deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
		cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
		refundedAt: integer('refunded_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('order_user_idx').on(table.userId),
		index('order_status_idx').on(table.status),
		index('order_status_created_idx').on(table.status, table.createdAt),
		index('order_status_payment_expiry_idx').on(table.status, table.paymentExpiresAt),
		index('order_created_idx').on(table.createdAt),
		check(
			'order_amounts_nonnegative',
			sql`${table.subtotal} >= 0 AND ${table.discountAmount} >= 0 AND ${table.shippingAmount} >= 0 AND ${table.totalAmount} >= 0`
		),
		check(
			'order_total_matches_parts',
			sql`${table.totalAmount} = (${table.subtotal} - ${table.discountAmount} + ${table.shippingAmount})`
		),
		check(
			'order_payment_expiry_positive',
			sql`${table.paymentExpiresAt} IS NULL OR ${table.paymentExpiresAt} > 0`
		),
		check(
			'order_promo_snapshot_valid',
			sql`${table.promoCodeSnapshot} IS NULL OR json_valid(${table.promoCodeSnapshot})`
		),
		check(
			'order_shipping_method_snapshot_valid',
			sql`${table.shippingMethodSnapshot} IS NULL OR json_valid(${table.shippingMethodSnapshot})`
		),
		check(
			'order_shipping_address_snapshot_valid',
			sql`${table.shippingAddressSnapshot} IS NULL OR json_valid(${table.shippingAddressSnapshot})`
		)
	]
);

// ---------------------------------------------------------------------------
// ORDER ITEMS
//
// All product/variant fields are DENORMALIZED at order time.
// This ensures historical orders remain accurate even after products are
// renamed, repriced, or deleted. The live FKs (variantId, productId) are
// kept for admin convenience and reporting but should be treated as nullable.
// ---------------------------------------------------------------------------

export const orderItem = sqliteTable(
	'order_item',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		orderId: text('order_id')
			.notNull()
			.references(() => order.id, { onDelete: 'cascade' }),
		// Kept for admin lookups; set null if the variant/product is later deleted
		variantId: text('variant_id').references(() => productVariant.id, {
			onDelete: 'set null'
		}),
		productId: text('product_id').references(() => product.id, {
			onDelete: 'set null'
		}),

		// ── Denormalized snapshots (source of truth for this order) ───────────
		productName: text('product_name').notNull(),
		variantSize: text('variant_size').notNull(),
		variantColor: text('variant_color').notNull(),
		// Snapshot of the primary product image R2 key at order time
		productImageR2Key: text('product_image_r2_key'),

		quantity: integer('quantity').notNull(),
		unitPrice: integer('unit_price').notNull(), // whole-LKR price at purchase time
		totalPrice: integer('total_price').notNull() // quantity × unitPrice
	},
	(table) => [
		index('order_item_order_idx').on(table.orderId),
		index('order_item_variant_idx').on(table.variantId),
		index('order_item_product_idx').on(table.productId),
		check('order_item_quantity_positive', sql`${table.quantity} > 0`),
		check(
			'order_item_prices_valid',
			sql`${table.unitPrice} > 0 AND ${table.totalPrice} > 0 AND ${table.totalPrice} = (${table.quantity} * ${table.unitPrice})`
		)
	]
);

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------
export { payment } from '../payments/payments.drizzle';

// ---------------------------------------------------------------------------
// ORDER STATUS HISTORY  (append-only audit trail — never delete rows)
// ---------------------------------------------------------------------------

export const orderStatusHistory = sqliteTable(
	'order_status_history',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		orderId: text('order_id')
			.notNull()
			.references(() => order.id, { onDelete: 'cascade' }),
		fromStatus: text('from_status', { enum: ORDER_STATUSES }), // null = initial "pending" entry
		toStatus: text('to_status', { enum: ORDER_STATUSES }).notNull(),
		// The admin userId who triggered the change; null = system / webhook
		changedBy: text('changed_by').references(() => user.id, {
			onDelete: 'set null'
		}),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('order_status_history_order_idx').on(table.orderId),
		index('order_status_history_created_idx').on(table.createdAt),
		check(
			'order_status_history_changes_status',
			sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`
		)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const orderRelations = relations(order, ({ one, many }) => ({
	user: one(user, {
		fields: [order.userId],
		references: [user.id]
	}),
	promoCode: one(promoCode, {
		fields: [order.promoCodeId],
		references: [promoCode.id]
	}),
	promotion: one(promotion, {
		fields: [order.promotionId],
		references: [promotion.id]
	}),
	shippingMethod: one(shippingMethod, {
		fields: [order.shippingMethodId],
		references: [shippingMethod.id]
	}),
	shippingAddress: one(address, {
		fields: [order.shippingAddressId],
		references: [address.id]
	}),
	items: many(orderItem),
	payments: many(payment),
	statusHistory: many(orderStatusHistory)
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
	order: one(order, {
		fields: [orderItem.orderId],
		references: [order.id]
	}),
	variant: one(productVariant, {
		fields: [orderItem.variantId],
		references: [productVariant.id]
	}),
	product: one(product, {
		fields: [orderItem.productId],
		references: [product.id]
	})
}));

export { paymentRelations } from '../payments/payments.drizzle';

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
	order: one(order, {
		fields: [orderStatusHistory.orderId],
		references: [order.id]
	}),
	changedByUser: one(user, {
		fields: [orderStatusHistory.changedBy],
		references: [user.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

// Validates snapshot fields are parseable JSON before they reach the DB.
// These columns are immutable source of truth for historical orders, so
// silently storing malformed JSON would be unrecoverable without manual SQL.

const idSchema = z.string().min(1).max(255);
const timestampMsSchema = z.number().int().positive();

function validateOrderTotal(
	data: {
		subtotal?: number;
		discountAmount?: number;
		shippingAmount?: number;
		totalAmount?: number;
	},
	ctx: z.RefinementCtx
) {
	if (data.subtotal === undefined || data.totalAmount === undefined) return;
	const expected = data.subtotal - (data.discountAmount ?? 0) + (data.shippingAmount ?? 0);
	if (data.totalAmount !== expected) {
		ctx.addIssue({
			code: 'custom',
			message: 'totalAmount must equal subtotal - discountAmount + shippingAmount',
			path: ['totalAmount']
		});
	}
}

export const insertOrderBaseSchema = createInsertSchema(order, {
	orderNumber: z.string().min(1).max(50),
	userId: idSchema.optional().nullable(),
	status: z.enum(ORDER_STATUSES).optional(),
	subtotal: z.number().int().min(0),
	discountAmount: z.number().int().min(0).optional(),
	shippingAmount: z.number().int().min(0).optional(),
	totalAmount: z.number().int().min(0),
	promotionId: idSchema.optional().nullable(),
	promoCodeId: idSchema.optional().nullable(),
	shippingMethodId: idSchema.optional().nullable(),
	shippingAddressId: idSchema.optional().nullable(),
	customerNote: z.string().max(1000).optional().nullable(),
	trackingNumber: z.string().max(100).optional().nullable(),
	trackingCarrier: z.string().max(100).optional().nullable(),
	trackingUrl: z.string().url().optional().nullable(),
	paymentExpiresAt: timestampMsSchema.optional().nullable(),
	promoCodeSnapshot: z.any().optional().nullable(),
	shippingMethodSnapshot: z.any().optional().nullable(),
	shippingAddressSnapshot: z.any().optional().nullable()
}).omit({
	id: true,
	confirmedAt: true,
	shippedAt: true,
	deliveredAt: true,
	cancelledAt: true,
	refundedAt: true,
	createdAt: true,
	updatedAt: true
});
export const insertOrderSchema = insertOrderBaseSchema.superRefine(validateOrderTotal);
export const selectOrderSchema = createSelectSchema(order);
export const updateOrderSchema = createUpdateSchema(order, {
	status: z.enum(ORDER_STATUSES).optional(),
	trackingNumber: z.string().max(100).optional().nullable(),
	trackingCarrier: z.string().max(100).optional().nullable(),
	trackingUrl: z.string().url().optional().nullable(),
	paymentExpiresAt: timestampMsSchema.optional().nullable(),
	adminNote: z.string().max(1000).optional().nullable(),
	confirmedAt: timestampMsSchema.optional().nullable(),
	shippedAt: timestampMsSchema.optional().nullable(),
	deliveredAt: timestampMsSchema.optional().nullable(),
	cancelledAt: timestampMsSchema.optional().nullable(),
	refundedAt: timestampMsSchema.optional().nullable()
}).omit({
	id: true,
	orderNumber: true,
	userId: true,
	subtotal: true,
	discountAmount: true,
	shippingAmount: true,
	totalAmount: true,
	promotionId: true,
	promoCodeId: true,
	promoCodeSnapshot: true,
	shippingMethodId: true,
	shippingMethodSnapshot: true,
	shippingAddressId: true,
	shippingAddressSnapshot: true,
	customerNote: true,
	createdAt: true,
	updatedAt: true
});

export const insertOrderItemBaseSchema = createInsertSchema(orderItem, {
	orderId: idSchema,
	variantId: idSchema.optional().nullable(),
	productId: idSchema.optional().nullable(),
	productName: z.string().min(1).max(255),
	variantSize: z.string().min(1).max(10),
	variantColor: z.string().min(1).max(50),
	productImageR2Key: r2KeySchema.optional().nullable(),
	quantity: z.number().int().positive(),
	unitPrice: z.number().int().positive(),
	totalPrice: z.number().int().positive()
}).omit({
	id: true
});
export const insertOrderItemSchema = insertOrderItemBaseSchema.refine(
	(d) => d.totalPrice === d.quantity * d.unitPrice,
	{
		message: 'totalPrice must equal quantity × unitPrice',
		path: ['totalPrice']
	}
);
export const selectOrderItemSchema = createSelectSchema(orderItem);

export {
	insertPaymentSchema,
	selectPaymentSchema,
	updatePaymentSchema
} from '../payments/payments.drizzle';

export const insertOrderStatusHistoryBaseSchema = createInsertSchema(orderStatusHistory, {
	orderId: idSchema,
	toStatus: z.enum(ORDER_STATUSES),
	fromStatus: z.enum(ORDER_STATUSES).optional().nullable(),
	changedBy: idSchema.optional().nullable(),
	note: z.string().max(500).optional().nullable()
}).omit({
	id: true,
	createdAt: true
});
export const insertOrderStatusHistorySchema = insertOrderStatusHistoryBaseSchema.refine(
	(d) => d.fromStatus == null || d.fromStatus !== d.toStatus,
	{
		message: 'fromStatus and toStatus must be different',
		path: ['toStatus']
	}
);
export const selectOrderStatusHistorySchema = createSelectSchema(orderStatusHistory);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type SelectOrder = z.infer<typeof selectOrderSchema>;
export type UpdateOrder = z.infer<typeof updateOrderSchema>;
export type OrderItem = typeof orderItem.$inferSelect;
export type NewOrderItem = typeof orderItem.$inferInsert;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type SelectOrderItem = z.infer<typeof selectOrderItemSchema>;
export type {
	Payment,
	NewPayment,
	InsertPayment,
	SelectPayment,
	UpdatePayment
} from '../payments/payments.drizzle';
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;
export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type SelectOrderStatusHistory = z.infer<typeof selectOrderStatusHistorySchema>;
