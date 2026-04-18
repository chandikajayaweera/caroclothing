import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { createdAt } from '$lib/server/db/helpers';
import { product } from './product.drizzle';
import { productVariant } from './product-variant.drizzle';

// ── Table ──────────────────────────────────────────────────────────────────

export const productImage = sqliteTable(
	'product_image',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),

		/**
		 * When set, this image is shown only when the customer selects
		 * this variant (e.g. colour-specific photos).
		 * Null → shown for all variants.
		 */
		variantId: text('variant_id').references(() => productVariant.id, { onDelete: 'set null' }),

		/** Cloudflare R2 object key (e.g. "products/abc123/front.webp"). */
		r2Key: text('r2_key').notNull(),

		/** Alt text for accessibility and SEO. */
		alt: text('alt'),

		/** Original image dimensions stored to avoid layout shifts on the frontend. */
		width: integer('width'),
		height: integer('height'),

		/** Lower number = shown first. The primary image should have sortOrder = 0. */
		sortOrder: integer('sort_order').default(0).notNull(),

		/** Exactly one image per product should have isPrimary = true. */
		isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),

		...createdAt
	},
	(table) => [
		index('product_image_product_idx').on(table.productId),
		index('product_image_variant_idx').on(table.variantId)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────

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

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertProductImageSchema = createInsertSchema(productImage, {
	r2Key: (s) => s.min(1),
	sortOrder: (s) => s.min(0),
	width: (s) => s.min(1).optional(),
	height: (s) => s.min(1).optional()
}).omit({ id: true });

export const selectProductImageSchema = createSelectSchema(productImage);
export const updateProductImageSchema = createUpdateSchema(productImage).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type ProductImage = z.infer<typeof selectProductImageSchema>;
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;
export type UpdateProductImage = z.infer<typeof updateProductImageSchema>;
