import type { PageServerLoad } from './$types';
import { ErrorCode } from '$lib/server/infrastructure/errors';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const errorParam = url.searchParams.get('error') || 'unknown';
	const errorDesc = url.searchParams.get('error_description') || '';

	let dynamicDesc = '';
	if (errorParam === 'banned' || errorParam === ErrorCode.ACCOUNT_SUSPENDED) {
		const cookieVal = cookies.get('caro_temp_ban_info');
		if (cookieVal) {
			try {
				const info = JSON.parse(cookieVal) as {
					banExpires: number | null;
					banReason: string | null;
				};
				if (info.banExpires) {
					const date = new Date(info.banExpires);
					dynamicDesc = `Account is suspended until ${date.toLocaleString()}.`;
				} else {
					dynamicDesc = 'Account is suspended.';
				}
				// Clean up cookie immediately
				cookies.delete('caro_temp_ban_info', { path: '/' });
			} catch (e) {
				console.error('[auth] Failed to parse temp ban cookie:', e);
			}
		}
	}

	let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
	let message = 'An unexpected authentication error occurred. Please try again.';
	let appealSupport = false;

	if (errorParam === 'banned' || errorParam === ErrorCode.ACCOUNT_SUSPENDED) {
		code = ErrorCode.ACCOUNT_SUSPENDED;
		const rawMsg = dynamicDesc || errorDesc || '';
		if (rawMsg.includes('suspended until')) {
			message = `${rawMsg}\nPlease contact support if you believe this is an error.`;
		} else {
			message = 'Account is suspended.\nPlease contact support if you believe this is an error.';
		}
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
