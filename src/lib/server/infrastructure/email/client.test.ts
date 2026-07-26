import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/infrastructure/env', () => ({
	getEnv: vi.fn()
}));

import { isRetryableResendError, maskEmailRecipient } from './client';

describe('email logging helpers', () => {
	it('masks recipient local parts and rejects malformed addresses from logs', () => {
		expect(maskEmailRecipient('buyer@example.com')).toBe('bu***@example.com');
		expect(maskEmailRecipient('not-an-email')).toBe('***');
	});

	it('retries only transient Resend API failures', () => {
		expect(isRetryableResendError({ name: 'rate_limit_exceeded', statusCode: 429 })).toBe(true);
		expect(isRetryableResendError({ name: 'internal_server_error', statusCode: 500 })).toBe(true);
		expect(
			isRetryableResendError({ name: 'concurrent_idempotent_requests', statusCode: 409 })
		).toBe(true);
		expect(isRetryableResendError({ name: 'network_error', statusCode: null })).toBe(true);
		expect(isRetryableResendError({ name: 'validation_error', statusCode: 422 })).toBe(false);
		expect(isRetryableResendError({ name: 'invalid_api_key', statusCode: 401 })).toBe(false);
		expect(isRetryableResendError({ name: 'monthly_quota_exceeded', statusCode: 429 })).toBe(false);
	});
});
