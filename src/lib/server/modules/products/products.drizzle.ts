import { relations, sql } from 'drizzle-orm';
import {
	sqliteTable,
	text,
	integer,
	real,
	index,
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
//           Priced LKR 2,500–3,000. No countdown, no ceremony.
//           If a piece could be a drop, it's too good for Core.
//
// Design rules per tier are defined in caro_brand_identity.html §06.
// ---------------------------------------------------------------------------

export const PRODUCT_TIERS = ['drop', 'core'] as const;
export type ProductTier = (typeof PRODUCT_TIERS)[number];

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
		index('category_active_idx').on(table.isActive)
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
		// ── Pricing ───────────────────────────────────────────────────────────
		// Monetary values in LKR (full units, 2 decimal places max).
		// real = IEEE 754 double; safe for LKR values at typical price ranges.
		basePrice: real('base_price').notNull(),
		compareAtPrice: real('compare_at_price'), // "was" price for strike-through
		// ── Attributes ────────────────────────────────────────────────────────
		gender: text('gender', {
			enum: ['men', 'women', 'unisex']
		})
			.default('unisex')
			.notNull(),
		fit: text('fit', {
			enum: ['oversized', 'regular', 'slim']
		})
			.default('oversized')
			.notNull(),
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
		index('product_active_featured_idx').on(table.isActive, table.isFeatured),
		index('product_gender_active_idx').on(table.gender, table.isActive),
		index('product_new_arrival_idx').on(table.isNewArrival, table.isActive),
		index('product_created_idx').on(table.createdAt),
		// Tier-based queries: PLP "Shop Core", "Shop Drops", admin tier management
		index('product_tier_active_idx').on(table.tier, table.isActive)
	]
);

// ---------------------------------------------------------------------------
// PRODUCT VARIANTS  (size × color combination)
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
		sku: text('sku').notNull().unique(), // e.g. CARO-BLK-001-L
		size: text('size', {
			enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
		}).notNull(),
		color: text('color').notNull(), // display name e.g. "Void Black"
		colorHex: text('color_hex'), // "#0A0A0A" for swatch rendering
		// null = inherit product.basePrice at query time — do NOT cache here
		priceOverride: real('price_override'),
		weight: real('weight'), // grams — used by shipping calc
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
		// Prevents duplicate size+color combos per product
		uniqueIndex('variant_product_size_color_idx').on(table.productId, table.size, table.color),
		index('variant_active_idx').on(table.isActive)
	]
);

// ---------------------------------------------------------------------------
// PRODUCT IMAGES
//
// r2Key stores the Cloudflare R2 object key — NOT a URL.
// Build via: buildMediaKey({ scope: 'products', entityId: productId, variant: 'main', contentType })
// Resolve to URL via: mediaUrl(r2Key) from media/utils.ts
//
// variantId null means the image applies to all variants (e.g. a lifestyle shot).
//
// isPrimary uniqueness:
//   There should be at most one isPrimary image per product (for null-variant images)
//   and at most one isPrimary image per variant. Drizzle does not support partial
//   indexes in schema definitions, so this cannot be expressed here. Add the
//   following to your migration SQL:
//
//   -- One primary image per product (applies to all variants)
//   CREATE UNIQUE INDEX product_image_one_primary_per_product
//     ON product_image(product_id) WHERE is_primary = 1 AND variant_id IS NULL;
//
//   -- One primary image per variant
//   CREATE UNIQUE INDEX product_image_one_primary_per_variant
//     ON product_image(variant_id) WHERE is_primary = 1 AND variant_id IS NOT NULL;
//
// Without these indexes, multiple images can have isPrimary = true for the same
// product/variant, causing ambiguous results in any query that fetches the primary image.
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
		variantId: text('variant_id').references(() => productVariant.id, {
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
		index('image_product_position_idx').on(table.productId, table.position)
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
	images: many(productImage),
	productTags: many(productTag)
}));

