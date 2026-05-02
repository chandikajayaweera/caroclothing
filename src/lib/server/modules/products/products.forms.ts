import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '$lib/server/modules/media/r2';
import {
	insertCategorySchema,
	insertProductImageSchema,
	insertProductSchema,
	insertProductVariantSchema,
	insertTagSchema,
	updateCategorySchema,
	updateProductSchema,
	updateProductVariantSchema,
	updateTagSchema
} from './products.drizzle';

function emptyFileToUndefined(value: unknown): unknown {
	if (value instanceof File && value.size === 0) return undefined;
	return value;
}

export const imageFileSchema = z
	.instanceof(File)
	.refine((file) => file.size > 0, 'Image is empty.')
	.refine((file) => file.size <= MAX_IMAGE_BYTES, 'Image must be 5MB or less.')
	.refine((file) => ALLOWED_IMAGE_TYPES.has(file.type), 'Unsupported image type.');

export const optionalImageFileSchema = z.preprocess(
	emptyFileToUndefined,
	imageFileSchema.optional()
);

export const createCategoryFormSchema = insertCategorySchema.omit({ imageR2Key: true }).extend({
	image: optionalImageFileSchema
});

export const updateCategoryFormSchema = updateCategorySchema.omit({ imageR2Key: true }).extend({
	image: optionalImageFileSchema,
	removeImage: z.boolean().optional()
});

export const productTagIdsSchema = z.array(z.string().min(1).max(64)).optional();

export const createProductFormSchema = insertProductSchema.safeExtend({
	tagIds: productTagIdsSchema
});

export const updateProductFormSchema = updateProductSchema.safeExtend({
	tagIds: productTagIdsSchema
});

export const createProductVariantFormSchema = insertProductVariantSchema.omit({
	productId: true
});

export const updateProductVariantFormSchema = updateProductVariantSchema.omit({
	productId: true
});

export const addProductImageFormSchema = insertProductImageSchema.omit({ r2Key: true }).extend({
	image: imageFileSchema
});

export const createTagFormSchema = insertTagSchema;

export const updateTagFormSchema = updateTagSchema;
