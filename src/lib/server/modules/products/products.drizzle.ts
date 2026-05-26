import { relations, sql } from 'drizzle-orm';
import {
	sqliteTable,
	text,
	integer,
	index,
	check,
	uniqueIndex,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// PRODUCT TIER ENUM
//
// 'drop'  — Limited release. Part of a named drop event. Bold graphic statement.
//           Never restocked. Priced LKR 3,000–4,500. Hype ritual applies.
//           A product with tier = 'drop' MUST be linked to a dropProduct row
//           when the drop is live.
//
// 'core'  — Always available. Minimal wordmark / tonal design. Restockable.
//           Priced LKR 2,500–3,200. No countdown, no ceremony.
//           If a piece could be a drop, it's too good for Core.
//
// Design rules per tier are defined in caro_brand_identity.html §06.
// ---------------------------------------------------------------------------

export const PRODUCT_TIERS = ['drop', 'core'] as const;
export type ProductTier = (typeof PRODUCT_TIERS)[number];

export const GENDER_TIERS = ['men', 'women', 'unisex'] as const;
export type GenderTier = (typeof GENDER_TIERS)[number];

export const FIT_TIERS = ['oversized', 'regular', 'slim'] as const;
export type FitTier = (typeof FIT_TIERS)[number];

export const SIZE_TIERS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
export type SizeTier = (typeof SIZE_TIERS)[number];

// ---------------------------------------------------------------------------
// CATEGORIES
//
// imageR2Key stores the Cloudflare R2 object key — NOT a URL.
// Resolve at query time via mediaUrl(imageR2Key) from media/utils.ts.
// R2 key format: categories/{categoryId}/{variant}-{uuid}.{ext}
// Use buildMediaKey({ scope: 'categories', entityId: id, ... }) from r2.ts
// ---------------------------------------------------------------------------

export const category = sqliteTable(
	'category',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		description: text('description'),
		imageR2Key: text('image_r2_key'), // R2 object key, NOT a URL
		parentId: text('parent_id').references((): AnySQLiteColumn => category.id, {
			onDelete: 'set null'
		}), // self-referential FK
		sortOrder: integer('sort_order').default(0).notNull(),
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
		index('category_parent_idx').on(table.parentId),
		index('category_active_idx').on(table.isActive),
		check('category_sort_nonnegative', sql`${table.sortOrder} >= 0`)
	]
);

// ---------------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------------

export const product = sqliteTable(
	'product',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		description: text('description'), // rich text / markdown
		shortDescription: text('short_description'), // used in listing cards
		categoryId: text('category_id').references(() => category.id, {
			onDelete: 'set null'
		}),
		// ── Tier ──────────────────────────────────────────────────────────────
		// Determines pricing band, restockability, and marketing ritual.
		// 'drop'  → limited, event-based, never restocked, hype mechanic
		// 'core'  → always available, minimal branding, quietly restocked
		// See PRODUCT_TIERS and brand identity §06 for full design rules.
		tier: text('tier', { enum: PRODUCT_TIERS }).default('core').notNull(),
		// ── Attributes ────────────────────────────────────────────────────────
		gender: text('gender', { enum: GENDER_TIERS }).default('unisex').notNull(),
		fit: text('fit', { enum: FIT_TIERS }).default('oversized').notNull(),
		material: text('material'), // e.g. "100% Combed Cotton 220GSM"
		careInstructions: text('care_instructions'),
		// ── Flags ─────────────────────────────────────────────────────────────
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		isFeatured: integer('is_featured', { mode: 'boolean' }).default(false).notNull(),
		isNewArrival: integer('is_new_arrival', { mode: 'boolean' }).default(true).notNull(),
		// ── SEO ───────────────────────────────────────────────────────────────
		metaTitle: text('meta_title'),
		metaDescription: text('meta_description'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('product_category_idx').on(table.categoryId),
		index('product_active_featured_idx').on(table.isActive, table.isFeatured, table.createdAt),
		index('product_gender_active_idx').on(table.gender, table.isActive),
		index('product_new_arrival_idx').on(table.isNewArrival, table.isActive, table.createdAt),
		index('product_created_idx').on(table.createdAt),
		// Tier-based queries: PLP "Shop Core", "Shop Drops", admin tier management
		index('product_tier_active_idx').on(table.tier, table.isActive, table.createdAt)
	]
);

// ---------------------------------------------------------------------------
// COLORS (Global reusable library of color swatches)
// ---------------------------------------------------------------------------

export const color = sqliteTable('color', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text('name').notNull().unique(), // display name e.g. "Void Black"
	hex: text('hex').notNull(), // "#0A0A0A" for swatch rendering
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull()
});

