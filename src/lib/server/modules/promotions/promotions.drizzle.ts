import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';

/**
 * Promotions own discount rules, eligibility, lifecycle and placement visibility.
 * Promo codes are optional redemption/distribution handles for code promotions.
 *
 * Year-one policy remains unchanged: new promotions default inactive. Storefront
 * visibility never activates a promotion and never applies it automatically.
 */
export const PROMOTION_DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export const PROMOTION_APPLICATION_MODES = ['automatic', 'code'] as const;
export const PROMOTION_ELIGIBILITY_SCOPES = ['all', 'authenticated', 'customer_grant'] as const;
export const PROMOTION_VISIBILITIES = ['public', 'unlisted', 'internal'] as const;
export const PROMO_CODE_DISTRIBUTIONS = ['public', 'private', 'influencer', 'internal'] as const;
export const PROMO_CODE_REDEMPTION_CHANNELS = ['storefront', 'admin', 'both'] as const;

export const promotion = sqliteTable(
	'promotion',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text('name').notNull(),
		publicTitle: text('public_title'),
		internalDescription: text('internal_description'),
		publicDescription: text('public_description'),
		discountType: text('discount_type', { enum: PROMOTION_DISCOUNT_TYPES }).notNull(),
		discountValue: integer('discount_value').notNull(),
		minOrderAmount: integer('min_order_amount'),
		maxDiscountAmount: integer('max_discount_amount'),
		usageLimit: integer('usage_limit'),
		usedCount: integer('used_count').default(0).notNull(),
		perUserLimit: integer('per_user_limit').default(1).notNull(),
		applicationMode: text('application_mode', { enum: PROMOTION_APPLICATION_MODES }).notNull(),
		eligibilityScope: text('eligibility_scope', { enum: PROMOTION_ELIGIBILITY_SCOPES })
			.default('all')
			.notNull(),
		visibility: text('visibility', { enum: PROMOTION_VISIBILITIES }).default('internal').notNull(),
		priority: integer('priority').default(0).notNull(),
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
		index('promotion_active_window_idx').on(table.isActive, table.startsAt, table.expiresAt),
		index('promotion_application_priority_idx').on(table.applicationMode, table.priority),
		index('promotion_visibility_idx').on(table.visibility),
		check(
			'promotion_discount_value_valid',
			sql`${table.discountValue} > 0 AND (${table.discountType} <> 'percentage' OR ${table.discountValue} <= 100)`
		),
		check(
			'promotion_amounts_valid',
			sql`(${table.minOrderAmount} IS NULL OR ${table.minOrderAmount} >= 0) AND (${table.maxDiscountAmount} IS NULL OR ${table.maxDiscountAmount} > 0)`
		),
		check(
			'promotion_usage_counts_valid',
			sql`${table.usedCount} >= 0 AND (${table.usageLimit} IS NULL OR ${table.usageLimit} > 0) AND ${table.perUserLimit} > 0`
		),
		check('promotion_priority_nonnegative', sql`${table.priority} >= 0`),
		check(
			'promotion_expiry_after_start',
			sql`${table.startsAt} IS NULL OR ${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`
		)
	]
);

export const promoCode = sqliteTable(
	'promo_code',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		promotionId: text('promotion_id')
			.notNull()
			.references(() => promotion.id, { onDelete: 'cascade' }),
		code: text('code').notNull().unique(),
		distribution: text('distribution', { enum: PROMO_CODE_DISTRIBUTIONS })
			.default('private')
			.notNull(),
		isDiscoverable: integer('is_discoverable', { mode: 'boolean' }).default(false).notNull(),
		redemptionChannel: text('redemption_channel', { enum: PROMO_CODE_REDEMPTION_CHANNELS })
			.default('storefront')
			.notNull(),
		partnerReference: text('partner_reference'),
		usageLimit: integer('usage_limit'),
		usedCount: integer('used_count').default(0).notNull(),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('promo_code_promotion_idx').on(table.promotionId),
		index('promo_code_active_discoverable_idx').on(table.isActive, table.isDiscoverable),
		check(
			'promo_code_usage_counts_valid',
			sql`${table.usedCount} >= 0 AND (${table.usageLimit} IS NULL OR ${table.usageLimit} > 0)`
		)
	]
);

