import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { seedOrder } from '../../../../tests/factories/orders';
import { seedProduct } from '../../../../tests/factories/products';
import { bag } from '../bag/bag.drizzle';
import { notificationOutbox } from '../notifications/outbox/outbox.drizzle';
import { payment, paymentAttempt } from '../payments/payments.drizzle';
import { order } from '../orders/orders.drizzle';
import { review, reviewMedia } from '../reviews/reviews.drizzle';
import { ErrorCode } from '../../infrastructure/errors';
import { user } from './auth.drizzle';
import { prepareAccountDeletion } from './auth.service';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

vi.mock('$lib/server/infrastructure/env', () => ({
	getEnv: () => ({ PUBLIC_APP_URL: 'https://example.test' })
}));

vi.mock('./database-hook', () => ({
	repairTempUserEmailFromLinkedGoogleAccount: vi.fn()
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-07-23T10:00:00.000Z');

function db() {
	return harness.db;
}

describe('auth account deletion integration', () => {
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

	it('atomically deletes the user and scrubs retained order, payment, and notification PII', async () => {
		const customer = await seedUser(db(), { id: 'account-delete-customer' });
		const deliveredOrder = await seedOrder(db(), {
			id: 'account-delete-order',
			userId: customer.id,
			status: 'delivered',
			shippingAddressSnapshot: {
				addressId: null,
				recipientName: 'Delete Me',
				phone: '+94770000000',
				addressLine1: '1 Privacy Lane',
				addressLine2: null,
				city: 'Colombo',
				district: 'Colombo',
				postalCode: '00100',
				country: 'Sri Lanka'
			},
			trackingNumber: 'TRACK-PII',
			trackingCarrier: 'Carrier',
			trackingUrl: 'https://carrier.example/track/TRACK-PII',
			customerNote: 'Private customer note',
			adminNote: 'Private admin note',
			deliveredAt: now
		});
		await db().insert(bag).values({
			id: 'account-delete-bag',
			userId: customer.id,
			createdAt: now,
			updatedAt: now
		});
		await db()
			.insert(payment)
			.values({
				id: 'account-delete-payment',
				orderId: deliveredOrder.id,
				amount: deliveredOrder.totalAmount,
				currency: 'LKR',
				method: 'payhere',
				status: 'captured',
				transactionId: 'financial-reference',
				gatewayResponse: {
					customer_email: customer.email,
					customer_phone: customer.phoneNumber
				},
				paidAt: now,
				createdAt: now,
				updatedAt: now
			});
		await db()
			.insert(paymentAttempt)
			.values({
				id: 'account-delete-attempt',
				userId: customer.id,
				bagId: 'account-delete-bag',
				method: 'payhere',
				status: 'pending',
				amount: deliveredOrder.totalAmount,
				currency: 'LKR',
				checkoutInput: {
					shippingAddress: {
						recipientName: 'Delete Me',
						phone: '+94770000000',
						addressLine1: '1 Privacy Lane',
						city: 'Colombo',
						district: 'Colombo'
					},
					shippingMethodId: 'shipping-method',
					paymentMethod: 'payhere'
				},
				billingEmail: customer.email,
				providerResponse: { customer_email: customer.email },
				expiresAt: new Date(now.getTime() + 60_000),
				createdAt: now,
				updatedAt: now
			});
		await db()
			.insert(notificationOutbox)
			.values({
				id: 'account-delete-notification',
				idempotencyKey: 'account-delete-notification',
				type: 'auth_welcome',
				channel: 'email',
				status: 'pending',
				recipient: customer.email,
				recipientUserId: customer.id,
				aggregateType: 'auth',
				payloadJson: { email: customer.email, name: customer.name },
				nextAttemptAt: now,
				createdAt: now,
				updatedAt: now
			});

		await expect(prepareAccountDeletion({ userId: customer.id, now })).resolves.toMatchObject({
			anonymizedOrderCount: 1
		});

		await expect(db().select().from(user).where(eq(user.id, customer.id))).resolves.toEqual([]);
		await expect(db().select().from(bag).where(eq(bag.userId, customer.id))).resolves.toEqual([]);
		await expect(
			db().select().from(order).where(eq(order.id, deliveredOrder.id)).get()
		).resolves.toMatchObject({
			userId: null,
			shippingAddressId: null,
			shippingAddressSnapshot: null,
			trackingNumber: null,
			trackingCarrier: null,
			trackingUrl: null,
			customerNote: null,
			adminNote: null
		});
		await expect(
			db().select().from(payment).where(eq(payment.id, 'account-delete-payment')).get()
		).resolves.toMatchObject({
			transactionId: 'financial-reference',
			gatewayResponse: null
		});
		await expect(
			db()
				.select()
				.from(paymentAttempt)
				.where(eq(paymentAttempt.id, 'account-delete-attempt'))
				.get()
		).resolves.toMatchObject({
			userId: '[deleted-account]:account-delete-attempt',
			bagId: '[deleted-account]:account-delete-attempt',
			status: 'cancelled',
			checkoutInput: { redacted: true },
			billingEmail: null,
			providerResponse: null,
			failureReason: 'Account deleted before payment completed.'
		});
		await expect(
			db()
				.select()
				.from(notificationOutbox)
				.where(eq(notificationOutbox.id, 'account-delete-notification'))
				.get()
		).resolves.toMatchObject({
			status: 'cancelled',
			recipient: '[deleted-account]',
			recipientUserId: null,
			payloadJson: { redacted: true },
			metadataJson: null
		});
	});

	it('refuses deletion before any mutation when fulfilment is still active', async () => {
		const customer = await seedUser(db(), { id: 'active-order-customer' });
		const activeOrder = await seedOrder(db(), {
			id: 'active-order',
			userId: customer.id,
			status: 'processing'
		});
		await db().insert(bag).values({
			id: 'active-order-bag',
			userId: customer.id,
			createdAt: now,
			updatedAt: now
		});

		await expect(prepareAccountDeletion({ userId: customer.id, now })).rejects.toMatchObject({
			code: ErrorCode.CONFLICT,
			details: {
				orderId: activeOrder.id,
				orderStatus: 'processing'
			}
		});
		await expect(
			db().select().from(user).where(eq(user.id, customer.id)).get()
		).resolves.toMatchObject({ id: customer.id });
		await expect(
			db().select().from(bag).where(eq(bag.id, 'active-order-bag')).get()
		).resolves.toMatchObject({ userId: customer.id });
		await expect(
			db().select().from(order).where(eq(order.id, activeOrder.id)).get()
		).resolves.toMatchObject({ userId: customer.id, status: 'processing' });
	});

	it('aborts deletion when review media changes after the R2 cleanup snapshot', async () => {
		const customer = await seedUser(db(), { id: 'review-media-race-customer' });
		const product = await seedProduct(db(), {
			id: 'review-media-race-product',
			slug: 'review-media-race-product'
		});
		await db().insert(review).values({
			id: 'review-media-race-review',
			productId: product.id,
			userId: customer.id,
			rating: 5,
			createdAt: now,
			updatedAt: now
		});

		const originalDb = harness.db;
		let batchCalls = 0;
		dbState.db = new Proxy(originalDb, {
			get(target, property, receiver) {
				if (property === 'batch') {
					return async (statements: Parameters<typeof target.batch>[0]) => {
						batchCalls += 1;
						await target.insert(reviewMedia).values({
							id: 'review-media-race-image',
							reviewId: 'review-media-race-review',
							r2Key: 'reviews/review-media-race-review/photo-1.png',
							createdAt: now
						});
						return target.batch(statements);
					};
				}
				const value = Reflect.get(target, property, receiver);
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});

		try {
			await expect(prepareAccountDeletion({ userId: customer.id, now })).rejects.toMatchObject({
				code: ErrorCode.CONFLICT
			});
			expect(batchCalls).toBe(1);
			await expect(
				originalDb.select().from(user).where(eq(user.id, customer.id)).get()
			).resolves.toMatchObject({ id: customer.id });
			await expect(
				originalDb
					.select()
					.from(reviewMedia)
					.where(eq(reviewMedia.id, 'review-media-race-image'))
					.get()
			).resolves.toMatchObject({
				r2Key: 'reviews/review-media-race-review/photo-1.png'
			});
		} finally {
			dbState.db = originalDb;
		}
	});
});
