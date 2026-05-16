import { z } from 'zod';
import {
	ALLOWED_IMAGE_TYPES,
	ALLOWED_VIDEO_TYPES,
	MAX_IMAGE_BYTES,
	MAX_VIDEO_BYTES
} from '$lib/server/infrastructure/media/r2';
import { insertReviewSchema, updateReviewSchema } from './reviews.drizzle';
import { MAX_REVIEW_MEDIA_FILES } from './reviews.types';

const emptyStringToUndefined = (value: unknown): unknown =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

function normalizeFiles(value: unknown): unknown {
	if (value === undefined || value === null) return undefined;

	const files =
		typeof FileList !== 'undefined' && value instanceof FileList
			? Array.from(value)
			: Array.isArray(value)
				? value
				: value instanceof File
					? [value]
					: value;

	if (!Array.isArray(files)) return files;

	const nonEmptyFiles = files.filter((file) => !(file instanceof File) || file.size > 0);
	return nonEmptyFiles.length > 0 ? nonEmptyFiles : undefined;
}

const idSchema = z.string().min(1).max(255);
const limitSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(1).max(100).default(20)
);
const offsetSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(0).default(0)
);
const optionalNullableStringSchema = (maxLength: number) =>
	z.preprocess(emptyStringToUndefined, z.string().trim().max(maxLength).optional().nullable());
const optionalIdSchema = z.preprocess(emptyStringToUndefined, idSchema.optional());
const optionalNullableIdSchema = z.preprocess(
	emptyStringToUndefined,
	idSchema.optional().nullable()
);
const optionalRatingSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(1).max(5).optional()
);

export const reviewMediaFileSchema = z
	.instanceof(File)
	.refine((file) => file.size > 0, 'File is empty.')
	.refine((file) => {
		if (ALLOWED_IMAGE_TYPES.has(file.type)) return file.size <= MAX_IMAGE_BYTES;
		if (ALLOWED_VIDEO_TYPES.has(file.type)) return file.size <= MAX_VIDEO_BYTES;
		return true;
	}, 'File is too large.')
	.refine(
		(file) => ALLOWED_IMAGE_TYPES.has(file.type) || ALLOWED_VIDEO_TYPES.has(file.type),
		'Unsupported file type.'
	);

export const optionalReviewMediaFilesSchema = z.preprocess(
	normalizeFiles,
	z.array(reviewMediaFileSchema).max(MAX_REVIEW_MEDIA_FILES).optional()
);

export const createReviewFormSchema = insertReviewSchema
	.omit({
		userId: true,
		isVerifiedPurchase: true
	})
	.safeExtend({
		files: optionalReviewMediaFilesSchema
	});

export const getReviewFormSchema = z.object({
	reviewId: idSchema
});

export const listProductReviewsFormSchema = z.object({
	productId: idSchema,
	includeUnapproved: z.boolean().optional(),
	limit: limitSchema,
	offset: offsetSchema
});

export const getProductReviewSummaryFormSchema = z.object({
	productId: idSchema,
	includeUnapproved: z.boolean().optional()
});

export const listRecentApprovedReviewsFormSchema = z.object({
	productId: optionalIdSchema,
	limit: limitSchema,
	offset: offsetSchema
});

export const listMyReviewsFormSchema = z.object({
	productId: optionalIdSchema,
	limit: limitSchema,
	offset: offsetSchema
});

export const reviewEligibilityFormSchema = z.object({
	productId: idSchema,
	orderId: optionalNullableIdSchema
});

export const updateMyReviewFormSchema = z.object({
	reviewId: idSchema,
	rating: optionalRatingSchema,
	title: optionalNullableStringSchema(150),
	body: optionalNullableStringSchema(2000)
});

export const addReviewMediaFormSchema = z.object({
	reviewId: idSchema,
	files: z.preprocess(
		normalizeFiles,
		z.array(reviewMediaFileSchema).min(1).max(MAX_REVIEW_MEDIA_FILES)
	)
});

export const deleteReviewMediaFormSchema = z.object({
	mediaId: idSchema
});

export const reorderReviewMediaFormSchema = z.object({
	reviewId: idSchema,
	mediaIdsInOrder: z.array(idSchema).max(MAX_REVIEW_MEDIA_FILES)
});

export const listReviewsFormSchema = z.object({
	productId: optionalIdSchema,
	userId: optionalIdSchema,
	orderId: optionalNullableIdSchema,
	isApproved: z.boolean().optional(),
	isVerifiedPurchase: z.boolean().optional(),
	rating: optionalRatingSchema,
	query: optionalNullableStringSchema(120),
	limit: limitSchema,
	offset: offsetSchema
});

export const listPendingReviewsFormSchema = z.object({
	limit: limitSchema,
	offset: offsetSchema
});

export const getReviewModerationSummaryFormSchema = z.object({
	productId: optionalIdSchema
});

export const moderateReviewFormSchema = z
	.object({
		reviewId: idSchema,
		isApproved: z.boolean()
	})
	.and(updateReviewSchema.pick({ adminNote: true }));

export const deleteReviewFormSchema = z.object({
	reviewId: idSchema
});