export const productVariantRelations = relations(productVariant, ({ one, many }) => ({
	product: one(product, {
		fields: [productVariant.productId],
		references: [product.id]
	}),
	images: many(productImage)
}));

export const productImageRelations = relations(productImage, ({ one }) => ({
	product: one(product, {
		fields: [productImage.productId],
		references: [product.id]
	}),
	variant: one(productVariant, {
		fields: [productImage.variantId],
		references: [productVariant.id]
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

const slugSchema = z
	.string()
	.min(1)
	.max(255)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

const r2KeySchema = z
	.string()
	.min(1)
	.max(512)
	.regex(/^[a-zA-Z0-9_\-./]+$/, 'Invalid R2 key format');

export const insertCategorySchema = createInsertSchema(category, {
	name: z.string().min(1).max(100),
	slug: slugSchema,
	sortOrder: z.number().int().min(0).optional(),
	imageR2Key: r2KeySchema.optional().nullable()
});
export const selectCategorySchema = createSelectSchema(category);
export const updateCategorySchema = createUpdateSchema(category, {
	name: z.string().min(1).max(100).optional(),
	slug: slugSchema.optional(),
	imageR2Key: r2KeySchema.optional().nullable()
});

export const insertProductSchema = createInsertSchema(product, {
	name: z.string().min(1).max(255),
	slug: slugSchema,
	tier: z.enum(PRODUCT_TIERS).optional(),
	basePrice: z.number().positive('Price must be positive'),
	compareAtPrice: z.number().positive().optional().nullable(),
	metaTitle: z.string().max(60).optional().nullable(),
	metaDescription: z.string().max(160).optional().nullable(),
	shortDescription: z.string().max(500).optional().nullable()
});
export const selectProductSchema = createSelectSchema(product);
export const updateProductSchema = createUpdateSchema(product, {
	name: z.string().min(1).max(255).optional(),
	tier: z.enum(PRODUCT_TIERS).optional(),
	basePrice: z.number().positive().optional(),
	compareAtPrice: z.number().positive().optional().nullable(),
	metaTitle: z.string().max(60).optional().nullable(),
	metaDescription: z.string().max(160).optional().nullable()
});

export const insertProductVariantSchema = createInsertSchema(productVariant, {
	sku: z.string().min(1).max(100),
	color: z.string().min(1).max(50),
	colorHex: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
		.optional()
		.nullable(),
	priceOverride: z.number().positive().optional().nullable(),
	weight: z.number().positive().optional().nullable(),
	sortOrder: z.number().int().min(0).optional()
});
export const selectProductVariantSchema = createSelectSchema(productVariant);
export const updateProductVariantSchema = createUpdateSchema(productVariant, {
	priceOverride: z.number().positive().optional().nullable(),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().min(0).optional()
});

export const insertProductImageSchema = createInsertSchema(productImage, {
	r2Key: r2KeySchema,
	altText: z.string().max(255).optional().nullable(),
	position: z.number().int().min(0).optional()
});
export const selectProductImageSchema = createSelectSchema(productImage);
export const updateProductImageSchema = createUpdateSchema(productImage, {
	altText: z.string().max(255).optional().nullable(),
	position: z.number().int().min(0).optional(),
	isPrimary: z.boolean().optional()
});

export const insertTagSchema = createInsertSchema(tag, {
	name: z.string().min(1).max(50),
	slug: z
		.string()
		.min(1)
		.max(50)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
});
export const selectTagSchema = createSelectSchema(tag);

export const insertProductTagSchema = createInsertSchema(productTag);
export const selectProductTagSchema = createSelectSchema(productTag);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;
export type ProductVariant = typeof productVariant.$inferSelect;
export type NewProductVariant = typeof productVariant.$inferInsert;
export type ProductImage = typeof productImage.$inferSelect;
export type NewProductImage = typeof productImage.$inferInsert;
export type Tag = typeof tag.$inferSelect;
