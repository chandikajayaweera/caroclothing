import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { seedProduct, seedVariant, seedVariantColor } from '../../../../tests/factories/products';
import { seedPromoCode } from '../../../../tests/factories/promotions';
import { makeCustomerCtx } from '../../../../tests/context';
import {
	addItemToBag,
	applyPromoCodeToBag,
	updateBagItemQuantity
} from './bag.service';

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
const now = new Date('2026-07-04T10:00:00.000Z');

function db() {
	return harness.db;
}

describe('bag promo min order threshold service integration', () => {
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

	it('preserves promo code on DTO when subtotal falls below minimum, and reactivates when subtotal recovers', async () => {
		const user = await seedUser(db(), { id: 'bag-promo-user' });
		const ctx = makeCustomerCtx(user.id, { now });

		const prod = await seedProduct(db());
		const varColor = await seedVariantColor(db(), prod.id, { basePrice: 5000 });
		const variant = await seedVariant(db(), prod.id, varColor.id);

		await seedPromoCode(db(), {
			code: 'MIN10K',
			discountType: 'fixed',
			discountValue: 1000,
			minOrderAmount: 10000,
			isActive: true
		});

		// 1. Add 3 items = 15,000 subtotal
		const bag1 = await addItemToBag(ctx, { variantId: variant.id, quantity: 3, now });
		expect(bag1.subtotal).toBe(15000);

		// 2. Apply promo MIN10K
		const bag2 = await applyPromoCodeToBag(ctx, { code: 'MIN10K', now });
		expect(bag2.promoCode).toBe('MIN10K');
		expect(bag2.promoCodeId).not.toBeNull();
		expect(bag2.promoMinOrderAmount).toBe(10000);
		expect(bag2.discountAmount).toBe(1000);

		// 3. Reduce quantity to 1 item = 5,000 subtotal (< 10,000)
		const bagItemId = bag2.items[0].id;
		const bag3 = await updateBagItemQuantity(ctx, { bagItemId, quantity: 1, now });
		expect(bag3.subtotal).toBe(5000);
		expect(bag3.promoCode).toBe('MIN10K');
		expect(bag3.promoMinOrderAmount).toBe(10000);
		expect(bag3.promoCodeId).toBeNull();
		expect(bag3.discountAmount).toBe(0);

		// 4. Increase quantity back to 2 items = 10,000 subtotal (>= 10,000)
		const bag4 = await updateBagItemQuantity(ctx, { bagItemId, quantity: 2, now });
		expect(bag4.subtotal).toBe(10000);
		expect(bag4.promoCode).toBe('MIN10K');
		expect(bag4.promoMinOrderAmount).toBe(10000);
		expect(bag4.promoCodeId).not.toBeNull();
		expect(bag4.discountAmount).toBe(1000);
	});
});
