import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { notificationOutbox } from '../notifications/outbox/outbox.drizzle';
import { bag as bagTable } from '../bag/bag.drizzle';
import { addItemToBag, startCheckout } from '../bag/bag.service';
import { inventory } from '../inventory/inventory.drizzle';
import { order, orderItem } from '../orders/orders.drizzle';
import { shippingMethod } from '../shipping/shipping.drizzle';
import { payment, paymentAttempt, paymentWebhookLog } from './payments.drizzle';
import { generatePayHereWebhookSignature } from './payments.logic';
import {
	capturePayPalPayment,
	createCheckoutPaymentSession,
	createPaymentSession,
	listAvailableCheckoutPaymentMethods,
	processPayHereWebhook
} from './payments.service';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { seedOrder } from '../../../../tests/factories/orders';
import { seedInventory } from '../../../../tests/factories/inventory';
import { seedProductWithVariant } from '../../../../tests/scenarios/products';
import { createFakeNotificationWakeupPublisher } from '../../../../tests/fakes/queue';
import { makeCustomerCtx } from '../../../../tests/context';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));
const envState = vi.hoisted(() => ({
	PUBLIC_APP_NAME: 'Caro Clothing',
	PUBLIC_APP_URL: 'https://caro.example',
	PAYHERE_MERCHANT_ID: 'merchant-123',
	PAYHERE_MERCHANT_SECRET: 'merchant-secret',
	PAYHERE_IS_SANDBOX: 'true' as const,
	PAYPAL_CLIENT_ID: 'paypal-client',
	PAYPAL_CLIENT_SECRET: 'paypal-secret',
	PAYPAL_IS_SANDBOX: 'true' as const
}));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

vi.mock('$lib/server/infrastructure/env', () => ({ getEnv: () => envState }));

let harness: TestDatabaseHarness;
const now = new Date('2026-07-13T10:00:00.000Z');

function db() {
	return harness.db;
}

