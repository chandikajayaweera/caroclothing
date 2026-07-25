import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { category, product } from '../products/products.drizzle';
import { promotion } from '../promotions/promotions.drizzle';
import { shippingMethod } from '../shipping/shipping.drizzle';

export const STOREFRONT_PAGE_KEYS = ['home'] as const;
export const STOREFRONT_SECTION_TYPES = [
	'hero',
	'product_grid',
	'product_spotlight',
	'category_showcase',
	'promotion_campaign',
	'service_strip',
	'review_rail'
] as const;
export const STOREFRONT_LAYOUT_VARIANTS = [
	'full_bleed',
	'split',
	'grid_2',
	'grid_3',
	'grid_4',
	'rail',
	'compact'
] as const;
export const STOREFRONT_SOURCE_TYPES = [
	'manual',
	'new_arrivals',
	'featured_products',
	'category_products',
	'root_categories',
	'promotion',
	'shipping',
	'recent_reviews'
] as const;
export const STOREFRONT_MEDIA_ROLES = ['desktop', 'mobile'] as const;

export const storefrontSection = sqliteTable(
	'storefront_section',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		pageKey: text('page_key', { enum: STOREFRONT_PAGE_KEYS }).default('home').notNull(),
		type: text('type', { enum: STOREFRONT_SECTION_TYPES }).notNull(),
		adminName: text('admin_name').notNull(),
		layoutVariant: text('layout_variant', { enum: STOREFRONT_LAYOUT_VARIANTS }).notNull(),
		sourceType: text('source_type', { enum: STOREFRONT_SOURCE_TYPES }).notNull(),
		eyebrow: text('eyebrow'),
		title: text('title'),
		body: text('body'),
		primaryCtaLabel: text('primary_cta_label'),
		primaryCtaUrl: text('primary_cta_url'),
		secondaryCtaLabel: text('secondary_cta_label'),
		secondaryCtaUrl: text('secondary_cta_url'),
		productId: text('product_id').references(() => product.id, { onDelete: 'set null' }),
		categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
		promotionId: text('promotion_id').references(() => promotion.id, { onDelete: 'set null' }),
		shippingMethodId: text('shipping_method_id').references(() => shippingMethod.id, {
			onDelete: 'set null'
		}),
		itemLimit: integer('item_limit').default(8).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).default(false).notNull(),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex('storefront_section_page_sort_unique_idx').on(table.pageKey, table.sortOrder),
		index('storefront_section_visibility_idx').on(
			table.pageKey,
			table.enabled,
			table.startsAt,
			table.endsAt
		),
		index('storefront_section_type_idx').on(table.type),
		check('storefront_section_item_limit_range', sql`${table.itemLimit} BETWEEN 1 AND 12`),
		check('storefront_section_sort_nonnegative', sql`${table.sortOrder} >= 0`),
		check(
			'storefront_section_window_valid',
			sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`
		),
		check(
			'storefront_section_cta_pairs',
			sql`(${table.primaryCtaLabel} IS NULL) = (${table.primaryCtaUrl} IS NULL) AND (${table.secondaryCtaLabel} IS NULL) = (${table.secondaryCtaUrl} IS NULL)`
		)
	]
);

export const storefrontSectionCategory = sqliteTable(
	'storefront_section_category',
	{
		sectionId: text('section_id')
			.notNull()
			.references(() => storefrontSection.id, { onDelete: 'cascade' }),
		categoryId: text('category_id')
			.notNull()
			.references(() => category.id, { onDelete: 'cascade' }),
		position: integer('position').default(0).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.sectionId, table.categoryId] }),
		uniqueIndex('storefront_section_category_position_unique_idx').on(
			table.sectionId,
			table.position
		),
		index('storefront_section_category_category_idx').on(table.categoryId),
		check('storefront_section_category_position_nonnegative', sql`${table.position} >= 0`)
	]
);

export const storefrontSectionMedia = sqliteTable(
	'storefront_section_media',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		sectionId: text('section_id')
			.notNull()
			.references(() => storefrontSection.id, { onDelete: 'cascade' }),
		role: text('role', { enum: STOREFRONT_MEDIA_ROLES }).notNull(),
		r2Key: text('r2_key').notNull(),
		mimeType: text('mime_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		originalFilename: text('original_filename'),
		width: integer('width'),
		height: integer('height'),
		altText: text('alt_text'),
		focalX: integer('focal_x').default(50).notNull(),
		focalY: integer('focal_y').default(50).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		uniqueIndex('storefront_section_media_role_unique_idx').on(table.sectionId, table.role),
		index('storefront_section_media_section_idx').on(table.sectionId),
		uniqueIndex('storefront_section_media_r2_key_unique_idx').on(table.r2Key),
		check('storefront_section_media_byte_size_positive', sql`${table.byteSize} > 0`),
		check(
			'storefront_section_media_dimensions_positive',
			sql`(${table.width} IS NULL OR ${table.width} > 0) AND (${table.height} IS NULL OR ${table.height} > 0)`
		),
		check(
			'storefront_section_media_focal_range',
			sql`${table.focalX} BETWEEN 0 AND 100 AND ${table.focalY} BETWEEN 0 AND 100`
		)
	]
);

export const storefrontSectionRelations = relations(storefrontSection, ({ one, many }) => ({
	product: one(product, { fields: [storefrontSection.productId], references: [product.id] }),
	category: one(category, { fields: [storefrontSection.categoryId], references: [category.id] }),
	promotion: one(promotion, {
		fields: [storefrontSection.promotionId],
		references: [promotion.id]
	}),
	shippingMethod: one(shippingMethod, {
		fields: [storefrontSection.shippingMethodId],
		references: [shippingMethod.id]
	}),
	categories: many(storefrontSectionCategory),
	media: many(storefrontSectionMedia)
}));
export const storefrontSectionCategoryRelations = relations(
	storefrontSectionCategory,
	({ one }) => ({
		section: one(storefrontSection, {
			fields: [storefrontSectionCategory.sectionId],
			references: [storefrontSection.id]
		}),
		category: one(category, {
			fields: [storefrontSectionCategory.categoryId],
			references: [category.id]
		})
	})
);
export const storefrontSectionMediaRelations = relations(storefrontSectionMedia, ({ one }) => ({
	section: one(storefrontSection, {
		fields: [storefrontSectionMedia.sectionId],
		references: [storefrontSection.id]
	})
}));

const idSchema = z.string().min(1).max(255);
const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const timestampMsSchema = z.number().int().positive();
const pathSchema = z
	.string()
	.trim()
	.min(1)
	.max(500)
	.refine(
		(value) => value.startsWith('/') || value.startsWith('https://'),
		'Use an internal path or HTTPS URL'
	);

export function validateStorefrontSectionWindowAndCtas(
	data: {
		startsAt?: number | null;
		endsAt?: number | null;
		primaryCtaLabel?: string | null;
		primaryCtaUrl?: string | null;
		secondaryCtaLabel?: string | null;
		secondaryCtaUrl?: string | null;
	},
	ctx: z.RefinementCtx
) {
	if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt)
		ctx.addIssue({
			code: 'custom',
			message: 'End time must be after start time',
			path: ['endsAt']
		});
	for (const [label, url] of [
		[data.primaryCtaLabel, data.primaryCtaUrl],
		[data.secondaryCtaLabel, data.secondaryCtaUrl]
	]) {
		if (Boolean(label) !== Boolean(url))
			ctx.addIssue({
				code: 'custom',
				message: 'CTA label and URL must be supplied together',
				path: [label ? 'primaryCtaUrl' : 'primaryCtaLabel']
			});
	}
}

export const insertStorefrontSectionBaseSchema = createInsertSchema(storefrontSection, {
	pageKey: z.enum(STOREFRONT_PAGE_KEYS).optional(),
	type: z.enum(STOREFRONT_SECTION_TYPES),
	adminName: z.string().trim().min(2).max(120),
	layoutVariant: z.enum(STOREFRONT_LAYOUT_VARIANTS),
	sourceType: z.enum(STOREFRONT_SOURCE_TYPES),
	eyebrow: nullableText(80),
	title: nullableText(160),
	body: nullableText(1000),
	primaryCtaLabel: nullableText(60),
	primaryCtaUrl: pathSchema.optional().nullable(),
	secondaryCtaLabel: nullableText(60),
	secondaryCtaUrl: pathSchema.optional().nullable(),
	productId: idSchema.optional().nullable(),
	categoryId: idSchema.optional().nullable(),
	promotionId: idSchema.optional().nullable(),
	shippingMethodId: idSchema.optional().nullable(),
	itemLimit: z.number().int().min(1).max(12).optional(),
	sortOrder: z.number().int().min(0).optional(),
	enabled: z.boolean().optional(),
	startsAt: timestampMsSchema.optional().nullable(),
	endsAt: timestampMsSchema.optional().nullable()
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStorefrontSectionSchema = insertStorefrontSectionBaseSchema.superRefine(
	validateStorefrontSectionWindowAndCtas
);
export const selectStorefrontSectionSchema = createSelectSchema(storefrontSection);
export const updateStorefrontSectionBaseSchema = createUpdateSchema(storefrontSection, {
	pageKey: z.enum(STOREFRONT_PAGE_KEYS).optional(),
	type: z.enum(STOREFRONT_SECTION_TYPES).optional(),
	adminName: z.string().trim().min(2).max(120).optional(),
	layoutVariant: z.enum(STOREFRONT_LAYOUT_VARIANTS).optional(),
	sourceType: z.enum(STOREFRONT_SOURCE_TYPES).optional(),
	eyebrow: nullableText(80),
	title: nullableText(160),
	body: nullableText(1000),
	primaryCtaLabel: nullableText(60),
	primaryCtaUrl: pathSchema.optional().nullable(),
	secondaryCtaLabel: nullableText(60),
	secondaryCtaUrl: pathSchema.optional().nullable(),
	productId: idSchema.optional().nullable(),
	categoryId: idSchema.optional().nullable(),
	promotionId: idSchema.optional().nullable(),
	shippingMethodId: idSchema.optional().nullable(),
	itemLimit: z.number().int().min(1).max(12).optional(),
	sortOrder: z.number().int().min(0).optional(),
	enabled: z.boolean().optional(),
	startsAt: timestampMsSchema.optional().nullable(),
	endsAt: timestampMsSchema.optional().nullable()
}).omit({ id: true, createdAt: true, updatedAt: true });
export const updateStorefrontSectionSchema = updateStorefrontSectionBaseSchema.superRefine(
	validateStorefrontSectionWindowAndCtas
);
export const insertStorefrontSectionMediaSchema = createInsertSchema(storefrontSectionMedia, {
	sectionId: idSchema,
	role: z.enum(STOREFRONT_MEDIA_ROLES),
	r2Key: z.string().min(1).max(1024),
	mimeType: z.string().min(1).max(120),
	byteSize: z.number().int().positive(),
	originalFilename: nullableText(255),
	width: z.number().int().positive().optional().nullable(),
	height: z.number().int().positive().optional().nullable(),
	altText: nullableText(255),
	focalX: z.number().int().min(0).max(100).optional(),
	focalY: z.number().int().min(0).max(100).optional()
}).omit({ id: true, createdAt: true });

export type StorefrontSection = typeof storefrontSection.$inferSelect;
export type NewStorefrontSection = typeof storefrontSection.$inferInsert;
export type InsertStorefrontSection = z.infer<typeof insertStorefrontSectionSchema>;
export type UpdateStorefrontSection = z.infer<typeof updateStorefrontSectionSchema>;
export type StorefrontSectionMedia = typeof storefrontSectionMedia.$inferSelect;
export type NewStorefrontSectionMedia = typeof storefrontSectionMedia.$inferInsert;
