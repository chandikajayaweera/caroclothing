import { error as kitError, fail, isRedirect, json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { message } from 'sveltekit-superforms/server';
import type { SuperValidated } from 'sveltekit-superforms/server';
import { getErrorStatusCode, isAppError, normalizeServerError, toErrorResponseBody } from './index';

type ErrorStatus = 400 | 401 | 402 | 403 | 404 | 409 | 410 | 429 | 500 | 503;

function toErrorStatus(statusCode: number): ErrorStatus {
	if (statusCode >= 400 && statusCode <= 599) return statusCode as ErrorStatus;
	return 500;
}

function recordDomainValidationBreadcrumb(error: unknown) {
	if (isAppError(error) && error.statusCode < 500) {
		Sentry.addBreadcrumb({
			category: 'domain.validation',
			message: `${error.code}: ${error.message}`,
			level: 'warning',
			data: { code: error.code, statusCode: error.statusCode }
		});
	}
}

export function failFromAppError(error: unknown) {
	if (isRedirect(error)) throw error;
	const normalizedError = normalizeServerError(error);

	if (!isAppError(normalizedError)) {
		Sentry.captureException(normalizedError);
		throw normalizedError;
	}

	if (normalizedError.statusCode >= 500) {
		Sentry.captureException(normalizedError);
	} else {
		recordDomainValidationBreadcrumb(normalizedError);
	}
	const body = toErrorResponseBody(normalizedError, {
		includeDetails: normalizedError.statusCode < 500
	});

	return fail(normalizedError.statusCode, {
		success: false,
		message: body.message,
		error: body
	});
}

export function throwHttpFromAppError(error: unknown): never {
	if (isRedirect(error)) throw error;
	const normalizedError = normalizeServerError(error);

	if (!isAppError(normalizedError)) {
		Sentry.captureException(normalizedError);
		throw normalizedError;
	}

	const body = toErrorResponseBody(normalizedError, {
		includeDetails: normalizedError.statusCode < 500
	});
	let sentryEventId: string | undefined;
	if (normalizedError.statusCode >= 500) {
		sentryEventId = Sentry.captureException(normalizedError);
	} else {
		recordDomainValidationBreadcrumb(normalizedError);
	}
	throw kitError(normalizedError.statusCode, {
		message: body.message,
		...(sentryEventId ? { sentryEventId } : {})
	});
}

export function jsonFromRouteError(error: unknown): Response {
	if (isRedirect(error)) throw error;
	const normalizedError = normalizeServerError(error);

	const statusCode = getErrorStatusCode(normalizedError);
	const body = toErrorResponseBody(normalizedError, { includeDetails: statusCode < 500 });
	const status = toErrorStatus(statusCode);

	if (status >= 500 || !isAppError(normalizedError)) {
		Sentry.captureException(normalizedError);
	} else {
		recordDomainValidationBreadcrumb(normalizedError);
	}

	return json(
		{
			...body,
			error: body.message
		},
		{ status }
	);
}

export function formFailFromAppError<
	T extends Record<string, unknown>,
	M = string,
	In extends Record<string, unknown> = T
>(form: SuperValidated<T, M, In>, error: unknown) {
	if (isRedirect(error)) throw error;
	const normalizedError = normalizeServerError(error);

	if (!isAppError(normalizedError)) {
		Sentry.captureException(normalizedError);
		throw normalizedError;
	}

	const body = toErrorResponseBody(normalizedError, {
		includeDetails: normalizedError.statusCode < 500
	});
	const status = toErrorStatus(normalizedError.statusCode);

	if (status >= 500) {
		Sentry.captureException(normalizedError);
	} else {
		recordDomainValidationBreadcrumb(normalizedError);
	}

	return message(form, body.message as M, { status });
}
