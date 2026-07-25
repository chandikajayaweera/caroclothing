import { error as kitError, fail, isRedirect, json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { message } from 'sveltekit-superforms/server';
import type { SuperValidated } from 'sveltekit-superforms/server';
import { getErrorStatusCode, isAppError, toErrorResponseBody } from './index';

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

	if (!isAppError(error)) {
		Sentry.captureException(error);
		throw error;
	}

	if (error.statusCode >= 500) {
		Sentry.captureException(error);
	} else {
		recordDomainValidationBreadcrumb(error);
	}

	return fail(error.statusCode, {
		error: toErrorResponseBody(error, { includeDetails: error.statusCode < 500 })
	});
}

export function throwHttpFromAppError(error: unknown): never {
	if (isRedirect(error)) throw error;

	if (!isAppError(error)) {
		Sentry.captureException(error);
		throw error;
	}

	const body = toErrorResponseBody(error, { includeDetails: error.statusCode < 500 });
	if (error.statusCode >= 500) {
		Sentry.captureException(error);
	} else {
		recordDomainValidationBreadcrumb(error);
	}
	throw kitError(error.statusCode, body.message);
}

export function jsonFromRouteError(error: unknown): Response {
	if (isRedirect(error)) throw error;

	const statusCode = getErrorStatusCode(error);
	const body = toErrorResponseBody(error, { includeDetails: statusCode < 500 });
	const status = toErrorStatus(statusCode);

	if (status >= 500 || !isAppError(error)) {
		Sentry.captureException(error);
	} else {
		recordDomainValidationBreadcrumb(error);
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

	if (!isAppError(error)) {
		Sentry.captureException(error);
		throw error;
	}

	const body = toErrorResponseBody(error, { includeDetails: error.statusCode < 500 });
	const status = toErrorStatus(error.statusCode);

	if (status >= 500) {
		Sentry.captureException(error);
	} else {
		recordDomainValidationBreadcrumb(error);
	}

	return message(form, body.message as M, { status });
}
