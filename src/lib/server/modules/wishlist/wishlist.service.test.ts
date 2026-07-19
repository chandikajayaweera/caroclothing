import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { makeAdminCtx, makeCustomerCtx } from '../../../../tests/context';
import { seedUser } from '../../../../tests/factories/auth';
import { seedInventory } from '../../../../tests/factories/inventory';
import { seedProductWithVariant } from '../../../../tests/scenarios/products';
import { inventory } from '../inventory/inventory.drizzle';
import { productVariant } from '../products/products.drizzle';
import { wishlistItem } from './wishlist.drizzle';
import { addToWishlist, listWishlist, listWishlistSignals } from './wishlist.service';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-07-19T10:00:00.000Z');

function db() {
	return harness.db;
}

describe('wishlist service integration', () => {
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

	it('reports and filters selected variants using current inventory availability', async () => {
		const user = await seedUser(db(), { id: 'wishlist-stock-user' });
		const { product, variant } = await seedProductWithVariant(db(), {
			product: { slug: 'wishlist-stock-product' }
		});
		await seedInventory(db(), variant.id, { quantity: 1, reservedQuantity: 1 });

		const ctx = makeCustomerCtx(user.id, { now });
		const saved = await addToWishlist(ctx, { productId: product.id, variantId: variant.id });
		expect(saved.isAvailable).toBe(false);

		await expect(listWishlist(ctx, { includeUnavailable: true })).resolves.toMatchObject({
			total: 1,
			items: [{ isAvailable: false }]
		});
		await expect(listWishlist(ctx, { includeUnavailable: false })).resolves.toMatchObject({
			total: 0,
			items: []
		});
		await expect(listWishlistSignals(makeAdminCtx({ now }))).resolves.toMatchObject({
			total: 0,
			items: []
		});

		await db()
			.update(inventory)
			.set({ reservedQuantity: 0, updatedAt: now })
			.where(eq(inventory.variantId, variant.id));

		await expect(listWishlist(ctx, { includeUnavailable: false })).resolves.toMatchObject({
			total: 1,
			items: [{ isAvailable: true }]
		});
		await expect(listWishlistSignals(makeAdminCtx({ now }))).resolves.toMatchObject({
			total: 1,
			items: [{ isAvailable: true }]
		});
	});

	it('removes a selected-variant row when the variant is deleted without colliding with product-only rows', async () => {
		const user = await seedUser(db(), { id: 'wishlist-cascade-user' });
		const { product, variant } = await seedProductWithVariant(db(), {
			product: { slug: 'wishlist-cascade-product' }
		});
		const ctx = makeCustomerCtx(user.id, { now });

		await addToWishlist(ctx, { productId: product.id });
		await addToWishlist(ctx, { productId: product.id, variantId: variant.id });
		await db().delete(productVariant).where(eq(productVariant.id, variant.id));

		const rows = await db().select().from(wishlistItem).where(eq(wishlistItem.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ productId: product.id, variantId: null });
	});
});
