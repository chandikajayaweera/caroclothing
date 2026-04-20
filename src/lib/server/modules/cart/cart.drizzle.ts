import { relations, sql } from 'drizzle-orm';
import {
	sqliteTable,
	text,
	integer,
	real,
	index,
	uniqueIndex,
	check
} from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, productVariant } from '../products/products.drizzle';
import { promoCode } from '../promotions/promotions.drizzle';

// ---------------------------------------------------------------------------
// CART
//
// Supports authenticated users (userId set) and guests (sessionToken set).
// On login, merge guest cart into user cart at the application layer:
//   1. Find guest cart by sessionToken.
//   2. Find or create user cart by userId.
//   3. Move items from guest cart to user cart (handle quantity conflicts).
//   4. Delete guest cart.
//
// expiresAt: null = persists indefinitely (authenticated users).
//            Set to NOW + 7 days for guest carts; clean up via a cron job.
// ---------------------------------------------------------------------------

export const cart = sqliteTable(
	'cart',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		// Used for guest session identification. Populated from a secure httpOnly cookie.
		sessionToken: text('session_token').unique(),
		promoCodeId: text('promo_code_id').references(() => promoCode.id, {
			onDelete: 'set null'
		}),
		// Pre-computed discount applied to the cart total
		discountAmount: real('discount_amount').default(0).notNull(),
		// null = never expires (authenticated user carts)
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
		index('cart_user_idx').on(table.userId),
		index('cart_session_idx').on(table.sessionToken),
		// Used by the cleanup cron to find and expire old guest carts
		index('cart_expires_idx').on(table.expiresAt),
		// Every cart must be claimable: at least one of userId or sessionToken must be set
		check('cart_has_owner', sql`${table.userId} IS NOT NULL OR ${table.sessionToken} IS NOT NULL`)
	]
);

// ---------------------------------------------------------------------------
// CART ITEMS
//
// unitPrice is locked at the moment the item is added to the cart.
// If the product price changes the cart item price does NOT update automatically.
// Surfacing price-change warnings to the customer is handled at the application layer.
//
// The unique constraint on (cartId, variantId) prevents duplicate rows for the
// same variant in a cart. Without it, concurrent add-to-cart requests for the
// same item can race and create two rows, causing doubled totals and confusing
// quantity displays. On conflict, the application should UPDATE quantity instead
// of INSERT a new row (upsert pattern).
// ---------------------------------------------------------------------------

export const cartItem = sqliteTable(
	'cart_item',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		cartId: text('cart_id')
			.notNull()
			.references(() => cart.id, { onDelete: 'cascade' }),
		variantId: text('variant_id')
			.notNull()
			.references(() => productVariant.id, { onDelete: 'cascade' }),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		quantity: integer('quantity').default(1).notNull(),
		// Locked price at add-to-cart time. Recompute cart total from this, not the live price.
		unitPrice: real('unit_price').notNull(),
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('cart_item_cart_idx').on(table.cartId),
		index('cart_item_variant_idx').on(table.variantId),
		// FIX: prevents duplicate variant rows within the same cart.
		// Without this, concurrent add-to-cart requests for the same variant
		// can race past application-layer deduplication and create two rows.
		// Application code must use an upsert (INSERT ... ON CONFLICT DO UPDATE)
		// to increment quantity instead of inserting a new row.
		uniqueIndex('cart_item_cart_variant_idx').on(table.cartId, table.variantId)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const cartRelations = relations(cart, ({ one, many }) => ({
	user: one(user, {
		fields: [cart.userId],
		references: [user.id]
	}),
	promoCode: one(promoCode, {
		fields: [cart.promoCodeId],
		references: [promoCode.id]
	}),
	items: many(cartItem)
}));

export const cartItemRelations = relations(cartItem, ({ one }) => ({
	cart: one(cart, {
		fields: [cartItem.cartId],
		references: [cart.id]
	}),
	variant: one(productVariant, {
		fields: [cartItem.variantId],
		references: [productVariant.id]
	}),
	product: one(product, {
		fields: [cartItem.productId],
		references: [product.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

export const insertCartSchema = createInsertSchema(cart, {
	sessionToken: z.string().min(1).max(255).optional().nullable(),
	discountAmount: z.number().min(0).optional()
});
export const selectCartSchema = createSelectSchema(cart);
export const updateCartSchema = createUpdateSchema(cart, {
	promoCodeId: z.string().optional().nullable(),
	discountAmount: z.number().min(0).optional()
});

export const insertCartItemSchema = createInsertSchema(cartItem, {
	quantity: z.number().int().min(1).max(10),
	unitPrice: z.number().positive()
});
export const selectCartItemSchema = createSelectSchema(cartItem);
export const updateCartItemSchema = createUpdateSchema(cartItem, {
	quantity: z.number().int().min(1).max(10)
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Cart = typeof cart.$inferSelect;
export type NewCart = typeof cart.$inferInsert;
export type CartItem = typeof cartItem.$inferSelect;
export type NewCartItem = typeof cartItem.$inferInsert;
