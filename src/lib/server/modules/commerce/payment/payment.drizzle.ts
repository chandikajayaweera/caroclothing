import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';
import { order, PAYMENT_METHODS } from '$lib/server/modules/commerce/order/order.drizzle';

// ── Constants ──────────────────────────────────────────────────────────────

export const PAYMENT_RECORD_STATUSES = [
	'pending',
	'processing',
	'completed',
	'failed',
	'refunded'
] as const;

export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

// ── Table ──────────────────────────────────────────────────────────────────

export const payment = sqliteTable(
	'payment',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		orderId: text('order_id')
			.notNull()
			.references(() => order.id, { onDelete: 'cascade' }),

		method: text('method', { enum: PAYMENT_METHODS }).notNull(),
		status: text('status', { enum: PAYMENT_RECORD_STATUSES }).default('pending').notNull(),

		/** Amount in LKR cents. */
		amount: integer('amount').notNull(),
		currency: text('currency').default('LKR').notNull(),

		// ── PayHere ───────────────────────────────────────────────────────
		// Fields populated from PayHere's payment notification callback.
		// Ref: https://support.payhere.lk/api-&-mobile-sdk/payhere-checkout

		/** PayHere's internal order ID (matches the order_id sent in the request). */
		payhereOrderId: text('payhere_order_id'),

		/** PayHere's unique payment ID returned in the callback. */
		payherePaymentId: text('payhere_payment_id'),

		/**
		 * PayHere status code.
		 *  2 = Success, 0 = Pending, -1 = Cancelled, -2 = Failed, -3 = Chargedback
		 */
		payhereStatusCode: text('payhere_status_code'),
		payhereStatusMessage: text('payhere_status_message'),

		/** Payment card/method type (VISA, MASTER, AMEX, EZCASH, MCASH, etc.). */
		payhereMethod: text('payhere_method'),

		/**
		 * MD5 hash received in the PayHere callback.
		 * Stored for audit; validated before updating order status.
		 */
		payhereHash: text('payhere_hash'),

		// ── Bank transfer ─────────────────────────────────────────────────

		/** Transaction / slip reference number submitted by the customer. */
		bankTransferReference: text('bank_transfer_reference'),

		/** R2 key of the uploaded bank slip image/PDF. */
		bankTransferProofR2Key: text('bank_transfer_proof_r2_key'),

		/** Timestamp when an admin manually verified the transfer. */
		bankTransferVerifiedAt: integer('bank_transfer_verified_at', {
			mode: 'timestamp_ms'
		}),

		/** User ID of the admin who verified the transfer. */
		bankTransferVerifiedBy: text('bank_transfer_verified_by'),

		// ── COD ───────────────────────────────────────────────────────────

		/** Timestamp when the delivery agent confirmed cash collection. */
		codCollectedAt: integer('cod_collected_at', { mode: 'timestamp_ms' }),

		// ── Outcome timestamps ────────────────────────────────────────────
		paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
		failedAt: integer('failed_at', { mode: 'timestamp_ms' }),
		failureReason: text('failure_reason'),
		refundedAt: integer('refunded_at', { mode: 'timestamp_ms' }),
		refundAmount: integer('refund_amount'),

		/**
		 * Arbitrary JSON blob for any additional gateway-specific data
		 * (e.g. raw PayHere notification payload for debugging).
		 */
		metadata: text('metadata'),

		...timestamps
	},
	(table) => [
		index('payment_order_idx').on(table.orderId),
		index('payment_status_idx').on(table.status),
		index('payment_payhere_id_idx').on(table.payherePaymentId)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const paymentRelations = relations(payment, ({ one }) => ({
	order: one(order, {
		fields: [payment.orderId],
		references: [order.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertPaymentSchema = createInsertSchema(payment, {
	amount: (s) => s.min(1),
	currency: (s) => s.length(3).toUpperCase()
}).omit({ id: true });

export const selectPaymentSchema = createSelectSchema(payment);
export const updatePaymentSchema = createUpdateSchema(payment).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type Payment = z.infer<typeof selectPaymentSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type UpdatePayment = z.infer<typeof updatePaymentSchema>;
