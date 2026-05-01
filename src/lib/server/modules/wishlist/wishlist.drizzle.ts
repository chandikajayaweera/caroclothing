import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, productVariant } from '../products/products.drizzle';

// ---------------------------------------------------------------------------
// WISHLIST ITEMS
//
// Users can save a product with or without a specific variant (size/colour).
//
// SQLite NULL uniqueness behaviour requires partial unique indexes:
//   - one row per selected variant
//   - one row per product when variantId is NULL
//
// variantId is nullable and has a real FK to productVariant. This keeps
// referential integrity while still supporting "no variant selected yet".
// ---------------------------------------------------------------------------

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
		variantId: text('variant_id').references(() => productVariant.id, { onDelete: 'set null' }),
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('wishlist_user_idx').on(table.userId),
		uniqueIndex('wishlist_user_product_variant_idx')
			.on(table.userId, table.productId, table.variantId)
			.where(sql`${table.variantId} IS NOT NULL`),
		uniqueIndex('wishlist_user_product_no_variant_idx')
			.on(table.userId, table.productId)
			.where(sql`${table.variantId} IS NULL`),
		index('wishlist_product_idx').on(table.productId)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
//
// variantId null → show product without selected size/color.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1).max(255);

export const insertWishlistItemSchema = createInsertSchema(wishlistItem, {
	userId: idSchema,
	productId: idSchema,
	variantId: idSchema.optional().nullable()
}).omit({
	id: true,
	addedAt: true
});
export const selectWishlistItemSchema = createSelectSchema(wishlistItem);
export const updateWishlistItemSchema = createUpdateSchema(wishlistItem, {
	variantId: idSchema.optional().nullable()
}).omit({
	id: true,
	userId: true,
	productId: true,
	addedAt: true
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type WishlistItem = typeof wishlistItem.$inferSelect;
export type NewWishlistItem = typeof wishlistItem.$inferInsert;
export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
export type SelectWishlistItem = z.infer<typeof selectWishlistItemSchema>;
export type UpdateWishlistItem = z.infer<typeof updateWishlistItemSchema>;