// ---------------------------------------------------------------------------
// PRODUCT VARIANT COLORS
// ---------------------------------------------------------------------------

export const productVariantColor = sqliteTable(
	'product_variant_color',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		colorId: text('color_id').references(() => color.id, { onDelete: 'set null' }),
		color: text('color').notNull(), // display name e.g. "Void Black"
		colorHex: text('color_hex'), // "#0A0A0A" for swatch rendering
		basePrice: integer('base_price').notNull(),
		compareAtPrice: integer('compare_at_price'), // "was" price for strike-through
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('color_product_idx').on(table.productId),
		index('color_global_idx').on(table.colorId),
		check('color_base_price_positive', sql`${table.basePrice} > 0`),
		check(
			'color_compare_at_gt_base',
			sql`${table.compareAtPrice} IS NULL OR ${table.compareAtPrice} > ${table.basePrice}`
		)
	]
);

// ---------------------------------------------------------------------------
// PRODUCT VARIANTS  (size under color variant)
// ---------------------------------------------------------------------------

export const productVariant = sqliteTable(
	'product_variant',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		variantColorId: text('variant_color_id')
			.notNull()
			.references(() => productVariantColor.id, { onDelete: 'cascade' }),
		size: text('size', {
			enum: SIZE_TIERS
		}).notNull(),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('variant_product_idx').on(table.productId),
		index('variant_color_idx').on(table.variantColorId),
		uniqueIndex('variant_color_size_idx').on(table.variantColorId, table.size),
		index('variant_active_idx').on(table.isActive),
		check('variant_sort_nonnegative', sql`${table.sortOrder} >= 0`)
	]
);

// ---------------------------------------------------------------------------
// PRODUCT IMAGES
//
// r2Key stores the Cloudflare R2 object key — NOT a URL.
// Build via: buildMediaKey({ scope: 'products', entityId: productId, variant: 'main', contentType })
// Resolve to URL via: mediaUrl(r2Key) from media/utils.ts
//
// variantId references productVariantColor.id.
//
// isPrimary uniqueness is enforced by partial unique indexes:
//   - one primary image per product when variantId is null
//   - one primary image per variant when variantId is not null
// ---------------------------------------------------------------------------

export const productImage = sqliteTable(
	'product_image',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		variantId: text('variant_id').references(() => productVariantColor.id, {
			onDelete: 'set null'
		}),
		r2Key: text('r2_key').notNull(), // R2 object key — use mediaUrl(r2Key) to serve
		altText: text('alt_text'),
		position: integer('position').default(0).notNull(),
		isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('image_product_idx').on(table.productId),
		index('image_variant_idx').on(table.variantId),
		// Composite index for ordered image retrieval per product
		index('image_product_position_idx').on(table.productId, table.position),
		uniqueIndex('product_image_one_primary_per_product')
			.on(table.productId)
			.where(sql`${table.isPrimary} = 1 AND ${table.variantId} IS NULL`),
		uniqueIndex('product_image_one_primary_per_variant')
			.on(table.variantId)
			.where(sql`${table.isPrimary} = 1 AND ${table.variantId} IS NOT NULL`),
		check('image_position_nonnegative', sql`${table.position} >= 0`)
	]
);

// ---------------------------------------------------------------------------
// TAGS  (many-to-many via junction table)
// ---------------------------------------------------------------------------

export const tag = sqliteTable('tag', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text('name').notNull().unique(),
	slug: text('slug').notNull().unique()
});

