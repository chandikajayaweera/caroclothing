import { z } from 'zod';
import {
	PROMO_CODE_DISTRIBUTIONS,
	PROMO_CODE_REDEMPTION_CHANNELS,
	PROMOTION_APPLICATION_MODES,
	PROMOTION_DISCOUNT_TYPES,
	PROMOTION_ELIGIBILITY_SCOPES,
	PROMOTION_VISIBILITIES,
	validatePromotionWindowAndValue
} from './promotions.drizzle';

const idSchema = z.string().min(1).max(255);
const emptyToNull = (value: unknown) => (value === '' ? null : value);
const nullableMoney = z.preprocess(
	emptyToNull,
	z.coerce.number().int().min(0).nullable().optional()
);
const nullablePositive = z.preprocess(
	emptyToNull,
	z.coerce.number().int().positive().nullable().optional()
);
const optionalTimestamp = z.preprocess(
	emptyToNull,
	z.coerce.number().int().positive().nullable().optional()
);
const codeSchema = z
	.string()
	.transform((value) => value.trim().toUpperCase())
	.pipe(
		z
			.string()
			.min(3)
			.max(50)
			.regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric')
	);
const boolFromForm = z.preprocess(
	(value) => (value === 'true' || value === 'on' ? true : value === 'false' ? false : value),
	z.boolean()
);

const promotionRuleFields = {
	name: z.string().trim().min(2).max(120),
	publicTitle: z.string().trim().max(120).nullable().optional(),
	internalDescription: z.string().trim().max(500).nullable().optional(),
	publicDescription: z.string().trim().max(500).nullable().optional(),
	discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
	discountValue: z.coerce.number().int().positive(),
	minOrderAmount: nullableMoney,
	maxDiscountAmount: nullablePositive,
	usageLimit: nullablePositive,
	perUserLimit: z.coerce.number().int().positive().default(1),
	applicationMode: z.enum(PROMOTION_APPLICATION_MODES),
	eligibilityScope: z.enum(PROMOTION_ELIGIBILITY_SCOPES).default('all'),
	visibility: z.enum(PROMOTION_VISIBILITIES).default('internal'),
	priority: z.coerce.number().int().min(0).default(0),
	startsAt: optionalTimestamp,
	expiresAt: optionalTimestamp
};

const promotionCodeFields = {
	code: codeSchema.nullable().optional(),
	distribution: z.enum(PROMO_CODE_DISTRIBUTIONS).default('private'),
	isDiscoverable: boolFromForm.default(false),
	redemptionChannel: z.enum(PROMO_CODE_REDEMPTION_CHANNELS).default('storefront'),
	partnerReference: z.string().trim().max(120).nullable().optional(),
	codeUsageLimit: nullablePositive
};

const createPromotionFields = { ...promotionRuleFields, ...promotionCodeFields };

function validatePromotionForm(
	data: z.infer<z.ZodObject<typeof createPromotionFields>>,
	ctx: z.RefinementCtx
) {
	validatePromotionWindowAndValue(data, ctx);
	if (data.applicationMode === 'code' && !data.code) {
		ctx.addIssue({
			code: 'custom',
			message: 'A code is required for code promotions',
			path: ['code']
		});
	}
	if (data.applicationMode === 'automatic' && data.code) {
		ctx.addIssue({
			code: 'custom',
			message: 'Automatic promotions cannot have a redemption code',
			path: ['code']
		});
	}
}

export const createPromotionFormSchema = z
	.object(createPromotionFields)
	.superRefine(validatePromotionForm);
export const updatePromotionFormSchema = z
	.object({ promotionId: idSchema, ...promotionRuleFields })
	.superRefine(validatePromotionWindowAndValue);
export const setPromotionActiveFormSchema = z.object({
	promotionId: idSchema,
	isActive: boolFromForm
});
export const promotionLookupFormSchema = z.object({ promotionId: idSchema });
export const grantPromotionToCustomerFormSchema = z.object({
	promotionId: idSchema,
	userId: idSchema,
	startsAt: optionalTimestamp,
	expiresAt: optionalTimestamp
});
export const addPromotionCodeFormSchema = z.object({
	promotionId: idSchema,
	code: codeSchema,
	distribution: z.enum(PROMO_CODE_DISTRIBUTIONS).default('private'),
	isDiscoverable: boolFromForm.default(false),
	redemptionChannel: z.enum(PROMO_CODE_REDEMPTION_CHANNELS).default('storefront'),
	partnerReference: z.string().trim().max(120).nullable().optional(),
	codeUsageLimit: nullablePositive
});
export const updatePromotionCodeFormSchema = z.object({
	promoCodeId: idSchema,
	code: codeSchema,
	distribution: z.enum(PROMO_CODE_DISTRIBUTIONS),
	isDiscoverable: boolFromForm,
	redemptionChannel: z.enum(PROMO_CODE_REDEMPTION_CHANNELS),
	partnerReference: z.string().trim().max(120).nullable().optional(),
	codeUsageLimit: nullablePositive,
	isActive: boolFromForm
});

// Compatibility form contracts used by the existing bag and admin transition surface.
const promoCodeFormBaseSchema = z.object({
	code: codeSchema,
	description: z.string().trim().max(500).nullable().optional(),
	discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
	discountValue: z.coerce.number().int().positive(),
	minOrderAmount: nullableMoney,
	maxDiscountAmount: nullablePositive,
	usageLimit: nullablePositive,
	perUserLimit: z.coerce.number().int().positive().default(1),
	startsAt: optionalTimestamp,
	expiresAt: optionalTimestamp
});
export const createPromoCodeFormSchema = promoCodeFormBaseSchema.superRefine(
	validatePromotionWindowAndValue
);
export const updatePromoCodeFormSchema = promoCodeFormBaseSchema
	.partial()
	.safeExtend({ promoCodeId: idSchema })
	.superRefine(validatePromotionWindowAndValue);
export const setPromoCodeActiveFormSchema = z.object({
	promoCodeId: idSchema,
	isActive: boolFromForm
});
export const validatePromoCodeForBagFormSchema = z.object({
	code: codeSchema,
	subtotal: z.coerce.number().int().min(0)
});
export const promoCodeLookupFormSchema = z.object({ promoCodeId: idSchema });
export const listPromoCodesFormSchema = z.object({
	query: z.string().max(120).optional().nullable(),
	isActive: z.boolean().optional(),
	includeInactive: z.boolean().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});
export const listPromoCodeUsagesFormSchema = z.object({
	promotionId: idSchema.optional(),
	promoCodeId: idSchema.optional(),
	userId: idSchema.optional().nullable(),
	orderId: idSchema.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});
export const reconcilePromoCodeUsageCountFormSchema = z.object({ promoCodeId: idSchema });
export const reconcilePromoCodeUsageCountsFormSchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).default(100),
	offset: z.coerce.number().int().min(0).default(0)
});
