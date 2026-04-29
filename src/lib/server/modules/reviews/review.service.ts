import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode, ReviewError } from '$lib/server/modules/errors';
import { deleteObjectSafe } from '$lib/server/modules/media/r2';
import { order, orderItem } from '$lib/server/modules/orders/orders.drizzle';
import { product } from '$lib/server/modules/products/products.drizzle';
import {
	insertReviewSchema,
	review,
	reviewMedia,
	type Review,
	type ReviewMedia
} from './reviews.drizzle';
import {
	assertNonEmptyUpdate,
	assertReviewPermission,
	conflict,
	isAdmin,
	normalizeLimit,
	normalizeOffset,
	parseReviewInput,
	reviewNotEligible,
	reviewNotFound,
	wrapReviewPersistenceError,
	type ReviewServiceActor
} from './service-utils';

const createReviewInputSchema = insertReviewSchema
	.omit({
		id: true,
		isVerifiedPurchase: true,
		isApproved: true,
		adminNote: true,
		createdAt: true,
		updatedAt: true
	})
	.extend({
		userId: z.string().min(1).optional()
	});

const updateReviewInputSchema = z.object({
	rating: z.number().int().min(1).max(5).optional(),
	title: z.string().min(1).max(150).optional().nullable(),
	body: z.string().min(10).max(2000).optional().nullable(),
	orderId: z.string().min(1).optional().nullable(),
	isApproved: z.boolean().optional(),
	adminNote: z.string().max(500).optional().nullable()
});

const moderationInputSchema = z.object({
	adminNote: z.string().max(500).optional().nullable()
});

export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewInputSchema>;
export type ModerationInput = z.infer<typeof moderationInputSchema>;

export type ReviewMutationOptions = {
	actor: ReviewServiceActor;
};

export type DeleteReviewOptions = ReviewMutationOptions & {
	bucket?: R2Bucket | null;
};

export type ListReviewsOptions = {
	actor?: ReviewServiceActor | null;
	productId?: string;
	userId?: string;
	rating?: number;
	approvedOnly?: boolean;
	includeUnapproved?: boolean;
	verifiedOnly?: boolean;
	limit?: number;
	offset?: number;
};

export type ReviewDetails = Review & {
	media: ReviewMedia[];
};

export type ProductReviewSummary = {
	productId: string;
	reviewCount: number;
	averageRating: number;
	ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
};

