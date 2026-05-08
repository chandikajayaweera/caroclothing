import { z } from 'zod';
import { SRI_LANKA_DISTRICTS } from '../addresses/addresses.drizzle';
import {
	insertShippingMethodSchema,
	insertShippingZoneSchema,
	updateShippingMethodSchema
} from './shipping.drizzle';

const shippingMethodIdSchema = z.string().min(1).max(64);
const districtSchema = z.enum(SRI_LANKA_DISTRICTS);
const subtotalSchema = z.number().int().min(0);

export const createShippingMethodFormSchema = insertShippingMethodSchema;

export const updateShippingMethodFormSchema = z.intersection(
	z.object({
		shippingMethodId: shippingMethodIdSchema
	}),
	updateShippingMethodSchema
);

export const shippingMethodIdFormSchema = z.object({
	shippingMethodId: shippingMethodIdSchema
});

export const setShippingZoneFormSchema = insertShippingZoneSchema;

export const removeShippingZoneFormSchema = z.object({
	shippingMethodId: shippingMethodIdSchema,
	district: districtSchema
});

export const calculateShippingQuoteFormSchema = z.object({
	shippingMethodId: shippingMethodIdSchema,
	district: districtSchema,
	subtotal: subtotalSchema
});
