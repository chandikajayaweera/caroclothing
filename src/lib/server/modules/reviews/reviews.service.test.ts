import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { order, orderItem } from '../orders/orders.drizzle';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { seedOrder } from '../../../../tests/factories/orders';
import { seedProductWithVariant } from '../../../../tests/scenarios/products';
import { makeCustomerCtx } from '../../../../tests/context';
import { getReviewEligibility } from './reviews.service';

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

describe('reviews service integration', () => {
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

	it('requires the purchased order to be delivered before review eligibility', async () => {
		const buyer = await seedUser(db(), { id: 'review-eligibility-buyer' });
		const { product, variant } = await seedProductWithVariant(db(), {
			product: { slug: 'review-eligibility-product' }
		});
		const orderRow = await seedOrder(db(), {
			id: 'review-eligibility-order',
			userId: buyer.id,
			status: 'confirmed'
		});
		await db().insert(orderItem).values({
			id: 'review-eligibility-item',
			orderId: orderRow.id,
			variantId: variant.id,
			productId: product.id,
			productName: product.name,
			variantSize: variant.size,
			variantColor: 'Black',
			productImageR2Key: null,
			quantity: 1,
			unitPrice: 3000,
			totalPrice: 3000
		});
		const ctx = makeCustomerCtx(buyer.id, { now });

		await expect(
			getReviewEligibility(ctx, { productId: product.id, orderId: orderRow.id })
		).resolves.toMatchObject({
			canReview: false,
			hasPurchased: false,
			reason: 'order_not_eligible'
		});

		await db().update(order).set({ status: 'delivered' }).where(eq(order.id, orderRow.id));
		await expect(
			getReviewEligibility(ctx, { productId: product.id, orderId: orderRow.id })
		).resolves.toMatchObject({ canReview: true, hasPurchased: true, reason: null });
	});
});
