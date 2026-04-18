import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { createdAt } from '$lib/server/db/helpers';
import { user } from '$lib/server/modules/auth/auth.drizzle';
import { product } from '$lib/server/modules/catalog/product/product.drizzle';
import { productVariant } from '$lib/server/modules/catalog/product/product-variant.drizzle';

// ── Table ──────────────────────────────────────────────────────────────────

export const wishlistItem = sqliteTable(
	'wishlist_item',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),

		/**
		 * Optional — the customer may save a specific size/colour.
		 * Null = they want the product but haven't chosen a variant yet.
		 */
		variantId: text('variant_id').references(() => productVariant.id, {
			onDelete: 'set null'
		}),

		...createdAt
	},
	(table) => [
		index('wishlist_user_idx').on(table.userId),
		/** Prevent duplicate product entries per user in the wishlist. */
		unique('wishlist_user_product_uniq').on(table.userId, table.productId)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const wishlistItemRelations = relations(wishlistItem, ({ one }) => ({
	user: one(user, {
		fields: [wishlistItem.userId],
		references: [user.id]
	}),
	product: one(product, {
		fields: [wishlistItem.productId],
		references: [product.id]
	}),
	variant: one(productVariant, {
		fields: [wishlistItem.variantId],
		references: [productVariant.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertWishlistItemSchema = createInsertSchema(wishlistItem).omit({ id: true });
export const selectWishlistItemSchema = createSelectSchema(wishlistItem);

// ── Types ──────────────────────────────────────────────────────────────────

export type WishlistItem = z.infer<typeof selectWishlistItemSchema>;
export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
