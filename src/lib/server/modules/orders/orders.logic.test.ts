import { describe, expect, it } from 'vitest';
import {
	buildOrderNumber,
	shouldSendOrderStatusSms,
	shouldSendPaymentStatusSms
} from './orders.logic';

describe('order number formatting', () => {
	it('uses a compact date and readable suffix', () => {
		expect(buildOrderNumber(new Date('2026-07-13T08:30:00.000Z'), 'LKCWB')).toBe('260713-LKCWB');
	});
});

describe('customer SMS frequency', () => {
	it('sends post-placement order SMS only for delivered, cancelled, and refunded', () => {
		for (const status of ['pending', 'confirmed', 'processing', 'shipped']) {
			expect(shouldSendOrderStatusSms(status)).toBe(false);
		}
		for (const status of ['delivered', 'cancelled', 'refunded']) {
			expect(shouldSendOrderStatusSms(status)).toBe(true);
		}
	});

	it('suppresses routine payment SMS and keeps only full refunds', () => {
		for (const status of ['pending', 'authorized', 'captured', 'failed', 'partially_refunded']) {
			expect(shouldSendPaymentStatusSms(status)).toBe(false);
		}
		expect(shouldSendPaymentStatusSms('refunded')).toBe(true);
	});
});
