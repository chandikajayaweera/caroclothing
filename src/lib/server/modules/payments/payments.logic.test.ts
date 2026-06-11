import { describe, expect, it } from 'vitest';
import {
	createPayPalFxQuote,
	decideCapturedOrderAction,
	generatePayHereWebhookSignature,
	getGatewayMetadata,
	mergeGatewayEnvelope,
	resolvePublicPaymentEmail,
	verifyPayHereWebhookSignature
} from './payments.logic';

describe('payment provider logic', () => {
	it('rejects internal placeholder emails', () => {
		expect(resolvePublicPaymentEmail('buyer@example.com')).toBe('buyer@example.com');
		expect(resolvePublicPaymentEmail('94770000000@phone.caroclothing.lk')).toBeNull();
		expect(resolvePublicPaymentEmail('guest@anonymous.caroclothing.lk')).toBeNull();
	});

	it('rounds and locks the PayPal USD quote', () => {
		expect(createPayPalFxQuote(12_345, 0.003337, new Date('2026-06-10T00:00:00Z'), 'test')).toEqual(
			{
				rate: 0.003337,
				usdAmount: '41.20',
				quotedAt: '2026-06-10T00:00:00.000Z',
				source: 'test'
			}
		);
	});

	it('verifies PayHere signatures without accepting tampered values', () => {
		const merchantSecret = 'merchant-secret';
		const signature = generatePayHereWebhookSignature({
			merchantId: '123',
			orderId: 'order-1',
			amount: '1500.00',
			currency: 'LKR',
			statusCode: '2',
			merchantSecret
		});

		expect(
			verifyPayHereWebhookSignature({
				merchantId: '123',
				orderId: 'order-1',
				amount: '1500.00',
				currency: 'LKR',
				statusCode: '2',
				merchantSecret,
				signature
			})
		).toBe(true);
		expect(
			verifyPayHereWebhookSignature({
				merchantId: '123',
				orderId: 'order-1',
				amount: '1501.00',
				currency: 'LKR',
				statusCode: '2',
				merchantSecret,
				signature
			})
		).toBe(false);
	});

	it('preserves provider data while adding service metadata', () => {
		const merged = mergeGatewayEnvelope(
			{ legacy: true },
			{ metadata: { billingEmail: 'a@b.com' } }
		);
		expect(merged.provider).toEqual({ legacy: true });
		expect(getGatewayMetadata(merged).billingEmail).toBe('a@b.com');
	});

	it('does not reclaim stock for captures after cancellation', () => {
		const now = new Date('2026-06-10T10:00:00Z');
		expect(decideCapturedOrderAction('pending', new Date('2026-06-10T10:01:00Z'), now)).toBe(
			'confirm'
		);
		expect(decideCapturedOrderAction('pending', new Date('2026-06-10T09:59:00Z'), now)).toBe(
			'cancel_and_review'
		);
		expect(decideCapturedOrderAction('cancelled', null, now)).toBe('review');
		expect(decideCapturedOrderAction('confirmed', null, now)).toBe('none');
	});
});
