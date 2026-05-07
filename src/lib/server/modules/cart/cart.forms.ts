import { z } from 'zod';

const idSchema = z.string().min(1).max(255);
const quantitySchema = z.coerce.number().int().min(1).max(10);

export const addCartItemFormSchema = z.object({
	variantId: idSchema,
	quantity: quantitySchema.default(1)
});

export const updateCartItemQuantityFormSchema = z.object({
	cartItemId: idSchema,
	quantity: quantitySchema
});

export const removeCartItemFormSchema = z.object({
	cartItemId: idSchema
});

export const clearCartFormSchema = z.object({});

export const deleteExpiredGuestCartsFormSchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).default(100)
});
