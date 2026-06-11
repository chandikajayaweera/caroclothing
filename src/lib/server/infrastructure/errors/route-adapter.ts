import { error as kitError, fail, json } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import type { SuperValidated } from 'sveltekit-superforms/server';
import { getErrorStatusCode, isAppError, toErrorResponseBody } from './index';

type ErrorStatus = 400 | 401 | 402 | 403 | 404 | 409 | 410 | 429 | 500 | 503;

function toErrorStatus(statusCode: number): ErrorStatus {
	if (statusCode >= 400 && statusCode <= 599) return statusCode as ErrorStatus;
	return 500;
}

export function failFromAppError(error: unknown) {
	if (!isAppError(error)) throw error;

	return fail(error.statusCode, {
		error: toErrorResponseBody(error, { includeDetails: error.statusCode < 500 })
	});
}

export function throwHttpFromAppError(error: unknown): never {
	if (!isAppError(error)) throw error;

	const body = toErrorResponseBody(error, { includeDetails: error.statusCode < 500 });
	throw kitError(error.statusCode, body.message);
}

export function jsonFromRouteError(error: unknown): Response {
	const statusCode = getErrorStatusCode(error);
	const body = toErrorResponseBody(error, { includeDetails: statusCode < 500 });

	return json(
		{
			...body,
			error: body.message
		},
		{ status: toErrorStatus(statusCode) }
	);
}

export function formFailFromAppError<
	T extends Record<string, unknown>,
	M = string,
	In extends Record<string, unknown> = T
>(form: SuperValidated<T, M, In>, error: unknown) {
	if (!isAppError(error)) throw error;

	const body = toErrorResponseBody(error, { includeDetails: error.statusCode < 500 });
	return message(form, body.message as M, { status: toErrorStatus(error.statusCode) });
}