export const productTag = sqliteTable(
	'product_tag',
	{
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(table) => [
		uniqueIndex('product_tag_unique_idx').on(table.productId, table.tagId),
		index('product_tag_tag_idx').on(table.tagId)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const categoryRelations = relations(category, ({ one, many }) => ({
	parent: one(category, {
		fields: [category.parentId],
		references: [category.id],
		relationName: 'subcategories'
	}),
	children: many(category, { relationName: 'subcategories' }),
	products: many(product)
}));

export const productRelations = relations(product, ({ one, many }) => ({
	category: one(category, {
		fields: [product.categoryId],
		references: [category.id]
	}),
	variants: many(productVariant),
	colors: many(productVariantColor),
	images: many(productImage),
	productTags: many(productTag)
}));

export const colorRelations = relations(color, ({ many }) => ({
	variantColors: many(productVariantColor)
}));

export const productVariantColorRelations = relations(productVariantColor, ({ one, many }) => ({
	product: one(product, {
		fields: [productVariantColor.productId],
		references: [product.id]
	}),
	globalColor: one(color, {
		fields: [productVariantColor.colorId],
		references: [color.id]
	}),
	variants: many(productVariant),
	images: many(productImage)
}));

export const productVariantRelations = relations(productVariant, ({ one }) => ({
	product: one(product, {
		fields: [productVariant.productId],
		references: [product.id]
	}),
	color: one(productVariantColor, {
		fields: [productVariant.variantColorId],
		references: [productVariantColor.id]
	})
}));

export const productImageRelations = relations(productImage, ({ one }) => ({
	product: one(product, {
		fields: [productImage.productId],
		references: [product.id]
	}),
	variantColor: one(productVariantColor, {
		fields: [productImage.variantId],
		references: [productVariantColor.id]
	})
}));

export const tagRelations = relations(tag, ({ many }) => ({
	productTags: many(productTag)
}));

export const productTagRelations = relations(productTag, ({ one }) => ({
	product: one(product, {
		fields: [productTag.productId],
		references: [product.id]
	}),
	tag: one(tag, {
		fields: [productTag.tagId],
		references: [tag.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

export const slugSchema = z
	.string()
	.min(1)
	.max(255)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

export const r2KeySchema = z
	.string()
	.min(1)
	.max(512)
	.regex(/^[a-zA-Z0-9_\-./]+$/, 'Invalid R2 key format')
	.refine((key) => !key.includes('..') && !key.startsWith('/'), {
		message: 'R2 key must not contain path traversal or start with /'
	});

const idSchema = z.string().min(1).max(64);
const nameSchema = z.string().min(1).max(255);
const sortOrderSchema = z.number().int().min(0);
const positiveMoneySchema = z.number().int().positive();

export const insertCategorySchema = createInsertSchema(category, {
	name: z.string().min(1).max(100),
	slug: slugSchema,
	description: z.string().max(1000).optional().nullable(),
	parentId: idSchema.optional().nullable(),
	sortOrder: sortOrderSchema.optional(),
	isActive: z.boolean().optional(),
	imageR2Key: r2KeySchema.optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const selectCategorySchema = createSelectSchema(category);

export const updateCategorySchema = createUpdateSchema(category, {
	name: z.string().min(1).max(100).optional(),
	slug: slugSchema.optional(),
	description: z.string().max(1000).optional().nullable(),
	parentId: idSchema.optional().nullable(),
	sortOrder: sortOrderSchema.optional(),
	isActive: z.boolean().optional(),
	imageR2Key: r2KeySchema.optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const insertProductBaseSchema = createInsertSchema(product, {
	name: nameSchema,
	slug: slugSchema,
	description: z.string().max(5000).optional().nullable(),
	shortDescription: z.string().max(500).optional().nullable(),
	categoryId: idSchema.optional().nullable(),
	tier: z.enum(PRODUCT_TIERS).optional(),
	gender: z.enum(GENDER_TIERS).optional(),
	fit: z.enum(FIT_TIERS).optional(),
	material: z.string().max(200).optional().nullable(),
	careInstructions: z.string().max(1000).optional().nullable(),
	isActive: z.boolean().optional(),
	isFeatured: z.boolean().optional(),
	isNewArrival: z.boolean().optional(),
	metaTitle: z.string().max(60).optional().nullable(),
	metaDescription: z.string().max(160).optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const insertProductSchema = insertProductBaseSchema;

export const selectProductSchema = createSelectSchema(product);

export const updateProductBaseSchema = createUpdateSchema(product, {
	name: nameSchema.optional(),
	slug: slugSchema.optional(),
	description: z.string().max(5000).optional().nullable(),
	shortDescription: z.string().max(500).optional().nullable(),
	categoryId: idSchema.optional().nullable(),
	tier: z.enum(PRODUCT_TIERS).optional(),
	gender: z.enum(GENDER_TIERS).optional(),
	fit: z.enum(FIT_TIERS).optional(),
	material: z.string().max(200).optional().nullable(),
	careInstructions: z.string().max(1000).optional().nullable(),
	isActive: z.boolean().optional(),
	isFeatured: z.boolean().optional(),
	isNewArrival: z.boolean().optional(),
	metaTitle: z.string().max(60).optional().nullable(),
	metaDescription: z.string().max(160).optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const updateProductSchema = updateProductBaseSchema;

export const insertProductVariantColorSchema = createInsertSchema(productVariantColor, {
	productId: idSchema,
	colorId: idSchema.optional().nullable(),
	color: z.string().min(1).max(50),
	colorHex: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
		.optional()
		.nullable(),
	basePrice: positiveMoneySchema,
	compareAtPrice: positiveMoneySchema.optional().nullable(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const selectProductVariantColorSchema = createSelectSchema(productVariantColor);

export const updateProductVariantColorSchema = createUpdateSchema(productVariantColor, {
	productId: idSchema.optional(),
	colorId: idSchema.optional().nullable(),
	color: z.string().min(1).max(50).optional(),
	colorHex: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
		.optional()
		.nullable(),
	basePrice: positiveMoneySchema.optional(),
	compareAtPrice: positiveMoneySchema.optional().nullable(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const insertProductVariantSchema = createInsertSchema(productVariant, {
	productId: idSchema,
	variantColorId: idSchema,
	size: z.enum(SIZE_TIERS),
	isActive: z.boolean().optional(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const selectProductVariantSchema = createSelectSchema(productVariant);

export const updateProductVariantSchema = createUpdateSchema(productVariant, {
	productId: idSchema.optional(),
	variantColorId: idSchema.optional(),
	size: z.enum(SIZE_TIERS).optional(),
	isActive: z.boolean().optional(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const insertProductImageSchema = createInsertSchema(productImage, {
	productId: idSchema,
	variantId: idSchema.optional().nullable(),
	r2Key: r2KeySchema,
	altText: z.string().max(255).optional().nullable(),
	position: sortOrderSchema.optional(),
	isPrimary: z.boolean().optional()
}).omit({
	id: true,
	createdAt: true
});
export const selectProductImageSchema = createSelectSchema(productImage);
export const updateProductImageSchema = createUpdateSchema(productImage, {
	productId: idSchema.optional(),
	variantId: idSchema.optional().nullable(),
	altText: z.string().max(255).optional().nullable(),
	position: sortOrderSchema.optional(),
	isPrimary: z.boolean().optional()
}).omit({
	id: true,
	r2Key: true,
	createdAt: true
});

export const insertTagSchema = createInsertSchema(tag, {
	name: z.string().min(1).max(50),
	slug: slugSchema
}).omit({
	id: true
});
export const selectTagSchema = createSelectSchema(tag);
export const updateTagSchema = createUpdateSchema(tag, {
	name: z.string().min(1).max(50).optional(),
	slug: slugSchema.optional()
}).omit({
	id: true
});

export const insertProductTagSchema = createInsertSchema(productTag, {
	productId: idSchema,
	tagId: idSchema
});
export const selectProductTagSchema = createSelectSchema(productTag);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type SelectCategory = z.infer<typeof selectCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type SelectProduct = z.infer<typeof selectProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;

export type ProductVariantColor = typeof productVariantColor.$inferSelect;
export type NewProductVariantColor = typeof productVariantColor.$inferInsert;
export type InsertProductVariantColor = z.infer<typeof insertProductVariantColorSchema>;
export type SelectProductVariantColor = z.infer<typeof selectProductVariantColorSchema>;
export type UpdateProductVariantColor = z.infer<typeof updateProductVariantColorSchema>;

export type ProductVariant = typeof productVariant.$inferSelect;
export type NewProductVariant = typeof productVariant.$inferInsert;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type SelectProductVariant = z.infer<typeof selectProductVariantSchema>;
export type UpdateProductVariant = z.infer<typeof updateProductVariantSchema>;

export type ProductImage = typeof productImage.$inferSelect;
export type NewProductImage = typeof productImage.$inferInsert;
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;
export type SelectProductImage = z.infer<typeof selectProductImageSchema>;
export type UpdateProductImage = z.infer<typeof updateProductImageSchema>;

export type Tag = typeof tag.$inferSelect;
export type NewTag = typeof tag.$inferInsert;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type SelectTag = z.infer<typeof selectTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;

export type ProductTag = typeof productTag.$inferSelect;
export type NewProductTag = typeof productTag.$inferInsert;
export type InsertProductTag = z.infer<typeof insertProductTagSchema>;
export type SelectProductTag = z.infer<typeof selectProductTagSchema>;

// ---------------------------------------------------------------------------
// COLOR SCHEMAS & TYPES
// ---------------------------------------------------------------------------

export const insertColorSchema = createInsertSchema(color, {
	name: z.string().min(1).max(50),
	hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const selectColorSchema = createSelectSchema(color);

export const updateColorSchema = createUpdateSchema(color, {
	name: z.string().min(1).max(50).optional(),
	hex: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
		.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export type Color = typeof color.$inferSelect;
export type NewColor = typeof color.$inferInsert;
export type InsertColor = z.infer<typeof insertColorSchema>;
export type SelectColor = z.infer<typeof selectColorSchema>;
export type UpdateColor = z.infer<typeof updateColorSchema>;
