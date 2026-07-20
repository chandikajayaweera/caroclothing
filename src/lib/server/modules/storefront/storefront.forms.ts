import { z } from 'zod';
import {
	STOREFRONT_LAYOUT_VARIANTS,
	STOREFRONT_PAGE_KEYS,
	STOREFRONT_SECTION_TYPES,
	STOREFRONT_SOURCE_TYPES,
	validateStorefrontSectionWindowAndCtas
} from './storefront.drizzle';

const idSchema = z.string().min(1).max(255);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const boolFromForm = z.preprocess(
	(value) => (value === 'true' || value === 'on' ? true : value === 'false' ? false : value),
	z.boolean()
);
const optionalTimestamp = z.coerce.number().int().positive().nullable().optional();
const optionalImage = z.instanceof(File).optional().nullable();
const pathSchema = z
	.string()
	.trim()
	.min(1)
	.max(500)
	.refine(
		(value) => value.startsWith('/') || value.startsWith('https://'),
		'Use an internal path or HTTPS URL'
	)
	.nullable()
	.optional();

const fields = {
	pageKey: z.enum(STOREFRONT_PAGE_KEYS).default('home'),
	type: z.enum(STOREFRONT_SECTION_TYPES),
	adminName: z.string().trim().min(2).max(120),
	layoutVariant: z.enum(STOREFRONT_LAYOUT_VARIANTS),
	sourceType: z.enum(STOREFRONT_SOURCE_TYPES),
	eyebrow: nullableText(80),
	title: nullableText(160),
	body: nullableText(1000),
	primaryCtaLabel: nullableText(60),
	primaryCtaUrl: pathSchema,
	secondaryCtaLabel: nullableText(60),
	secondaryCtaUrl: pathSchema,
	productId: idSchema.nullable().optional(),
	categoryId: idSchema.nullable().optional(),
	promotionId: idSchema.nullable().optional(),
	shippingMethodId: idSchema.nullable().optional(),
	itemLimit: z.coerce.number().int().min(1).max(12).default(8),
	sortOrder: z.coerce.number().int().min(0).default(0),
	enabled: boolFromForm.default(false),
	startsAt: optionalTimestamp,
	endsAt: optionalTimestamp,
	categoryIds: z.array(idSchema).default([]),
	desktopImage: optionalImage,
	mobileImage: optionalImage,
	desktopAltText: nullableText(255),
	mobileAltText: nullableText(255),
	desktopFocalX: z.coerce.number().int().min(0).max(100).default(50),
	desktopFocalY: z.coerce.number().int().min(0).max(100).default(50),
	mobileFocalX: z.coerce.number().int().min(0).max(100).default(50),
	mobileFocalY: z.coerce.number().int().min(0).max(100).default(50)
};

function validateSource(data: z.infer<z.ZodObject<typeof fields>>, ctx: z.RefinementCtx) {
	validateStorefrontSectionWindowAndCtas(data, ctx);
	if (data.sourceType === 'category_products' && !data.categoryId)
		ctx.addIssue({ code: 'custom', message: 'Choose a category', path: ['categoryId'] });
	if (data.sourceType === 'promotion' && !data.promotionId)
		ctx.addIssue({ code: 'custom', message: 'Choose a promotion', path: ['promotionId'] });
	if (data.sourceType === 'shipping' && !data.shippingMethodId)
		ctx.addIssue({
			code: 'custom',
			message: 'Choose a shipping method',
			path: ['shippingMethodId']
		});
	if (data.type === 'product_spotlight' && !data.productId)
		ctx.addIssue({ code: 'custom', message: 'Choose a product', path: ['productId'] });
	if (
		data.type === 'category_showcase' &&
		data.sourceType === 'manual' &&
		data.categoryIds.length === 0
	)
		ctx.addIssue({
			code: 'custom',
			message: 'Choose at least one category',
			path: ['categoryIds']
		});
}

export const createStorefrontSectionFormSchema = z.object(fields).superRefine(validateSource);
export const updateStorefrontSectionFormSchema = z
	.object({
		sectionId: idSchema,
		...fields,
		removeDesktopImage: boolFromForm.default(false),
		removeMobileImage: boolFromForm.default(false)
	})
	.superRefine(validateSource);
export const setStorefrontSectionEnabledFormSchema = z.object({
	sectionId: idSchema,
	enabled: boolFromForm
});
export const deleteStorefrontSectionFormSchema = z.object({ sectionId: idSchema });
export const reorderStorefrontSectionsFormSchema = z.object({
	pageKey: z.enum(STOREFRONT_PAGE_KEYS).default('home'),
	sectionIds: z.array(idSchema).min(1)
});
