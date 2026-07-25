import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { seedProduct, seedVariant, seedVariantColor } from '../../../../tests/factories/products';
import { seedInventory } from '../../../../tests/factories/inventory';
import { seedPromoCode } from '../../../../tests/factories/promotions';
import { seedProductWithVariant } from '../../../../tests/scenarios/products';
import { makeAdminCtx, makeCustomerCtx } from '../../../../tests/context';
import { inventory, inventoryMovement } from '../inventory/inventory.drizzle';
import { bag as bagTable, bagItem as bagItemTable } from './bag.drizzle';
import {
	addItemToBag,
	applyPromoCodeToBag,
	expireDueBagCheckouts,
	getBag,
	getBagSummary,
	getCheckoutBagForOrderTx,
	getStorefrontVariantAvailability,
	removePromoCodeFromBag,
	prepareUserBagDeletion,
	startCheckout,
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

describe('bag service integration', () => {
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

	it('prepares deletion of every legacy user bag during account deletion', async () => {
		const user = await seedUser(db(), { id: 'bag-account-deletion-user' });
		const { product, variant } = await seedProductWithVariant(db(), {
			product: { slug: 'bag-account-deletion-product' }
		});
		await seedInventory(db(), variant.id, { quantity: 10, reservedQuantity: 0 });

		await db()
			.insert(bagTable)
			.values([
				{ id: 'legacy-user-bag-1', userId: user.id, createdAt: now, updatedAt: now },
				{ id: 'legacy-user-bag-2', userId: user.id, createdAt: now, updatedAt: now }
			]);
		await db()
			.insert(bagItemTable)
			.values([
				{
					id: 'legacy-user-bag-item-1',
					bagId: 'legacy-user-bag-1',
					variantId: variant.id,
					productId: product.id,
					quantity: 1,
					unitPrice: 5000,
					addedAt: now,
					updatedAt: now
				},
				{
					id: 'legacy-user-bag-item-2',
					bagId: 'legacy-user-bag-2',
					variantId: variant.id,
					productId: product.id,
					quantity: 2,
					unitPrice: 5000,
					addedAt: now,
					updatedAt: now
				}
			]);

		await db().batch([prepareUserBagDeletion(db(), user.id)]);
		await expect(db().select().from(bagTable).where(eq(bagTable.userId, user.id))).resolves.toEqual(
			[]
		);
	});

	it('aggregates bag and active checkout-window statistics without treating them as reservations', async () => {
		const user = await seedUser(db(), { id: 'bag-summary-user' });
		const { product, variant } = await seedProductWithVariant(db(), {
			product: { slug: 'bag-summary-product' }
		});
		const checkoutStartedAt = new Date(now.getTime() - 60_000);
		const checkoutExpiresAt = new Date(now.getTime() + 5 * 60_000);
		const expiredAt = new Date(now.getTime() - 60_000);

		await db()
			.insert(bagTable)
			.values([
				{
					id: 'bag-summary-user-bag',
					userId: user.id,
					checkoutStartedAt,
					checkoutExpiresAt,
					createdAt: now,
					updatedAt: now
				},
				{
					id: 'bag-summary-expired-guest-bag',
					sessionToken: 'bag-summary-expired-session',
					expiresAt: expiredAt,
					createdAt: now,
					updatedAt: now
				}
			]);
		await db()
			.insert(bagItemTable)
			.values([
				{
					id: 'bag-summary-user-item',
					bagId: 'bag-summary-user-bag',
					variantId: variant.id,
					productId: product.id,
					quantity: 2,
					unitPrice: 5000,
					addedAt: now,
					updatedAt: now
				},
				{
					id: 'bag-summary-expired-item',
					bagId: 'bag-summary-expired-guest-bag',
					variantId: variant.id,
					productId: product.id,
					quantity: 1,
					unitPrice: 2000,
					addedAt: now,
					updatedAt: now
				}
			]);

		await expect(getBagSummary(makeAdminCtx({ now }), { now })).resolves.toEqual({
			total: 2,
			active: 1,
			expired: 1,
			guest: 1,
			user: 1,
			totalSubtotal: 12000,
			totalItems: 3,
			activeCheckouts: 1,
			checkoutWindowItems: 2
		});
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

	it('ignores and removes a retained promo after its minimum is no longer met', async () => {
		const user = await seedUser(db(), { id: 'bag-invalid-promo-user' });
		const ctx = makeCustomerCtx(user.id, { now });
		const prod = await seedProduct(db());
		const varColor = await seedVariantColor(db(), prod.id, { basePrice: 5000 });
		const variant = await seedVariant(db(), prod.id, varColor.id);
		await seedInventory(db(), variant.id, { quantity: 10, reservedQuantity: 0 });
		await seedPromoCode(db(), {
			code: 'MIN10K',
			discountType: 'fixed',
			discountValue: 1000,
			minOrderAmount: 10000,
			isActive: true
		});

		const added = await addItemToBag(ctx, { variantId: variant.id, quantity: 2, now });
		const applied = await applyPromoCodeToBag(ctx, { code: 'MIN10K', now });
		const belowMinimum = await updateBagItemQuantity(ctx, {
			bagItemId: applied.items[0].id,
			quantity: 1,
			now
		});
		expect(belowMinimum.promoCode).toBe('MIN10K');
		expect(belowMinimum.promoCodeId).toBeNull();

		await startCheckout(ctx, { now });
		const checkoutBag = await getCheckoutBagForOrderTx(db(), ctx, { now });
		expect(checkoutBag.promoCode).toBe('MIN10K');
		expect(checkoutBag.promoCodeId).toBeNull();

		const removed = await removePromoCodeFromBag(ctx, { now });
		expect(removed.promoCode).toBeNull();
		expect(removed.promoCodeId).toBeNull();
		expect(removed.discountAmount).toBe(0);
		expect(added.id).toBe(removed.id);
	});

	it('rejects additions and quantity increases beyond tracked available stock', async () => {
		const user = await seedUser(db(), { id: 'bag-stock-limit-user' });
		const ctx = makeCustomerCtx(user.id, { now });
		const { variant } = await seedProductWithVariant(db(), {
			product: { slug: 'bag-stock-limit-product' }
		});
		await seedInventory(db(), variant.id, { quantity: 2, reservedQuantity: 0 });

		const added = await addItemToBag(ctx, { variantId: variant.id, quantity: 1, now });
		const bagItemId = added.items[0].id;

		await expect(
			addItemToBag(ctx, { variantId: variant.id, quantity: 2, now })
		).rejects.toMatchObject({
			code: 'INSUFFICIENT_STOCK',
			details: { requestedQuantity: 3, availableQuantity: 2 }
		});
		await expect(updateBagItemQuantity(ctx, { bagItemId, quantity: 3, now })).rejects.toMatchObject(
			{
				code: 'INSUFFICIENT_STOCK',
				details: { requestedQuantity: 3, availableQuantity: 2 }
			}
		);

		await expect(getBag(ctx, { now })).resolves.toMatchObject({
			items: [{ id: bagItemId, quantity: 1 }]
		});
	});

	it('labels a partial shortage accurately and still allows reducing the quantity', async () => {
		const user = await seedUser(db(), { id: 'bag-partial-shortage-user' });
		const ctx = makeCustomerCtx(user.id, { now });
		const { variant } = await seedProductWithVariant(db(), {
			product: { slug: 'bag-partial-shortage-product' }
		});
		await seedInventory(db(), variant.id, { quantity: 3, reservedQuantity: 0 });
		const added = await addItemToBag(ctx, { variantId: variant.id, quantity: 3, now });
		const bagItemId = added.items[0].id;

		await db().update(inventory).set({ quantity: 2 }).where(eq(inventory.variantId, variant.id));
		const staleBag = await getBag(ctx, { now });

		expect(staleBag).toMatchObject({
			hasUnavailableItems: false,
			hasInsufficientItems: true,
			items: [
				{
					id: bagItemId,
					quantity: 3,
					availableQuantity: 2,
					availabilityStatus: 'insufficient'
				}
			]
		});

		const reduced = await updateBagItemQuantity(ctx, { bagItemId, quantity: 2, now });
		expect(reduced.items[0]).toMatchObject({ quantity: 2, availabilityStatus: 'available' });
		await expect(
			db().select().from(bagItemTable).where(eq(bagItemTable.id, bagItemId)).get()
		).resolves.toMatchObject({ quantity: 2 });
	});

	it('keeps checkout windows reservation-free and availability reads non-mutating', async () => {
		const holder = await seedUser(db(), { id: 'checkout-holder' });
		const observer = await seedUser(db(), { id: 'availability-observer' });
		const { variant } = await seedProductWithVariant(db(), {
			product: { slug: 'read-only-availability-product' }
		});
		await seedInventory(db(), variant.id, { quantity: 1, reservedQuantity: 0 });

		const holderCtx = makeCustomerCtx(holder.id, { now });
		await addItemToBag(holderCtx, { variantId: variant.id, quantity: 1, now });
		const checkoutBag = await startCheckout(holderCtx, { now });
		const expiredNow = new Date(now.getTime() + 10 * 60 * 1000 + 1);

		const [availability] = await getStorefrontVariantAvailability(
			makeCustomerCtx(observer.id, { now: expiredNow }),
			{ variantIds: [variant.id], now: expiredNow }
		);

		expect(availability).toMatchObject({
			variantId: variant.id,
			reservedQuantity: 0,
			availableQuantity: 1,
			checkoutHeldQuantity: 0,
			checkoutHoldExpiresAt: null,
			availabilityStatus: 'available'
		});
		await expect(
			db().select().from(bagTable).where(eq(bagTable.id, checkoutBag.id)).get()
		).resolves.toMatchObject({
			checkoutStartedAt: now,
			checkoutExpiresAt: new Date(now.getTime() + 10 * 60 * 1000)
		});
		await expect(
			db().select().from(inventory).where(eq(inventory.variantId, variant.id)).get()
		).resolves.toMatchObject({ reservedQuantity: 0 });
		await expect(
			db().select().from(inventoryMovement).where(eq(inventoryMovement.variantId, variant.id))
		).resolves.toEqual([]);

		const cleanup = await expireDueBagCheckouts(makeAdminCtx({ now: expiredNow }), {
			now: expiredNow
		});

		expect(cleanup).toMatchObject({
			expiredCount: 1,
			releasedQuantity: 0,
			failedCount: 0
		});
		await expect(
			db().select().from(bagTable).where(eq(bagTable.id, checkoutBag.id)).get()
		).resolves.toMatchObject({ checkoutStartedAt: null, checkoutExpiresAt: null });
		await expect(
			db().select().from(inventory).where(eq(inventory.variantId, variant.id)).get()
		).resolves.toMatchObject({ reservedQuantity: 0 });
	});
});