describe('payments service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
		vi.unstubAllGlobals();
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	it('exposes only PayHere, PayPal v6, and cash on delivery', () => {
		const methods = listAvailableCheckoutPaymentMethods(makeCustomerCtx('buyer'));

		expect(methods.map((method) => method.id)).toEqual(['payhere', 'cash_on_delivery', 'paypal']);
		expect(methods.find((method) => method.id === 'paypal')?.clientConfig).toEqual({
			clientId: 'paypal-client',
			sdkUrl: 'https://www.sandbox.paypal.com/web-sdk/v6/core'
		});
	});

	it('resumes idempotent PayPal setup and creates no order until verified capture succeeds', async () => {
		const buyer = await seedUser(db(), {
			id: 'attempt-paypal-buyer',
			name: 'Attempt Buyer',
			email: 'attempt@example.com'
		});
		const { variant } = await seedProductWithVariant(db(), {
			product: { slug: 'attempt-paypal-product' },
			variantColor: { basePrice: 5000 }
		});
		await seedInventory(db(), variant.id, { quantity: 2, reservedQuantity: 0 });
		await db().insert(shippingMethod).values({
			id: 'attempt-shipping',
			name: 'Attempt Shipping',
			description: null,
			price: 500,
			freeShippingThreshold: null,
			estimatedDaysMin: 2,
			estimatedDaysMax: 4,
			isActive: true,
			sortOrder: 0,
			carrierId: null
		});
		const ctx = makeCustomerCtx(buyer.id, { now });
		await addItemToBag(ctx, { variantId: variant.id, quantity: 1, now });
		await startCheckout(ctx, { now });

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ rates: { USD: 0.003 } }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 })
			)
			.mockRejectedValueOnce(new Error('provider connection reset'))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: 'recovery-token' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'PAYPAL-ATTEMPT-ORDER' }), { status: 201 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: 'capture-token' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'COMPLETED',
						purchase_units: [
							{
								payments: {
									captures: [
										{
											id: 'PAYPAL-ATTEMPT-CAPTURE',
											status: 'COMPLETED',
											amount: { currency_code: 'USD', value: '16.50' }
										}
									]
								}
							}
						]
					}),
					{ status: 201 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);

		const checkoutInput = {
			shippingAddress: {
				recipientName: 'Attempt Buyer',
				phone: '+94770000002',
				addressLine1: '3 Main Street',
				addressLine2: null,
				city: 'Colombo',
				district: 'Colombo',
				postalCode: '00100'
			},
			shippingMethodId: 'attempt-shipping',
			paymentMethod: 'paypal'
		} as const;
		await expect(createCheckoutPaymentSession(ctx, checkoutInput)).rejects.toThrow(
			'provider connection reset'
		);
		await expect(db().select().from(paymentAttempt)).resolves.toMatchObject([
			{ status: 'pending', providerOrderId: null }
		]);

		const session = await createCheckoutPaymentSession(ctx, checkoutInput);
		expect(session).toMatchObject({
			method: 'paypal',
			paypalOrderId: 'PAYPAL-ATTEMPT-ORDER'
		});
		const persistedAttempt = await db()
			.select()
			.from(paymentAttempt)
			.where(eq(paymentAttempt.id, session.attemptId))
			.get();
		const paypalRequestIds = (
			persistedAttempt?.providerResponse as {
				metadata?: { paypalRequestIds?: { create: string; capture: string } };
			} | null
		)?.metadata?.paypalRequestIds;
		expect(session.attemptId).toMatch(/^[A-Za-z0-9_-]{21}$/);
		expect(paypalRequestIds).toMatchObject({
			create: expect.stringMatching(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
			),
			capture: expect.stringMatching(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
			)
		});
		expect(paypalRequestIds?.create).not.toBe(paypalRequestIds?.capture);
		await expect(createCheckoutPaymentSession(ctx, checkoutInput)).resolves.toEqual(session);
		expect(fetchMock).toHaveBeenCalledTimes(5);
		expect(await db().select().from(paymentAttempt)).toHaveLength(1);
		expect(await db().select().from(order)).toHaveLength(0);
		expect(await db().select().from(payment)).toHaveLength(0);
		await expect(
			db().select().from(inventory).where(eq(inventory.variantId, variant.id)).get()
		).resolves.toMatchObject({ quantity: 2, reservedQuantity: 0 });
		expect(await db().select().from(bagTable)).toHaveLength(1);
		await expect(
			db().select().from(paymentAttempt).where(eq(paymentAttempt.id, session.attemptId)).get()
		).resolves.toMatchObject({ status: 'pending', orderId: null });

		const wakeups = createFakeNotificationWakeupPublisher();
		const capture = await capturePayPalPayment(
			{ ...ctx, notificationWakeups: wakeups },
			{ paypalOrderId: 'PAYPAL-ATTEMPT-ORDER' }
		);
		expect(capture).toMatchObject({ success: true, status: 'captured' });
		expect(await db().select().from(order)).toMatchObject([{ status: 'confirmed' }]);
		expect(await db().select().from(payment)).toMatchObject([
			{ status: 'captured', transactionId: 'PAYPAL-ATTEMPT-CAPTURE' }
		]);
		await expect(
			db().select().from(inventory).where(eq(inventory.variantId, variant.id)).get()
		).resolves.toMatchObject({ quantity: 1, reservedQuantity: 0 });
		expect(await db().select().from(bagTable)).toHaveLength(0);
		expect((await db().select().from(notificationOutbox)).map((row) => row.channel).sort()).toEqual(
			['email', 'sms']
		);
	});

	it('confirms a signed PayHere payment and enqueues confirmation email and SMS once', async () => {
		const buyer = await seedUser(db(), {
			id: 'payhere-buyer',
			name: 'Caro Buyer',
			email: 'buyer@example.com'
		});
		const orderRow = await seedOrder(db(), {
			id: 'payhere-order',
			userId: buyer.id,
			status: 'pending',
			paymentExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
			totalAmount: 5000,
			shippingAddressSnapshot: {
				addressId: null,
				recipientName: 'Caro Buyer',
				phone: '+94770000000',
				addressLine1: '1 Main Street',
				addressLine2: null,
				city: 'Colombo',
				district: 'Colombo',
				postalCode: '00100',
				country: 'Sri Lanka'
			}
		});
		await db().insert(orderItem).values({
			id: 'payhere-item',
			orderId: orderRow.id,
			variantId: null,
			productId: null,
			productName: 'Caro Tee',
			variantSize: 'M',
			variantColor: 'Black',
			productImageR2Key: null,
			quantity: 1,
			unitPrice: 5000,
			totalPrice: 5000
		});
		await db().insert(payment).values({
			id: 'payhere-payment',
			orderId: orderRow.id,
			amount: 5000,
			currency: 'LKR',
			method: 'payhere',
			status: 'pending'
		});

		const payload = {
			merchant_id: envState.PAYHERE_MERCHANT_ID,
			order_id: orderRow.id,
			payment_id: 'provider-payment-1',
			payhere_amount: '5000.00',
			payhere_currency: 'LKR',
			status_code: '2',
			status_message: 'Completed',
			email: 'private-buyer@example.com',
			phone: '+94770000009',
			md5sig: generatePayHereWebhookSignature({
				merchantId: envState.PAYHERE_MERCHANT_ID,
				orderId: orderRow.id,
				amount: '5000.00',
				currency: 'LKR',
				statusCode: '2',
				merchantSecret: envState.PAYHERE_MERCHANT_SECRET
			})
		};
		const wakeups = createFakeNotificationWakeupPublisher();
		const ctx = {
			actor: { id: 'system:payhere-webhook', role: 'adminUser' as const },
			now,
			notificationWakeups: wakeups
		};

		await expect(processPayHereWebhook(ctx, { payload, headers: {} })).resolves.toMatchObject({
			status: 'captured',
			orderId: orderRow.id
		});
		await expect(
			db().select().from(order).where(eq(order.id, orderRow.id)).get()
		).resolves.toMatchObject({ status: 'confirmed' });
		await expect(
			db().select().from(payment).where(eq(payment.id, 'payhere-payment')).get()
		).resolves.toMatchObject({
			status: 'captured',
			transactionId: 'provider-payment-1',
			gatewayResponse: {
				provider: {
					order_id: orderRow.id,
					payment_id: 'provider-payment-1',
					status_code: '2',
					status_message: 'Completed'
				}
			}
		});
		const webhookAudit = await db().select().from(paymentWebhookLog).get();
		expect(webhookAudit?.payload).toMatchObject({
			order_id: orderRow.id,
			payment_id: 'provider-payment-1',
			status_code: '2'
		});
		expect(JSON.stringify(webhookAudit?.payload)).not.toContain('private-buyer@example.com');
		expect(JSON.stringify(webhookAudit?.payload)).not.toContain('+94770000009');
		expect(webhookAudit?.payload).not.toHaveProperty('md5sig');

		const notifications = await db().select().from(notificationOutbox);
		expect(notifications.map((row) => `${row.type}:${row.channel}`).sort()).toEqual([
			'order_confirmation:email',
			'order_confirmation:sms'
		]);
		expect(wakeups.queue.batches.flat()).toHaveLength(2);

		await processPayHereWebhook(ctx, { payload, headers: {} });
		expect(await db().select().from(notificationOutbox)).toHaveLength(2);
		expect(wakeups.queue.batches.flat()).toHaveLength(2);
	});

	it('rejects the retired order-first online payment flow', async () => {
		await expect(
			createPaymentSession(makeCustomerCtx('paypal-buyer', { now }), {
				orderId: 'retired-order-first-flow',
				method: 'paypal'
			})
		).rejects.toMatchObject({ code: ErrorCode.PAYMENT_ALREADY_PROCESSED });
	});

	it('authorizes the owner and verifies the PayPal capture object before confirming', async () => {
		const buyer = await seedUser(db(), { id: 'paypal-capture-buyer' });
		const orderRow = await seedOrder(db(), {
			id: 'paypal-capture-order',
			userId: buyer.id,
			status: 'pending',
			paymentExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
			totalAmount: 5000,
			shippingAddressSnapshot: {
				addressId: null,
				recipientName: 'PayPal Buyer',
				phone: '+94770000001',
				addressLine1: '2 Main Street',
				addressLine2: null,
				city: 'Colombo',
				district: 'Colombo',
				postalCode: null,
				country: 'Sri Lanka'
			}
		});
		await db()
			.insert(payment)
			.values({
				id: 'paypal-capture-payment',
				orderId: orderRow.id,
				amount: 5000,
				currency: 'LKR',
				method: 'paypal',
				status: 'pending',
				transactionId: 'PAYPAL-ORDER-CAPTURE',
				gatewayResponse: {
					metadata: {
						paypalFxQuote: {
							rate: 0.003,
							usdAmount: '15.00',
							quotedAt: now.toISOString(),
							source: 'test'
						},
						paypalRequestIds: {
							create: 'paypal-capture-payment-create',
							capture: 'paypal-capture-payment-capture'
						}
					}
				}
			});

		await expect(
			capturePayPalPayment(makeCustomerCtx('different-buyer', { now }), {
				paypalOrderId: 'PAYPAL-ORDER-CAPTURE'
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						status: 'COMPLETED',
						purchase_units: [
							{
								payments: {
									captures: [
										{
											id: 'PAYPAL-CAPTURE-1',
											status: 'COMPLETED',
											amount: { currency_code: 'USD', value: '15.00' }
										}
									]
								}
							}
						]
					}),
					{ status: 201 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		const wakeups = createFakeNotificationWakeupPublisher();

		await expect(
			capturePayPalPayment(makeCustomerCtx(buyer.id, { now, notificationWakeups: wakeups }), {
				paypalOrderId: 'PAYPAL-ORDER-CAPTURE'
			})
		).resolves.toMatchObject({ status: 'captured', orderId: orderRow.id });
		await expect(
			db().select().from(order).where(eq(order.id, orderRow.id)).get()
		).resolves.toMatchObject({ status: 'confirmed' });
		expect((await db().select().from(notificationOutbox)).map((row) => row.channel)).toEqual([
			'sms'
		]);
	});

	it('does not call PayPal after an attempt checkout window expires', async () => {
		const buyer = await seedUser(db(), { id: 'expired-paypal-buyer' });
		await db()
			.insert(paymentAttempt)
			.values({
				id: 'expired-paypal-attempt',
				userId: buyer.id,
				bagId: 'expired-paypal-bag',
				method: 'paypal',
				status: 'pending',
				amount: 5000,
				currency: 'LKR',
				checkoutInput: {},
				providerOrderId: 'EXPIRED-PAYPAL-ORDER',
				expiresAt: new Date(now.getTime() - 1),
				createdAt: new Date(now.getTime() - 60_000),
				updatedAt: new Date(now.getTime() - 60_000)
			});
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			capturePayPalPayment(makeCustomerCtx(buyer.id, { now }), {
				paypalOrderId: 'EXPIRED-PAYPAL-ORDER'
			})
		).rejects.toMatchObject({ code: ErrorCode.CHECKOUT_SESSION_EXPIRED });
		expect(fetchMock).not.toHaveBeenCalled();
		await expect(
			db()
				.select()
				.from(paymentAttempt)
				.where(eq(paymentAttempt.id, 'expired-paypal-attempt'))
				.get()
		).resolves.toMatchObject({ status: 'cancelled' });
	});

	it('keeps captured attempts terminal when a late PayHere failure arrives', async () => {
		const buyer = await seedUser(db(), { id: 'terminal-payhere-buyer' });
		const orderRow = await seedOrder(db(), {
			id: 'terminal-payhere-order',
			userId: buyer.id,
			status: 'confirmed',
			totalAmount: 5000
		});
		await db().insert(payment).values({
			id: 'terminal-payhere-payment',
			orderId: orderRow.id,
			amount: 5000,
			currency: 'LKR',
			method: 'payhere',
			status: 'captured',
			transactionId: 'terminal-provider-payment',
			paidAt: now
		});
		await db()
			.insert(paymentAttempt)
			.values({
				id: 'terminal-payhere-attempt',
				userId: buyer.id,
				bagId: 'terminal-payhere-bag',
				method: 'payhere',
				status: 'captured',
				amount: 5000,
				currency: 'LKR',
				checkoutInput: {},
				providerOrderId: 'terminal-provider-payment',
				orderId: orderRow.id,
				expiresAt: new Date(now.getTime() + 60_000),
				createdAt: now,
				updatedAt: now
			});
		const payload = {
			merchant_id: envState.PAYHERE_MERCHANT_ID,
			order_id: 'terminal-payhere-attempt',
			payment_id: 'terminal-provider-payment',
			payhere_amount: '5000.00',
			payhere_currency: 'LKR',
			status_code: '-2',
			status_message: 'Late failure',
			md5sig: generatePayHereWebhookSignature({
				merchantId: envState.PAYHERE_MERCHANT_ID,
				orderId: 'terminal-payhere-attempt',
				amount: '5000.00',
				currency: 'LKR',
				statusCode: '-2',
				merchantSecret: envState.PAYHERE_MERCHANT_SECRET
			})
		};

		await expect(
			processPayHereWebhook(
				{ actor: { id: 'system:payhere-webhook', role: 'adminUser' }, now },
				{ payload, headers: {} }
			)
		).resolves.toMatchObject({ success: true, status: 'captured', orderId: orderRow.id });
		await expect(
			db()
				.select()
				.from(paymentAttempt)
				.where(eq(paymentAttempt.id, 'terminal-payhere-attempt'))
				.get()
		).resolves.toMatchObject({ status: 'captured', failureReason: null });
	});

	it('escalates a verified late PayHere capture to durable review state', async () => {
		const buyer = await seedUser(db(), { id: 'late-capture-payhere-buyer' });
		await db()
			.insert(paymentAttempt)
			.values({
				id: 'late-capture-payhere-attempt',
				userId: buyer.id,
				bagId: 'expired-bag',
				method: 'payhere',
				status: 'cancelled',
				amount: 5000,
				currency: 'LKR',
				checkoutInput: {
					shippingAddress: {
						fullName: 'Late Buyer',
						phone: '0771234567',
						addressLine1: '1 Main Street',
						city: 'Colombo',
						postalCode: '00100',
						country: 'Sri Lanka'
					},
					shippingMethodId: 'expired-shipping-method',
					paymentMethod: 'payhere'
				},
				billingEmail: 'late@example.com',
				expiresAt: new Date(now.getTime() - 60_000),
				failureReason: 'Checkout expired.',
				createdAt: new Date(now.getTime() - 120_000),
				updatedAt: new Date(now.getTime() - 60_000)
			});
		const payload = {
			merchant_id: envState.PAYHERE_MERCHANT_ID,
			order_id: 'late-capture-payhere-attempt',
			payment_id: 'late-provider-payment',
			payhere_amount: '5000.00',
			payhere_currency: 'LKR',
			status_code: '2',
			md5sig: generatePayHereWebhookSignature({
				merchantId: envState.PAYHERE_MERCHANT_ID,
				orderId: 'late-capture-payhere-attempt',
				amount: '5000.00',
				currency: 'LKR',
				statusCode: '2',
				merchantSecret: envState.PAYHERE_MERCHANT_SECRET
			})
		};

		await expect(
			processPayHereWebhook(
				{ actor: { id: 'system:payhere-webhook', role: 'adminUser' }, now },
				{ payload, headers: {} }
			)
		).resolves.toMatchObject({
			success: false,
			status: 'captured',
			requiresManualReview: true
		});
		await expect(
			db()
				.select()
				.from(paymentAttempt)
				.where(eq(paymentAttempt.id, 'late-capture-payhere-attempt'))
				.get()
		).resolves.toMatchObject({
			status: 'review_required',
			providerOrderId: 'late-provider-payment'
		});
		expect(await db().select().from(order)).toHaveLength(0);
	});
});
