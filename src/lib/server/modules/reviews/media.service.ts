import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import {
	buildMediaKey,
	deleteObjectSafe,
	uploadMedia,
	type MediaType
} from '$lib/server/modules/media/r2';
import {
	insertReviewMediaSchema,
	reviewMedia,
	updateReviewMediaSchema,
	type Review,
	type ReviewMedia
} from './reviews.drizzle';
import { getReviewById } from './review.service';
import {
	assertNonEmptyUpdate,
	assertReviewPermission,
	conflict,
	isAdmin,
	normalizeLimit,
	normalizeOffset,
	parseReviewInput,
	requireMediaBucket,
	reviewMediaNotFound,
	sanitizeMediaVariant,
	wrapMediaError,
	wrapReviewPersistenceError,
	type ReviewServiceActor
} from './service-utils';

const MAX_REVIEW_MEDIA = 6;

const createReviewMediaInputSchema = insertReviewMediaSchema.omit({
	id: true,
	createdAt: true
});

const updateReviewMediaInputSchema = updateReviewMediaSchema.omit({
	id: true,
	reviewId: true,
	r2Key: true,
	type: true,
	createdAt: true
});

const uploadReviewMediaInputSchema = z.object({
	reviewId: z.string().min(1),
	position: z.number().int().min(0).optional(),
	variant: z.string().min(1).max(80).optional()
});

export type CreateReviewMediaInput = z.infer<typeof createReviewMediaInputSchema>;
export type UpdateReviewMediaInput = z.infer<typeof updateReviewMediaInputSchema>;
export type UploadReviewMediaInput = z.infer<typeof uploadReviewMediaInputSchema>;

export type ReviewMediaMutationOptions = {
	actor: ReviewServiceActor;
};

export type ReviewMediaUploadOptions = ReviewMediaMutationOptions & {
	bucket: R2Bucket;
};

export type ListReviewMediaOptions = {
	actor?: ReviewServiceActor | null;
	reviewId?: string;
	limit?: number;
	offset?: number;
};

