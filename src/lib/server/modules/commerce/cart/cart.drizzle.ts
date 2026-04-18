import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';
import { user } from '$lib/server/modules/auth/auth.drizzle';
import { productVariant } from '$lib/server/modules/catalog/product/product-variant.drizzle';
import { coupon } from '$lib/server/modules/commerce/coupon/coupon.drizzle';

// ── cart ───────────────────────────────────────────────────────────────────

export const cart = sqliteTable(
	'cart',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		/**
		 * Null for guest shoppers.
		 * A logged-in user's cart is merged with their guest cart on sign-in.
		 */
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),

		/**
		 * Opaque token stored in a cookie for guest carts.
		 * Should be a cryptographically random value (e.g. nanoid(32)).
		 */
		sessionToken: text('session_token').unique(),

		/** Applied coupon — FK kept so the service can validate it is still active. */
		couponId: text('coupon_id').references(() => coupon.id, { onDelete: 'set null' }),

		/** Cached discount so the checkout page can display it without recalculation. */
		discountAmount: integer('discount_amount').default(0).notNull(),

		/**
		 * Carts older than this date can be purged by a scheduled cleanup job.
		 * Reset on every cart mutation.
		 */
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),

		...timestamps
	},
	(table) => [
		index('cart_user_idx').on(table.userId),
		index('cart_session_idx').on(table.sessionToken)
	]
);

// ── cart_item ──────────────────────────────────────────────────────────────

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

		quantity: integer('quantity').default(1).notNull(),

		/**
		 * Price in LKR cents at the moment the item was added.
		 * Displayed as-is; recalculated at checkout to catch any price changes.
		 */
		priceSnapshot: integer('price_snapshot').notNull(),

		...timestamps
	},
	(table) => [
		index('cart_item_cart_idx').on(table.cartId),
		index('cart_item_variant_idx').on(table.variantId)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const cartRelations = relations(cart, ({ one, many }) => ({
	user: one(user, {
		fields: [cart.userId],
		references: [user.id]
	}),
	coupon: one(coupon, {
		fields: [cart.couponId],
		references: [coupon.id]
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
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertCartSchema = createInsertSchema(cart).omit({ id: true, discountAmount: true });
export const selectCartSchema = createSelectSchema(cart);
export const updateCartSchema = createUpdateSchema(cart).omit({ id: true });

export const insertCartItemSchema = createInsertSchema(cartItem, {
	quantity: (s) => s.min(1).max(50)
}).omit({ id: true });

export const selectCartItemSchema = createSelectSchema(cartItem);
export const updateCartItemSchema = createUpdateSchema(cartItem).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type Cart = z.infer<typeof selectCartSchema>;
export type InsertCart = z.infer<typeof insertCartSchema>;
export type UpdateCart = z.infer<typeof updateCartSchema>;

export type CartItem = z.infer<typeof selectCartItemSchema>;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type UpdateCartItem = z.infer<typeof updateCartItemSchema>;
