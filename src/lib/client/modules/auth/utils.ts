interface BetterAuthClientError {
	message?: string;
	status: number;
	statusText: string;
	code?: string;
}

export function parseAuthError(error: BetterAuthClientError): string {
	if (error.code === 'INVALID_EMAIL_OR_PASSWORD') {
		return 'Invalid email or password.';
	}

	if (error.status >= 500) {
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
