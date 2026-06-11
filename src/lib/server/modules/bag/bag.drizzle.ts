import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, productVariant } from '../products/products.drizzle';
import { promoCode } from '../promotions/promotions.drizzle';

// ---------------------------------------------------------------------------
// BAG
//
// Supports authenticated users (userId set) and guests (sessionToken set).
// Ownership is exclusive: guest bags use sessionToken, authenticated bags use userId.
// On login, merge guest bag into user bag at the application layer:
//   1. Find guest bag by sessionToken.
//   2. Find or create user bag by userId.
//   3. Move items from guest bag to user bag (handle quantity conflicts).
//   4. Delete guest bag.
//
// expiresAt: null = persists indefinitely (authenticated users).
//            Set to NOW + 7 days for guest bags; clean up via a cron job.
// ---------------------------------------------------------------------------

export const bag = sqliteTable(
	'bag',
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
		// null = never expires (authenticated user bags)
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		checkoutStartedAt: integer('checkout_started_at', { mode: 'timestamp_ms' }),
		checkoutExpiresAt: integer('checkout_expires_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('bag_user_idx').on(table.userId),
		index('bag_session_idx').on(table.sessionToken),
		// Used by the cleanup cron to find and expire old guest bags
		index('bag_expires_idx').on(table.expiresAt),
		index('bag_checkout_expires_idx').on(table.checkoutExpiresAt),
		// Exactly one owner: user bag or guest bag, never both.
		check(
			'bag_has_one_owner',
			sql`(${table.userId} IS NOT NULL AND ${table.sessionToken} IS NULL) OR (${table.userId} IS NULL AND ${table.sessionToken} IS NOT NULL)`
		),
		check('bag_expiry_positive', sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > 0`),
		check(
			'bag_checkout_timestamps_paired',
			sql`(${table.checkoutStartedAt} IS NULL AND ${table.checkoutExpiresAt} IS NULL) OR (${table.checkoutStartedAt} IS NOT NULL AND ${table.checkoutExpiresAt} IS NOT NULL)`
		),
		check(
			'bag_checkout_expiry_after_start',
			sql`${table.checkoutExpiresAt} IS NULL OR ${table.checkoutExpiresAt} > ${table.checkoutStartedAt}`
		)
	]
);

// ---------------------------------------------------------------------------
// BAG ITEMS
//
// unitPrice is locked at the moment the item is added to the bag.
// If the product price changes the bag item price does NOT update automatically.
// Surfacing price-change warnings to the customer is handled at the application layer.
//
// The unique constraint on (bagId, variantId) prevents duplicate rows for the
// same variant in a bag. Without it, concurrent add-to-bag requests for the
// same item can race and create two rows, causing doubled totals and confusing
// quantity displays. On conflict, the application should UPDATE quantity instead
// of INSERT a new row (upsert pattern).
// ---------------------------------------------------------------------------

export const bagItem = sqliteTable(
	'bag_item',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		bagId: text('bag_id')
			.notNull()
			.references(() => bag.id, { onDelete: 'cascade' }),
		variantId: text('variant_id')
			.notNull()
			.references(() => productVariant.id, { onDelete: 'cascade' }),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		quantity: integer('quantity').default(1).notNull(),
		// Locked whole-LKR price at add-to-bag time. Recompute bag total from this.
		unitPrice: integer('unit_price').notNull(),
		addedAt: integer('added_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('bag_item_bag_idx').on(table.bagId),
		index('bag_item_variant_idx').on(table.variantId),
		index('bag_item_product_idx').on(table.productId),
		// FIX: prevents duplicate variant rows within the same bag.
		// Without this, concurrent add-to-bag requests for the same variant
		// can race past application-layer deduplication and create two rows.
		// Application code must use an upsert (INSERT ... ON CONFLICT DO UPDATE)
		// to increment quantity instead of inserting a new row.
		uniqueIndex('bag_item_bag_variant_idx').on(table.bagId, table.variantId),
		check('bag_item_quantity_range', sql`${table.quantity} BETWEEN 1 AND 10`),
		check('bag_item_unit_price_positive', sql`${table.unitPrice} > 0`)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const bagRelations = relations(bag, ({ one, many }) => ({
	user: one(user, {
		fields: [bag.userId],
		references: [user.id]
	}),
	promoCode: one(promoCode, {
		fields: [bag.promoCodeId],
		references: [promoCode.id]
	}),
	items: many(bagItem)
}));

export const bagItemRelations = relations(bagItem, ({ one }) => ({
	bag: one(bag, {
		fields: [bagItem.bagId],
		references: [bag.id]
	}),
	variant: one(productVariant, {
		fields: [bagItem.variantId],
		references: [productVariant.id]
	}),
	product: one(product, {
		fields: [bagItem.productId],
		references: [product.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1).max(255);
const timestampMsSchema = z.number().int().positive();

function validateBagOwner(
	data: { userId?: string | null; sessionToken?: string | null },
	ctx: z.RefinementCtx
) {
	const ownerCount = Number(Boolean(data.userId)) + Number(Boolean(data.sessionToken));
	if (ownerCount !== 1) {
		ctx.addIssue({
			code: 'custom',
			message: 'Bag requires exactly one of userId or sessionToken',
			path: ['sessionToken']
		});
	}
}

export const insertBagBaseSchema = createInsertSchema(bag, {
	userId: idSchema.optional().nullable(),
	sessionToken: z.string().min(1).max(255).optional().nullable(),
	promoCodeId: idSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable(),
	checkoutStartedAt: timestampMsSchema.optional().nullable(),
	checkoutExpiresAt: timestampMsSchema.optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const insertBagSchema = insertBagBaseSchema.superRefine(validateBagOwner);
export const selectBagSchema = createSelectSchema(bag);
export const updateBagSchema = createUpdateSchema(bag, {
	promoCodeId: idSchema.optional().nullable(),
	expiresAt: timestampMsSchema.optional().nullable(),
	checkoutStartedAt: timestampMsSchema.optional().nullable(),
	checkoutExpiresAt: timestampMsSchema.optional().nullable()
}).omit({
	id: true,
	userId: true,
	sessionToken: true,
	createdAt: true,
	updatedAt: true
});

export const insertBagItemSchema = createInsertSchema(bagItem, {
	bagId: idSchema,
	variantId: idSchema,
	productId: idSchema,
	quantity: z.number().int().min(1).max(10),
	unitPrice: z.number().int().positive()
}).omit({
	id: true,
	addedAt: true,
	updatedAt: true
});
export const selectBagItemSchema = createSelectSchema(bagItem);
export const updateBagItemSchema = createUpdateSchema(bagItem, {
	quantity: z.number().int().min(1).max(10).optional()
}).omit({
	id: true,
	bagId: true,
	variantId: true,
	productId: true,
	unitPrice: true,
	addedAt: true,
	updatedAt: true
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Bag = typeof bag.$inferSelect;
export type NewBag = typeof bag.$inferInsert;
export type InsertBag = z.infer<typeof insertBagSchema>;
export type SelectBag = z.infer<typeof selectBagSchema>;
export type UpdateBag = z.infer<typeof updateBagSchema>;
export type BagItem = typeof bagItem.$inferSelect;
export type NewBagItem = typeof bagItem.$inferInsert;
export type InsertBagItem = z.infer<typeof insertBagItemSchema>;
export type SelectBagItem = z.infer<typeof selectBagItemSchema>;
export type UpdateBagItem = z.infer<typeof updateBagItemSchema>;
