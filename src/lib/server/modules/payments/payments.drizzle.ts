import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { order } from '../orders/orders.drizzle';

// ---------------------------------------------------------------------------
// PAYMENT METHODS
// ---------------------------------------------------------------------------
export const PAYMENT_METHODS = ['payhere', 'paypal', 'cash_on_delivery'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ONLINE_PAYMENT_METHODS = [
	'payhere',
	'paypal'
] as const satisfies readonly PaymentMethod[];

export const OFFLINE_PAYMENT_METHODS = [
	'cash_on_delivery'
] as const satisfies readonly PaymentMethod[];

export const CHECKOUT_PAYMENT_METHODS = [
	'payhere',
	'paypal',
	'cash_on_delivery'
] as const satisfies readonly PaymentMethod[];

// ---------------------------------------------------------------------------
// PAYMENT STATUSES
// ---------------------------------------------------------------------------
export const PAYMENT_STATUSES = [
	'pending',
	'authorized',
	'captured',
	'failed',
	'refunded',
	'partially_refunded'
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_ATTEMPT_STATUSES = [
	'pending',
	'captured',
	'failed',
	'cancelled',
	'review_required'
] as const;

export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

// A gateway session is durable checkout orchestration state, not an order.
// It stores the validated checkout intent until the provider confirms payment.
export const paymentAttempt = sqliteTable(
	'payment_attempt',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		userId: text('user_id').notNull(),
		bagId: text('bag_id').notNull(),
		method: text('method', { enum: ONLINE_PAYMENT_METHODS }).notNull(),
		status: text('status', { enum: PAYMENT_ATTEMPT_STATUSES }).default('pending').notNull(),
		amount: integer('amount').notNull(),
		currency: text('currency').default('LKR').notNull(),
		checkoutInput: text('checkout_input', { mode: 'json' }).notNull(),
		billingEmail: text('billing_email'),
		providerOrderId: text('provider_order_id'),
		providerResponse: text('provider_response', { mode: 'json' }),
		orderId: text('order_id').references(() => order.id, { onDelete: 'set null' }),
		failureReason: text('failure_reason'),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('payment_attempt_user_idx').on(table.userId),
		index('payment_attempt_bag_idx').on(table.bagId),
		uniqueIndex('payment_attempt_one_pending_per_bag_idx')
			.on(table.bagId)
			.where(sql`${table.status} = 'pending'`),
		index('payment_attempt_provider_order_idx').on(table.providerOrderId),
		index('payment_attempt_status_expiry_idx').on(table.status, table.expiresAt),
		check('payment_attempt_amount_positive', sql`${table.amount} > 0`),
		check('payment_attempt_checkout_input_valid', sql`json_valid(${table.checkoutInput})`),
		check(
			'payment_attempt_provider_response_valid',
			sql`${table.providerResponse} IS NULL OR json_valid(${table.providerResponse})`
		)
	]
);

// ---------------------------------------------------------------------------
// PAYMENTS TABLE
// ---------------------------------------------------------------------------
export const payment = sqliteTable(
	'payment',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		orderId: text('order_id')
			.notNull()
			.references(() => order.id, { onDelete: 'cascade' }),
		amount: integer('amount').notNull(),
		currency: text('currency').default('LKR').notNull(),
		method: text('method', { enum: PAYMENT_METHODS }).notNull(),
		status: text('status', { enum: PAYMENT_STATUSES }).default('pending').notNull(),
		// Payment gateway transaction reference / PayPal order/capture ID
		transactionId: text('transaction_id'),
		// Raw JSON response/payload from gateway
		gatewayResponse: text('gateway_response', { mode: 'json' }),
		refundAmount: integer('refund_amount'),
		refundedAt: integer('refunded_at', { mode: 'timestamp_ms' }),
		paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('payment_order_idx').on(table.orderId),
		index('payment_status_idx').on(table.status),
		index('payment_transaction_idx').on(table.transactionId),
		check('payment_amount_positive', sql`${table.amount} > 0`),
		check(
			'payment_refund_valid',
			sql`${table.refundAmount} IS NULL OR (${table.refundAmount} >= 0 AND ${table.refundAmount} <= ${table.amount})`
		),
		check(
			'payment_gateway_response_valid',
			sql`${table.gatewayResponse} IS NULL OR json_valid(${table.gatewayResponse})`
		)
	]
);

// ---------------------------------------------------------------------------
// PAYMENT WEBHOOK LOG TABLE
// ---------------------------------------------------------------------------
export const paymentWebhookLog = sqliteTable(
	'payment_webhook_log',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		gateway: text('gateway').notNull(),
		payload: text('payload', { mode: 'json' }).notNull(),
		status: text('status').notNull(), // 'processed', 'failed', 'signature_mismatch'
		errorMessage: text('error_message'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('payment_webhook_log_gateway_idx').on(table.gateway),
		index('payment_webhook_log_created_idx').on(table.createdAt)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------
export const paymentRelations = relations(payment, ({ one }) => ({
	order: one(order, {
		fields: [payment.orderId],
		references: [order.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------
const idSchema = z.string().min(1).max(255);
const timestampMsSchema = z.number().int().positive();

export const insertPaymentBaseSchema = createInsertSchema(payment, {
	orderId: idSchema,
	amount: z.number().int().positive(),
	currency: z.string().length(3).optional(),
	method: z.enum(PAYMENT_METHODS),
	status: z.enum(PAYMENT_STATUSES).optional(),
	transactionId: z.string().max(255).optional().nullable(),
	gatewayResponse: z.any().optional().nullable(),
	refundAmount: z.number().int().min(0).optional().nullable()
}).omit({
	id: true,
	refundedAt: true,
	paidAt: true,
	createdAt: true,
	updatedAt: true
});

export const insertPaymentSchema = insertPaymentBaseSchema.refine(
	(d) => d.refundAmount == null || d.refundAmount <= d.amount,
	{
		message: 'refundAmount cannot exceed amount',
		path: ['refundAmount']
	}
);

export const selectPaymentSchema = createSelectSchema(payment);

export const updatePaymentSchema = createUpdateSchema(payment, {
	status: z.enum(PAYMENT_STATUSES).optional(),
	transactionId: z.string().max(255).optional().nullable(),
	gatewayResponse: z.any().optional().nullable(),
	refundAmount: z.number().int().min(0).optional().nullable(),
	refundedAt: timestampMsSchema.optional().nullable(),
	paidAt: timestampMsSchema.optional().nullable()
}).omit({
	id: true,
	orderId: true,
	amount: true,
	currency: true,
	method: true,
	createdAt: true,
	updatedAt: true
});

export const insertPaymentWebhookLogSchema = createInsertSchema(paymentWebhookLog).omit({
	id: true,
	createdAt: true
});
export const selectPaymentWebhookLogSchema = createSelectSchema(paymentWebhookLog);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------
export type Payment = typeof payment.$inferSelect;
export type NewPayment = typeof payment.$inferInsert;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type SelectPayment = z.infer<typeof selectPaymentSchema>;
export type UpdatePayment = z.infer<typeof updatePaymentSchema>;

export type PaymentAttempt = typeof paymentAttempt.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempt.$inferInsert;

export type PaymentWebhookLog = typeof paymentWebhookLog.$inferSelect;
export type NewPaymentWebhookLog = typeof paymentWebhookLog.$inferInsert;
export type InsertPaymentWebhookLog = z.infer<typeof insertPaymentWebhookLogSchema>;
export type SelectPaymentWebhookLog = z.infer<typeof selectPaymentWebhookLogSchema>;
