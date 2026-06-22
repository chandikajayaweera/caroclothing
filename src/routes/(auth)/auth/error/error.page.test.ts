/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
import { ErrorCode } from '$lib/server/infrastructure/errors';

describe('auth error page load handler', () => {
	it('formats message when a temporary ban cookie is present with expiry', async () => {
		const mockCookies = {
			get: vi.fn().mockReturnValue(JSON.stringify({ banExpires: 1782255660000, banReason: 'Testing' })),
			delete: vi.fn(),
			set: vi.fn(),
			getAll: vi.fn(),
			serialize: vi.fn()
		} as any;

		const mockUrl = new URL('http://localhost/auth/error?error=banned');

		const result = (await load({
			url: mockUrl,
			cookies: mockCookies,
			request: {} as any,
			params: {},
			route: { id: null },
			parent: async () => ({}),
			depends: () => {},
			untrack: () => {},
			isDataRequest: false,
			platform: {} as any,
			locals: {} as any,
			clientAddress: ''
		} as any)) as any;

		expect(result.error.code).toBe(ErrorCode.ACCOUNT_SUSPENDED);
		expect(result.error.message).toContain('Account is suspended until');
		expect(result.error.message).toContain('Please contact support if you believe this is an error.');
		expect(mockCookies.delete).toHaveBeenCalledWith('caro_temp_ban_info', { path: '/' });
	});

	it('formats message when temporary ban cookie is present with no expiry (permanent)', async () => {
		const mockCookies = {
			get: vi.fn().mockReturnValue(JSON.stringify({ banExpires: null, banReason: 'Permanent' })),
			delete: vi.fn(),
			set: vi.fn(),
			getAll: vi.fn(),
			serialize: vi.fn()
		} as any;

		const mockUrl = new URL('http://localhost/auth/error?error=banned');

		const result = (await load({
			url: mockUrl,
			cookies: mockCookies,
			request: {} as any,
			params: {},
			route: { id: null },
			parent: async () => ({}),
			depends: () => {},
			untrack: () => {},
			isDataRequest: false,
			platform: {} as any,
			locals: {} as any,
			clientAddress: ''
		} as any)) as any;

		expect(result.error.code).toBe(ErrorCode.ACCOUNT_SUSPENDED);
		expect(result.error.message).toBe('Account is suspended.\nPlease contact support if you believe this is an error.');
		expect(mockCookies.delete).toHaveBeenCalledWith('caro_temp_ban_info', { path: '/' });
	});

	it('formats message when error_description has expiry from URL', async () => {
		const mockCookies = {
			get: vi.fn().mockReturnValue(undefined),
			delete: vi.fn(),
			set: vi.fn(),
			getAll: vi.fn(),
			serialize: vi.fn()
		} as any;

		const mockUrl = new URL(
			'http://localhost/auth/error?error=banned&error_description=Account%20is%20suspended%20until%206%2F24%2F2026%2C%201%3A01%3A00%20AM.'
		);

		const result = (await load({
			url: mockUrl,
			cookies: mockCookies,
			request: {} as any,
			params: {},
			route: { id: null },
			parent: async () => ({}),
			depends: () => {},
			untrack: () => {},
			isDataRequest: false,
			platform: {} as any,
			locals: {} as any,
			clientAddress: ''
		} as any)) as any;

		expect(result.error.code).toBe(ErrorCode.ACCOUNT_SUSPENDED);
		expect(result.error.message).toBe(
			'Account is suspended until 6/24/2026, 1:01:00 AM.\nPlease contact support if you believe this is an error.'
		);
	});

	it('formats message for permanent ban when no cookie and no expiry in url desc', async () => {
		const mockCookies = {
			get: vi.fn().mockReturnValue(undefined),
			delete: vi.fn(),
			set: vi.fn(),
			getAll: vi.fn(),
			serialize: vi.fn()
		} as any;

		const mockUrl = new URL('http://localhost/auth/error?error=banned');

		const result = (await load({
			url: mockUrl,
			cookies: mockCookies,
			request: {} as any,
			params: {},
			route: { id: null },
			parent: async () => ({}),
			depends: () => {},
			untrack: () => {},
			isDataRequest: false,
			platform: {} as any,
			locals: {} as any,
			clientAddress: ''
		} as any)) as any;

		expect(result.error.code).toBe(ErrorCode.ACCOUNT_SUSPENDED);
		expect(result.error.message).toBe('Account is suspended.\nPlease contact support if you believe this is an error.');
	});
});
