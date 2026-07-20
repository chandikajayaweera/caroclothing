import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { order } from '../orders/orders.drizzle';
import { promoCode, promoCodeUsage } from './promotions.drizzle';
import {
	addPromotionCode,
	createPromotion,
	createPromoCode,
	getPromoCode,
	grantPromotionToCustomer,
	listPromotionCustomerGrants,
	listPromoCodeUsages,
	listPromoCodes,
	reconcilePromoCodeUsageCount,
	reconcilePromoCodeUsageCounts,
	recordPromoUsage,
	resolvePromotionForBag,
	revokePromotionCustomerGrant,
	setPromotionActive,
	setPromoCodeActive,
	updatePromotion,
	updatePromotionCode,
	updatePromoCode,
	validatePromoCodeForBag
} from './promotions.service';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { makeAdminCtx, makeCustomerCtx } from '../../../../tests/context';
import { seedOrder } from '../../../../tests/factories/orders';
import {
	promoCodeInput,
	seedPromoCode,
	seedPromoCodeUsage
} from '../../../../tests/factories/promotions';

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

async function promoRows() {
	return db().select().from(promoCode);
}

async function usageRows() {
	return db().select().from(promoCodeUsage);
}

describe('promotions service integration', () => {
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

	describe('canonical promotion lifecycle', () => {
		it('keeps application mode immutable and manages multiple child codes', async () => {
			const created = await createPromotion(adminCtx(), {
				name: 'Creator partners',
				discountType: 'percentage',
				discountValue: 15,
				applicationMode: 'code',
				code: { code: 'CREATOR15' }
			});

			await expect(
				updatePromotion(adminCtx(), {
					promotionId: created.id,
					data: { applicationMode: 'automatic' }
				})
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			const partnerCode = await addPromotionCode(adminCtx(), {
				promotionId: created.id,
				code: 'partner_15',
				distribution: 'influencer',
				partnerReference: 'creator-one',
				usageLimit: 25
			});
			expect(partnerCode).toMatchObject({
				code: 'PARTNER_15',
				distribution: 'influencer',
				codeIsActive: true,
				usageLimit: 25
			});

			await expect(
				updatePromotionCode(adminCtx(), {
					promoCodeId: partnerCode.id,
					data: { isActive: false, isDiscoverable: true }
				})
			).resolves.toMatchObject({ codeIsActive: false, isDiscoverable: true });
		});

		it('selects the highest-value eligible automatic promotion', async () => {
			const smaller = await createPromotion(adminCtx(), {
				name: 'Priority five hundred',
				discountType: 'fixed',
				discountValue: 500,
				applicationMode: 'automatic',
				priority: 10
			});
			const larger = await createPromotion(adminCtx(), {
				name: 'Best one thousand',
				discountType: 'fixed',
				discountValue: 1000,
				applicationMode: 'automatic',
				priority: 1
			});
			await setPromotionActive(adminCtx(), { promotionId: smaller.id, isActive: true });
			await setPromotionActive(adminCtx(), { promotionId: larger.id, isActive: true });

			await expect(resolvePromotionForBag({ subtotal: 5000, now })).resolves.toMatchObject({
				promotionId: larger.id,
				promoCodeId: null,
				code: null,
				discountAmount: 1000
			});
		});

		it('enforces, lists, and revokes customer grants for code promotions', async () => {
			const user = await seedUser(db(), { id: 'granted-customer' });
			const created = await createPromotion(adminCtx(), {
				name: 'Invite only',
				discountType: 'fixed',
				discountValue: 750,
				applicationMode: 'code',
				eligibilityScope: 'customer_grant',
				code: { code: 'INVITE750' }
			});
			await setPromotionActive(adminCtx(), { promotionId: created.id, isActive: true });

			await expect(
				validatePromoCodeForBag({
					code: 'INVITE750',
					userId: user.id,
					subtotal: 5000,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.PROMO_NOT_APPLICABLE });

			await grantPromotionToCustomer(adminCtx(), {
				promotionId: created.id,
				userId: user.id
			});
			expect(await listPromotionCustomerGrants(adminCtx(), { promotionId: created.id })).toEqual([
				expect.objectContaining({ promotionId: created.id, userId: user.id })
			]);
			await expect(
				validatePromoCodeForBag({
					code: 'INVITE750',
					userId: user.id,
					subtotal: 5000,
					now
				})
			).resolves.toMatchObject({ promotionId: created.id, discountAmount: 750 });

			await revokePromotionCustomerGrant(adminCtx(), {
				promotionId: created.id,
				userId: user.id
			});
			expect(
				await listPromotionCustomerGrants(adminCtx(), { promotionId: created.id })
			).toHaveLength(0);
		});
	});

	describe('admin promo code lifecycle', () => {
		it('creates inactive normalized codes, activates them, updates rules, and lists filters', async () => {
			const futureStartMs = now.getTime() + 60 * 60 * 1000;
			const futureEndMs = now.getTime() + 2 * 60 * 60 * 1000;
			const created = await createPromoCode(
				adminCtx(),
				promoCodeInput({
					code: ' caro20 ',
					discountType: 'percentage',
					discountValue: 20,
					minOrderAmount: 1000,
					maxDiscountAmount: 750,
					usageLimit: 10,
					perUserLimit: 2,
					startsAt: futureStartMs,
					expiresAt: futureEndMs
				})
			);

			expect(created).toMatchObject({
				code: 'CARO20',
				isActive: false,
				status: 'inactive',
				usedCount: 0,
				remainingUses: 10
			});

			const scheduled = await setPromoCodeActive(adminCtx(), {
				lookup: { code: 'caro20' },
				isActive: true
			});
			expect(scheduled.status).toBe('scheduled');

			const active = await updatePromoCode(adminCtx(), {
				lookup: { id: created.id },
				data: {
					description: 'Launch code',
					startsAt: null
				}
			});
			expect(active).toMatchObject({
				description: 'Launch code',
				isActive: true,
				status: 'active'
			});

			const activeList = await listPromoCodes(adminCtx(), {
				isActive: true,
				query: 'caro',
				limit: 5
			});
			expect(activeList.items.map((item) => item.code)).toEqual(['CARO20']);

			const fetched = await getPromoCode(adminCtx(), { lookup: { code: 'caro20' } });
			expect(fetched.id).toBe(created.id);
		});

		it('maps duplicate and invalid promo data to service errors', async () => {
			await createPromoCode(adminCtx(), promoCodeInput({ code: 'DUPLICATE' }));

			await expect(
				createPromoCode(adminCtx(), promoCodeInput({ code: ' duplicate ' }))
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			await expect(
				createPromoCode(
					adminCtx(),
					promoCodeInput({
						code: 'TOO_MUCH',
						discountType: 'percentage',
						discountValue: 101
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			await expect(
				createPromoCode(
					adminCtx(),
					promoCodeInput({
						code: 'PAST',
						startsAt: now.getTime() - 2 * 60 * 1000
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			expect(await promoRows()).toHaveLength(1);
		});

		it('requires admin access for protected promo APIs', async () => {
			const customerCtx = makeCustomerCtx('customer-user', { now });

			await expect(
				createPromoCode(customerCtx, promoCodeInput({ code: 'DENIED' }))
			).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });

			await expect(listPromoCodes(customerCtx)).rejects.toMatchObject({
				code: ErrorCode.INSUFFICIENT_PERMISSIONS
			});

			await expect(listPromoCodeUsages(customerCtx)).rejects.toMatchObject({
				code: ErrorCode.INSUFFICIENT_PERMISSIONS
			});
		});

		it('rejects changing the start date after a promo has started', async () => {
			const row = await seedPromoCode(db(), {
				code: 'STARTED',
				startsAt: new Date(now.getTime() - 60 * 60 * 1000),
				isActive: true
			});

			await expect(
				updatePromoCode(adminCtx(), {
					lookup: { id: row.id },
					data: {
						startsAt: now.getTime() + 60 * 60 * 1000
					}
				})
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
		});
	});

	describe('validatePromoCodeForBag', () => {
		it('calculates fixed, percentage-capped, and subtotal-clamped discounts', async () => {
			await seedPromoCode(db(), {
				code: 'FIXED',
				discountType: 'fixed',
				discountValue: 700,
				isActive: true
			});
			await seedPromoCode(db(), {
				code: 'PERCENT',
				discountType: 'percentage',
				discountValue: 20,
				maxDiscountAmount: 600,
				isActive: true
			});
			await seedPromoCode(db(), {
				code: 'CLAMP',
				discountType: 'fixed',
				discountValue: 9000,
				isActive: true
			});

			await expect(
				validatePromoCodeForBag({ code: ' fixed ', subtotal: 5000, now })
			).resolves.toMatchObject({
				code: 'FIXED',
				discountAmount: 700,
				totalAfterDiscount: 4300,
				snapshot: {
					code: 'FIXED',
					discountType: 'fixed',
					discountValue: 700
				}
			});

			await expect(
				validatePromoCodeForBag({ code: 'percent', subtotal: 5000, now })
			).resolves.toMatchObject({
				discountAmount: 600,
				totalAfterDiscount: 4400
			});

			await expect(
				validatePromoCodeForBag({ code: 'CLAMP', subtotal: 5000, now })
			).resolves.toMatchObject({
				discountAmount: 5000,
				totalAfterDiscount: 0
			});
		});

		it('rejects inactive, scheduled, expired, exhausted, and minimum-order failures', async () => {
			await seedPromoCode(db(), { code: 'INACTIVE', isActive: false });
			await seedPromoCode(db(), {
				code: 'SCHEDULED',
				isActive: true,
				startsAt: new Date(now.getTime() + 60 * 60 * 1000)
			});
			await seedPromoCode(db(), {
				code: 'EXPIRED',
				isActive: true,
				expiresAt: now
			});
			await seedPromoCode(db(), {
				code: 'EXHAUSTED',
				isActive: true,
				usageLimit: 1,
				usedCount: 1
			});
			await seedPromoCode(db(), {
				code: 'MINIMUM',
				isActive: true,
				minOrderAmount: 6000
			});

			await expect(
				validatePromoCodeForBag({ code: 'INACTIVE', subtotal: 5000, now })
			).rejects.toMatchObject({ code: ErrorCode.PROMO_NOT_FOUND });

			await expect(
				validatePromoCodeForBag({ code: 'SCHEDULED', subtotal: 5000, now })
			).rejects.toMatchObject({ code: ErrorCode.PROMO_NOT_APPLICABLE });

			await expect(
				validatePromoCodeForBag({ code: 'EXPIRED', subtotal: 5000, now })
			).rejects.toMatchObject({ code: ErrorCode.PROMO_EXPIRED });

			await expect(
				validatePromoCodeForBag({ code: 'EXHAUSTED', subtotal: 5000, now })
			).rejects.toMatchObject({ code: ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED });

			await expect(
				validatePromoCodeForBag({ code: 'MINIMUM', subtotal: 5000, now })
			).rejects.toMatchObject({ code: ErrorCode.MINIMUM_ORDER_VALUE_NOT_MET });
		});

		it('enforces per-user limits from the usage audit table', async () => {
			const user = await seedUser(db(), { id: 'promo-user' });
			const row = await seedPromoCode(db(), {
				code: 'ONCE',
				isActive: true,
				perUserLimit: 1
			});
			await seedPromoCodeUsage(db(), row.id, {
				userId: user.id,
				orderId: 'order-already-used'
			});

			await expect(
				validatePromoCodeForBag({ code: 'ONCE', userId: user.id, subtotal: 5000, now })
			).rejects.toMatchObject({ code: ErrorCode.PROMO_ALREADY_USED });

			await expect(
				validatePromoCodeForBag({ code: 'ONCE', userId: 'other-user', subtotal: 5000, now })
			).resolves.toMatchObject({ code: 'ONCE' });
		});
	});

	describe('recordPromoUsage', () => {
		it('records order usage and increments usedCount atomically', async () => {
			const user = await seedUser(db(), { id: 'buyer' });
			const promo = await seedPromoCode(db(), {
				code: 'ORDER500',
				discountType: 'fixed',
				discountValue: 500,
				isActive: true
			});
			const orderRow = await seedOrder(db(), {
				id: 'order-with-promo',
				userId: user.id,
				subtotal: 5000,
				discountAmount: 500,
				totalAmount: 4500,
				promoCodeId: promo.id
			});

			const usage = await recordPromoUsage(adminCtx(), {
				promoCodeId: promo.id,
				orderId: orderRow.id,
				userId: user.id,
				discountAmount: 500,
				now
			});

			expect(usage).toMatchObject({
				promoCodeId: promo.id,
				promoCode: {
					id: promo.id,
					code: 'ORDER500'
				},
				userId: user.id,
				orderId: orderRow.id,
				discountAmount: 500
			});

			const [updatedPromo] = await db().select().from(promoCode).where(eq(promoCode.id, promo.id));
			expect(updatedPromo.usedCount).toBe(1);
			expect(await usageRows()).toHaveLength(1);
		});

		it('rejects missing orders and order/promo/discount mismatches without usage rows', async () => {
			const promo = await seedPromoCode(db(), {
				code: 'MATCH',
				discountType: 'fixed',
				discountValue: 500,
				isActive: true
			});
			const otherPromo = await seedPromoCode(db(), {
				code: 'OTHER',
				discountType: 'fixed',
				discountValue: 500,
				isActive: true
			});
			await seedOrder(db(), {
				id: 'mismatch-order',
				subtotal: 5000,
				discountAmount: 500,
				totalAmount: 4500,
				promoCodeId: otherPromo.id
			});
			await seedOrder(db(), {
				id: 'discount-order',
				subtotal: 5000,
				discountAmount: 400,
				totalAmount: 4600,
				promoCodeId: promo.id
			});

			await expect(
				recordPromoUsage(adminCtx(), {
					promoCodeId: promo.id,
					orderId: 'missing-order',
					discountAmount: 500,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.ORDER_NOT_FOUND });

			await expect(
				recordPromoUsage(adminCtx(), {
					promoCodeId: promo.id,
					orderId: 'mismatch-order',
					discountAmount: 500,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.PROMO_NOT_APPLICABLE });

			await expect(
				recordPromoUsage(adminCtx(), {
					promoCodeId: promo.id,
					orderId: 'discount-order',
					discountAmount: 500,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.PROMO_NOT_APPLICABLE });

			expect(await usageRows()).toHaveLength(0);
			const [unchanged] = await db().select().from(promoCode).where(eq(promoCode.id, promo.id));
			expect(unchanged.usedCount).toBe(0);
		});

		it('rejects stale order discounts against current promo rules', async () => {
			const promo = await seedPromoCode(db(), {
				code: 'CHANGED',
				discountType: 'fixed',
				discountValue: 400,
				isActive: true
			});
			const orderRow = await seedOrder(db(), {
				id: 'stale-discount-order',
				subtotal: 5000,
				discountAmount: 500,
				totalAmount: 4500,
				promoCodeId: promo.id
			});

			await expect(
				recordPromoUsage(adminCtx(), {
					promoCodeId: promo.id,
					orderId: orderRow.id,
					discountAmount: 500,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.PROMO_NOT_APPLICABLE });

			expect(await usageRows()).toHaveLength(0);
		});

		it('rolls back usedCount when duplicate order usage insertion fails', async () => {
			const user = await seedUser(db(), { id: 'repeat-buyer' });
			const promo = await seedPromoCode(db(), {
				code: 'REPEAT',
				discountType: 'fixed',
				discountValue: 500,
				perUserLimit: 2,
				isActive: true
			});
			const orderRow = await seedOrder(db(), {
				id: 'repeat-order',
				userId: user.id,
				subtotal: 5000,
				discountAmount: 500,
				totalAmount: 4500,
				promoCodeId: promo.id
			});

			await recordPromoUsage(adminCtx(), {
				promoCodeId: promo.id,
				orderId: orderRow.id,
				userId: user.id,
				discountAmount: 500,
				now
			});

			await expect(
				recordPromoUsage(adminCtx(), {
					promoCodeId: promo.id,
					orderId: orderRow.id,
					userId: user.id,
					discountAmount: 500,
					now
				})
			).rejects.toMatchObject({ code: ErrorCode.PROMO_ALREADY_USED });

			const [updatedPromo] = await db().select().from(promoCode).where(eq(promoCode.id, promo.id));
			expect(updatedPromo.usedCount).toBe(1);
			expect(await usageRows()).toHaveLength(1);
		});
	});

	describe('promo usage reads and reconciliation', () => {
		it('lists usage rows with promo summaries and filters', async () => {
			const user = await seedUser(db(), { id: 'usage-user' });
			const firstPromo = await seedPromoCode(db(), { code: 'FIRST', isActive: true });
			const secondPromo = await seedPromoCode(db(), { code: 'SECOND', isActive: true });
			await seedPromoCodeUsage(db(), firstPromo.id, {
				userId: user.id,
				orderId: 'first-order',
				discountAmount: 500
			});
			await seedPromoCodeUsage(db(), secondPromo.id, {
				userId: null,
				orderId: 'guest-order',
				discountAmount: 300
			});

			const firstOnly = await listPromoCodeUsages(adminCtx(), { promoCodeId: firstPromo.id });
			expect(firstOnly.total).toBe(1);
			expect(firstOnly.items[0]).toMatchObject({
				promoCodeId: firstPromo.id,
				promoCode: {
					id: firstPromo.id,
					code: 'FIRST'
				},
				userId: user.id,
				orderId: 'first-order'
			});

			const anonymousOnly = await listPromoCodeUsages(adminCtx(), { userId: null });
			expect(anonymousOnly.items.map((item) => item.orderId)).toEqual(['guest-order']);

			const orderOnly = await listPromoCodeUsages(adminCtx(), { orderId: 'first-order' });
			expect(orderOnly.items.map((item) => item.promoCode?.code)).toEqual(['FIRST']);
		});

		it('reconciles a single stale promo usage count', async () => {
			const promo = await seedPromoCode(db(), {
				code: 'STALE',
				isActive: true,
				usageLimit: 5,
				usedCount: 4
			});
			await seedPromoCodeUsage(db(), promo.id, { orderId: 'usage-1' });
			await seedPromoCodeUsage(db(), promo.id, { orderId: 'usage-2' });

			const reconciled = await reconcilePromoCodeUsageCount(adminCtx(), {
				lookup: { id: promo.id },
				now
			});

			expect(reconciled).toMatchObject({
				code: 'STALE',
				usedCount: 2,
				remainingUses: 3
			});
		});

		it('reconciles promo usage counts in batches with pagination metadata', async () => {
			const first = await seedPromoCode(db(), {
				code: 'A-PROMO',
				isActive: true,
				usedCount: 0
			});
			await seedPromoCode(db(), {
				code: 'B-PROMO',
				isActive: true,
				usedCount: 0
			});
			await seedPromoCodeUsage(db(), first.id, { orderId: 'usage-a' });

			const firstPage = await reconcilePromoCodeUsageCounts(adminCtx(), {
				limit: 1,
				offset: 0
			});
			expect(firstPage).toMatchObject({
				checkedCount: 1,
				changedCount: 1,
				unchangedCount: 0,
				limit: 1,
				offset: 0,
				hasMore: true
			});
			expect(firstPage.items[0]).toMatchObject({
				code: 'A-PROMO',
				previousUsedCount: 0,
				actualUsedCount: 1,
				changed: true
			});

			const secondPage = await reconcilePromoCodeUsageCounts(adminCtx(), {
				limit: 1,
				offset: 1
			});
			expect(secondPage).toMatchObject({
				checkedCount: 1,
				changedCount: 0,
				unchangedCount: 1,
				hasMore: false
			});
			expect(secondPage.items[0]).toMatchObject({
				code: 'B-PROMO',
				changed: false
			});
		});
	});

	describe('schema-level integration', () => {
		it('keeps order promo references intact for runtime validation', async () => {
			const promo = await seedPromoCode(db(), { code: 'ORDERREF', isActive: true });
			const orderRow = await seedOrder(db(), {
				id: 'order-reference',
				promoCodeId: promo.id,
				subtotal: 5000,
				discountAmount: 500,
				totalAmount: 4500
			});

			const [storedOrder] = await db().select().from(order).where(eq(order.id, orderRow.id));
			expect(storedOrder.promoCodeId).toBe(promo.id);
		});
	});
});
