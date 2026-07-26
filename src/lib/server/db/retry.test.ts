import { describe, expect, it, vi } from 'vitest';
import {
	isTransientD1Error,
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation,
	withTransientD1WriteRetry
} from './retry';
import { DatabaseUnavailableError, ErrorCode } from '../infrastructure/errors';

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

	it.each([
		'D1_ERROR: Internal error while starting up D1 DB storage caused object to be reset.',
		'D1_ERROR: Internal error in D1 DB storage caused object to be reset.',
		'D1_ERROR: Cannot resolve D1 DB due to transient remote node.',
		'D1_ERROR: Network connection lost.',
		'D1_ERROR: Request stream disconnected because client disconnected.'
	])('recognizes documented transient D1 error: %s', (message) => {
		expect(isTransientD1Error({ message })).toBe(true);
	});

	it('recognizes a deeply nested plain-object cause', () => {
		expect(
			isTransientD1Error({
				message: 'Failed query',
				cause: {
					message: 'D1 wrapper',
					cause: { message: 'D1_ERROR: Cannot resolve D1 DB due to transient remote node.' }
				}
			})
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

describe('transient D1 write retry', () => {
	it('retries an explicitly idempotent write until it succeeds', async () => {
		const operation = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(
				drizzleError(
					'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
				)
			)
			.mockResolvedValueOnce('ok');

		await expect(
			withTransientD1WriteRetry(operation, { maxAttempts: 3, baseDelayMs: 0 })
		).resolves.toBe('ok');
		expect(operation).toHaveBeenCalledTimes(2);
	});

	it('stops after the configured number of transient attempts', async () => {
		const error = drizzleError(
			'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
		);
		const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

		await expect(
			withTransientD1WriteRetry(operation, { maxAttempts: 3, baseDelayMs: 0 })
		).rejects.toBe(error);
		expect(operation).toHaveBeenCalledTimes(3);
	});

	it('does not retry non-transient write failures', async () => {
		const error = drizzleError('D1_ERROR: UNIQUE constraint failed');
		const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

		await expect(
			withTransientD1WriteRetry(operation, { maxAttempts: 3, baseDelayMs: 0 })
		).rejects.toBe(error);
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it('returns a reconciled committed value without repeating an ambiguous write', async () => {
		const error = drizzleError(
			'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
		);
		const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);
		const reconcile = vi
			.fn<() => Promise<{ committed: true; value: string }>>()
			.mockResolvedValue({ committed: true, value: 'committed' });

		await expect(
			withTransientD1WriteReconciliation(operation, reconcile, {
				maxAttempts: 3,
				baseDelayMs: 0
			})
		).resolves.toBe('committed');
		expect(operation).toHaveBeenCalledTimes(1);
		expect(reconcile).toHaveBeenCalledTimes(1);
	});

	it('retries when reconciliation proves an ambiguous write did not commit', async () => {
		const error = drizzleError('D1_ERROR: Network connection lost.');
		const operation = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(error)
			.mockResolvedValueOnce('retried');
		const reconcile = vi
			.fn<() => Promise<{ committed: false }>>()
			.mockResolvedValue({ committed: false });

		await expect(
			withTransientD1WriteReconciliation(operation, reconcile, {
				maxAttempts: 2,
				baseDelayMs: 0
			})
		).resolves.toBe('retried');
		expect(operation).toHaveBeenCalledTimes(2);
	});
});

describe('transient D1 error mapping', () => {
	it('maps a transient failure to a 503 AppError and preserves its cause', () => {
		const cause = drizzleError('D1_ERROR: Network connection lost.');

		expect(() => rethrowTransientD1Error(cause)).toThrow(
			expect.objectContaining({
				code: ErrorCode.DATABASE_UNAVAILABLE,
				statusCode: 503,
				cause
			})
		);
	});

	it('leaves non-transient failures for the module mapper', () => {
		expect(() => rethrowTransientD1Error(new Error('UNIQUE constraint failed'))).not.toThrow();
	});

	it('uses the shared database error type', () => {
		expect(() => rethrowTransientD1Error(new Error('D1_ERROR: Network connection lost.'))).toThrow(
			DatabaseUnavailableError
		);
	});
});
