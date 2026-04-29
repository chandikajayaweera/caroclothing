import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import {
	SRI_LANKA_DISTRICTS,
	type SriLankaDistrict
} from '$lib/server/modules/addresses/addresses.drizzle';
import {
	shippingMethod,
	shippingZone,
	type ShippingMethod,
	type ShippingZone
} from './shipping.drizzle';
import { deliveryUnavailable, methodNotFound, parseShippingInput } from './service-utils';

const shippingRateRequestSchema = z.object({
	district: z.enum(SRI_LANKA_DISTRICTS),
	subtotal: z.number().min(0)
});

const selectedShippingRateRequestSchema = shippingRateRequestSchema.extend({
	shippingMethodId: z.string().min(1)
});

export type ShippingRateRequest = z.infer<typeof shippingRateRequestSchema>;
export type SelectedShippingRateRequest = z.infer<typeof selectedShippingRateRequestSchema>;

export type ShippingRate = {
	shippingMethodId: string;
	name: string;
	description: string | null;
	carrier: string | null;
	district: SriLankaDistrict;
	price: number;
	basePrice: number;
	freeShippingThreshold: number | null;
	isFreeShipping: boolean;
	estimatedDaysMin: number;
	estimatedDaysMax: number;
	zoneId: string | null;
	hasDistrictOverride: boolean;
};

export async function listAvailableShippingRates(
	input: ShippingRateRequest
): Promise<ShippingRate[]> {
	const parsed = parseShippingInput(shippingRateRequestSchema, input, 'shipping rate request');

	const methods = await getDb()
		.select()
		.from(shippingMethod)
		.where(eq(shippingMethod.isActive, true))
		.orderBy(asc(shippingMethod.sortOrder), asc(shippingMethod.name));

	if (methods.length === 0) deliveryUnavailable({ district: parsed.district });

	const zones = await getDb()
		.select()
		.from(shippingZone)
		.where(eq(shippingZone.district, parsed.district));
	const zoneByMethodId = new Map(zones.map((zone) => [zone.shippingMethodId, zone]));

	return methods.map((method) =>
		calculateShippingRate({
			method,
			zone: zoneByMethodId.get(method.id) ?? null,
			district: parsed.district,
			subtotal: parsed.subtotal
		})
	);
}

export async function getShippingRateForMethod(
	input: SelectedShippingRateRequest
): Promise<ShippingRate> {
	const parsed = parseShippingInput(
		selectedShippingRateRequestSchema,
		input,
		'selected shipping rate request'
	);

	const [method] = await getDb()
		.select()
		.from(shippingMethod)
		.where(eq(shippingMethod.id, parsed.shippingMethodId))
		.limit(1);

	if (!method || !method.isActive) methodNotFound({ shippingMethodId: parsed.shippingMethodId });

	const [zone] = await getDb()
		.select()
		.from(shippingZone)
		.where(
			and(eq(shippingZone.shippingMethodId, method.id), eq(shippingZone.district, parsed.district))
		)
		.limit(1);

	return calculateShippingRate({
		method,
		zone: zone ?? null,
		district: parsed.district,
		subtotal: parsed.subtotal
	});
}

export function calculateShippingRate(input: {
	method: ShippingMethod;
	zone?: ShippingZone | null;
	district: SriLankaDistrict;
	subtotal: number;
}): ShippingRate {
	const basePrice = input.zone?.priceOverride ?? input.method.price;
	const isFreeShipping =
		input.method.freeShippingThreshold != null &&
		input.subtotal >= input.method.freeShippingThreshold;
	const price = isFreeShipping ? 0 : basePrice;

	return {
		shippingMethodId: input.method.id,
		name: input.method.name,
		description: input.method.description,
		carrier: input.method.carrier,
		district: input.district,
		price,
		basePrice,
		freeShippingThreshold: input.method.freeShippingThreshold,
		isFreeShipping,
		estimatedDaysMin: input.zone?.estimatedDaysMin ?? input.method.estimatedDaysMin,
		estimatedDaysMax: input.zone?.estimatedDaysMax ?? input.method.estimatedDaysMax,
		zoneId: input.zone?.id ?? null,
		hasDistrictOverride: Boolean(input.zone)
	};
}
