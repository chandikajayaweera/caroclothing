import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { productVariant } from '$lib/server/modules/products/products.drizzle';
import {
	insertInventoryMovementSchema,
	inventoryMovement,
	type InventoryMovement
} from './inventory.drizzle';
import {
	assertInventoryPermission,
	inventoryMovementNotFound,
	normalizeLimit,
	normalizeOffset,
	parseInventoryInput,
	variantNotFound,
	wrapInventoryPersistenceError,
	type InventoryServiceActor
} from './service-utils';

const createInventoryMovementInputSchema = insertInventoryMovementSchema.omit({
	id: true,
	createdAt: true
});

const movementIdSchema = z.string().min(1);
const movementTypeSchema = z.enum([
	'restock',
	'sale',
	'return',
	'adjustment',
	'reserved',
	'released',
	'cancelled'
]);

export type CreateInventoryMovementInput = z.infer<typeof createInventoryMovementInputSchema>;
export type InventoryMovementType = z.infer<typeof movementTypeSchema>;

export type InventoryMovementMutationOptions = {
	actor: InventoryServiceActor;
};

export type ListInventoryMovementsOptions = InventoryMovementMutationOptions & {
	variantId?: string;
	type?: InventoryMovementType | InventoryMovementType[];
	referenceId?: string;
	createdFrom?: Date;
	createdTo?: Date;
	limit?: number;
	offset?: number;
};

export async function listInventoryMovements(
	options: ListInventoryMovementsOptions
): Promise<InventoryMovement[]> {
	assertInventoryPermission(options.actor, 'read');

	const filters = buildMovementFilters(options);

	return getDb()
		.select()
		.from(inventoryMovement)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(inventoryMovement.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getInventoryMovementById(
	id: string,
	options: InventoryMovementMutationOptions
): Promise<InventoryMovement> {
	assertInventoryPermission(options.actor, 'read');

	const parsedId = parseInventoryInput(movementIdSchema, id, 'inventory movement id');
	const [row] = await getDb()
		.select()
		.from(inventoryMovement)
		.where(eq(inventoryMovement.id, parsedId))
		.limit(1);

	if (!row) inventoryMovementNotFound({ id });
	return row;
}

export async function appendInventoryMovement(
	input: CreateInventoryMovementInput,
	options: InventoryMovementMutationOptions
): Promise<InventoryMovement> {
	assertInventoryPermission(options.actor, 'create');

	const parsed = parseInventoryInput(
		createInventoryMovementInputSchema,
		input,
		'inventory movement'
	);
	await assertVariantExists(parsed.variantId);

	try {
		const [created] = await getDb().insert(inventoryMovement).values(parsed).returning();
		return created;
	} catch (error) {
		wrapInventoryPersistenceError(error, 'Unable to append inventory movement.');
	}
}

async function assertVariantExists(variantId: string): Promise<void> {
	const [row] = await getDb()
		.select({ id: productVariant.id })
		.from(productVariant)
		.where(eq(productVariant.id, variantId))
		.limit(1);

	if (!row) variantNotFound({ variantId });
}

function buildMovementFilters(options: ListInventoryMovementsOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.variantId) filters.push(eq(inventoryMovement.variantId, options.variantId));
	if (options.type) {
		const types = Array.isArray(options.type) ? options.type : [options.type];
		filters.push(inArray(inventoryMovement.type, types));
	}
	if (options.referenceId) filters.push(eq(inventoryMovement.referenceId, options.referenceId));
	if (options.createdFrom) filters.push(gte(inventoryMovement.createdAt, options.createdFrom));
	if (options.createdTo) filters.push(lte(inventoryMovement.createdAt, options.createdTo));

	return filters;
}
