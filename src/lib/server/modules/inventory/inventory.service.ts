import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { ErrorCode, InventoryError, getErrorMessage, isAppError } from '$lib/server/modules/errors';
import {
	insertInventoryMovementSchema,
	inventory,
	inventoryMovement,
	type InsertInventoryMovement,
	type Inventory,
	type InventoryMovement
} from './inventory.drizzle';
import type {
	InventoryAvailabilityDTO,
	InventoryAvailabilityLookupInput,
	InventoryDTO,
	InventoryReleaseResult,
	InventoryReservationResult,
	OutstandingReservationInput,
	ReleaseInventoryInput,
	ReserveInventoryInput
} from './inventory.types';

type Db = ReturnType<typeof getDb>;
export type InventoryTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | InventoryTx;

const UNTRACKED_AVAILABLE_QUANTITY = 1_000_000;

export async function getInventoryAvailabilityByVariantIdsTx(
	tx: QueryExecutor,
	input: InventoryAvailabilityLookupInput
): Promise<InventoryAvailabilityDTO[]> {
	const variantIds = uniqueStrings(input.variantIds);
	if (variantIds.length === 0) return [];

	const rows = await tx.select().from(inventory).where(inArray(inventory.variantId, variantIds));
	return rows.map(toInventoryAvailabilityDTO);
}

export async function reserveInventoryTx(
	tx: InventoryTx,
	input: ReserveInventoryInput
): Promise<InventoryReservationResult> {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const row = await loadInventoryByVariantId(tx, variantId);

	if (!row) {
		throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
			variantId
		});
	}

	const availableBefore = availableQuantity(row);

	if (!row.trackInventory) {
		return {
			variantId,
			requestedQuantity: quantity,
			reservedQuantity: 0,
			backorderedQuantity: 0,
			availableBefore,
			availableAfter: availableBefore,
			trackInventory: false,
			allowBackorder: row.allowBackorder
		};
	}

	if (availableBefore < quantity && !row.allowBackorder) {
		throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, {
			variantId,
			requestedQuantity: quantity,
			availableQuantity: availableBefore
		});
	}

	const reservedQuantity = Math.min(quantity, availableBefore);
	const backorderedQuantity = quantity - reservedQuantity;

	if (reservedQuantity === 0) {
		return {
			variantId,
			requestedQuantity: quantity,
			reservedQuantity,
			backorderedQuantity,
			availableBefore,
			availableAfter: availableBefore,
			trackInventory: true,
			allowBackorder: row.allowBackorder
		};
	}

	const reservedAfter = row.reservedQuantity + reservedQuantity;
	const updated = await updateReservedQuantityTx(tx, row, reservedAfter, now);

	await insertInventoryMovementTx(tx, {
		variantId,
		type: 'reserved',
		quantityDelta: 0,
		quantityAfter: updated.quantity,
		reservedQuantityDelta: reservedQuantity,
		reservedQuantityAfter: updated.reservedQuantity,
		referenceId,
		note: null
	});

	return {
		variantId,
		requestedQuantity: quantity,
		reservedQuantity,
		backorderedQuantity,
		availableBefore,
		availableAfter: availableQuantity(updated),
		trackInventory: true,
		allowBackorder: row.allowBackorder
	};
}

export async function releaseInventoryReservationTx(
	tx: InventoryTx,
	input: ReleaseInventoryInput
): Promise<InventoryReleaseResult> {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const outstandingReservedQuantity = await getOutstandingReservedQuantityTx(tx, {
		variantId,
		referenceId
	});
	const releasedQuantity = Math.min(quantity, outstandingReservedQuantity);

	if (releasedQuantity === 0) {
		return {
			variantId,
			requestedQuantity: quantity,
			releasedQuantity: 0,
			outstandingReservedQuantity
		};
	}

	const row = await loadInventoryByVariantId(tx, variantId);
	if (!row) {
		throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
			variantId
		});
	}

	const reservedAfter = Math.max(0, row.reservedQuantity - releasedQuantity);
	const updated = await updateReservedQuantityTx(tx, row, reservedAfter, now);

	await insertInventoryMovementTx(tx, {
		variantId,
		type: 'released',
		quantityDelta: 0,
		quantityAfter: updated.quantity,
		reservedQuantityDelta: -releasedQuantity,
		reservedQuantityAfter: updated.reservedQuantity,
		referenceId,
		note: null
	});

	return {
		variantId,
		requestedQuantity: quantity,
		releasedQuantity,
		outstandingReservedQuantity
	};
}

