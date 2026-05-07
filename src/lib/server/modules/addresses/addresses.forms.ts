import { z } from 'zod';
import { insertAddressBaseSchema, updateAddressSchema } from './addresses.drizzle';

const addressIdSchema = z.string().min(1).max(255);

export const createAddressFormSchema = insertAddressBaseSchema.omit({ userId: true });

export const updateAddressFormSchema = updateAddressSchema;

export const checkoutAddressFormSchema = insertAddressBaseSchema.omit({
	userId: true,
	label: true,
	isDefault: true
});

export const addressIdFormSchema = z.object({
	addressId: addressIdSchema
});

export const setDefaultAddressFormSchema = addressIdFormSchema;

export const deleteAddressFormSchema = addressIdFormSchema;
