import { redirect } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	failFromAppError,
	formFailFromAppError,
	jsonFromRouteError,
	throwHttpFromAppError
} from './route-adapter';

vi.mock('@sentry/sveltekit', () => ({
	captureException: vi.fn()
}));

const captureException = vi.mocked(Sentry.captureException);

function createRedirectError(): unknown {
	try {
		redirect(303, '/checkout');
	} catch (error) {
		return error;
	}

	throw new Error('Expected redirect() to throw.');
}

function expectRethrownRedirect(run: (error: unknown) => unknown): void {
	const redirectError = createRedirectError();
	let caught: unknown;

	try {
		run(redirectError);
	} catch (error) {
		caught = error;
	}

	expect(caught).toBe(redirectError);
	expect(captureException).not.toHaveBeenCalled();
}

describe('route AppError adapters', () => {
	beforeEach(() => {
		captureException.mockClear();
	});

	it('rethrows SvelteKit redirects from throwHttpFromAppError without reporting them', () => {
		expectRethrownRedirect((error) => throwHttpFromAppError(error));
	});

	it('rethrows SvelteKit redirects from failFromAppError without reporting them', () => {
		expectRethrownRedirect((error) => failFromAppError(error));
	});

	it('rethrows SvelteKit redirects from jsonFromRouteError without reporting them', () => {
		expectRethrownRedirect((error) => jsonFromRouteError(error));
	});

	it('rethrows SvelteKit redirects from formFailFromAppError without reporting them', () => {
		expectRethrownRedirect((error) => formFailFromAppError({} as never, error));
	});

	it('still reports unexpected non-AppError exceptions', () => {
		const error = new Error('Unexpected failure.');

		expect(() => throwHttpFromAppError(error)).toThrow(error);
		expect(captureException).toHaveBeenCalledWith(error);
	});

	it('normalizes raw transient D1 failures to a captured 503 response', () => {
		const result = failFromAppError(new Error('D1_ERROR: Network connection lost.'));

		expect(result.status).toBe(503);
		expect(result.data).toEqual({
			success: false,
			message: 'Something went wrong on our end. Please try again later.',
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Something went wrong on our end. Please try again later.'
			}
		});
		expect(captureException).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'DATABASE_UNAVAILABLE', statusCode: 503 })
		);
	});

	it('marks a thrown 5xx HttpError with the original Sentry event ID', () => {
		captureException.mockReturnValueOnce('event-id');
		let caught: unknown;

		try {
			throwHttpFromAppError(new Error('D1_ERROR: Network connection lost.'));
		} catch (error) {
			caught = error;
		}

		expect(caught).toMatchObject({
			status: 503,
			body: {
				message: 'Something went wrong on our end. Please try again later.',
				sentryEventId: 'event-id'
			}
		});
	});
});
