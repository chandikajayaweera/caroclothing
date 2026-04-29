import { and, asc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import type { SriLankaDistrict } from '$lib/server/modules/addresses/addresses.drizzle';
import {
	insertShippingZoneBaseSchema,
	shippingMethod,
	shippingZone,
	updateShippingZoneSchema,
	type ShippingZone
} from './shipping.drizzle';
import {
	assertDeliveryEstimate,
	assertNonEmptyUpdate,
	assertShippingPermission,
	methodNotFound,
	normalizeLimit,
	normalizeOffset,
	parseShippingInput,
	wrapShippingPersistenceError,
	zoneNotFound,
	type ShippingServiceActor
} from './service-utils';

const createShippingZoneInputSchema = insertShippingZoneBaseSchema.omit({
	id: true
});

const updateShippingZoneInputSchema = updateShippingZoneSchema.omit({
	id: true
});

export type CreateShippingZoneInput = z.infer<typeof createShippingZoneInputSchema>;
export type UpdateShippingZoneInput = z.infer<typeof updateShippingZoneInputSchema>;

export type ListShippingZonesOptions = {
	actor: ShippingServiceActor;
	shippingMethodId?: string;
	district?: SriLankaDistrict;
	limit?: number;
	offset?: number;
};

export type ShippingZoneMutationOptions = {
	actor: ShippingServiceActor;
};

export async function listShippingZones(
	options: ListShippingZonesOptions
): Promise<ShippingZone[]> {
	assertShippingPermission(options.actor, 'read');

	const filters = buildZoneFilters(options);

	return getDb()
		.select()
		.from(shippingZone)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(asc(shippingZone.district))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function listShippingZonesForMethod(
	shippingMethodId: string,
	options: ShippingZoneMutationOptions & { limit?: number; offset?: number }
): Promise<ShippingZone[]> {
	assertShippingPermission(options.actor, 'read');
	await assertShippingMethodExists(shippingMethodId);

	return getDb()
		.select()
		.from(shippingZone)
		.where(eq(shippingZone.shippingMethodId, shippingMethodId))
		.orderBy(asc(shippingZone.district))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getShippingZoneById(
	id: string,
	options: ShippingZoneMutationOptions
): Promise<ShippingZone> {
	assertShippingPermission(options.actor, 'read');

	const row = await findShippingZoneById(id);
	if (!row) zoneNotFound({ id });
	return row;
}

export async function getShippingZoneByMethodDistrict(
	shippingMethodId: string,
	district: SriLankaDistrict
): Promise<ShippingZone | null> {
	const [row] = await getDb()
		.select()
		.from(shippingZone)
		.where(
			and(eq(shippingZone.shippingMethodId, shippingMethodId), eq(shippingZone.district, district))
		)
		.limit(1);

	return row ?? null;
}

export async function createShippingZone(
	input: CreateShippingZoneInput,
	options: ShippingZoneMutationOptions
): Promise<ShippingZone> {
	assertShippingPermission(options.actor, 'create');

	const parsed = parseShippingInput(createShippingZoneInputSchema, input, 'shipping zone');
	await assertShippingMethodExists(parsed.shippingMethodId);
	assertDeliveryEstimate(parsed.estimatedDaysMin, parsed.estimatedDaysMax, 'shipping zone');

	try {
		const [created] = await getDb().insert(shippingZone).values(parsed).returning();
		return created;
	} catch (error) {
		wrapShippingPersistenceError(
			error,
			'Shipping zone already exists for this method and district.'
		);
	}
}

export async function updateShippingZone(
	id: string,
	input: UpdateShippingZoneInput,
	options: ShippingZoneMutationOptions
): Promise<ShippingZone> {
	assertShippingPermission(options.actor, 'update');

	const current = await getShippingZoneById(id, options);
	const parsed = parseShippingInput(updateShippingZoneInputSchema, input, 'shipping zone');
	assertNonEmptyUpdate(parsed, 'shipping zone');

	await assertShippingMethodExists(parsed.shippingMethodId);

	const estimatedDaysMin = parsed.estimatedDaysMin ?? current.estimatedDaysMin;
	const estimatedDaysMax = parsed.estimatedDaysMax ?? current.estimatedDaysMax;
	assertDeliveryEstimate(estimatedDaysMin, estimatedDaysMax, 'shipping zone');

	try {
		const [updated] = await getDb()
			.update(shippingZone)
			.set(parsed)
			.where(eq(shippingZone.id, id))
			.returning();

		if (!updated) zoneNotFound({ id });
		return updated;
	} catch (error) {
		wrapShippingPersistenceError(
			error,
			'Shipping zone already exists for this method and district.'
		);
	}
}

export async function upsertShippingZone(
	input: CreateShippingZoneInput,
	options: ShippingZoneMutationOptions
): Promise<ShippingZone> {
	assertShippingPermission(options.actor, 'update');

	const parsed = parseShippingInput(createShippingZoneInputSchema, input, 'shipping zone');
	const existing = await getShippingZoneByMethodDistrict(parsed.shippingMethodId, parsed.district);

	if (!existing) return createShippingZone(parsed, options);
	return updateShippingZone(existing.id, parsed, options);
}

export async function deleteShippingZone(
	id: string,
	options: ShippingZoneMutationOptions
): Promise<ShippingZone> {
	assertShippingPermission(options.actor, 'delete');

	const existing = await getShippingZoneById(id, options);
	const [deleted] = await getDb().delete(shippingZone).where(eq(shippingZone.id, id)).returning();
	return deleted ?? existing;
}

async function findShippingZoneById(id: string): Promise<ShippingZone | null> {
	const [row] = await getDb().select().from(shippingZone).where(eq(shippingZone.id, id)).limit(1);
	return row ?? null;
}

async function assertShippingMethodExists(shippingMethodId: string | undefined) {
	if (!shippingMethodId) return;

	const [row] = await getDb()
		.select({ id: shippingMethod.id })
		.from(shippingMethod)
		.where(eq(shippingMethod.id, shippingMethodId))
		.limit(1);

	if (!row) methodNotFound({ shippingMethodId });
}

function buildZoneFilters(options: ListShippingZonesOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.shippingMethodId)
		filters.push(eq(shippingZone.shippingMethodId, options.shippingMethodId));
	if (options.district) filters.push(eq(shippingZone.district, options.district));

	return filters;
}
