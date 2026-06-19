import { describe, expect, it } from 'vitest';
import { isCredentialApiUnsupportedError } from './utils';

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
});
