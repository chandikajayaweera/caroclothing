import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '$lib/server/infrastructure/media/r2';
import {
	GENDER_TIERS,
	PRODUCT_TIERS,
	SIZE_TIERS,
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

const idSchema = z.string().min(1).max(64);
const redirectToSchema = z.enum(['view', 'products', 'categories', 'drops']).default('view');

function emptyFileToUndefined(value: unknown): unknown {
	if (value instanceof File && value.size === 0) return undefined;
	return value;
}

function emptyStringToNull(value: unknown): unknown {
	if (value === '') return null;
	return value;
}

function emptyFilesToArray(value: unknown): unknown {
	if (value === undefined || value === null || value === '') return [];
	if (value instanceof File) return value.size === 0 ? [] : [value];
	if (Array.isArray(value)) {
		return value.filter((entry) => !(entry instanceof File && entry.size === 0));
	}
	return value;
}

function toStringArray(value: unknown): unknown {
	if (value === undefined || value === null || value === '') return [];
	if (Array.isArray(value)) return value.filter((entry) => String(entry).trim().length > 0);
	return [value].filter((entry) => String(entry).trim().length > 0);
}

export const nullableIdFormSchema = z.preprocess(emptyStringToNull, idSchema.optional().nullable());

export const listProductsFormSchema = z.object({
	categoryId: idSchema.optional(),
	tier: z.enum(PRODUCT_TIERS).optional(),
	gender: z.enum(GENDER_TIERS).optional(),
	isFeatured: z.boolean().optional(),
	isNewArrival: z.boolean().optional(),
	includeInactive: z.boolean().optional(),
	limit: z.number().int().positive().optional(),
	offset: z.number().int().min(0).optional()
});

export const listCategoriesFormSchema = z.object({
	includeInactive: z.boolean().optional(),
	parentId: nullableIdFormSchema,
	limit: z.number().int().positive().optional(),
	offset: z.number().int().min(0).optional()
});

export const listTagsFormSchema = z.object({
	limit: z.number().int().positive().optional(),
	offset: z.number().int().min(0).optional()
});

export const imageFileSchema = z
	.instanceof(File)
	.refine((file) => file.size > 0, 'Image is empty.')
	.refine((file) => file.size <= MAX_IMAGE_BYTES, 'Image must be 5MB or less.')
	.refine((file) => ALLOWED_IMAGE_TYPES.has(file.type), 'Unsupported image type.');

export const optionalImageFileSchema = z.preprocess(
	emptyFileToUndefined,
	imageFileSchema.optional()
);
export const imageFilesFormSchema = z.preprocess(
	emptyFilesToArray,
	z.array(imageFileSchema).default([])
);

export const createCategoryFormSchema = insertCategorySchema.omit({ imageR2Key: true }).extend({
	parentId: nullableIdFormSchema,
	image: optionalImageFileSchema
});

const formBooleanSchema = z.preprocess((val) => {
	if (val === 'true') return true;
	if (val === 'false') return false;
	if (typeof val === 'boolean') return val;
	return undefined;
}, z.boolean().optional());

export const updateCategoryFormSchema = updateCategorySchema.omit({ imageR2Key: true }).extend({
	parentId: nullableIdFormSchema,
	image: optionalImageFileSchema,
	removeImage: formBooleanSchema
});

export const updateCategoryActionFormSchema = updateCategoryFormSchema.extend({
	categoryId: idSchema
});

export const deleteCategoryFormSchema = z.object({
	categoryId: idSchema
});

export const productTagIdsSchema = z.array(z.string().min(1).max(64)).default([]);
export const primaryImageIndexFormSchema = z.coerce.number().int().min(0).default(0);
export const newTagNamesFormSchema = z.preprocess(
	toStringArray,
	z.array(z.string().trim().min(1).max(50)).default([])
);
export const createProductDraftVariantFormSchema = z.object({
	clientId: idSchema,
	color: z.string().trim().min(1).max(50),
	colorHex: z.preprocess(
		emptyStringToNull,
		z
			.string()
			.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
			.optional()
			.nullable()
	),
	basePrice: z.coerce.number().int().positive(),
	compareAtPrice: z.preprocess(
		(v) => (v === '' || v === undefined || v === null ? null : Number(v)),
		z.number().int().positive().optional().nullable()
	),
	sortOrder: z.coerce.number().int().min(0).default(0),
	sizes: z.array(z.enum(SIZE_TIERS)).min(1, 'At least one size is required')
});
export const createProductImageMetadataFormSchema = z.object({
	variantClientId: nullableIdFormSchema,
	altText: z.preprocess(emptyStringToNull, z.string().max(255).optional().nullable()),
	position: z.coerce.number().int().min(0).default(0),
	isPrimary: z.boolean().default(false)
});

export const createProductFormSchema = insertProductSchema
	.safeExtend({
		tagIds: productTagIdsSchema,
		newTagNames: newTagNamesFormSchema,
		dropId: nullableIdFormSchema,
		primaryImageIndex: primaryImageIndexFormSchema,
		images: imageFilesFormSchema,
		variants: z.array(createProductDraftVariantFormSchema).default([]),
		imageMetadata: z.array(createProductImageMetadataFormSchema).default([]),
		redirectTo: redirectToSchema,
		syncPrices: z.boolean().default(false)
	})
	.superRefine((data, ctx) => {
		const tier = data.tier ?? 'core';
		data.variants.forEach((v, index) => {
			if (v.compareAtPrice != null && v.compareAtPrice <= v.basePrice) {
				ctx.addIssue({
					code: 'custom',
					message: 'compareAtPrice must be greater than basePrice',
					path: ['variants', index, 'compareAtPrice']
				});
			}
			if (tier === 'drop') {
				if (v.basePrice < 3000 || v.basePrice > 4500) {
					ctx.addIssue({
						code: 'custom',
						message: 'Drop variant basePrice must be between 3000 and 4500',
						path: ['variants', index, 'basePrice']
					});
				}
			} else {
				if (v.basePrice < 2500 || v.basePrice > 3200) {
					ctx.addIssue({
						code: 'custom',
						message: 'Core variant basePrice must be between 2500 and 3200',
						path: ['variants', index, 'basePrice']
					});
				}
			}
		});
	});

export const updateProductFormSchema = updateProductSchema.extend({
	isActive: formBooleanSchema,
	isFeatured: formBooleanSchema,
	isNewArrival: formBooleanSchema,
	tagIds: productTagIdsSchema,
	newTagNames: newTagNamesFormSchema,
	dropId: nullableIdFormSchema,
	serializedVariants: z.string().default('[]'),
	serializedImages: z.string().default('[]'),
	newImageFiles: imageFilesFormSchema
});

export const deleteProductFormSchema = z.object({
	productId: idSchema
});

export const updateProductFlagsFormSchema = z.object({
	productId: idSchema,
	isActive: formBooleanSchema,
	isFeatured: formBooleanSchema,
	isNewArrival: formBooleanSchema
});

export const createProductVariantFormSchema = insertProductVariantSchema.omit({
	productId: true
});

export const updateProductVariantFormSchema = updateProductVariantSchema.omit({
	productId: true
});

export const updateProductVariantActionFormSchema = updateProductVariantFormSchema.extend({
	variantId: idSchema
});

export const deleteProductVariantFormSchema = z.object({
	variantId: idSchema
});

export const addProductImageFormSchema = insertProductImageSchema.omit({ r2Key: true }).extend({
	variantId: nullableIdFormSchema,
	image: imageFileSchema
});

export const setPrimaryProductImageFormSchema = z.object({
	imageId: idSchema
});

export const deleteProductImageFormSchema = z.object({
	imageId: idSchema
});

export const reorderProductImagesFormSchema = z.object({
	productId: idSchema,
	imageIdsInOrder: z.array(idSchema)
});

export const createTagFormSchema = insertTagSchema;

export const updateTagFormSchema = updateTagSchema;

export const updateTagActionFormSchema = updateTagFormSchema.extend({
	tagId: idSchema
});

export const deleteTagFormSchema = z.object({
	tagId: idSchema
});

export const createProductVariantColorActionFormSchema = z.object({
	productId: idSchema,
	color: z.string().trim().min(1).max(50),
	colorHex: z.preprocess(
		emptyStringToNull,
		z
			.string()
			.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
			.optional()
			.nullable()
	),
	basePrice: z.coerce.number().int().positive(),
	compareAtPrice: z.preprocess(
		(v) => (v === '' || v === undefined || v === null ? null : Number(v)),
		z.number().int().positive().optional().nullable()
	),
	sortOrder: z.coerce.number().int().min(0).default(0)
});

export const updateProductVariantColorActionFormSchema = z.object({
	variantColorId: idSchema,
	color: z.string().trim().min(1).max(50).optional(),
	colorHex: z.preprocess(
		emptyStringToNull,
		z
			.string()
			.regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex colour')
			.optional()
			.nullable()
	),
	basePrice: z.coerce.number().int().positive().optional(),
	compareAtPrice: z.preprocess(
		(v) => (v === '' || v === undefined || v === null ? null : Number(v)),
		z.number().int().positive().optional().nullable()
	),
	sortOrder: z.coerce.number().int().min(0).default(0).optional()
});

export const deleteProductVariantColorActionFormSchema = z.object({
	variantColorId: idSchema
});
