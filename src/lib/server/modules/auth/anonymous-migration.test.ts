import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { seedProductWithVariant } from '../../../../tests/scenarios/products';
import { bag, bagItem } from '../bag/bag.drizzle';
import { wishlistItem } from '../wishlist/wishlist.drizzle';
import { migrateAnonymousUserData } from './anonymous-migration';

const dbState = vi.hoisted((): { db: unknown; d1: D1Database | undefined } => ({
	db: undefined,
	d1: undefined
}));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	},
	getD1Database: () => {
		if (!dbState.d1) throw new Error('Test D1 database has not been initialized.');
		return dbState.d1;
	}
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-07-23T11:00:00.000Z');

function db() {
	return harness.db;
}

describe('anonymous account migration integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
		dbState.d1 = harness.d1;
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(() => {
		dbState.db = undefined;
		dbState.d1 = undefined;
		harness.close();
	});

	it('atomically moves bag and wishlist data and remains safe to replay', async () => {
		const source = await seedUser(db(), {
			id: 'anonymous-migration-source',
			isAnonymous: true
		});
		const target = await seedUser(db(), {
			id: 'anonymous-migration-target',
			isAnonymous: false
		});
		const { product, variant } = await seedProductWithVariant(db(), {
			product: { slug: 'anonymous-migration-product' }
		});
		await db().insert(bag).values({
			id: 'anonymous-migration-bag',
			userId: source.id,
			createdAt: now,
			updatedAt: now
		});
		await db().insert(bagItem).values({
			id: 'anonymous-migration-bag-item',
			bagId: 'anonymous-migration-bag',
			productId: product.id,
			variantId: variant.id,
			quantity: 2,
			unitPrice: 5000,
			addedAt: now,
			updatedAt: now
		});
		await db().insert(wishlistItem).values({
			id: 'anonymous-migration-wishlist',
			userId: source.id,
			productId: product.id,
			variantId: variant.id,
			addedAt: now
		});

		await migrateAnonymousUserData(source.id, target.id);
		await migrateAnonymousUserData(source.id, target.id);

		await expect(db().select().from(bag).where(eq(bag.userId, source.id))).resolves.toEqual([]);
		await expect(
			db().select().from(wishlistItem).where(eq(wishlistItem.userId, source.id))
		).resolves.toEqual([]);

		const targetBags = await db().select().from(bag).where(eq(bag.userId, target.id));
		expect(targetBags).toHaveLength(1);
		await expect(
			db().select().from(bagItem).where(eq(bagItem.bagId, targetBags[0]!.id))
		).resolves.toMatchObject([{ productId: product.id, variantId: variant.id, quantity: 2 }]);
		await expect(
			db().select().from(wishlistItem).where(eq(wishlistItem.userId, target.id))
		).resolves.toMatchObject([{ productId: product.id, variantId: variant.id }]);
	});
});
