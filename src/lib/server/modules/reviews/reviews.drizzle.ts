import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product } from '../products/products.drizzle';
import { order } from '../orders/orders.drizzle';

// ---------------------------------------------------------------------------
// REVIEWS
//
// Admin-moderated: isApproved = false by default.
// Run an approval step before surfacing reviews publicly.
// isVerifiedPurchase = true only when orderId is set and the order contains
// the reviewed product — verify this in the application layer before inserting.
// ---------------------------------------------------------------------------

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
		orderId: text('order_id').references(() => order.id, {
			onDelete: 'set null'
		}),
		rating: integer('rating').notNull(), // 1–5 (enforced via zod)
		title: text('title'),
		body: text('body'),
		isVerifiedPurchase: integer('is_verified_purchase', { mode: 'boolean' })
			.default(false)
			.notNull(),
		// Requires admin approval before public display
		isApproved: integer('is_approved', { mode: 'boolean' }).default(false).notNull(),
		adminNote: text('admin_note'), // moderation note
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('review_product_idx').on(table.productId),
		index('review_user_idx').on(table.userId),
		// Listing: only approved reviews, newest first
		index('review_product_approved_idx').on(table.productId, table.isApproved, table.createdAt),
		// Admin moderation queue
		index('review_pending_idx').on(table.isApproved, table.createdAt),
		// One review per user per product
		uniqueIndex('review_product_user_idx').on(table.productId, table.userId),
		// Enforce star rating bounds at DB level (Zod enforces this on the way in,
		// but CHECK catches direct SQL writes and migration seeds too)
		check('rating_range', sql`${table.rating} BETWEEN 1 AND 5`)
	]
);

// ---------------------------------------------------------------------------
// REVIEW MEDIA  (photos / videos attached to reviews)
//
// r2Key stores the Cloudflare R2 object key — NOT a URL.
// Build via: buildMediaKey({ scope: 'reviews', entityId: reviewId, variant: 'photo-1', contentType })
// Resolve to URL via: mediaUrl(r2Key) from media/utils.ts
// Supports both images and videos (video/mp4, video/webm) per r2.ts ALLOWED_VIDEO_TYPES.
// ---------------------------------------------------------------------------

export const reviewMedia = sqliteTable(
	'review_media',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		reviewId: text('review_id')
			.notNull()
			.references(() => review.id, { onDelete: 'cascade' }),
		r2Key: text('r2_key').notNull(), // R2 object key — use mediaUrl(r2Key) to serve
		type: text('type', { enum: ['image', 'video'] })
			.default('image')
			.notNull(),
		position: integer('position').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('review_media_review_idx').on(table.reviewId),
		index('review_media_position_idx').on(table.reviewId, table.position)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const reviewRelations = relations(review, ({ one, many }) => ({
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
	}),
	media: many(reviewMedia)
}));

export const reviewMediaRelations = relations(reviewMedia, ({ one }) => ({
	review: one(review, {
		fields: [reviewMedia.reviewId],
		references: [review.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

const r2KeySchema = z
	.string()
	.min(1)
	.max(512)
	.regex(/^[a-zA-Z0-9_\-./]+$/, 'Invalid R2 key format');

export const insertReviewSchema = createInsertSchema(review, {
	rating: z.number().int().min(1).max(5),
	title: z.string().min(1).max(150).optional().nullable(),
	body: z.string().min(10).max(2000).optional().nullable(),
	adminNote: z.string().max(500).optional().nullable()
});
export const selectReviewSchema = createSelectSchema(review);
export const updateReviewSchema = createUpdateSchema(review, {
	isApproved: z.boolean().optional(),
	adminNote: z.string().max(500).optional().nullable(),
	title: z.string().min(1).max(150).optional().nullable(),
	body: z.string().min(10).max(2000).optional().nullable()
});

export const insertReviewMediaSchema = createInsertSchema(reviewMedia, {
	r2Key: r2KeySchema,
	type: z.enum(['image', 'video']).optional(),
	position: z.number().int().min(0).optional()
});
export const selectReviewMediaSchema = createSelectSchema(reviewMedia);
export const updateReviewMediaSchema = createUpdateSchema(reviewMedia, {
	position: z.number().int().min(0).optional()
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Review = typeof review.$inferSelect;
export type NewReview = typeof review.$inferInsert;
export type ReviewMedia = typeof reviewMedia.$inferSelect;
export type NewReviewMedia = typeof reviewMedia.$inferInsert;
