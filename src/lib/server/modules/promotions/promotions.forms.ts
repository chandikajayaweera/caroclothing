import { z } from 'zod';
import { insertPromoCodeSchema, updatePromoCodeSchema } from './promotions.drizzle';

const idSchema = z.string().min(1).max(255);
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
const limitSchema = z.coerce.number().int().min(1).max(100).default(50);
const offsetSchema = z.coerce.number().int().min(0).default(0);

export const createPromoCodeFormSchema = insertPromoCodeSchema
	.omit({
		isActive: true,
		usedCount: true
	})
	.safeExtend({
		code: codeSchema
	});

export const updatePromoCodeFormSchema = z.intersection(
	z.object({
		promoCodeId: idSchema
	}),
	updatePromoCodeSchema
		.omit({
			isActive: true,
			usedCount: true
		})
		.safeExtend({
			code: codeSchema.optional()
		})
);

export const setPromoCodeActiveFormSchema = z.object({
	promoCodeId: idSchema,
	isActive: z.boolean()
});

export const validatePromoCodeForCartFormSchema = z.object({
	code: codeSchema,
	subtotal: z.coerce.number().int().min(0)
});

export const promoCodeLookupFormSchema = z.object({
	promoCodeId: idSchema
});

export const listPromoCodesFormSchema = z.object({
	query: z.string().max(120).optional().nullable(),
	isActive: z.boolean().optional(),
	includeInactive: z.boolean().optional(),
	limit: limitSchema,
	offset: offsetSchema
});

export const listPromoCodeUsagesFormSchema = z.object({
	promoCodeId: idSchema.optional(),
	userId: idSchema.optional().nullable(),
	orderId: z.string().min(1).max(255).optional(),
	limit: limitSchema,
	offset: offsetSchema
});

export const reconcilePromoCodeUsageCountFormSchema = z.object({
	promoCodeId: idSchema
});

export const reconcilePromoCodeUsageCountsFormSchema = z.object({
	limit: limitSchema,
	offset: offsetSchema
});
