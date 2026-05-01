import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';

// ---------------------------------------------------------------------------
// PROMO CODES
//
// Year-one brand rule: Caro does not run product discounts or sales.
// Keep this table as future/admin infrastructure, but new codes default inactive
// and application flows must not auto-activate discounting.
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
		// For percentage: whole percent 1–100. For fixed: whole LKR amount.
		discountValue: integer('discount_value').notNull(),
		minOrderAmount: integer('min_order_amount'), // null = no minimum
		// Cap on percentage discounts (prevents e.g. 50% off a LKR 50 000 order)
		maxDiscountAmount: integer('max_discount_amount'), // null = uncapped
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
		isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
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
		index('promo_starts_idx').on(table.startsAt),
		check(
			'promo_discount_value_valid',
			sql`${table.discountValue} > 0 AND (${table.discountType} <> 'percentage' OR ${table.discountValue} <= 100)`
		),
		check(
			'promo_amounts_nonnegative',
			sql`(${table.minOrderAmount} IS NULL OR ${table.minOrderAmount} >= 0) AND (${table.maxDiscountAmount} IS NULL OR ${table.maxDiscountAmount} > 0)`
		),
		check(
			'promo_usage_counts_valid',
			sql`${table.usedCount} >= 0 AND (${table.usageLimit} IS NULL OR ${table.usageLimit} > 0) AND ${table.perUserLimit} > 0`
		),
		check(
			'promo_expiry_after_start',
			sql`${table.startsAt} IS NULL OR ${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`
		)
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
		discountAmount: integer('discount_amount').notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('promo_usage_code_idx').on(table.promoCodeId),
		index('promo_usage_user_idx').on(table.userId),
		index('promo_usage_order_idx').on(table.orderId),
		uniqueIndex('promo_usage_order_unique_idx').on(table.orderId),
		// Per-user usage check: promoCodeId + userId lets us COUNT existing usages
		index('promo_usage_per_user_idx').on(table.promoCodeId, table.userId),
		check('promo_usage_discount_nonnegative', sql`${table.discountAmount} >= 0`)
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

const idSchema = z.string().min(1).max(255);
const timestampMsSchema = z.number().int().positive();

function validatePromoCodeWindowAndValue(
	data: {
		discountType?: 'percentage' | 'fixed';
		discountValue?: number;
		startsAt?: number | null;
		expiresAt?: number | null;
	},
	ctx: z.RefinementCtx
) {
	if (
		data.discountType === 'percentage' &&
		data.discountValue !== undefined &&
		data.discountValue > 100
	) {
		ctx.addIssue({
			code: 'custom',
			message: 'Percentage discount must be between 1 and 100',
			path: ['discountValue']
		});
	}

	if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) {
		ctx.addIssue({
			code: 'custom',
			message: 'expiresAt must be after startsAt',
			path: ['expiresAt']
		});
	}
}

export const insertPromoCodeBaseSchema = createInsertSchema(promoCode, {
	code: z
		.string()
		.min(3)
		.max(50)
		.regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric'),
	description: z.string().max(500).optional().nullable(),
	discountType: z.enum(['percentage', 'fixed']),
	discountValue: z.number().int().positive(),
	minOrderAmount: z.number().int().min(0).optional().nullable(),
	maxDiscountAmount: z.number().int().positive().optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	usedCount: z.number().int().min(0).optional(),
	perUserLimit: z.number().int().positive().optional(),
	isActive: z.boolean().optional(),
	// Override drizzle-zod's default z.date() inference for timestamp_ms columns so
	// insert and update schemas both accept raw millisecond integers consistently.
	startsAt: timestampMsSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const insertPromoCodeSchema = insertPromoCodeBaseSchema.superRefine(
	validatePromoCodeWindowAndValue
);

export const selectPromoCodeSchema = createSelectSchema(promoCode);
export const updatePromoCodeSchema = createUpdateSchema(promoCode, {
	code: z
		.string()
		.min(3)
		.max(50)
		.regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric')
		.optional(),
	description: z.string().max(500).optional().nullable(),
	discountType: z.enum(['percentage', 'fixed']).optional(),
	discountValue: z.number().int().positive().optional(),
	minOrderAmount: z.number().int().min(0).optional().nullable(),
	maxDiscountAmount: z.number().int().positive().optional().nullable(),
	isActive: z.boolean().optional(),
	startsAt: timestampMsSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	usedCount: z.number().int().min(0).optional(),
	perUserLimit: z.number().int().positive().optional()
})
	.omit({
		id: true,
		createdAt: true,
		updatedAt: true
	})
	.superRefine(validatePromoCodeWindowAndValue);

export const insertPromoCodeUsageSchema = createInsertSchema(promoCodeUsage, {
	promoCodeId: idSchema,
	userId: idSchema.optional().nullable(),
	orderId: z.string().min(1).max(255),
	discountAmount: z.number().int().min(0)
}).omit({
	id: true,
	usedAt: true
});
export const selectPromoCodeUsageSchema = createSelectSchema(promoCodeUsage);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type PromoCode = typeof promoCode.$inferSelect;
export type NewPromoCode = typeof promoCode.$inferInsert;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type SelectPromoCode = z.infer<typeof selectPromoCodeSchema>;
export type UpdatePromoCode = z.infer<typeof updatePromoCodeSchema>;
export type PromoCodeUsage = typeof promoCodeUsage.$inferSelect;
export type NewPromoCodeUsage = typeof promoCodeUsage.$inferInsert;
export type InsertPromoCodeUsage = z.infer<typeof insertPromoCodeUsageSchema>;
export type SelectPromoCodeUsage = z.infer<typeof selectPromoCodeUsageSchema>;