export async function listReviews(options: ListReviewsOptions = {}): Promise<Review[]> {
	if (options.includeUnapproved) assertReviewPermission(options.actor, 'review', 'read');

	const filters = buildReviewFilters(options);

	return getDb()
		.select()
		.from(review)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(review.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function listPendingReviews(
	options: ReviewMutationOptions & { limit?: number; offset?: number }
): Promise<Review[]> {
	assertReviewPermission(options.actor, 'review', 'read');

	return getDb()
		.select()
		.from(review)
		.where(eq(review.isApproved, false))
		.orderBy(asc(review.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getReviewById(
	id: string,
	options: { actor?: ReviewServiceActor | null } = {}
): Promise<Review> {
	const [row] = await getDb().select().from(review).where(eq(review.id, id)).limit(1);
	if (!row) reviewNotFound({ id });

	assertCanReadReview(row, options.actor);
	return row;
}

export async function getReviewDetailsById(
	id: string,
	options: { actor?: ReviewServiceActor | null } = {}
): Promise<ReviewDetails> {
	const targetReview = await getReviewById(id, options);
	const media = await getDb()
		.select()
		.from(reviewMedia)
		.where(eq(reviewMedia.reviewId, targetReview.id))
		.orderBy(asc(reviewMedia.position), asc(reviewMedia.createdAt));

	return {
		...targetReview,
		media
	};
}

export async function createReview(
	input: CreateReviewInput,
	options: ReviewMutationOptions
): Promise<Review> {
	assertReviewPermission(options.actor, 'review', 'create');

	const parsed = parseReviewInput(createReviewInputSchema, input, 'review');
	const userId = resolveReviewUserId(parsed.userId, options.actor);

	await assertProductExists(parsed.productId);
	const isVerifiedPurchase = parsed.orderId
		? await verifyReviewPurchase(parsed.productId, userId, parsed.orderId)
		: false;

	try {
		const [created] = await getDb()
			.insert(review)
			.values({
				...parsed,
				userId,
				isVerifiedPurchase,
				isApproved: false,
				adminNote: null
			})
			.returning();

		return created;
	} catch (error) {
		wrapReviewPersistenceError(error, 'You have already reviewed this product.');
	}
}

export async function updateReview(
	id: string,
	input: UpdateReviewInput,
	options: ReviewMutationOptions
): Promise<Review> {
	const existing = await getReviewById(id, { actor: options.actor });
	assertCanMutateReview(existing, options.actor, 'update');

	const parsed = parseReviewInput(updateReviewInputSchema, input, 'review');
	assertNonEmptyUpdate(parsed, 'review');

	const adminPatch = isAdmin(options.actor)
		? {
				isApproved: parsed.isApproved,
				adminNote: parsed.adminNote
			}
		: {};
	const contentPatch = {
		rating: parsed.rating,
		title: parsed.title,
		body: parsed.body,
		orderId: parsed.orderId
	};
	const nextOrderId = parsed.orderId === undefined ? existing.orderId : parsed.orderId;
	const isVerifiedPurchase = nextOrderId
		? await verifyReviewPurchase(existing.productId, existing.userId, nextOrderId)
		: false;
	const shouldResetApproval =
		!isAdmin(options.actor) &&
		(parsed.rating !== undefined ||
			parsed.title !== undefined ||
			parsed.body !== undefined ||
			parsed.orderId !== undefined);

	const [updated] = await getDb()
		.update(review)
		.set({
			...contentPatch,
			...adminPatch,
			isVerifiedPurchase,
			isApproved: shouldResetApproval ? false : adminPatch.isApproved
		})
		.where(eq(review.id, id))
		.returning();

	if (!updated) reviewNotFound({ id });
	return updated;
}

export async function approveReview(
	id: string,
	input: ModerationInput = {},
	options: ReviewMutationOptions
): Promise<Review> {
	assertReviewPermission(options.actor, 'review', 'update');

	const parsed = parseReviewInput(moderationInputSchema, input, 'review moderation');
	return updateReview(id, { isApproved: true, adminNote: parsed.adminNote }, options);
}

export async function rejectReview(
	id: string,
	input: ModerationInput = {},
	options: ReviewMutationOptions
): Promise<Review> {
	assertReviewPermission(options.actor, 'review', 'update');

	const parsed = parseReviewInput(moderationInputSchema, input, 'review moderation');
	return updateReview(id, { isApproved: false, adminNote: parsed.adminNote }, options);
}

export async function deleteReview(id: string, options: DeleteReviewOptions): Promise<Review> {
	const existing = await getReviewById(id, { actor: options.actor });
	assertCanMutateReview(existing, options.actor, 'delete');

	const mediaRows = options.bucket
		? await getDb().select().from(reviewMedia).where(eq(reviewMedia.reviewId, id))
		: [];
	const [deleted] = await getDb().delete(review).where(eq(review.id, id)).returning();

	if (options.bucket) {
		await Promise.all(mediaRows.map((media) => deleteObjectSafe(options.bucket!, media.r2Key)));
	}

	return deleted ?? existing;
}

export async function getProductReviewSummary(productId: string): Promise<ProductReviewSummary> {
	const rows = await getDb()
		.select({ rating: review.rating })
		.from(review)
		.where(and(eq(review.productId, productId), eq(review.isApproved, true)));
	const ratingCounts: Record<1 | 2 | 3 | 4 | 5, number> = {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0
	};

	for (const row of rows) {
		ratingCounts[row.rating as 1 | 2 | 3 | 4 | 5] += 1;
	}

	const ratingSum = rows.reduce((sum, row) => sum + row.rating, 0);

	return {
		productId,
		reviewCount: rows.length,
		averageRating: rows.length ? Math.round((ratingSum / rows.length) * 10) / 10 : 0,
		ratingCounts
	};
}

async function assertProductExists(productId: string): Promise<void> {
	const [row] = await getDb()
		.select({ id: product.id })
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!row) {
		throw new ReviewError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
	}
}

async function verifyReviewPurchase(
	productId: string,
	userId: string,
	orderId: string
): Promise<boolean> {
	const [row] = await getDb()
		.select({ orderId: order.id })
		.from(order)
		.innerJoin(orderItem, eq(orderItem.orderId, order.id))
		.where(
			and(
				eq(order.id, orderId),
				eq(order.userId, userId),
				eq(orderItem.productId, productId),
				inArray(order.status, ['confirmed', 'processing', 'shipped', 'delivered'])
			)
		)
		.limit(1);

	if (row) return true;

	reviewNotEligible({
		productId,
		userId,
		orderId
	});
}

function resolveReviewUserId(userId: string | undefined, actor: ReviewServiceActor): string {
	if (isAdmin(actor)) {
		if (userId) return userId;
		conflict('userId is required when an admin creates a review.');
	}

	if (!userId || userId === actor.id) return actor.id;

	throw new ReviewError(
		'You cannot create a review for another user.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			userId
		}
	);
}

function assertCanReadReview(row: Review, actor: ReviewServiceActor | null | undefined): void {
	if (row.isApproved) return;
	if (!actor) reviewNotFound({ id: row.id });

	assertReviewPermission(actor, 'review', 'read');
	if (isAdmin(actor) || actor.id === row.userId) return;

	reviewNotFound({ id: row.id });
}

function assertCanMutateReview(
	row: Review,
	actor: ReviewServiceActor,
	action: 'update' | 'delete'
): void {
	assertReviewPermission(actor, 'review', action);
	if (isAdmin(actor) || actor.id === row.userId) return;

	throw new ReviewError(
		'You do not have permission to modify this review.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			reviewId: row.id,
			action
		}
	);
}

function buildReviewFilters(options: ListReviewsOptions): SQL[] {
	const filters: SQL[] = [];

	if (!options.includeUnapproved) filters.push(eq(review.isApproved, true));
	if (options.approvedOnly) filters.push(eq(review.isApproved, true));
	if (options.productId) filters.push(eq(review.productId, options.productId));
	if (options.userId) filters.push(eq(review.userId, options.userId));
	if (options.rating) filters.push(eq(review.rating, options.rating));
	if (options.verifiedOnly) filters.push(eq(review.isVerifiedPurchase, true));

	if (options.includeUnapproved && !isAdmin(options.actor)) {
		filters.push(eq(review.userId, options.actor!.id));
	}

	return filters;
}
