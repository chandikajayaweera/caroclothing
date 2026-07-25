import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { inventory } from '$lib/server/modules/inventory/inventory.drizzle';
import {
	adjustInventory,
	getInventory,
	getInventoryAvailabilityByVariantIds,
	getInventorySummary,
	initializeInventory,
	listInventory,
	listInventoryMovements,
	restockInventory,
	updateInventorySettings
} from '$lib/server/modules/inventory/inventory.service';
import { productVariant, type ProductVariant } from '../products/products.drizzle';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { makeAdminCtx, makeCustomerCtx } from '../../../../tests/context';
import { seedInventory } from '../../../../tests/factories/inventory';
import { seedProductWithVariant } from '../../../../tests/scenarios/products';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) {
			throw new Error('Test database has not been initialized.');
		}

		return dbState.db;
	}
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-06-19T10:00:00.000Z');

function db() {
	return harness.db;
}

function adminCtx() {
	return makeAdminCtx({ now });
}

async function seedVariantForInventory(
	overrides: {
		productName?: string;
		productSlug?: string;
		size?: ProductVariant['size'];
		color?: string;
		isActive?: boolean;
	} = {}
) {
	const id = crypto.randomUUID().slice(0, 8);
	const { product, variantColor, variant } = await seedProductWithVariant(db(), {
		product: {
			name: overrides.productName ?? `Inventory Product ${id}`,
			slug: overrides.productSlug ?? `inventory-product-${id}`,
			isActive: true
		},
		variantColor: {
			color: overrides.color ?? 'Black',
			colorHex: '#000000'
		},
		variant: {
			size: overrides.size ?? 'M',
			isActive: overrides.isActive ?? true
		}
	});

	return { product, color: variantColor, variant };
}

