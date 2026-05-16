import type { InventoryMovement, InsertInventory, UpdateInventory } from './inventory.drizzle';
import type { ProductTier, SizeTier } from '../products/products.drizzle';

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

export type InventoryStockStatusFilter = 'missing' | 'low' | 'out' | 'available' | 'untracked';

export type InventoryProductSummaryDTO = {
	id: string;
	name: string;
	slug: string;
	tier: ProductTier;
	isActive: boolean;
};

export type InventoryVariantSummaryDTO = {
	id: string;
	productId: string;
	sku: string;
	size: SizeTier;
	color: string;
	colorHex: string | null;
	isActive: boolean;
};

export type InventoryListItemDTO = {
	variantId: string;
	product: InventoryProductSummaryDTO;
	variant: InventoryVariantSummaryDTO;
	inventory: InventoryDTO | null;
	hasInventory: boolean;
};

export type InventoryDetailDTO = InventoryListItemDTO & {
	movements: InventoryMovementDTO[];
};

export type InventorySummaryDTO = {
	totalVariants: number;
	inventoryRows: number;
	missingInventoryCount: number;
	trackedCount: number;
	untrackedCount: number;
	lowStockCount: number;
	outOfStockCount: number;
	backorderEnabledCount: number;
	totalQuantity: number;
	totalReservedQuantity: number;
	totalAvailableQuantity: number;
};

export type InventoryListOptions = {
	query?: string | null;
	productId?: string;
	variantId?: string;
	stockStatus?: InventoryStockStatusFilter;
	trackInventory?: boolean;
	allowBackorder?: boolean;
	limit?: number;
	offset?: number;
};

export type InventoryMovementListOptions = {
	variantId?: string;
	type?: InventoryMovement['type'];
	referenceId?: string | null;
	limit?: number;
	offset?: number;
};

export type InventoryListResult = {
	items: InventoryListItemDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type InventoryMovementListResult = {
	items: InventoryMovementDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type CreateInventoryInput = Omit<InsertInventory, 'reservedQuantity'>;

export type UpdateInventoryInput = UpdateInventory;

export type InitializeInventoryInput = CreateInventoryInput & {
	note?: string | null;
};

export type UpdateInventorySettingsInput = Pick<
	UpdateInventory,
	'lowStockThreshold' | 'trackInventory' | 'allowBackorder'
> & {
	variantId: string;
};

export type RestockInventoryInput = {
	variantId: string;
	quantity: number;
	note?: string | null;
	now?: Date;
};

export type AdjustInventoryInput = {
	variantId: string;
	quantityDelta: number;
	note?: string | null;
	now?: Date;
};

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

export type RecordInventorySaleInput = {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
	note?: string | null;
};

export type RestoreInventorySaleInput = {
	variantId: string;
	quantity: number;
	referenceId: string;
	now?: Date;
	note?: string | null;
	type?: Extract<InventoryMovement['type'], 'cancelled' | 'return'>;
};
