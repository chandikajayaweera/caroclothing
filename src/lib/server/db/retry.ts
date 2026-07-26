import { DatabaseUnavailableError } from '../infrastructure/errors';
import { isTransientD1Error } from './errors';

export { isTransientD1Error } from './errors';

type D1ReadRetryOptions = {
	maxAttempts?: number;
	baseDelayMs?: number;
};

type D1WriteRetryOptions = D1ReadRetryOptions & {
	maxDelayMs?: number;
};

export type D1WriteReconciliation<T> = { committed: true; value: T } | { committed: false };

/**
 * Converts a known transient D1 failure into the shared retryable HTTP boundary.
 * This does not retry the operation; callers must explicitly prove idempotency
 * before choosing either retry helper.
 */
export function rethrowTransientD1Error(error: unknown): void {
	if (isTransientD1Error(error)) throw new DatabaseUnavailableError(error);
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

/**
 * Adds bounded exponential backoff with jitter around an explicitly idempotent
 * D1 write operation. Callers must build stable statement values before
 * invoking this helper so an ambiguous first attempt can be safely repeated.
 */
export async function withTransientD1WriteRetry<T>(
	operation: () => Promise<T>,
	options: D1WriteRetryOptions = {}
): Promise<T> {
	const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3));
	const baseDelayMs = Math.max(0, Math.trunc(options.baseDelayMs ?? 100));
	const maxDelayMs = Math.max(baseDelayMs, Math.trunc(options.maxDelayMs ?? 1_000));

	for (let attempt = 1; ; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= maxAttempts || !isTransientD1Error(error)) throw error;
			const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
			const jitterMs = Math.floor(Math.random() * Math.max(1, backoffMs / 4));
			const delayMs = backoffMs + jitterMs;
			if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
}

/**
 * Retries a stable write while reconciling an ambiguous result before every
 * retry. The operation and reconciliation lookup must share a stable identity
 * generated before this helper is called (for example, a row or history ID).
 */
export async function withTransientD1WriteReconciliation<T>(
	operation: () => Promise<T>,
	reconcile: () => Promise<D1WriteReconciliation<T>>,
	options: D1WriteRetryOptions = {}
): Promise<T> {
	return withTransientD1WriteRetry(async () => {
		try {
			return await operation();
		} catch (error) {
			try {
				const result = await withTransientD1ReadRetry(reconcile);
				if (result.committed) return result.value;
			} catch (reconciliationError) {
				if (isTransientD1Error(reconciliationError)) throw reconciliationError;
			}
			throw error;
		}
	}, options);
}
