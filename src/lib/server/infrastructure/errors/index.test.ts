import { describe, expect, it } from 'vitest';
import {
	DatabaseUnavailableError,
	ErrorCode,
	getErrorMessage,
	normalizeServerError,
	toBetterAuthApiError,
	toErrorResponseBody
} from './index';

describe('server error helpers', () => {
	it('walks nested Error and plain-object causes', () => {
		const error = new Error('Failed query', {
			cause: {
				message: 'D1 wrapper',
				cause: new Error('D1_ERROR: Network connection lost.')
			}
		});

		expect(getErrorMessage(error)).toBe(
			'Failed query | D1 wrapper | D1_ERROR: Network connection lost.'
		);
	});

	it('stops safely on cyclic cause chains', () => {
		const error: { message: string; cause?: unknown } = { message: 'outer' };
		error.cause = error;

		expect(getErrorMessage(error)).toBe('outer');
	});

	it('hides database failure details at the public boundary', () => {
		const error = new DatabaseUnavailableError(new Error('secret storage detail'));

		expect(error.code).toBe(ErrorCode.DATABASE_UNAVAILABLE);
		expect(toErrorResponseBody(error)).toEqual({
			code: ErrorCode.DATABASE_UNAVAILABLE,
			message: 'Something went wrong on our end. Please try again later.'
		});
	});

	it('normalizes an unwrapped transient D1 failure at server boundaries', () => {
		const cause = new Error('D1_ERROR: Network connection lost.');
		const normalized = normalizeServerError(cause);

		expect(normalized).toBeInstanceOf(DatabaseUnavailableError);
		expect(normalized).toMatchObject({
			code: ErrorCode.DATABASE_UNAVAILABLE,
			statusCode: 503,
			cause
		});
	});

	it('preserves service-unavailable status through the Better Auth adapter', () => {
		const error = toBetterAuthApiError(
			new Error(
				'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
			)
		);

		expect(error.status).toBe('SERVICE_UNAVAILABLE');
		expect(error.statusCode).toBe(503);
	});
});
