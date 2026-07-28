import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { makeCustomerCtx } from '../../../../tests/context';
import { seedUser } from '../../../../tests/factories/auth';
import { seedOrder } from '../../../../tests/factories/orders';
import { seedProduct } from '../../../../tests/factories/products';
import { address } from '../addresses/addresses.drizzle';
import { review } from '../reviews/reviews.drizzle';
import { wishlistItem } from '../wishlist/wishlist.drizzle';
import { getMyAccountSummary } from './account.service';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

let harness: TestDatabaseHarness;

describe('account service integration', () => {
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

	it('loads all account dashboard counts in one aggregate read', async () => {
		const customer = await seedUser(harness.db, { id: 'account-summary-user' });
		const product = await seedProduct(harness.db, { id: 'account-summary-product' });
		await seedOrder(harness.db, { id: 'account-summary-order', userId: customer.id });
		await harness.db.insert(address).values({
			id: 'account-summary-address',
			userId: customer.id,
			recipientName: 'Caro Buyer',
			phone: '+94770000000',
			addressLine1: '1 Main Street',
			city: 'Colombo',
			district: 'Colombo'
		});
		await harness.db.insert(wishlistItem).values({
			id: 'account-summary-wishlist',
			userId: customer.id,
			productId: product.id
		});
		await harness.db.insert(review).values({
			id: 'account-summary-review',
			userId: customer.id,
			productId: product.id,
			orderId: 'account-summary-order',
			rating: 5,
			isVerifiedPurchase: true
		});

		await expect(getMyAccountSummary(makeCustomerCtx(customer.id))).resolves.toEqual({
			orders: 1,
			addresses: 1,
			wishlist: 1,
			reviews: 1
		});
	});
});
