import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendSms = vi.hoisted(() => vi.fn());

vi.mock('../client', () => ({ sendSms }));

import { sendOtpSms } from './auth';
import {
	sendOrderConfirmationSms,
	sendOrderStatusUpdateSms,
	sendPaymentUpdateSms
} from './transactional';

describe('SMS sender copy', () => {
	beforeEach(() => {
		sendSms.mockReset();
		sendSms.mockResolvedValue({ ok: true, messageId: 'sms-1' });
	});

	it('keeps OTP copy short, one-line, and brand-free', async () => {
		await sendOtpSms('+94771234567', '465174');

		expect(sendSms).toHaveBeenCalledWith({
			to: '+94771234567',
			senderPurpose: 'otp',
			message: 'Code 465174. Valid 10 min. Do not share.'
		});
	});

	it('formats placed SMS with readable lines and the customer order link', async () => {
		await sendOrderConfirmationSms({
			to: '+94771234567',
			customerName: 'Customer',
			orderId: 'internal-order-id',
			orderNumber: '260713-LKCWB',
			total: 'LKR 5,500',
			orderUrl: 'https://caroclothing.lk/view-order/260713-LKCWB'
		});

		expect(sendSms).toHaveBeenCalledWith({
			to: '+94771234567',
			senderPurpose: 'transactional',
			message:
				'Your order has been placed.\nOrder ID: 260713-LKCWB\nTotal: LKR 5,500\nView your order: https://caroclothing.lk/view-order/260713-LKCWB\nThank you for shopping with us.'
		});
	});

	it('uses status-specific cancelled copy', async () => {
		await sendOrderStatusUpdateSms({
			to: '+94771234567',
			orderId: 'internal-order-id',
			orderNumber: '260713-LKCWB',
			status: 'cancelled',
			orderUrl: 'https://caroclothing.lk/view-order/260713-LKCWB'
		});

		expect(sendSms).toHaveBeenCalledWith({
			to: '+94771234567',
			senderPurpose: 'transactional',
			message:
				'Your order has been cancelled.\nOrder ID: 260713-LKCWB\nView your order: https://caroclothing.lk/view-order/260713-LKCWB\nNeed help? Reply to this message.'
		});
	});

	it('explains refund timing in refunded payment copy', async () => {
		await sendPaymentUpdateSms({
			to: '+94771234567',
			orderId: 'internal-order-id',
			orderNumber: '260713-LKCWB',
			status: 'refunded',
			amount: 'LKR 5,500'
		});

		expect(sendSms.mock.calls[0]?.[0].message).toContain(
			'Your bank may take several business days to show the refund.'
		);
	});
});
