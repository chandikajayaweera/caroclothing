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
import {
	addToWishlist,
	listWishlist,
	listWishlistProductIds,
	listWishlistSignals
} from './wishlist.service';

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

	it('paginates and filters demand signals in D1 while keeping global aggregate statistics', async () => {
		const firstUser = await seedUser(db(), { id: 'wishlist-signal-user-1' });
		const secondUser = await seedUser(db(), { id: 'wishlist-signal-user-2' });
		const thirdUser = await seedUser(db(), { id: 'wishlist-signal-user-3' });
		const highRisk = await seedProductWithVariant(db(), {
			product: { slug: 'wishlist-high-risk-product' }
		});
		const normal = await seedProductWithVariant(db(), {
			product: { slug: 'wishlist-normal-product' }
		});
		await seedInventory(db(), highRisk.variant.id, { quantity: 1, reservedQuantity: 0 });
		await seedInventory(db(), normal.variant.id, { quantity: 20, reservedQuantity: 0 });

		const firstSavedAt = new Date('2026-07-19T08:00:00.000Z');
		const lastSavedAt = new Date('2026-07-19T09:00:00.000Z');
		await db()
			.insert(wishlistItem)
			.values([
				{
					id: 'wishlist-high-risk-save-1',
					userId: firstUser.id,
					productId: highRisk.product.id,
					variantId: highRisk.variant.id,
					addedAt: firstSavedAt
				},
				{
					id: 'wishlist-high-risk-save-2',
					userId: secondUser.id,
					productId: highRisk.product.id,
					variantId: highRisk.variant.id,
					addedAt: lastSavedAt
				},
				{
					id: 'wishlist-normal-save',
					userId: thirdUser.id,
					productId: normal.product.id,
					variantId: normal.variant.id,
					addedAt: firstSavedAt
				}
			]);

		const firstPage = await listWishlistSignals(makeAdminCtx({ now }), { limit: 1 });
		expect(firstPage).toMatchObject({
			total: 2,
			limit: 1,
			offset: 0,
			stats: { totalSaves: 3, totalSignals: 2, highRiskVariants: 1 },
			items: [
				{
					id: `${highRisk.product.id}:${highRisk.variant.id}`,
					saveCount: 2,
					alertStatus: 'high',
					lastSavedAt
				}
			]
		});

		await expect(
			listWishlistSignals(makeAdminCtx({ now }), { alertLevel: 'normal', limit: 1 })
		).resolves.toMatchObject({
			total: 1,
			stats: { totalSaves: 3, totalSignals: 2, highRiskVariants: 1 },
			items: [{ productId: normal.product.id, alertStatus: 'normal' }]
		});

		await expect(
			listWishlistSignals(makeAdminCtx({ now }), { limit: 1, offset: 1 })
		).resolves.toMatchObject({
			total: 2,
			items: [{ productId: normal.product.id }]
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

	it('lists unique product ids by their most recent save without hydrating products', async () => {
		const user = await seedUser(db(), { id: 'wishlist-id-user' });
		const first = await seedProductWithVariant(db(), {
			product: { slug: 'wishlist-id-first' }
		});
		const second = await seedProductWithVariant(db(), {
			product: { slug: 'wishlist-id-second' }
		});
		await db()
			.insert(wishlistItem)
			.values([
				{
					id: 'wishlist-id-first-product',
					userId: user.id,
					productId: first.product.id,
					variantId: null,
					addedAt: new Date('2026-07-19T08:00:00.000Z')
				},
				{
					id: 'wishlist-id-first-variant',
					userId: user.id,
					productId: first.product.id,
					variantId: first.variant.id,
					addedAt: new Date('2026-07-19T10:00:00.000Z')
				},
				{
					id: 'wishlist-id-second-product',
					userId: user.id,
					productId: second.product.id,
					variantId: null,
					addedAt: new Date('2026-07-19T09:00:00.000Z')
				}
			]);

		await expect(listWishlistProductIds(makeCustomerCtx(user.id), { limit: 100 })).resolves.toEqual(
			[first.product.id, second.product.id]
		);
	});
});
