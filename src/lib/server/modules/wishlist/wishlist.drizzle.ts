import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, productVariant } from '../products/products.drizzle';

// ---------------------------------------------------------------------------
// WISHLIST ITEMS
//
// Users can save a product with or without a specific variant (size/colour).
//
// IMPORTANT — SQLite NULL uniqueness behaviour:
// SQLite treats each NULL as distinct in UNIQUE constraints, so
// UNIQUE(userId, productId, variantId) with variantId = NULL would allow
// multiple "no-variant" wishlist entries for the same product per user.
//
// Fix: use the sentinel value '' (empty string) for "no specific variant"
// instead of NULL. variantId is NOT NULL; '' means "any size / not chosen yet".
// On insert, set variantId = '' when the user hasn't picked a variant.
// When looking up the live variant, treat '' as "no variant selected".
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
		// '' = no specific variant selected; any other value = a valid variantId.
		// Cannot use a FK here because '' is not a valid productVariant.id.
		// The application layer validates that non-empty values reference a real variant.
		variantId: text('variant_id').notNull().default(''),
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('wishlist_user_idx').on(table.userId),
		// Now safe: '' is a concrete value, not NULL — duplicates are prevented correctly
		uniqueIndex('wishlist_user_product_variant_idx').on(
			table.userId,
			table.productId,
			table.variantId
		),
		index('wishlist_product_idx').on(table.productId)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
//
// variantId cannot have a FK relation because '' is not a valid DB reference.
// Resolve the variant at the application layer:
//   variantId === '' → show product without variant selection
//   variantId !== '' → fetch productVariant by id
// ---------------------------------------------------------------------------

export const wishlistItemRelations = relations(wishlistItem, ({ one }) => ({
	user: one(user, {
		fields: [wishlistItem.userId],
		references: [user.id]
	}),
	product: one(product, {
		fields: [wishlistItem.productId],
		references: [product.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

// nanoid alphabet — used to validate non-sentinel variantId values
const NANOID_RE = /^[A-Za-z0-9_-]{21}$/;

export const insertWishlistItemSchema = createInsertSchema(wishlistItem, {
	// '' = no specific variant; any non-empty value must be a valid nanoid.
	// The application layer is still responsible for confirming the variant exists
	// and belongs to the correct product, but this catches obvious garbage values
	// (typos, UUIDs, empty-ish strings) before they reach the database.
	variantId: z
		.string()
		.refine((v) => v === '' || NANOID_RE.test(v), {
			message: "variantId must be '' (no variant) or a valid 21-character nanoid"
		})
		.optional()
});
export const selectWishlistItemSchema = createSelectSchema(wishlistItem);

// ---------------------------------------------------------------------------
// MIGRATION NOTE — alternative uniqueness approach (avoids the sentinel)
//
// If you migrate away from the sentinel, replace the Drizzle uniqueIndex with
// two raw partial indexes in your migration file:
//
//   CREATE UNIQUE INDEX wishlist_user_product_variant_idx
//     ON wishlist_item(user_id, product_id, variant_id)
//     WHERE variant_id IS NOT NULL;
//
//   CREATE UNIQUE INDEX wishlist_user_product_no_variant_idx
//     ON wishlist_item(user_id, product_id)
//     WHERE variant_id IS NULL;
//
// This lets variant_id be a proper nullable FK to product_variant(id) while
// still preventing duplicate (user, product, no-variant) rows.
// Drizzle does not yet support partial indexes in schema definitions,
// so these must live in raw migration SQL.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type WishlistItem = typeof wishlistItem.$inferSelect;
export type NewWishlistItem = typeof wishlistItem.$inferInsert;
