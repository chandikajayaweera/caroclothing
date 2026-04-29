import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { InventoryError, ErrorCode } from '$lib/server/modules/errors';
import { productVariant } from '$lib/server/modules/products/products.drizzle';
import {
	insertInventorySchema,
	inventory,
	inventoryMovement,
	type Inventory,
	type InventoryMovement
} from './inventory.drizzle';
import {
	assertInventoryPermission,
	assertNonEmptyUpdate,
	assertPositiveQuantity,
	conflict,
	insufficientStock,
	inventoryNotFound,
	normalizeLimit,
	normalizeOffset,
	parseInventoryInput,
	variantNotFound,
	wrapInventoryPersistenceError,
	type InventoryServiceActor
} from './service-utils';

const inventoryIdSchema = z.string().min(1);
const variantIdSchema = z.string().min(1);
const movementMetadataSchema = z.object({
	referenceId: z.string().min(1).optional().nullable(),
	note: z.string().max(500).optional().nullable()
});

const createInventoryInputSchema = insertInventorySchema
	.omit({
		id: true,
		updatedAt: true
	})
	.extend({
		quantity: z.number().int().min(0).optional(),
		reservedQuantity: z.number().int().min(0).optional(),
		lowStockThreshold: z.number().int().min(0).optional(),
		trackInventory: z.boolean().optional(),
		allowBackorder: z.boolean().optional()
	});

const updateInventorySettingsInputSchema = z.object({
	lowStockThreshold: z.number().int().min(0).optional(),
	trackInventory: z.boolean().optional(),
	allowBackorder: z.boolean().optional()
});

const stockQuantityInputSchema = movementMetadataSchema.extend({
	quantity: z.number().int().positive()
});

const setInventoryQuantityInputSchema = movementMetadataSchema.extend({
	quantity: z.number().int().min(0)
});

const adjustInventoryQuantityInputSchema = movementMetadataSchema.extend({
	quantityDelta: z
		.number()
		.int()
		.refine((value) => value !== 0, {
			message: 'quantityDelta cannot be zero'
		})
});

export type CreateInventoryInput = z.infer<typeof createInventoryInputSchema>;
export type UpdateInventorySettingsInput = z.infer<typeof updateInventorySettingsInputSchema>;
export type StockQuantityInput = z.infer<typeof stockQuantityInputSchema>;
export type SetInventoryQuantityInput = z.infer<typeof setInventoryQuantityInputSchema>;
export type AdjustInventoryQuantityInput = z.infer<typeof adjustInventoryQuantityInputSchema>;

export type InventoryMutationOptions = {
	actor: InventoryServiceActor;
};

export type InventorySystemMutationOptions = {
	actor?: InventoryServiceActor | null;
};

export type ListInventoryOptions = {
	actor: InventoryServiceActor;
	variantId?: string;
	productId?: string;
	lowStockOnly?: boolean;
	trackInventory?: boolean;
	allowBackorder?: boolean;
	sortBy?: 'updatedAt' | 'quantity' | 'availableQuantity' | 'lowStockThreshold';
	sortDirection?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
};

export type InventoryAvailability = {
	inventory: Inventory | null;
	variantId: string;
	trackInventory: boolean;
	allowBackorder: boolean;
	quantity: number | null;
	reservedQuantity: number | null;
	availableQuantity: number | null;
	lowStockThreshold: number | null;
	isLowStock: boolean;
	isOutOfStock: boolean;
	canBackorder: boolean;
	canFulfill: boolean;
	requestedQuantity: number;
};

export async function listInventory(options: ListInventoryOptions): Promise<Inventory[]> {
	assertInventoryPermission(options.actor, 'read');

	const filters = buildInventoryFilters(options);
	if (options.productId) filters.push(eq(productVariant.productId, options.productId));

	if (options.productId) {
		const rows = await getDb()
			.select({ inventory })
			.from(inventory)
			.innerJoin(productVariant, eq(inventory.variantId, productVariant.id))
			.where(filters.length ? and(...filters) : undefined)
			.orderBy(...buildInventoryOrderBy(options))
			.limit(normalizeLimit(options.limit))
			.offset(normalizeOffset(options.offset));

		return rows.map((row) => row.inventory);
	}

	return getDb()
		.select()
		.from(inventory)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(...buildInventoryOrderBy(options))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function listLowStockInventory(
	options: Omit<ListInventoryOptions, 'lowStockOnly'>
): Promise<Inventory[]> {
	return listInventory({ ...options, lowStockOnly: true });
}

export async function getInventoryById(
	id: string,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'read');

	const parsedId = parseInventoryInput(inventoryIdSchema, id, 'inventory id');
	const [row] = await getDb().select().from(inventory).where(eq(inventory.id, parsedId)).limit(1);

	if (!row) inventoryNotFound({ id });
	return row;
}

