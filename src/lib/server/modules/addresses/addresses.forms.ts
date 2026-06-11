import { z } from 'zod';
import { insertAddressBaseSchema, updateAddressSchema } from './addresses.drizzle';

const addressIdSchema = z.string().min(1).max(255);
const requiredText = (label: string, maxLength: number) =>
	z
		.string()
		.trim()
		.min(1, { message: `${label} is required.` })
		.max(maxLength, { message: `${label} is too long.` });
const phoneSchema = z
	.string()
	.trim()
	.min(1, { message: 'Phone number is required.' })
	.regex(/^(?:\+94|0)7[0-9]{8}$/, {
		message: 'Enter a valid Sri Lankan mobile number.'
	});
const optionalText = (maxLength: number) =>
	z.preprocess(
		(value) => (typeof value === 'string' && value.trim() === '' ? null : value),
		z.string().trim().max(maxLength).optional().nullable()
	);

export const createAddressFormSchema = insertAddressBaseSchema.omit({ userId: true }).safeExtend({
	recipientName: requiredText('Recipient name', 150),
	phone: phoneSchema,
	addressLine1: requiredText('Address line 1', 255),
	city: requiredText('City', 100)
});

export const updateAddressFormSchema = updateAddressSchema;

export const updateMyAddressFormSchema = updateAddressSchema.safeExtend({
	addressId: addressIdSchema,
	recipientName: requiredText('Recipient name', 150),
	phone: phoneSchema,
	addressLine1: requiredText('Address line 1', 255),
	city: requiredText('City', 100)
});

export const checkoutAddressFormSchema = insertAddressBaseSchema.omit({
	userId: true,
	label: true,
	isDefault: true
});

export const saveCheckoutAddressFormSchema = checkoutAddressFormSchema.extend({
	label: optionalText(50),
	addressLine2: optionalText(255),
	postalCode: optionalText(10)
});

export const addressIdFormSchema = z.object({
	addressId: addressIdSchema
});

export const setDefaultAddressFormSchema = addressIdFormSchema;

export const deleteAddressFormSchema = addressIdFormSchema;
