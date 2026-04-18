import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';

// ── Constants ──────────────────────────────────────────────────────────────

export const COUPON_TYPES = ['percentage', 'fixed_amount'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

// ── Table ──────────────────────────────────────────────────────────────────

export const coupon = sqliteTable(
	'coupon',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		/** The code customers enter at checkout (stored uppercase). */
		code: text('code').notNull().unique(),

		description: text('description'),

		type: text('type', { enum: COUPON_TYPES }).notNull(),

		/**
		 * For `percentage`: 0–100 (e.g. 20 = 20 % off).
		 * For `fixed_amount`: amount in LKR cents.
		 */
		value: integer('value').notNull(),

		/** Minimum cart total (LKR cents) required to apply the coupon. */
		minOrderAmount: integer('min_order_amount'),

		/**
		 * Maximum discount in LKR cents for percentage coupons.
		 * Prevents runaway discounts on large orders.
		 */
		maxDiscountAmount: integer('max_discount_amount'),

		/** Total times this coupon can be redeemed across all users. Null = unlimited. */
		maxUses: integer('max_uses'),

		/** How many times a single user can apply this coupon. Null = unlimited. */
		perUserLimit: integer('per_user_limit').default(1),

		/** Auto-incremented by the service layer each time the coupon is applied. */
		usedCount: integer('used_count').default(0).notNull(),

		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),

		/** Coupon is not valid before this date. Null = valid immediately. */
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }),

		/** Coupon expires after this date. Null = never expires. */
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),

		...timestamps
	},
	(table) => [
		index('coupon_code_idx').on(table.code),
		index('coupon_active_idx').on(table.isActive)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────
// The many-side (usages) is defined in db/relations.ts to avoid circular imports
// with coupon-usage.drizzle.ts which itself imports coupon.

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertCouponSchema = createInsertSchema(coupon, {
	code: (s) =>
		s
			.min(3)
			.max(32)
			.regex(/^[A-Z0-9_-]+$/, 'Must be uppercase alphanumeric with - or _')
			.transform((v) => v.toUpperCase()),
	value: (s) => s.min(1),
	maxUses: (s) => s.min(1).optional(),
	perUserLimit: (s) => s.min(1).optional()
}).omit({ id: true, usedCount: true });

export const selectCouponSchema = createSelectSchema(coupon);
export const updateCouponSchema = createUpdateSchema(coupon).omit({ id: true, usedCount: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type Coupon = z.infer<typeof selectCouponSchema>;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type UpdateCoupon = z.infer<typeof updateCouponSchema>;