describe('inventory service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	describe('admin inventory reads and initialization', () => {
		it('initializes inventory, writes opening movement, and hydrates detail rows', async () => {
			const { variant } = await seedVariantForInventory({
				productName: 'Core Stock Tee',
				productSlug: 'core-stock-tee',
				size: 'L',
				color: 'Bone'
			});

			const created = await initializeInventory(adminCtx(), {
				variantId: variant.id,
				quantity: 8,
				lowStockThreshold: 3,
				trackInventory: true,
				allowBackorder: false,
				note: 'Opening count'
			});

			expect(created).toMatchObject({
				variantId: variant.id,
				quantity: 8,
				reservedQuantity: 0,
				availableQuantity: 8,
				lowStockThreshold: 3,
				trackInventory: true,
				allowBackorder: false,
				isLowStock: false
			});

			const detail = await getInventory(adminCtx(), { variantId: variant.id });
			expect(detail).toMatchObject({
				variantId: variant.id,
				hasInventory: true,
				product: {
					name: 'Core Stock Tee',
					slug: 'core-stock-tee'
				},
				variant: {
					size: 'L',
					color: 'Bone'
				}
			});
			expect(detail.movements).toHaveLength(1);
			expect(detail.movements[0]).toMatchObject({
				type: 'restock',
				quantityDelta: 8,
				quantityAfter: 8,
				reservedQuantityDelta: 0,
				reservedQuantityAfter: 0,
				note: 'Opening count'
			});

			await expect(getInventorySummary(adminCtx())).resolves.toMatchObject({
				totalVariants: 1,
				inventoryRows: 1,
				missingInventoryCount: 0,
				trackedCount: 1,
				totalQuantity: 8,
				totalReservedQuantity: 0,
				totalAvailableQuantity: 8
			});
		});

		it('rejects duplicate initialization, missing variants, and non-admin access', async () => {
			const { variant } = await seedVariantForInventory();
			await initializeInventory(adminCtx(), {
				variantId: variant.id,
				quantity: 1
			});

			await expect(
				initializeInventory(adminCtx(), {
					variantId: variant.id,
					quantity: 1
				})
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			await expect(
				initializeInventory(adminCtx(), {
					variantId: 'missing-variant',
					quantity: 1
				})
			).rejects.toMatchObject({ code: ErrorCode.VARIANT_NOT_FOUND });

			await expect(getInventorySummary(makeCustomerCtx('customer-user'))).rejects.toMatchObject({
				code: ErrorCode.INSUFFICIENT_PERMISSIONS
			});
		});

		it('lists inventory with query, status, tracking, and missing-row filters', async () => {
			const missing = await seedVariantForInventory({
				productName: 'Missing Tee',
				productSlug: 'missing-tee',
				color: 'Slate'
			});
			const low = await seedVariantForInventory({
				productName: 'Low Tee',
				productSlug: 'low-tee',
				color: 'Volt'
			});
			const out = await seedVariantForInventory({
				productName: 'Out Tee',
				productSlug: 'out-tee',
				color: 'Black'
			});
			const available = await seedVariantForInventory({
				productName: 'Available Tee',
				productSlug: 'available-tee',
				color: 'Bone'
			});
			const untracked = await seedVariantForInventory({
				productName: 'Untracked Tee',
				productSlug: 'untracked-tee',
				color: 'Silver'
			});

			await seedInventory(db(), low.variant.id, {
				quantity: 3,
				reservedQuantity: 1,
				lowStockThreshold: 2
			});
			await seedInventory(db(), out.variant.id, {
				quantity: 2,
				reservedQuantity: 2,
				lowStockThreshold: 5
			});
			await seedInventory(db(), available.variant.id, {
				quantity: 10,
				reservedQuantity: 2,
				lowStockThreshold: 2
			});
			await seedInventory(db(), untracked.variant.id, {
				quantity: 0,
				trackInventory: false
			});

			const missingResult = await listInventory(adminCtx(), { stockStatus: 'missing' });
			expect(missingResult.items.map((item) => item.variantId)).toEqual([missing.variant.id]);

			const lowResult = await listInventory(adminCtx(), { stockStatus: 'low' });
			expect(lowResult.items.map((item) => item.variantId).sort()).toEqual(
				[low.variant.id, out.variant.id].sort()
			);

			const outResult = await listInventory(adminCtx(), { stockStatus: 'out' });
			expect(outResult.items.map((item) => item.variantId)).toEqual([out.variant.id]);

			const availableResult = await listInventory(adminCtx(), { stockStatus: 'available' });
			expect(availableResult.items.map((item) => item.variantId).sort()).toEqual(
				[low.variant.id, available.variant.id, untracked.variant.id].sort()
			);

			const untrackedResult = await listInventory(adminCtx(), { trackInventory: false });
			expect(untrackedResult.items.map((item) => item.variantId)).toEqual([untracked.variant.id]);

			const queryResult = await listInventory(adminCtx(), { query: 'bone' });
			expect(queryResult.items.map((item) => item.variantId)).toEqual([available.variant.id]);
		});
	});

	describe('admin stock mutations', () => {
		it('updates settings, restocks, adjusts stock, and writes audit movements', async () => {
			const { variant } = await seedVariantForInventory();
			await seedInventory(db(), variant.id, {
				quantity: 5,
				reservedQuantity: 2,
				lowStockThreshold: 3,
				allowBackorder: false
			});

			await expect(
				updateInventorySettings(adminCtx(), {
					variantId: variant.id,
					trackInventory: false
				})
			).rejects.toMatchObject({ code: ErrorCode.INVENTORY_TRACKING_DISABLED });

			const settings = await updateInventorySettings(adminCtx(), {
				variantId: variant.id,
				lowStockThreshold: 1,
				allowBackorder: true
			});
			expect(settings).toMatchObject({
				lowStockThreshold: 1,
				allowBackorder: true,
				trackInventory: true
			});

			const restocked = await restockInventory(adminCtx(), {
				variantId: variant.id,
				quantity: 4,
				note: 'Supplier restock',
				now
			});
			expect(restocked).toMatchObject({
				quantity: 9,
				reservedQuantity: 2,
				availableQuantity: 7
			});

			const adjusted = await adjustInventory(adminCtx(), {
				variantId: variant.id,
				quantityDelta: -3,
				note: 'Stock count correction',
				now
			});
			expect(adjusted).toMatchObject({
				quantity: 6,
				reservedQuantity: 2,
				availableQuantity: 4
			});

			await expect(
				adjustInventory(adminCtx(), {
					variantId: variant.id,
					quantityDelta: -5,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.INVALID_INVENTORY_MOVEMENT });

			const movements = await listInventoryMovements(adminCtx(), {
				variantId: variant.id,
				limit: 10
			});
			expect(movements.total).toBe(2);
			expect(movements.items.map((item) => item.type).sort()).toEqual(['adjustment', 'restock']);
			expect(movements.items.find((item) => item.type === 'restock')).toMatchObject({
				quantityDelta: 4,
				quantityAfter: 9,
				note: 'Supplier restock'
			});
			expect(movements.items.find((item) => item.type === 'adjustment')).toMatchObject({
				quantityDelta: -3,
				quantityAfter: 6,
				note: 'Stock count correction'
			});
		});

		it('rejects missing inventory and invalid stock mutation quantities', async () => {
			const { variant } = await seedVariantForInventory();

			await expect(
				restockInventory(adminCtx(), {
					variantId: variant.id,
					quantity: 1
				})
			).rejects.toMatchObject({ code: ErrorCode.INVENTORY_NOT_FOUND });

			await seedInventory(db(), variant.id, {
				quantity: 2
			});

			await expect(
				restockInventory(adminCtx(), {
					variantId: variant.id,
					quantity: 0
				})
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			await expect(
				adjustInventory(adminCtx(), {
					variantId: variant.id,
					quantityDelta: -3
				})
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
		});
	});

	describe('availability lookup', () => {
		it('returns public-safe availability for unique inventory-backed variant IDs', async () => {
			const tracked = await seedVariantForInventory({ productSlug: 'tracked-availability' });
			const untracked = await seedVariantForInventory({ productSlug: 'untracked-availability' });
			const missing = await seedVariantForInventory({ productSlug: 'missing-availability' });
			await seedInventory(db(), tracked.variant.id, {
				quantity: 6,
				reservedQuantity: 2,
				lowStockThreshold: 4
			});
			await seedInventory(db(), untracked.variant.id, {
				quantity: 0,
				trackInventory: false
			});

			const rows = await getInventoryAvailabilityByVariantIds(makeCustomerCtx('customer-user'), {
				variantIds: [
					tracked.variant.id,
					untracked.variant.id,
					tracked.variant.id,
					missing.variant.id
				]
			});
			const byVariantId = new Map(rows.map((row) => [row.variantId, row]));

			expect(rows).toHaveLength(2);
			expect(byVariantId.get(tracked.variant.id)).toMatchObject({
				quantity: 6,
				reservedQuantity: 2,
				availableQuantity: 4,
				isLowStock: true,
				trackInventory: true
			});
			expect(byVariantId.get(untracked.variant.id)).toMatchObject({
				quantity: 0,
				reservedQuantity: 0,
				availableQuantity: 1_000_000,
				isLowStock: false,
				trackInventory: false
			});
			expect(byVariantId.has(missing.variant.id)).toBe(false);
		});

		it('cascades inventory rows when variants are deleted', async () => {
			const { variant } = await seedVariantForInventory();
			await seedInventory(db(), variant.id, {
				quantity: 4
			});

			await db().delete(productVariant).where(eq(productVariant.id, variant.id));

			expect(
				await db().select().from(inventory).where(eq(inventory.variantId, variant.id))
			).toHaveLength(0);
		});
	});
});
