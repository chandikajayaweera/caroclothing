import { z } from 'zod';

const idSchema = z.string().min(1).max(255);
const quantitySchema = z.coerce.number().int().min(1).max(10);

export const addBagItemFormSchema = z.object({
	variantId: idSchema,
	quantity: quantitySchema.default(1)
});

export const updateBagItemQuantityFormSchema = z.object({
	bagItemId: idSchema,
	quantity: quantitySchema
});

export const removeBagItemFormSchema = z.object({
	bagItemId: idSchema
});

export const clearBagFormSchema = z.object({});

export const deleteExpiredGuestBagsFormSchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const expireDueBagCheckoutsFormSchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).default(100)
});
