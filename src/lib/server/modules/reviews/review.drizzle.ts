import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';
import { user } from '$lib/server/modules/auth/auth.drizzle';
import { product } from '$lib/server/modules/catalog/product/product.drizzle';
import { order } from '$lib/server/modules/commerce/order/order.drizzle';

// ── Constants ──────────────────────────────────────────────────────────────

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ── Table ──────────────────────────────────────────────────────────────────

export const review = sqliteTable(
	'review',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),

		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		/**
		 * Links the review to a specific order for verified-purchase badging.
		 * Null = unverified review (e.g. manually submitted via admin).
		 */
		orderId: text('order_id').references(() => order.id, { onDelete: 'set null' }),

		/** Star rating 1–5. */
		rating: integer('rating').notNull(),

		title: text('title'),
		body: text('body'),

		/**
		 * Moderation gate — only 'approved' reviews are shown on the storefront.
		 * New reviews start as 'pending'.
		 */
		status: text('status', { enum: REVIEW_STATUSES }).default('pending').notNull(),

		/** True when the reviewer has a confirmed delivered order for this product. */
		isVerifiedPurchase: integer('is_verified_purchase', { mode: 'boolean' })
			.default(false)
			.notNull(),

		/**
		 * Count of "helpful" upvotes.
		 * Incremented by a separate action; never decremented to avoid gaming.
		 */
		helpfulCount: integer('helpful_count').default(0).notNull(),

		...timestamps
	},
	(table) => [
		index('review_product_idx').on(table.productId),
		index('review_user_idx').on(table.userId),
		index('review_status_idx').on(table.status)
	]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const reviewRelations = relations(review, ({ one }) => ({
	product: one(product, {
		fields: [review.productId],
		references: [product.id]
	}),
	user: one(user, {
		fields: [review.userId],
		references: [user.id]
	}),
	order: one(order, {
		fields: [review.orderId],
		references: [order.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertReviewSchema = createInsertSchema(review, {
	rating: (s) => s.min(1).max(5),
	title: (s) => s.max(120).optional(),
	body: (s) => s.max(2000).optional()
}).omit({ id: true, helpfulCount: true, isVerifiedPurchase: true });

export const selectReviewSchema = createSelectSchema(review);

export const updateReviewSchema = createUpdateSchema(review).omit({
	id: true,
	userId: true,
	productId: true,
	helpfulCount: true
});

// ── Types ──────────────────────────────────────────────────────────────────

export type Review = z.infer<typeof selectReviewSchema>;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type UpdateReview = z.infer<typeof updateReviewSchema>;