export async function getInventoryByVariantId(
	variantId: string,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'read');

	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');
	const row = await findInventoryByVariantId(parsedVariantId);

	if (!row) inventoryNotFound({ variantId });
	return row;
}

export async function getInventoryAvailability(
	variantId: string,
	requestedQuantity = 1
): Promise<InventoryAvailability> {
	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');
	assertPositiveQuantity(requestedQuantity, 'requestedQuantity');

	const row = await findInventoryByVariantId(parsedVariantId);
	if (!row || !row.trackInventory) {
		return {
			inventory: row ?? null,
			variantId: parsedVariantId,
			trackInventory: false,
			allowBackorder: row?.allowBackorder ?? false,
			quantity: row?.quantity ?? null,
			reservedQuantity: row?.reservedQuantity ?? null,
			availableQuantity: null,
			lowStockThreshold: row?.lowStockThreshold ?? null,
			isLowStock: false,
			isOutOfStock: false,
			canBackorder: false,
			canFulfill: true,
			requestedQuantity
		};
	}

	const availableQuantity = row.quantity - row.reservedQuantity;
	const canBackorder = row.allowBackorder && row.quantity === 0;

	return {
		inventory: row,
		variantId: parsedVariantId,
		trackInventory: row.trackInventory,
		allowBackorder: row.allowBackorder,
		quantity: row.quantity,
		reservedQuantity: row.reservedQuantity,
		availableQuantity,
		lowStockThreshold: row.lowStockThreshold,
		isLowStock: availableQuantity <= row.lowStockThreshold,
		isOutOfStock: availableQuantity <= 0,
		canBackorder,
		canFulfill: availableQuantity >= requestedQuantity || canBackorder,
		requestedQuantity
	};
}

export async function createInventory(
	input: CreateInventoryInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'create');

	const parsed = parseInventoryInput(createInventoryInputSchema, input, 'inventory');
	assertInventoryInvariant(parsed.quantity ?? 0, parsed.reservedQuantity ?? 0);
	await assertVariantExists(parsed.variantId);

	try {
		const [created] = await getDb().insert(inventory).values(parsed).returning();
		return created;
	} catch (error) {
		wrapInventoryPersistenceError(error, 'Inventory already exists for this variant.');
	}
}

export async function getOrCreateInventoryForVariant(
	variantId: string,
	options: InventoryMutationOptions & Partial<Omit<CreateInventoryInput, 'variantId'>>
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'create');

	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');
	const existing = await findInventoryByVariantId(parsedVariantId);
	if (existing) return existing;

	return createInventory(
		{
			variantId: parsedVariantId,
			quantity: options.quantity,
			reservedQuantity: options.reservedQuantity,
			lowStockThreshold: options.lowStockThreshold,
			trackInventory: options.trackInventory,
			allowBackorder: options.allowBackorder
		},
		options
	);
}

export async function updateInventorySettings(
	id: string,
	input: UpdateInventorySettingsInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'update');

	const existing = await getInventoryById(id, options);
	const parsed = parseInventoryInput(
		updateInventorySettingsInputSchema,
		input,
		'inventory settings'
	);
	assertNonEmptyUpdate(parsed, 'inventory settings');

	const [updated] = await getDb()
		.update(inventory)
		.set(parsed)
		.where(eq(inventory.id, existing.id))
		.returning();

	return updated ?? existing;
}

export async function updateInventorySettingsByVariantId(
	variantId: string,
	input: UpdateInventorySettingsInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	const existing = await getInventoryByVariantId(variantId, options);
	return updateInventorySettings(existing.id, input, options);
}

export async function setInventoryQuantity(
	variantId: string,
	input: SetInventoryQuantityInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(setInventoryQuantityInputSchema, input, 'inventory quantity');
	return applyQuantityDelta(variantId, parsed.quantity, {
		type: 'adjustment',
		absolute: true,
		referenceId: parsed.referenceId,
		note: parsed.note
	});
}

export async function adjustInventoryQuantity(
	variantId: string,
	input: AdjustInventoryQuantityInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(
		adjustInventoryQuantityInputSchema,
		input,
		'inventory adjustment'
	);
	return applyQuantityDelta(variantId, parsed.quantityDelta, {
		type: 'adjustment',
		referenceId: parsed.referenceId,
		note: parsed.note
	});
}

export async function restockInventory(
	variantId: string,
	input: StockQuantityInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(stockQuantityInputSchema, input, 'inventory restock');
	return applyQuantityDelta(variantId, parsed.quantity, {
		type: 'restock',
		referenceId: parsed.referenceId,
		note: parsed.note
	});
}