export async function getOutstandingReservedQuantityTx(
	tx: QueryExecutor,
	input: OutstandingReservationInput
): Promise<number> {
	const variantId = normalizeId(input.variantId, 'variantId');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const [row] = await tx
		.select({
			total: sql<number>`coalesce(sum(${inventoryMovement.reservedQuantityDelta}), 0)`
		})
		.from(inventoryMovement)
		.where(
			sql`${inventoryMovement.variantId} = ${variantId} and ${inventoryMovement.referenceId} = ${referenceId}`
		);

	return Math.max(0, Number(row?.total ?? 0));
}

function toInventoryDTO(row: Inventory): InventoryDTO {
	const available = availableQuantity(row);

	return {
		id: row.id,
		variantId: row.variantId,
		quantity: row.quantity,
		reservedQuantity: row.reservedQuantity,
		availableQuantity: available,
		lowStockThreshold: row.lowStockThreshold,
		trackInventory: row.trackInventory,
		allowBackorder: row.allowBackorder,
		isLowStock: row.trackInventory && available <= row.lowStockThreshold,
		updatedAt: row.updatedAt
	};
}

function toInventoryAvailabilityDTO(row: Inventory): InventoryAvailabilityDTO {
	const dto = toInventoryDTO(row);
	return {
		variantId: dto.variantId,
		quantity: dto.quantity,
		reservedQuantity: dto.reservedQuantity,
		availableQuantity: dto.availableQuantity,
		lowStockThreshold: dto.lowStockThreshold,
		trackInventory: dto.trackInventory,
		allowBackorder: dto.allowBackorder,
		isLowStock: dto.isLowStock
	};
}

async function loadInventoryByVariantId(
	tx: QueryExecutor,
	variantId: string
): Promise<Inventory | null> {
	const [row] = await tx
		.select()
		.from(inventory)
		.where(eq(inventory.variantId, variantId))
		.limit(1);
	return row ?? null;
}

async function updateReservedQuantityTx(
	tx: InventoryTx,
	row: Inventory,
	reservedQuantity: number,
	now: Date
): Promise<Inventory> {
	try {
		const [updated] = await tx
			.update(inventory)
			.set({ reservedQuantity, updatedAt: now })
			.where(eq(inventory.id, row.id))
			.returning();

		if (!updated) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId: row.variantId
			});
		}

		return updated;
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

async function insertInventoryMovementTx(
	tx: InventoryTx,
	input: InsertInventoryMovement
): Promise<InventoryMovement> {
	const data = parseInventoryMovement(input);

	try {
		const [created] = await tx.insert(inventoryMovement).values(data).returning();

		if (!created) {
			throw new InventoryError('Inventory movement was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return created;
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

function parseInventoryMovement(input: InsertInventoryMovement): InsertInventoryMovement {
	const result = insertInventoryMovementSchema.safeParse(input);

	if (!result.success) {
		throw new InventoryError('Invalid inventory movement.', ErrorCode.INVALID_INVENTORY_MOVEMENT, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function availableQuantity(row: Inventory): number {
	if (!row.trackInventory) return UNTRACKED_AVAILABLE_QUANTITY;
	return Math.max(0, row.quantity - row.reservedQuantity);
}

function normalizeQuantity(value: number, field: string): number {
	if (!Number.isInteger(value) || value <= 0) {
		throw new InventoryError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return value;
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new InventoryError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mapInventoryPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);
	const normalizedMessage = message.toLowerCase();

	if (normalizedMessage.includes('foreign key')) {
		throw new InventoryError('Related inventory record not found.', ErrorCode.NOT_FOUND);
	}

	if (normalizedMessage.includes('check constraint failed')) {
		throw new InventoryError('Invalid inventory data.', ErrorCode.INVALID_INVENTORY_MOVEMENT);
	}

	throw error;
}
