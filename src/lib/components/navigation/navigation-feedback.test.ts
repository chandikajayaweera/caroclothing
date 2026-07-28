import { describe, expect, it } from 'vitest';
import { getNavigationLabel, isDataNavigation } from './navigation-feedback';

describe('navigation feedback labels', () => {
	it.each([
		['/', 'home'],
		['/shop', 'shop'],
		['/shop/core-tee', 'product'],
		['/checkout/confirmation/order-1', 'order confirmation'],
		['/account/orders/order-1', 'orders'],
		['/app/categories', 'categories'],
		['/auth/error', 'authentication']
	] as const)('labels %s as %s', (pathname, expectedLabel) => {
		expect(getNavigationLabel(pathname)).toBe(expectedLabel);
	});
});

describe('data navigation detection', () => {
	it('includes path and query changes', () => {
		expect(
			isDataNavigation(new URL('https://caro.test/shop'), new URL('https://caro.test/bag'), false)
		).toBe(true);
		expect(
			isDataNavigation(
				new URL('https://caro.test/shop?sort=newest'),
				new URL('https://caro.test/shop?sort=price-asc'),
				false
			)
		).toBe(true);
	});

	it('ignores hash-only and unloading navigations', () => {
		expect(
			isDataNavigation(
				new URL('https://caro.test/about#story'),
				new URL('https://caro.test/about#values'),
				false
			)
		).toBe(false);
		expect(
			isDataNavigation(new URL('https://caro.test/'), new URL('https://other.test/'), true)
		).toBe(false);
	});
});
