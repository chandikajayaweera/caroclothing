import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';
import { category } from '../category/category.drizzle';

// ── Constants ──────────────────────────────────────────────────────────────

export const PRODUCT_STATUS = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

// ── Table ──────────────────────────────────────────────────────────────────

export const product = sqliteTable(
	'product',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),

		/** Full rich-text / HTML description shown on the product page. */
		description: text('description'),

		/** Plain-text summary used in cards, search results, and OG tags. */
		shortDescription: text('short_description'),

		categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),

		/**
		 * Base price in LKR cents (1 LKR = 100 cents).
		 * Individual variants may override this via priceOverride.
		 */
		basePrice: integer('base_price').notNull(),

		/**
		 * Original / crossed-out price used to show a sale.
		 * Null = not on sale.
		 */
		compareAtPrice: integer('compare_at_price'),

		status: text('status', { enum: PRODUCT_STATUS }).default('draft').notNull(),

		isFeatured: integer('is_featured', { mode: 'boolean' }).default(false).notNull(),

		/**
		 * JSON array of tag strings, e.g. ["graphic", "oversized", "summer"].
		 * Kept denormalised for simplicity; can be migrated to a join table later.
		 */
		tags: text('tags'),

		// ── SEO ────────────────────────────────────────────────────────────
		metaTitle: text('meta_title'),
		metaDescription: text('meta_description'),
		metaKeywords: text('meta_keywords'),
		canonicalUrl: text('canonical_url'),

		// ── Open Graph ────────────────────────────────────────────────────
		ogTitle: text('og_title'),
		ogDescription: text('og_description'),
		/** R2 key for the OG share image (ideally 1200×630). */
		ogImageR2Key: text('og_image_r2_key'),

		...timestamps
	},
	(table) => [
		index('product_category_idx').on(table.categoryId),
		index('product_status_idx').on(table.status),
		index('product_featured_idx').on(table.isFeatured)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────
// Only the non-circular one-side is defined here.
// The many-sides (variants, images, reviews) are defined in db/relations.ts
// to avoid circular imports.

export const productRelations = relations(product, ({ one }) => ({
	category: one(category, {
		fields: [product.categoryId],
		references: [category.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertProductSchema = createInsertSchema(product, {
	slug: (s) => s.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a valid slug'),
	basePrice: (s) => s.min(1, 'Price must be greater than 0'),
	tags: (s) => s.optional()
}).omit({ id: true });

export const selectProductSchema = createSelectSchema(product);
export const updateProductSchema = createUpdateSchema(product).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type Product = z.infer<typeof selectProductSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;
