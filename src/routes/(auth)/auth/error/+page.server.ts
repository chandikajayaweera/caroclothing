import type { PageServerLoad } from './$types';
import { ErrorCode } from '$lib/server/infrastructure/errors';

export const load: PageServerLoad = async ({ url }) => {
	const errorParam = url.searchParams.get('error') || 'unknown';
	const errorDesc = url.searchParams.get('error_description') || '';

	let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
	let message = 'An unexpected authentication error occurred. Please try again.';
	let appealSupport = false;

	if (errorParam === 'banned' || errorParam === ErrorCode.ACCOUNT_SUSPENDED) {
		code = ErrorCode.ACCOUNT_SUSPENDED;
		message = errorDesc || 'Your account has been suspended due to a policy violation.';
		appealSupport = true;
	} else if (errorParam === 'session_expired' || errorParam === ErrorCode.SESSION_NOT_FOUND) {
		code = ErrorCode.SESSION_NOT_FOUND;
		message = 'Your session has expired. Please sign in again.';
	} else if (errorParam === 'unauthorized' || errorParam === ErrorCode.UNAUTHORIZED) {
		code = ErrorCode.UNAUTHORIZED;
		message = 'You are not authorized to access this resource.';
	} else if (errorParam === 'forbidden' || errorParam === ErrorCode.FORBIDDEN) {
		code = ErrorCode.FORBIDDEN;
		message = 'Access is forbidden.';
	} else if (errorParam && errorParam !== 'unknown') {
		message = errorDesc || `Authentication failed: ${errorParam}`;
	}

	return {
		error: {
			code,
			message,
			appealSupport
		}
	};
};
