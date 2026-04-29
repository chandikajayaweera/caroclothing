import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';

// ---------------------------------------------------------------------------
// PROMO CODES
//
// NOTE ON CIRCULAR DEPENDENCY:
// promoCodeUsage.orderId references an order but we cannot import from
// orders.drizzle here — orders imports promotions (for promoCodeId FK).
// The orderId column is kept as plain text with no FK constraint.
// Referential integrity for orderId is enforced at the application layer.
// ---------------------------------------------------------------------------

export const promoCode = sqliteTable(
	'promo_code',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		code: text('code').notNull().unique(), // e.g. "CARO20", "DROPALPHA"
		description: text('description'), // internal admin note
		discountType: text('discount_type', {
			enum: ['percentage', 'fixed']
		}).notNull(),
		// For percentage: 0–100. For fixed: LKR amount.
		discountValue: real('discount_value').notNull(),
		minOrderAmount: real('min_order_amount'), // null = no minimum
		// Cap on percentage discounts (prevents e.g. 50% off a LKR 50 000 order)
		maxDiscountAmount: real('max_discount_amount'), // null = uncapped
		usageLimit: integer('usage_limit'), // null = unlimited uses
		// Denormalized count for quick limit checks — MUST be incremented atomically
		// alongside inserting a promoCodeUsage row (single transaction, UPDATE + INSERT).
		// If they diverge, the source of truth is COUNT(*) FROM promo_code_usage.
		// Run a periodic reconciliation job:
		//   UPDATE promo_code SET used_count = (
		//     SELECT COUNT(*) FROM promo_code_usage WHERE promo_code_id = promo_code.id
		//   );
		usedCount: integer('used_count').default(0).notNull(),
		// How many times a single user may redeem this code (default 1)
		perUserLimit: integer('per_user_limit').default(1).notNull(),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('promo_active_expires_idx').on(table.isActive, table.expiresAt),
		index('promo_starts_idx').on(table.startsAt)
	]
);

// ---------------------------------------------------------------------------
// PROMO CODE USAGE  (append-only audit log)
//
// orderId is plain text (no FK) to avoid circular imports with orders module.
// Enforce the reference in the application layer when creating usage records.
// ---------------------------------------------------------------------------

export const promoCodeUsage = sqliteTable(
	'promo_code_usage',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		promoCodeId: text('promo_code_id')
			.notNull()
			.references(() => promoCode.id, { onDelete: 'cascade' }),
		// null for anonymous usage (if you allow guest promo codes)
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		// No FK constraint — avoids circular dep with orders module.
		// Verified at the application layer.
		orderId: text('order_id').notNull(),
		discountAmount: real('discount_amount').notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('promo_usage_code_idx').on(table.promoCodeId),
		index('promo_usage_user_idx').on(table.userId),
		index('promo_usage_order_idx').on(table.orderId),
		// Per-user usage check: promoCodeId + userId lets us COUNT existing usages
		index('promo_usage_per_user_idx').on(table.promoCodeId, table.userId)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const promoCodeRelations = relations(promoCode, ({ many }) => ({
	usages: many(promoCodeUsage)
}));

export const promoCodeUsageRelations = relations(promoCodeUsage, ({ one }) => ({
	promoCode: one(promoCode, {
		fields: [promoCodeUsage.promoCodeId],
		references: [promoCode.id]
	}),
	user: one(user, {
		fields: [promoCodeUsage.userId],
		references: [user.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

export const insertPromoCodeBaseSchema = createInsertSchema(promoCode, {
	code: z
		.string()
		.min(3)
		.max(50)
		.regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric'),
	discountValue: z.number().positive(),
	minOrderAmount: z.number().min(0).optional().nullable(),
	maxDiscountAmount: z.number().positive().optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	perUserLimit: z.number().int().positive().optional(),
	// Override drizzle-zod's default z.date() inference for timestamp_ms columns so
	// insert and update schemas both accept raw millisecond integers consistently.
	startsAt: z.number().int().positive().optional().nullable(),
	expiresAt: z.number().int().positive().optional().nullable()
});
export const insertPromoCodeSchema = insertPromoCodeBaseSchema
	.refine(
		(d) => d.discountType !== 'percentage' || (d.discountValue > 0 && d.discountValue <= 100),
		{
			message: 'Percentage discount must be between 1 and 100',
			path: ['discountValue']
		}
	)
	.refine((d) => !d.startsAt || !d.expiresAt || d.expiresAt > d.startsAt, {
		message: 'expiresAt must be after startsAt',
		path: ['expiresAt']
	});

export const selectPromoCodeSchema = createSelectSchema(promoCode);
export const updatePromoCodeSchema = createUpdateSchema(promoCode, {
	isActive: z.boolean().optional(),
	startsAt: z.number().int().positive().optional().nullable(),
	expiresAt: z.number().int().positive().optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable()
});

export const insertPromoCodeUsageSchema = createInsertSchema(promoCodeUsage, {
	orderId: z.string().min(1),
	discountAmount: z.number().min(0)
});
export const selectPromoCodeUsageSchema = createSelectSchema(promoCodeUsage);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type PromoCode = typeof promoCode.$inferSelect;
export type NewPromoCode = typeof promoCode.$inferInsert;
export type PromoCodeUsage = typeof promoCodeUsage.$inferSelect;
export type NewPromoCodeUsage = typeof promoCodeUsage.$inferInsert;
