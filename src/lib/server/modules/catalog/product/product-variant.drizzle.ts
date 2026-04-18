import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';
import { product } from './product.drizzle';

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Standard clothing sizes.
 * `one_size` covers accessories or free-size items added in the future.
 */
export const PRODUCT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'one_size'] as const;
export type ProductSize = (typeof PRODUCT_SIZES)[number];

// ── Table ──────────────────────────────────────────────────────────────────

export const productVariant = sqliteTable(
	'product_variant',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),

		/** Stock-keeping unit — must be unique across the entire catalogue. */
		sku: text('sku').notNull().unique(),

		size: text('size', { enum: PRODUCT_SIZES }),

		/** Human-readable colour name shown to the customer (e.g. "Midnight Black"). */
		color: text('color'),

		/** Hex code for colour swatches (#RRGGBB). */
		colorHex: text('color_hex'),

		/**
		 * Per-variant price in LKR cents.
		 * Null → fall back to product.basePrice.
		 */
		priceOverride: integer('price_override'),

		/** Per-variant compare-at price. Null → fall back to product.compareAtPrice. */
		compareAtPriceOverride: integer('compare_at_price_override'),

		/** Units currently available. Decremented on order placement. */
		stock: integer('stock').default(0).notNull(),

		/** Notify admin when stock falls at or below this number. */
		lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),

		/** Shipping weight in grams. Used by the delivery service for rate calculation. */
		weightGrams: integer('weight_grams'),

		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),

		/** Ordering within a product's variant list. */
		sortOrder: integer('sort_order').default(0).notNull(),

		...timestamps
	},
	(table) => [
		index('variant_product_idx').on(table.productId),
		index('variant_sku_idx').on(table.sku),
		/** Prevent duplicate size+colour combos on the same product. */
		unique('variant_product_size_color_uniq').on(table.productId, table.size, table.color)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────
// The many-side (images) is defined in db/relations.ts to avoid circular imports.

export const productVariantRelations = relations(productVariant, ({ one }) => ({
	product: one(product, {
		fields: [productVariant.productId],
		references: [product.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertProductVariantSchema = createInsertSchema(productVariant, {
	sku: (s) => s.min(1).max(100),
	stock: (s) => s.min(0),
	lowStockThreshold: (s) => s.min(0),
	weightGrams: (s) => s.min(1).optional(),
	colorHex: (s) => s.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour').optional()
}).omit({ id: true });

export const selectProductVariantSchema = createSelectSchema(productVariant);
export const updateProductVariantSchema = createUpdateSchema(productVariant).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type ProductVariant = z.infer<typeof selectProductVariantSchema>;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type UpdateProductVariant = z.infer<typeof updateProductVariantSchema>;
