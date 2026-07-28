import { describe, expect, it } from 'vitest';
import { shouldDisableSessionCookieCache } from './session-cookie-cache';

function event(pathname: string, method = 'GET') {
	return {
		request: { method },
		url: { pathname }
	};
}

describe('auth session cookie cache boundary', () => {
	it('bypasses cached sessions for mutations and security-sensitive routes', () => {
		expect(shouldDisableSessionCookieCache(event('/shop', 'POST'))).toBe(true);
		expect(shouldDisableSessionCookieCache(event('/app/orders'))).toBe(true);
		expect(shouldDisableSessionCookieCache(event('/account/security'))).toBe(true);
		expect(shouldDisableSessionCookieCache(event('/api/auth/get-session'))).toBe(true);
	});

	it('uses the short cache for ordinary customer reads', () => {
		expect(shouldDisableSessionCookieCache(event('/'))).toBe(false);
		expect(shouldDisableSessionCookieCache(event('/shop'))).toBe(false);
		expect(shouldDisableSessionCookieCache(event('/account/orders'))).toBe(false);
	});
});