export async function returnInventoryStock(
	variantId: string,
	input: StockQuantityInput,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(stockQuantityInputSchema, input, 'inventory return');
	return applyQuantityDelta(variantId, parsed.quantity, {
		type: 'return',
		referenceId: parsed.referenceId,
		note: parsed.note
	});
}

export async function reserveInventory(
	variantId: string,
	input: StockQuantityInput,
	options: InventorySystemMutationOptions = {}
): Promise<number> {
	if (options.actor) assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(stockQuantityInputSchema, input, 'inventory reservation');
	return reserveInventoryQuantity(variantId, parsed.quantity, {
		type: 'reserved',
		referenceId: parsed.referenceId,
		note: parsed.note ?? 'Reserved stock'
	});
}

export async function releaseInventoryReservation(
	variantId: string,
	input: StockQuantityInput,
	options: InventorySystemMutationOptions = {}
): Promise<number> {
	if (options.actor) assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(stockQuantityInputSchema, input, 'inventory release');
	return releaseReservedInventoryQuantity(variantId, parsed.quantity, {
		type: 'released',
		referenceId: parsed.referenceId,
		note: parsed.note ?? 'Released stock'
	});
}

export async function cancelInventoryReservation(
	variantId: string,
	input: StockQuantityInput,
	options: InventorySystemMutationOptions = {}
): Promise<number> {
	if (options.actor) assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(stockQuantityInputSchema, input, 'inventory cancellation');
	return releaseReservedInventoryQuantity(variantId, parsed.quantity, {
		type: 'cancelled',
		referenceId: parsed.referenceId,
		note: parsed.note ?? 'Cancelled reservation'
	});
}

export async function consumeReservedInventory(
	variantId: string,
	input: StockQuantityInput,
	options: InventorySystemMutationOptions = {}
): Promise<number> {
	if (options.actor) assertInventoryPermission(options.actor, 'update');

	const parsed = parseInventoryInput(stockQuantityInputSchema, input, 'inventory sale');
	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');

	return getDb().transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, parsedVariantId))
			.limit(1);

		if (!row || !row.trackInventory) return 0;
		if (row.allowBackorder && row.quantity === 0) return 0;
		if (row.reservedQuantity < parsed.quantity) {
			throw new InventoryError(
				'Reserved stock is lower than the sale quantity.',
				ErrorCode.INVALID_INVENTORY_MOVEMENT,
				{
					variantId: parsedVariantId,
					requestedQuantity: parsed.quantity,
					reservedQuantity: row.reservedQuantity
				}
			);
		}

		const nextQuantity = row.quantity - parsed.quantity;
		if (nextQuantity < 0) {
			insufficientStock({
				variantId: parsedVariantId,
				requestedQuantity: parsed.quantity,
				availableQuantity: row.quantity
			});
		}

		const [updated] = await tx
			.update(inventory)
			.set({
				quantity: nextQuantity,
				reservedQuantity: row.reservedQuantity - parsed.quantity
			})
			.where(eq(inventory.id, row.id))
			.returning();

		await tx.insert(inventoryMovement).values({
			variantId: parsedVariantId,
			type: 'sale',
			quantityDelta: -parsed.quantity,
			quantityAfter: nextQuantity,
			referenceId: parsed.referenceId,
			note: parsed.note ?? 'Consumed reserved stock'
		});

		return updated ? parsed.quantity : 0;
	});
}

export async function deleteInventory(
	id: string,
	options: InventoryMutationOptions
): Promise<Inventory> {
	assertInventoryPermission(options.actor, 'delete');

	const existing = await getInventoryById(id, options);
	const [deleted] = await getDb().delete(inventory).where(eq(inventory.id, id)).returning();

	return deleted ?? existing;
}

async function applyQuantityDelta(
	variantId: string,
	quantityOrDelta: number,
	options: {
		type: InventoryMovement['type'];
		absolute?: boolean;
		referenceId?: string | null;
		note?: string | null;
	}
): Promise<Inventory> {
	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');

	return getDb().transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, parsedVariantId))
			.limit(1);

		if (!row) inventoryNotFound({ variantId: parsedVariantId });

		const nextQuantity = options.absolute ? quantityOrDelta : row.quantity + quantityOrDelta;
		const quantityDelta = nextQuantity - row.quantity;
		if (quantityDelta === 0) return row;
		assertInventoryInvariant(nextQuantity, row.reservedQuantity);

		const [updated] = await tx
			.update(inventory)
			.set({ quantity: nextQuantity })
			.where(eq(inventory.id, row.id))
			.returning();

		await tx.insert(inventoryMovement).values({
			variantId: parsedVariantId,
			type: options.type,
			quantityDelta,
			quantityAfter: nextQuantity,
			referenceId: options.referenceId,
			note: options.note
		});

		return updated ?? row;
	});
}

