import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, r2KeySchema } from '../products/products.drizzle';
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
		check('rating_range', sql`${table.rating} BETWEEN 1 AND 5`),
		check(
			'review_verified_requires_order',
			sql`${table.isVerifiedPurchase} = 0 OR ${table.orderId} IS NOT NULL`
		)
	]
);

// ---------------------------------------------------------------------------
// REVIEW MEDIA  (still images attached to reviews)
//
// r2Key stores the Cloudflare R2 object key — NOT a URL.
// Build via: buildMediaKey({ scope: 'reviews', entityId: reviewId, variant: 'photo-1', contentType })
// Resolve originals via mediaOriginalUrl(r2Key) or display presets via mediaPresetUrl().
// Videos are intentionally out of scope for this image pipeline.
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
		r2Key: text('r2_key').notNull(), // R2 object key, not a URL
		type: text('type', { enum: ['image'] })
			.default('image')
			.notNull(),
		mimeType: text('mime_type'),
		byteSize: integer('byte_size'),
		originalFilename: text('original_filename'),
		width: integer('width'),
		height: integer('height'),
		position: integer('position').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('review_media_review_idx').on(table.reviewId),
		index('review_media_position_idx').on(table.reviewId, table.position),
		check('review_media_position_nonnegative', sql`${table.position} >= 0`)
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

const idSchema = z.string().min(1).max(255);

export const insertReviewSchema = createInsertSchema(review, {
	productId: idSchema,
	userId: idSchema,
	orderId: idSchema.optional().nullable(),
	rating: z.number().int().min(1).max(5),
	title: z.string().min(1).max(150).optional().nullable(),
	body: z.string().min(10).max(2000).optional().nullable(),
	isVerifiedPurchase: z.boolean().optional()
}).omit({
	id: true,
	isApproved: true,
	adminNote: true,
	createdAt: true,
	updatedAt: true
});
export const selectReviewSchema = createSelectSchema(review);
export const updateReviewSchema = createUpdateSchema(review, {
	isApproved: z.boolean().optional(),
	adminNote: z.string().max(500).optional().nullable(),
	title: z.string().min(1).max(150).optional().nullable(),
	body: z.string().min(10).max(2000).optional().nullable()
}).omit({
	id: true,
	productId: true,
	userId: true,
	orderId: true,
	rating: true,
	isVerifiedPurchase: true,
	createdAt: true,
	updatedAt: true
});

export const insertReviewMediaSchema = createInsertSchema(reviewMedia, {
	reviewId: idSchema,
	r2Key: r2KeySchema,
	type: z.literal('image').optional(),
	mimeType: z.string().max(100).optional().nullable(),
	byteSize: z.number().int().nonnegative().optional().nullable(),
	originalFilename: z.string().max(255).optional().nullable(),
	width: z.number().int().positive().optional().nullable(),
	height: z.number().int().positive().optional().nullable(),
	position: z.number().int().min(0).optional()
}).omit({
	id: true,
	createdAt: true
});
export const selectReviewMediaSchema = createSelectSchema(reviewMedia);
export const updateReviewMediaSchema = createUpdateSchema(reviewMedia, {
	position: z.number().int().min(0).optional()
}).omit({
	id: true,
	reviewId: true,
	r2Key: true,
	type: true,
	createdAt: true
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Review = typeof review.$inferSelect;
export type NewReview = typeof review.$inferInsert;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type SelectReview = z.infer<typeof selectReviewSchema>;
export type UpdateReview = z.infer<typeof updateReviewSchema>;
export type ReviewMedia = typeof reviewMedia.$inferSelect;
export type NewReviewMedia = typeof reviewMedia.$inferInsert;
export type InsertReviewMedia = z.infer<typeof insertReviewMediaSchema>;
export type SelectReviewMedia = z.infer<typeof selectReviewMediaSchema>;
export type UpdateReviewMedia = z.infer<typeof updateReviewMediaSchema>;
