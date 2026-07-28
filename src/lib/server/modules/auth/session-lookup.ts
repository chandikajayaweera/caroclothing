import { isAPIError, type APIError } from 'better-auth/api';

const FAILED_TO_GET_SESSION_CODE = 'FAILED_TO_GET_SESSION';

type SessionLookupOptions = {
	maxAttempts?: number;
	baseDelayMs?: number;
};

function isFailedSessionLookupError(error: unknown): error is APIError {
	return isAPIError(error) && error.body?.code === FAILED_TO_GET_SESSION_CODE;
}

/**
 * Resolves the request session without turning a revoked-session race into an
 * unexpected request failure. Better Auth deliberately wraps unknown adapter
 * failures in a generic FAILED_TO_GET_SESSION 5xx, so that narrow case gets one
 * bounded retry. Exhausted and unrelated errors remain observable.
 */
export async function resolveAuthSession<T>(
	lookup: () => Promise<T | null>,
	options: SessionLookupOptions = {}
): Promise<T | null> {
	const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 2));
	const baseDelayMs = Math.max(0, Math.trunc(options.baseDelayMs ?? 50));

	for (let attempt = 1; ; attempt += 1) {
		try {
			return await lookup();
		} catch (error) {
			if (isFailedSessionLookupError(error) && error.statusCode === 401) {
				return null;
			}

			const shouldRetry =
				attempt < maxAttempts && isFailedSessionLookupError(error) && error.statusCode >= 500;

			if (!shouldRetry) throw error;
			if (baseDelayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
			}
		}
	}
}