export async function listReviewMedia(
	options: ListReviewMediaOptions = {}
): Promise<ReviewMedia[]> {
	if (options.reviewId) {
		await getReviewById(options.reviewId, { actor: options.actor });
	} else {
		assertReviewPermission(options.actor, 'reviewMedia', 'read');
	}

	return getDb()
		.select()
		.from(reviewMedia)
		.where(options.reviewId ? eq(reviewMedia.reviewId, options.reviewId) : undefined)
		.orderBy(asc(reviewMedia.position), asc(reviewMedia.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getReviewMediaById(
	id: string,
	options: { actor?: ReviewServiceActor | null } = {}
): Promise<ReviewMedia> {
	const [row] = await getDb().select().from(reviewMedia).where(eq(reviewMedia.id, id)).limit(1);
	if (!row) reviewMediaNotFound({ id });

	await getReviewById(row.reviewId, { actor: options.actor });
	return row;
}

export async function createReviewMedia(
	input: CreateReviewMediaInput,
	options: ReviewMediaMutationOptions
): Promise<ReviewMedia> {
	assertReviewPermission(options.actor, 'reviewMedia', 'create');

	const parsed = parseReviewInput(createReviewMediaInputSchema, input, 'review media');
	const targetReview = await getReviewById(parsed.reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'create');
	await assertReviewMediaCapacity(parsed.reviewId);

	try {
		const [created] = await getDb().insert(reviewMedia).values(parsed).returning();
		return created;
	} catch (error) {
		wrapReviewPersistenceError(error, 'Unable to create review media.');
	}
}

export async function uploadReviewMedia(
	input: UploadReviewMediaInput,
	file: File,
	options: ReviewMediaUploadOptions
): Promise<ReviewMedia> {
	assertReviewPermission(options.actor, 'reviewMedia', 'create');

	const parsed = parseReviewInput(uploadReviewMediaInputSchema, input, 'review media upload');
	const targetReview = await getReviewById(parsed.reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'create');
	await assertReviewMediaCapacity(parsed.reviewId);

	const bucket = requireMediaBucket(options.bucket);
	const variant = sanitizeMediaVariant(parsed.variant ?? `media-${Date.now()}`) || 'media';
	const key = buildMediaKey({
		scope: 'reviews',
		entityId: parsed.reviewId,
		variant,
		contentType: file.type
	});

	let mediaType: MediaType;
	try {
		({ mediaType } = await uploadMedia(bucket, key, file));
	} catch (error) {
		wrapMediaError(error, 'Unable to upload review media.');
	}

	try {
		const [created] = await getDb()
			.insert(reviewMedia)
			.values({
				reviewId: parsed.reviewId,
				r2Key: key,
				type: toReviewMediaType(mediaType),
				position: parsed.position
			})
			.returning();

		return created;
	} catch (error) {
		await deleteObjectSafe(bucket, key);
		wrapReviewPersistenceError(error, 'Unable to create review media.');
	}
}

export async function updateReviewMedia(
	id: string,
	input: UpdateReviewMediaInput,
	options: ReviewMediaMutationOptions
): Promise<ReviewMedia> {
	assertReviewPermission(options.actor, 'reviewMedia', 'update');

	const existing = await getReviewMediaById(id, { actor: options.actor });
	const targetReview = await getReviewById(existing.reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'update');

	const parsed = parseReviewInput(updateReviewMediaInputSchema, input, 'review media');
	assertNonEmptyUpdate(parsed, 'review media');

	const [updated] = await getDb()
		.update(reviewMedia)
		.set(parsed)
		.where(eq(reviewMedia.id, id))
		.returning();

	if (!updated) reviewMediaNotFound({ id });
	return updated;
}

export async function replaceReviewMediaFile(
	id: string,
	file: File,
	options: ReviewMediaUploadOptions & { variant?: string }
): Promise<ReviewMedia> {
	assertReviewPermission(options.actor, 'reviewMedia', 'update');

	const existing = await getReviewMediaById(id, { actor: options.actor });
	const targetReview = await getReviewById(existing.reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'update');

	const bucket = requireMediaBucket(options.bucket);
	const variant = sanitizeMediaVariant(options.variant ?? `media-${Date.now()}`) || 'media';
	const key = buildMediaKey({
		scope: 'reviews',
		entityId: existing.reviewId,
		variant,
		contentType: file.type
	});

	let mediaType: MediaType;
	try {
		({ mediaType } = await uploadMedia(bucket, key, file));
	} catch (error) {
		wrapMediaError(error, 'Unable to upload review media.');
	}

	try {
		const [updated] = await getDb()
			.update(reviewMedia)
			.set({
				r2Key: key,
				type: toReviewMediaType(mediaType)
			})
			.where(eq(reviewMedia.id, id))
			.returning();

		if (!updated) reviewMediaNotFound({ id });
		await deleteObjectSafe(bucket, existing.r2Key);
		return updated;
	} catch (error) {
		await deleteObjectSafe(bucket, key);
		throw error;
	}
}

export async function deleteReviewMedia(
	id: string,
	options: ReviewMediaUploadOptions
): Promise<ReviewMedia> {
	assertReviewPermission(options.actor, 'reviewMedia', 'delete');

	const existing = await getReviewMediaById(id, { actor: options.actor });
	const targetReview = await getReviewById(existing.reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'delete');

	const [deleted] = await getDb().delete(reviewMedia).where(eq(reviewMedia.id, id)).returning();
	await deleteObjectSafe(options.bucket, existing.r2Key);

	return deleted ?? existing;
}

export async function deleteReviewMediaForReview(
	reviewId: string,
	options: ReviewMediaUploadOptions
): Promise<ReviewMedia[]> {
	assertReviewPermission(options.actor, 'reviewMedia', 'delete');

	const targetReview = await getReviewById(reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'delete');

	const existing = await getDb()
		.select()
		.from(reviewMedia)
		.where(eq(reviewMedia.reviewId, reviewId));
	if (existing.length === 0) return [];

	const deleted = await getDb()
		.delete(reviewMedia)
		.where(eq(reviewMedia.reviewId, reviewId))
		.returning();

	await Promise.all(existing.map((media) => deleteObjectSafe(options.bucket, media.r2Key)));
	return deleted;
}

export async function reorderReviewMedia(
	reviewId: string,
	mediaIds: string[],
	options: ReviewMediaMutationOptions
): Promise<ReviewMedia[]> {
	assertReviewPermission(options.actor, 'reviewMedia', 'update');

	const targetReview = await getReviewById(reviewId, { actor: options.actor });
	assertCanMutateReviewMedia(targetReview, options.actor, 'update');

	const existing = await getDb()
		.select()
		.from(reviewMedia)
		.where(eq(reviewMedia.reviewId, reviewId));
	const existingIds = new Set(existing.map((media) => media.id));
	if (mediaIds.some((id) => !existingIds.has(id))) {
		reviewMediaNotFound({ reviewId, mediaIds });
	}

	await getDb().transaction(async (tx) => {
		for (const [position, id] of mediaIds.entries()) {
			await tx.update(reviewMedia).set({ position }).where(eq(reviewMedia.id, id));
		}
	});

	return getDb()
		.select()
		.from(reviewMedia)
		.where(and(eq(reviewMedia.reviewId, reviewId)))
		.orderBy(asc(reviewMedia.position), asc(reviewMedia.createdAt));
}

function assertCanMutateReviewMedia(
	targetReview: Review,
	actor: ReviewServiceActor,
	action: 'create' | 'update' | 'delete'
): void {
	assertReviewPermission(actor, 'reviewMedia', action);
	if (isAdmin(actor) || actor.id === targetReview.userId) return;

	reviewMediaNotFound({ reviewId: targetReview.id });
}

async function assertReviewMediaCapacity(reviewId: string): Promise<void> {
	const rows = await getDb()
		.select({ id: reviewMedia.id })
		.from(reviewMedia)
		.where(eq(reviewMedia.reviewId, reviewId));

	if (rows.length < MAX_REVIEW_MEDIA) return;

	conflict(`A review can have at most ${MAX_REVIEW_MEDIA} media items.`, { reviewId });
}

function toReviewMediaType(mediaType: MediaType): ReviewMedia['type'] {
	return mediaType === 'photo' ? 'image' : 'video';
}
