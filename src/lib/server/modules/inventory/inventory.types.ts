import type { InventoryMovement, InsertInventory, UpdateInventory } from './inventory.drizzle';

export type InventoryDTO = {
	id: string;
	variantId: string;
	quantity: number;
	reservedQuantity: number;
	availableQuantity: number;
	lowStockThreshold: number;
	trackInventory: boolean;
	allowBackorder: boolean;
	isLowStock: boolean;
	updatedAt: Date;
};

export type InventoryAvailabilityDTO = {
	variantId: string;
	quantity: number;
	reservedQuantity: number;
	availableQuantity: number;
	lowStockThreshold: number;
	trackInventory: boolean;
	allowBackorder: boolean;
	isLowStock: boolean;
};

export type InventoryMovementDTO = {
	id: string;
	variantId: string;
	type: InventoryMovement['type'];
	quantityDelta: number;
	quantityAfter: number;
	reservedQuantityDelta: number;
	reservedQuantityAfter: number;
	referenceId: string | null;
	note: string | null;
	createdAt: Date;
};

export type CreateInventoryInput = InsertInventory;

export type UpdateInventoryInput = UpdateInventory;

export type ReserveInventoryInput = {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
};

export type InventoryReservationResult = {
	variantId: string;
	requestedQuantity: number;
	reservedQuantity: number;
	backorderedQuantity: number;
	availableBefore: number;
	availableAfter: number;
	trackInventory: boolean;
	allowBackorder: boolean;
};

export type ReleaseInventoryInput = {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
};

export type InventoryReleaseResult = {
	variantId: string;
	requestedQuantity: number;
	releasedQuantity: number;
	outstandingReservedQuantity: number;
};

export type InventoryAvailabilityLookupInput = {
	variantIds: string[];
};

export type OutstandingReservationInput = {
	variantId: string;
	referenceId: string;
};
