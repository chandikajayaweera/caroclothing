import { and, asc, desc, eq, like, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import {
	insertShippingMethodBaseSchema,
	shippingMethod,
	updateShippingMethodSchema,
	type ShippingMethod
} from './shipping.drizzle';
import {
	assertDeliveryEstimate,
	assertNonEmptyUpdate,
	assertShippingPermission,
	isAdmin,
	methodNotFound,
	normalizeLimit,
	normalizeOffset,
	parseShippingInput,
	wrapShippingPersistenceError,
	type ShippingServiceActor
} from './service-utils';

const createShippingMethodInputSchema = insertShippingMethodBaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateShippingMethodInputSchema = updateShippingMethodSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export type CreateShippingMethodInput = z.infer<typeof createShippingMethodInputSchema>;
export type UpdateShippingMethodInput = z.infer<typeof updateShippingMethodInputSchema>;

export type ListShippingMethodsOptions = {
	actor?: ShippingServiceActor | null;
	includeInactive?: boolean;
	search?: string;
	sortBy?: 'sortOrder' | 'createdAt' | 'price' | 'name';
	sortDirection?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
};

export type ShippingMethodMutationOptions = {
	actor: ShippingServiceActor;
};

export async function listShippingMethods(
	options: ListShippingMethodsOptions = {}
): Promise<ShippingMethod[]> {
	if (options.includeInactive) assertShippingPermission(options.actor, 'read');

	const filters = buildMethodFilters(options);

	return getDb()
		.select()
		.from(shippingMethod)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(...buildMethodOrderBy(options))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getShippingMethodById(
	id: string,
	options: { actor?: ShippingServiceActor | null; includeInactive?: boolean } = {}
): Promise<ShippingMethod> {
	if (options.includeInactive) assertShippingPermission(options.actor, 'read');

	const filters = [eq(shippingMethod.id, id)];
	if (!options.includeInactive) filters.push(eq(shippingMethod.isActive, true));

	const [row] = await getDb()
		.select()
		.from(shippingMethod)
		.where(and(...filters))
		.limit(1);

	if (!row) methodNotFound({ id });
	return row;
}

export async function getShippingMethodDetailsById(
	id: string,
	options: { actor?: ShippingServiceActor | null; includeInactive?: boolean } = {}
) {
	const method = await getShippingMethodById(id, options);

	const row = await getDb().query.shippingMethod.findFirst({
		where: (methods, { eq }) => eq(methods.id, method.id),
		with: {
			zones: {
				orderBy: (zones, { asc }) => [asc(zones.district)]
			}
		}
	});

	if (!row) methodNotFound({ id });
	return row;
}

export async function createShippingMethod(
	input: CreateShippingMethodInput,
	options: ShippingMethodMutationOptions
): Promise<ShippingMethod> {
	assertShippingPermission(options.actor, 'create');

	const parsed = parseShippingInput(createShippingMethodInputSchema, input, 'shipping method');
	assertDeliveryEstimate(parsed.estimatedDaysMin, parsed.estimatedDaysMax, 'shipping method');

	try {
		const [created] = await getDb().insert(shippingMethod).values(parsed).returning();
		return created;
	} catch (error) {
		wrapShippingPersistenceError(error, 'Shipping method already exists.');
	}
}

export async function updateShippingMethod(
	id: string,
	input: UpdateShippingMethodInput,
	options: ShippingMethodMutationOptions
): Promise<ShippingMethod> {
	assertShippingPermission(options.actor, 'update');

	const current = await getShippingMethodById(id, {
		actor: options.actor,
		includeInactive: true
	});
	const parsed = parseShippingInput(updateShippingMethodInputSchema, input, 'shipping method');
	assertNonEmptyUpdate(parsed, 'shipping method');

	const estimatedDaysMin = parsed.estimatedDaysMin ?? current.estimatedDaysMin;
	const estimatedDaysMax = parsed.estimatedDaysMax ?? current.estimatedDaysMax;
	assertDeliveryEstimate(estimatedDaysMin, estimatedDaysMax, 'shipping method');

	try {
		const [updated] = await getDb()
			.update(shippingMethod)
			.set(parsed)
			.where(eq(shippingMethod.id, id))
			.returning();

		if (!updated) methodNotFound({ id });
		return updated;
	} catch (error) {
		wrapShippingPersistenceError(error, 'Unable to update shipping method.');
	}
}

export async function activateShippingMethod(
	id: string,
	options: ShippingMethodMutationOptions
): Promise<ShippingMethod> {
	return updateShippingMethod(id, { isActive: true }, options);
}

export async function deactivateShippingMethod(
	id: string,
	options: ShippingMethodMutationOptions
): Promise<ShippingMethod> {
	return updateShippingMethod(id, { isActive: false }, options);
}

export async function deleteShippingMethod(
	id: string,
	options: ShippingMethodMutationOptions
): Promise<ShippingMethod> {
	assertShippingPermission(options.actor, 'delete');

	const existing = await getShippingMethodById(id, {
		actor: options.actor,
		includeInactive: true
	});
	const [deleted] = await getDb()
		.delete(shippingMethod)
		.where(eq(shippingMethod.id, id))
		.returning();
	return deleted ?? existing;
}

function buildMethodFilters(options: ListShippingMethodsOptions): SQL[] {
	const filters: SQL[] = [];

	if (!options.includeInactive) filters.push(eq(shippingMethod.isActive, true));
	if (options.search) filters.push(like(shippingMethod.name, `%${options.search}%`));

	if (options.includeInactive && !isAdmin(options.actor)) {
		filters.push(eq(shippingMethod.isActive, true));
	}

	return filters;
}

function buildMethodOrderBy(options: ListShippingMethodsOptions): SQL[] {
	const direction = options.sortDirection === 'desc' ? desc : asc;

	switch (options.sortBy) {
		case 'createdAt':
			return [direction(shippingMethod.createdAt)];
		case 'price':
			return [direction(shippingMethod.price), asc(shippingMethod.sortOrder)];
		case 'name':
			return [direction(shippingMethod.name)];
		case 'sortOrder':
		default:
			return [direction(shippingMethod.sortOrder), asc(shippingMethod.name)];
	}
}
