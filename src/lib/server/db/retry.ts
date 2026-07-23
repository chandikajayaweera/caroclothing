const RETRYABLE_D1_ERROR_FRAGMENTS = [
	'network connection lost',
	'storage operation exceeded timeout which caused object to be reset',
	'storage caused object to be reset',
	'reset because its code was updated'
] as const;

type D1ReadRetryOptions = {
	maxAttempts?: number;
	baseDelayMs?: number;
};

export function isTransientD1Error(error: unknown): boolean {
	const messages: string[] = [];
	const seen = new Set<unknown>();
	let current = error;

	for (let depth = 0; current != null && depth < 8 && !seen.has(current); depth += 1) {
		seen.add(current);
		if (typeof current === 'string') {
			messages.push(current);
			break;
		}
		if (current instanceof Error) messages.push(current.message);
		if (typeof current !== 'object') break;
		current = 'cause' in current ? current.cause : null;
	}

	const message = messages.join(' | ').toLowerCase();
	return RETRYABLE_D1_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Adds one bounded application retry around a read-only D1 operation.
 * D1 already retries eligible reads internally; this covers a reset that still
 * escapes that boundary. Never use this helper for writes.
 */
export async function withTransientD1ReadRetry<T>(
	operation: () => Promise<T>,
	options: D1ReadRetryOptions = {}
): Promise<T> {
	const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 2));
	const baseDelayMs = Math.max(0, Math.trunc(options.baseDelayMs ?? 50));

	for (let attempt = 1; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= maxAttempts || !isTransientD1Error(error)) throw error;
			if (baseDelayMs > 0)
				await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
		}
	}
}
