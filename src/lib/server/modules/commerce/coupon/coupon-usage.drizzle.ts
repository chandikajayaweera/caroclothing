import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { createdAt } from '$lib/server/db/helpers';
import { user } from '$lib/server/modules/auth/auth.drizzle';
import { coupon } from '$lib/server/modules/commerce/coupon/coupon.drizzle';
import { order } from '$lib/server/modules/commerce/order/order.drizzle';

// ── Table ──────────────────────────────────────────────────────────────────

/**
 * Audit log for every coupon redemption.
 * Used to enforce perUserLimit and provide reporting.
 *
 * This file is deliberately separate from both coupon.drizzle.ts and
 * order.drizzle.ts to avoid a circular import cycle.
 */
export const couponUsage = sqliteTable(
	'coupon_usage',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		couponId: text('coupon_id')
			.notNull()
			.references(() => coupon.id, { onDelete: 'cascade' }),

		/** Null for guest checkouts. */
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

		orderId: text('order_id')
			.notNull()
			.references(() => order.id, { onDelete: 'cascade' }),

		/** Actual discount applied in LKR cents (may be capped). */
		discountAmount: integer('discount_amount').notNull(),

		...createdAt
	},
	(table) => [
		index('coupon_usage_coupon_idx').on(table.couponId),
		index('coupon_usage_user_idx').on(table.userId),
		index('coupon_usage_order_idx').on(table.orderId)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const couponUsageRelations = relations(couponUsage, ({ one }) => ({
	coupon: one(coupon, {
		fields: [couponUsage.couponId],
		references: [coupon.id]
	}),
	user: one(user, {
		fields: [couponUsage.userId],
		references: [user.id]
	}),
	order: one(order, {
		fields: [couponUsage.orderId],
		references: [order.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertCouponUsageSchema = createInsertSchema(couponUsage, {
	discountAmount: (s) => s.min(0)
}).omit({ id: true });

export const selectCouponUsageSchema = createSelectSchema(couponUsage);

// ── Types ──────────────────────────────────────────────────────────────────

export type CouponUsage = z.infer<typeof selectCouponUsageSchema>;
export type InsertCouponUsage = z.infer<typeof insertCouponUsageSchema>;
