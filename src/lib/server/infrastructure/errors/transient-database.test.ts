import { describe, expect, it } from 'vitest';
import {
	isTransientDatabaseTransportError,
	withTransientDatabaseRetry
} from './transient-database';

function sentryLibsql404Error() {
	const httpError = Object.assign(new Error('Server returned HTTP status 404'), {
		name: 'HttpServerError',
		status: 404
	});
	const libsqlError = Object.assign(new Error('SERVER_ERROR: Server returned HTTP status 404'), {
		name: 'LibsqlError',
		code: 'SERVER_ERROR',
		cause: httpError
	});

	return Object.assign(new Error('Failed query: select * from bag_item where bag_id in (?)'), {
		name: 'DrizzleQueryError',
		cause: libsqlError
	});
}

function sentryTursoConnectionResetError() {
	const fetchError = Object.assign(
		new Error(
			'request to https://staging-chandikajayaweera.aws-ap-south-1.turso.io/v2/pipeline failed, reason: read ECONNRESET'
		),
		{
			name: 'FetchError',
			code: 'ECONNRESET'
		}
	);

	return Object.assign(new Error('Failed query: select * from product_variant'), {
		name: 'DrizzleQueryError',
		cause: fetchError
	});
}

describe('transient database transport errors', () => {
	it('detects the nested LibSQL HTTP 404 transport failure from Sentry', () => {
		expect(isTransientDatabaseTransportError(sentryLibsql404Error())).toBe(true);
	});

	it('detects the nested Turso FetchError ECONNRESET transport failure from Sentry', () => {
		expect(isTransientDatabaseTransportError(sentryTursoConnectionResetError())).toBe(true);
	});

	it('does not treat ordinary app or database errors as transient transport errors', () => {
		expect(isTransientDatabaseTransportError(new Error('Server returned HTTP status 404'))).toBe(
			false
		);
		expect(
			isTransientDatabaseTransportError(
				Object.assign(new Error('UNIQUE constraint failed: bag_item.id'), {
					code: 'SQLITE_CONSTRAINT_UNIQUE'
				})
			)
		).toBe(false);
	});

	it('retries transient failures once and returns the successful result', async () => {
		let attempts = 0;

		const result = await withTransientDatabaseRetry(
			async () => {
				attempts += 1;
				if (attempts === 1) throw sentryLibsql404Error();
				return 'ok';
			},
			{ delayMs: 0 }
		);

		expect(result).toBe('ok');
		expect(attempts).toBe(2);
	});

	it('does not retry non-transient errors', async () => {
		let attempts = 0;
		const error = new Error('Validation failed');

		await expect(
			withTransientDatabaseRetry(
				async () => {
					attempts += 1;
					throw error;
				},
				{ delayMs: 0 }
			)
		).rejects.toBe(error);
		expect(attempts).toBe(1);
	});

	it('rethrows a transient error after max attempts', async () => {
		let attempts = 0;

		await expect(
			withTransientDatabaseRetry(
				async () => {
					attempts += 1;
					throw sentryLibsql404Error();
				},
				{ attempts: 2, delayMs: 0 }
			)
		).rejects.toMatchObject({ name: 'DrizzleQueryError' });
		expect(attempts).toBe(2);
	});
});