export const promotionCustomerGrant = sqliteTable(
	'promotion_customer_grant',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		promotionId: text('promotion_id')
			.notNull()
			.references(() => promotion.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		uniqueIndex('promotion_customer_grant_unique_idx').on(table.promotionId, table.userId),
		index('promotion_customer_grant_user_idx').on(table.userId),
		check(
			'promotion_customer_grant_window_valid',
			sql`${table.startsAt} IS NULL OR ${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`
		)
	]
);

// orderId intentionally has no FK: orders imports promotions for its promotion FKs.
export const promotionUsage = sqliteTable(
	'promo_code_usage',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		promotionId: text('promotion_id')
			.notNull()
			.references(() => promotion.id, { onDelete: 'restrict' }),
		promoCodeId: text('promo_code_id').references(() => promoCode.id, { onDelete: 'set null' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		orderId: text('order_id').notNull(),
		discountAmount: integer('discount_amount').notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('promotion_usage_promotion_idx').on(table.promotionId),
		index('promotion_usage_code_idx').on(table.promoCodeId),
		index('promotion_usage_user_idx').on(table.userId),
		uniqueIndex('promotion_usage_order_unique_idx').on(table.orderId),
		index('promotion_usage_per_user_idx').on(table.promotionId, table.userId),
		check('promotion_usage_discount_nonnegative', sql`${table.discountAmount} >= 0`)
	]
);

/** @deprecated Use promotionUsage. Kept for existing internal imports during migration. */
export const promoCodeUsage = promotionUsage;

export const promotionRelations = relations(promotion, ({ many }) => ({
	codes: many(promoCode),
	grants: many(promotionCustomerGrant),
	usages: many(promotionUsage)
}));
export const promoCodeRelations = relations(promoCode, ({ one, many }) => ({
	promotion: one(promotion, { fields: [promoCode.promotionId], references: [promotion.id] }),
	usages: many(promotionUsage)
}));
export const promotionCustomerGrantRelations = relations(promotionCustomerGrant, ({ one }) => ({
	promotion: one(promotion, {
		fields: [promotionCustomerGrant.promotionId],
		references: [promotion.id]
	}),
	user: one(user, { fields: [promotionCustomerGrant.userId], references: [user.id] })
}));
export const promotionUsageRelations = relations(promotionUsage, ({ one }) => ({
	promotion: one(promotion, { fields: [promotionUsage.promotionId], references: [promotion.id] }),
	promoCode: one(promoCode, { fields: [promotionUsage.promoCodeId], references: [promoCode.id] }),
	user: one(user, { fields: [promotionUsage.userId], references: [user.id] })
}));
/** @deprecated Use promotionUsageRelations. */
export const promoCodeUsageRelations = promotionUsageRelations;

const idSchema = z.string().min(1).max(255);
const timestampMsSchema = z.number().int().positive();
const codeSchema = z
	.string()
	.min(3)
	.max(50)
	.regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric');

export function validatePromotionWindowAndValue(
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
/** @deprecated Use validatePromotionWindowAndValue. */
export const validatePromoCodeWindowAndValue = validatePromotionWindowAndValue;

export const insertPromotionBaseSchema = createInsertSchema(promotion, {
	name: z.string().trim().min(2).max(120),
	publicTitle: z.string().trim().max(120).optional().nullable(),
	internalDescription: z.string().trim().max(500).optional().nullable(),
	publicDescription: z.string().trim().max(500).optional().nullable(),
	discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
	discountValue: z.number().int().positive(),
	minOrderAmount: z.number().int().min(0).optional().nullable(),
	maxDiscountAmount: z.number().int().positive().optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	usedCount: z.number().int().min(0).optional(),
	perUserLimit: z.number().int().positive().optional(),
	applicationMode: z.enum(PROMOTION_APPLICATION_MODES),
	eligibilityScope: z.enum(PROMOTION_ELIGIBILITY_SCOPES).optional(),
	visibility: z.enum(PROMOTION_VISIBILITIES).optional(),
	priority: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
	startsAt: timestampMsSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable()
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPromotionSchema = insertPromotionBaseSchema.superRefine(
	validatePromotionWindowAndValue
);
export const selectPromotionSchema = createSelectSchema(promotion);
export const updatePromotionBaseSchema = createUpdateSchema(promotion, {
	name: z.string().trim().min(2).max(120).optional(),
	publicTitle: z.string().trim().max(120).optional().nullable(),
	internalDescription: z.string().trim().max(500).optional().nullable(),
	publicDescription: z.string().trim().max(500).optional().nullable(),
	discountType: z.enum(PROMOTION_DISCOUNT_TYPES).optional(),
	discountValue: z.number().int().positive().optional(),
	minOrderAmount: z.number().int().min(0).optional().nullable(),
	maxDiscountAmount: z.number().int().positive().optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	perUserLimit: z.number().int().positive().optional(),
	applicationMode: z.enum(PROMOTION_APPLICATION_MODES).optional(),
	eligibilityScope: z.enum(PROMOTION_ELIGIBILITY_SCOPES).optional(),
	visibility: z.enum(PROMOTION_VISIBILITIES).optional(),
	priority: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
	startsAt: timestampMsSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable()
}).omit({ id: true, usedCount: true, createdAt: true, updatedAt: true });
export const updatePromotionSchema = updatePromotionBaseSchema.superRefine(
	validatePromotionWindowAndValue
);

export const insertPromoCodeBaseSchema = createInsertSchema(promoCode, {
	promotionId: idSchema,
	code: codeSchema,
	distribution: z.enum(PROMO_CODE_DISTRIBUTIONS).optional(),
	isDiscoverable: z.boolean().optional(),
	redemptionChannel: z.enum(PROMO_CODE_REDEMPTION_CHANNELS).optional(),
	partnerReference: z.string().trim().max(120).optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	usedCount: z.number().int().min(0).optional(),
	isActive: z.boolean().optional()
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPromoCodeSchema = insertPromoCodeBaseSchema;
export const selectPromoCodeSchema = createSelectSchema(promoCode);
export const updatePromoCodeBaseSchema = createUpdateSchema(promoCode, {
	code: codeSchema.optional(),
	distribution: z.enum(PROMO_CODE_DISTRIBUTIONS).optional(),
	isDiscoverable: z.boolean().optional(),
	redemptionChannel: z.enum(PROMO_CODE_REDEMPTION_CHANNELS).optional(),
	partnerReference: z.string().trim().max(120).optional().nullable(),
	usageLimit: z.number().int().positive().optional().nullable(),
	isActive: z.boolean().optional()
}).omit({ id: true, promotionId: true, usedCount: true, createdAt: true, updatedAt: true });
export const updatePromoCodeSchema = updatePromoCodeBaseSchema;

export const insertPromotionCustomerGrantSchema = createInsertSchema(promotionCustomerGrant, {
	promotionId: idSchema,
	userId: idSchema,
	startsAt: timestampMsSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable()
})
	.omit({ id: true, createdAt: true })
	.superRefine((data, ctx) => {
		if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) {
			ctx.addIssue({
				code: 'custom',
				message: 'expiresAt must be after startsAt',
				path: ['expiresAt']
			});
		}
	});
export const insertPromotionUsageSchema = createInsertSchema(promotionUsage, {
	promotionId: idSchema,
	promoCodeId: idSchema.optional().nullable(),
	userId: idSchema.optional().nullable(),
	orderId: idSchema,
	discountAmount: z.number().int().min(0)
}).omit({ id: true, usedAt: true });
/** @deprecated Use insertPromotionUsageSchema. */
export const insertPromoCodeUsageSchema = insertPromotionUsageSchema;
export const selectPromotionUsageSchema = createSelectSchema(promotionUsage);
/** @deprecated Use selectPromotionUsageSchema. */
export const selectPromoCodeUsageSchema = selectPromotionUsageSchema;

export type Promotion = typeof promotion.$inferSelect;
export type NewPromotion = typeof promotion.$inferInsert;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type UpdatePromotion = z.infer<typeof updatePromotionSchema>;
export type PromoCode = typeof promoCode.$inferSelect;
export type NewPromoCode = typeof promoCode.$inferInsert;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type UpdatePromoCode = z.infer<typeof updatePromoCodeSchema>;
export type PromotionCustomerGrant = typeof promotionCustomerGrant.$inferSelect;
export type PromotionUsage = typeof promotionUsage.$inferSelect;
export type NewPromotionUsage = typeof promotionUsage.$inferInsert;
export type InsertPromotionUsage = z.infer<typeof insertPromotionUsageSchema>;
/** @deprecated Use PromotionUsage. */
export type PromoCodeUsage = PromotionUsage;
/** @deprecated Use NewPromotionUsage. */
export type NewPromoCodeUsage = NewPromotionUsage;
/** @deprecated Use InsertPromotionUsage. */
export type InsertPromoCodeUsage = InsertPromotionUsage;
export type SelectPromoCodeUsage = z.infer<typeof selectPromotionUsageSchema>;