async function reserveInventoryQuantity(
	variantId: string,
	quantity: number,
	options: {
		type: Extract<InventoryMovement['type'], 'reserved'>;
		referenceId?: string | null;
		note?: string | null;
	}
): Promise<number> {
	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');

	return getDb().transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, parsedVariantId))
			.limit(1);

		if (!row || !row.trackInventory) return 0;

		const availableQuantity = row.quantity - row.reservedQuantity;
		if (availableQuantity < quantity) {
			if (row.allowBackorder && row.quantity === 0) return 0;

			insufficientStock({
				variantId: parsedVariantId,
				requestedQuantity: quantity,
				availableQuantity
			});
		}

		const nextReservedQuantity = row.reservedQuantity + quantity;
		assertInventoryInvariant(row.quantity, nextReservedQuantity);

		await tx
			.update(inventory)
			.set({ reservedQuantity: nextReservedQuantity })
			.where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovement).values({
			variantId: parsedVariantId,
			type: options.type,
			quantityDelta: -quantity,
			quantityAfter: row.quantity,
			referenceId: options.referenceId,
			note: options.note
		});

		return quantity;
	});
}

async function releaseReservedInventoryQuantity(
	variantId: string,
	quantity: number,
	options: {
		type: Extract<InventoryMovement['type'], 'released' | 'cancelled'>;
		referenceId?: string | null;
		note?: string | null;
	}
): Promise<number> {
	const parsedVariantId = parseInventoryInput(variantIdSchema, variantId, 'variant id');

	return getDb().transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(inventory)
			.where(eq(inventory.variantId, parsedVariantId))
			.limit(1);

		if (!row || !row.trackInventory) return 0;

		const releasedQuantity = Math.min(quantity, row.reservedQuantity);
		if (releasedQuantity <= 0) return 0;

		await tx
			.update(inventory)
			.set({ reservedQuantity: row.reservedQuantity - releasedQuantity })
			.where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovement).values({
			variantId: parsedVariantId,
			type: options.type,
			quantityDelta: releasedQuantity,
			quantityAfter: row.quantity,
			referenceId: options.referenceId,
			note: options.note
		});

		return releasedQuantity;
	});
}

async function findInventoryByVariantId(variantId: string): Promise<Inventory | null> {
	const [row] = await getDb()
		.select()
		.from(inventory)
		.where(eq(inventory.variantId, variantId))
		.limit(1);

	return row ?? null;
}

async function assertVariantExists(variantId: string): Promise<void> {
	const [row] = await getDb()
		.select({ id: productVariant.id })
		.from(productVariant)
		.where(eq(productVariant.id, variantId))
		.limit(1);

	if (!row) variantNotFound({ variantId });
}

function assertInventoryInvariant(quantity: number, reservedQuantity: number): void {
	if (quantity < 0) {
		throw new InventoryError('Inventory quantity cannot be negative.', ErrorCode.VALIDATION_ERROR, {
			quantity
		});
	}

	if (reservedQuantity < 0 || reservedQuantity > quantity) {
		conflict('Reserved quantity must be between zero and total quantity.', {
			quantity,
			reservedQuantity
		});
	}
}

function buildInventoryFilters(options: ListInventoryOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.variantId) filters.push(eq(inventory.variantId, options.variantId));
	if (options.lowStockOnly) {
		filters.push(
			and(
				eq(inventory.trackInventory, true),
				sql`${inventory.quantity} - ${inventory.reservedQuantity} <= ${inventory.lowStockThreshold}`
			)!
		);
	}
	if (options.trackInventory !== undefined) {
		filters.push(eq(inventory.trackInventory, options.trackInventory));
	}
	if (options.allowBackorder !== undefined) {
		filters.push(eq(inventory.allowBackorder, options.allowBackorder));
	}

	return filters;
}

function buildInventoryOrderBy(options: ListInventoryOptions) {
	const direction = options.sortDirection === 'asc' ? asc : desc;

	switch (options.sortBy) {
		case 'quantity':
			return [direction(inventory.quantity), asc(inventory.variantId)];
		case 'availableQuantity':
			return [
				direction(sql`${inventory.quantity} - ${inventory.reservedQuantity}`),
				asc(inventory.variantId)
			];
		case 'lowStockThreshold':
			return [direction(inventory.lowStockThreshold), asc(inventory.variantId)];
		case 'updatedAt':
		default:
			return [direction(inventory.updatedAt)];
	}
}
