import { nanoid } from 'nanoid';
import {
	inventory,
	inventoryMovement,
	type Inventory,
	type InventoryMovement
} from '$lib/server/modules/inventory/inventory.drizzle';
import type { TestDatabase } from '../db';

export async function seedInventory(
	db: TestDatabase,
	variantId: string,
	overrides: Partial<Omit<typeof inventory.$inferInsert, 'variantId'>> = {}
): Promise<Inventory> {
	const quantity = overrides.quantity ?? 10;

	const [created] = await db
		.insert(inventory)
		.values({
			id: overrides.id ?? nanoid(),
			variantId,
			quantity,
			reservedQuantity: overrides.reservedQuantity ?? 0,
			lowStockThreshold: overrides.lowStockThreshold ?? 5,
			trackInventory: overrides.trackInventory ?? true,
			allowBackorder: overrides.allowBackorder ?? false,
			updatedAt: overrides.updatedAt ?? new Date()
		})
		.returning();

	return created;
}

export async function seedInventoryMovement(
	db: TestDatabase,
	variantId: string,
	overrides: Partial<Omit<typeof inventoryMovement.$inferInsert, 'variantId'>> = {}
): Promise<InventoryMovement> {
	const [created] = await db
		.insert(inventoryMovement)
		.values({
			id: overrides.id ?? nanoid(),
			variantId,
			type: overrides.type ?? 'restock',
			quantityDelta: overrides.quantityDelta ?? 1,
			quantityAfter: overrides.quantityAfter ?? 1,
			reservedQuantityDelta: overrides.reservedQuantityDelta ?? 0,
			reservedQuantityAfter: overrides.reservedQuantityAfter ?? 0,
			referenceId: overrides.referenceId ?? null,
			note: overrides.note ?? null,
			createdAt: overrides.createdAt ?? new Date()
		})
		.returning();

	return created;
}
