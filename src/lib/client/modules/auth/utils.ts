interface BetterAuthClientError {
	message?: string;
	status?: number;
	statusText?: string;
	code?: string;
	details?: Record<string, unknown>;
	body?: {
		details?: Record<string, unknown>;
	};
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: 'Invalid email or password.',
	AUTHENTICATION_REQUIRED: 'Sign in to continue.',
	INVALID_PHONE_NUMBER: 'Enter a valid phone number.',
	PHONE_NUMBER_ALREADY_LINKED: 'Phone number is already linked to another account.',
	GOOGLE_ACCOUNT_ALREADY_LINKED: 'Google account is already linked to another account.',
	GOOGLE_ACCOUNT_ALREADY_LINKED_TO_USER: 'Only one Google account can be linked.',
	LAST_AUTH_METHOD_REQUIRED: 'At least one sign-in method must remain linked.',
	SESSION_EXPIRED: 'Your session expired. Sign in again to continue.',
	OTP_RATE_LIMITED: 'Please wait before requesting another OTP code.',
	OTP_SEND_FAILED: 'Unable to send OTP code. Please try again.',
	ANONYMOUS_MIGRATION_FAILED: 'Unable to move your bag to this account. Please try again.'
};

export const OTP_RATE_LIMITED_MESSAGE = AUTH_ERROR_MESSAGES.OTP_RATE_LIMITED;

function parsePositiveSeconds(value: unknown): number | null {
	const seconds = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;

	return Math.ceil(seconds);
}

export function getAuthErrorRetryAfterSeconds(
	error: BetterAuthClientError | null | undefined
): number | null {
	if (!error) return null;

	return (
		parsePositiveSeconds(error.details?.retryAfter) ??
		parsePositiveSeconds(error.body?.details?.retryAfter)
	);
}

export function parseAuthError(error: BetterAuthClientError | null | undefined): string {
	if (!error) return 'An unknown error occurred.';

	if (error.code && AUTH_ERROR_MESSAGES[error.code]) return AUTH_ERROR_MESSAGES[error.code];

	if (error.status && error.status >= 500) {
		return 'Something went wrong on our end. Please try again later.';
	}

	return error.message ?? 'An unknown error occurred.';
}

export function parseUnknownError(err: unknown): string {
	if (err instanceof TypeError) {
		return 'Could not connect to the server. Check your connection.';
	}
	if (import.meta.env.DEV) console.error('[auth] caught:', err);
	return 'An unexpected error occurred.';
}

export function isCredentialApiUnsupportedError(error: unknown): boolean {
	const { name, message } = normalizeClientError(error);
	const normalizedMessage = message.toLowerCase();

	return (
		normalizedMessage.includes('user agent does not support public key credentials') ||
		(name === 'NotSupportedError' && normalizedMessage.includes('public key credentials'))
	);
}

function normalizeClientError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message
		};
	}

	if (typeof error === 'object' && error !== null) {
		const entry = error as { name?: unknown; message?: unknown };

		return {
			name: typeof entry.name === 'string' ? entry.name : '',
			message: typeof entry.message === 'string' ? entry.message : String(error)
		};
	}

	return {
		name: '',
		message: String(error)
	};
}
