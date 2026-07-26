import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { resolveAuthSession } from './session-lookup';

function failedSessionError(status: 'UNAUTHORIZED' | 'INTERNAL_SERVER_ERROR') {
	return new APIError(status, {
		code: 'FAILED_TO_GET_SESSION',
		message: 'Failed to get session'
	});
}

describe('auth session lookup recovery', () => {
	it('treats an invalidated session as unauthenticated without retrying', async () => {
		const lookup = vi
			.fn<() => Promise<string | null>>()
			.mockRejectedValue(failedSessionError('UNAUTHORIZED'));

		await expect(resolveAuthSession(lookup, { baseDelayMs: 0 })).resolves.toBeNull();
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('retries one wrapped server failure and returns the recovered session', async () => {
		const lookup = vi
			.fn<() => Promise<string | null>>()
			.mockRejectedValueOnce(failedSessionError('INTERNAL_SERVER_ERROR'))
			.mockResolvedValueOnce('session');

		await expect(resolveAuthSession(lookup, { baseDelayMs: 0 })).resolves.toBe('session');
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('rethrows an exhausted wrapped server failure', async () => {
		const error = failedSessionError('INTERNAL_SERVER_ERROR');
		const lookup = vi.fn<() => Promise<string | null>>().mockRejectedValue(error);

		await expect(resolveAuthSession(lookup, { maxAttempts: 2, baseDelayMs: 0 })).rejects.toBe(
			error
		);
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('does not retry an unrelated Better Auth API error', async () => {
		const error = new APIError('INTERNAL_SERVER_ERROR', {
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Internal Server Error'
		});
		const lookup = vi.fn<() => Promise<string | null>>().mockRejectedValue(error);

		await expect(resolveAuthSession(lookup, { baseDelayMs: 0 })).rejects.toBe(error);
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('returns a normal empty lookup unchanged', async () => {
		const lookup = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);

		await expect(resolveAuthSession(lookup, { baseDelayMs: 0 })).resolves.toBeNull();
		expect(lookup).toHaveBeenCalledTimes(1);
	});
});
