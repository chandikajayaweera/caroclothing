import { describe, expect, it, vi } from 'vitest';
import { isTransientD1Error, withTransientD1ReadRetry } from './retry';

function drizzleError(causeMessage: string): Error {
	const error = new Error('Failed query: select * from storefront_section');
	error.cause = new Error(causeMessage);
	return error;
}

describe('transient D1 read retry', () => {
	it('recognizes a nested D1 storage reset timeout', () => {
		expect(
			isTransientD1Error(
				drizzleError(
					'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
				)
			)
		).toBe(true);
	});

	it('retries a transient read once and returns the successful result', async () => {
		const operation = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(
				drizzleError(
					'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
				)
			)
			.mockResolvedValueOnce('ok');

		await expect(
			withTransientD1ReadRetry(operation, { maxAttempts: 2, baseDelayMs: 0 })
		).resolves.toBe('ok');
		expect(operation).toHaveBeenCalledTimes(2);
	});

	it('does not retry non-transient query failures', async () => {
		const error = drizzleError('D1_ERROR: no such table: storefront_section');
		const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

		await expect(
			withTransientD1ReadRetry(operation, { maxAttempts: 2, baseDelayMs: 0 })
		).rejects.toBe(error);
		expect(operation).toHaveBeenCalledTimes(1);
	});
});
