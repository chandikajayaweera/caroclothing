import { z } from 'zod';
import { SRI_LANKA_DISTRICTS } from '../addresses/addresses.drizzle';
import {
	insertShippingMethodBaseSchema,
	updateShippingMethodBaseSchema,
	insertShippingZoneBaseSchema,
	insertCarrierSchema,
	updateCarrierSchema,
	validateDeliveryEstimate
} from './shipping.drizzle';

const shippingMethodIdSchema = z.string().min(1).max(64);
const districtSchema = z.enum(SRI_LANKA_DISTRICTS);
const subtotalSchema = z.number().int().min(0);
const idSchema = z.string().min(1).max(64);

export const createShippingMethodFormSchema = insertShippingMethodBaseSchema
	.extend({
		isActive: z.preprocess(
			(val) => (val === 'true' ? true : val === 'false' ? false : val),
			z.boolean().optional()
		)
	})
	.superRefine(validateDeliveryEstimate);

export const updateShippingMethodFormSchema = updateShippingMethodBaseSchema
	.extend({
		shippingMethodId: shippingMethodIdSchema,
		isActive: z.preprocess(
			(val) => (val === 'true' ? true : val === 'false' ? false : val),
			z.boolean().optional()
		)
	})
	.superRefine(validateDeliveryEstimate);

export const shippingMethodIdFormSchema = z.object({
	shippingMethodId: shippingMethodIdSchema
});

export const setShippingZoneFormSchema = insertShippingZoneBaseSchema
	.extend({
		isAvailable: z.preprocess(
			(val) => (val === 'true' ? true : val === 'false' ? false : val),
			z.boolean().optional()
		)
	})
	.superRefine(validateDeliveryEstimate);

export const removeShippingZoneFormSchema = z.object({
	shippingMethodId: shippingMethodIdSchema,
	district: districtSchema
});

export const calculateShippingQuoteFormSchema = z.object({
	shippingMethodId: shippingMethodIdSchema,
	district: districtSchema,
	subtotal: subtotalSchema
});

// Carrier CRUD Forms
export const createCarrierFormSchema = insertCarrierSchema.extend({
	isActive: z.preprocess(
		(val) => (val === 'true' ? true : val === 'false' ? false : val),
		z.boolean().optional()
	)
});

export const updateCarrierFormSchema = updateCarrierSchema.extend({
	carrierId: idSchema,
	isActive: z.preprocess(
		(val) => (val === 'true' ? true : val === 'false' ? false : val),
		z.boolean().optional()
	)
});

export const deleteCarrierFormSchema = z.object({
	carrierId: idSchema
});
