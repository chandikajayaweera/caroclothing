import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/infrastructure/env', () => ({
	getEnv: () => ({
		PUBLIC_APP_NAME: 'Caro Clothing',
		PUBLIC_APP_URL: 'https://caroclothing.lk'
	})
}));

import { buildOrderConfirmationEmail } from './transactional';
import { buildOTPEmail } from './otp';
import { buildWelcomeEmail } from './welcome';
import { buildSecurityEmail } from './security';
import { buildPromotionalEmail } from './marketing';

describe('transactional email links', () => {
	it('uses the friendly order URL and short customer reference', () => {
		const result = buildOrderConfirmationEmail({
			email: 'customer@example.com',
			customerName: 'Customer',
			orderId: 'internal-order-id',
			orderNumber: '260713-LKCWB',
			orderDate: '13 Jul 2026',
			items: [{ name: 'Core Tee', quantity: 1, price: 'LKR 5,000' }],
			subtotal: 'LKR 5,000',
			shipping: 'LKR 500',
			total: 'LKR 5,500',
			shippingAddress: 'Colombo',
			orderUrl: 'https://caroclothing.lk/view-order/260713-LKCWB'
		});

		expect(result.subject).toBe('Order #260713-LKCWB received');
		expect(result.html).toContain('href="https://caroclothing.lk/view-order/260713-LKCWB"');
		expect(result.html).not.toContain('/account/orders/internal-order-id');
	});
});

describe('email template copy and safety', () => {
	it('gives OTP recipients explicit expiry and code-sharing guidance', () => {
		const result = buildOTPEmail('123456', 'sign-in');
		expect(result.html).toContain('Expires in 10 minutes.');
		expect(result.html).toContain('Never share this code.');
	});

	it('escapes welcome names and links to the storefront', () => {
		const result = buildWelcomeEmail('<script>alert(1)</script>');
		expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(result.html).toContain('href="https://caroclothing.lk/shop"');
	});

	it('uses event-specific security recovery guidance', () => {
		const result = buildSecurityEmail({ event: 'password_changed', ipAddress: '127.0.0.1' });
		expect(result.html).toContain(
			"If you didn't make this change, secure your account immediately."
		);
		expect(result.html).toContain('127.0.0.1');
	});

	it('identifies the opt-in reason in promotional email footers', () => {
		const html = buildPromotionalEmail({
			to: 'customer@example.com',
			subject: 'New arrivals',
			previewText: 'See what is new.',
			headline: 'New arrivals',
			body: 'Built for everyday wear.',
			ctaLabel: 'Shop now',
			ctaUrl: 'https://caroclothing.lk/shop'
		});
		expect(html).toContain('because you opted in to Caro updates.');
		expect(html).toContain('Unsubscribe here.');
	});
});
