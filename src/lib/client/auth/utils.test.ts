import { describe, expect, it } from 'vitest';
import { isCredentialApiUnsupportedError, parseAuthError } from './utils';

describe('auth client error helpers', () => {
	it('detects unsupported public key credential errors', () => {
		const error =
			typeof DOMException === 'function'
				? new DOMException(
						'The user agent does not support public key credentials.',
						'NotSupportedError'
					)
				: Object.assign(new Error('The user agent does not support public key credentials.'), {
						name: 'NotSupportedError'
					});

		expect(isCredentialApiUnsupportedError(error)).toBe(true);
		expect(
			isCredentialApiUnsupportedError(
				new Error('NotSupportedError: The user agent does not support public key credentials.')
			)
		).toBe(true);
	});

	it('does not treat ordinary auth failures as credential support failures', () => {
		expect(isCredentialApiUnsupportedError(new Error('Network request failed'))).toBe(false);
		expect(
			isCredentialApiUnsupportedError(
				Object.assign(new Error('Session expired'), { name: 'NotSupportedError' })
			)
		).toBe(false);
		expect(isCredentialApiUnsupportedError(null)).toBe(false);
	});

	describe('parseAuthError', () => {
		it('returns default message for ACCOUNT_SUSPENDED if message is missing', () => {
			const error = { code: 'ACCOUNT_SUSPENDED' };
			expect(parseAuthError(error)).toBe('Account is suspended.');
		});

		it('returns server-provided message for ACCOUNT_SUSPENDED if available', () => {
			const error = {
				code: 'ACCOUNT_SUSPENDED',
				message: 'Account is suspended until 2026-06-25.'
			};
			expect(parseAuthError(error)).toBe('Account is suspended until 2026-06-25.');
		});

		it('returns standard messages for other mapped codes', () => {
			const error = { code: 'OTP_RATE_LIMITED' };
			expect(parseAuthError(error)).toBe('Please wait before requesting another OTP code.');
		});

		it('returns error.message for unmapped codes if present', () => {
			const error = { code: 'SOME_NEW_ERROR', message: 'A custom error' };
			expect(parseAuthError(error)).toBe('A custom error');
		});
	});
});
