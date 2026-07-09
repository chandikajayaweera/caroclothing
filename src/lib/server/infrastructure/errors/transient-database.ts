type RetryOptions = {
	attempts?: number;
	delayMs?: number;
};

type ErrorLike = {
	name?: unknown;
	message?: unknown;
	code?: unknown;
	status?: unknown;
	statusCode?: unknown;
	cause?: unknown;
};

const DEFAULT_ATTEMPTS = 2;
const DEFAULT_DELAY_MS = 75;

export function isTransientDatabaseTransportError(error: unknown): boolean {
	const chain = collectErrorChain(error);
	const joinedMessages = chain
		.map((entry) => entry.message)
		.join(' | ')
		.toLowerCase();

	return chain.some((entry) => {
		if (entry.code === 'ECONNRESET') return true;

		if (entry.code !== 'SERVER_ERROR') return false;
		if (entry.status === 404) return true;

		return joinedMessages.includes('server returned http status 404');
	});
}

export async function withTransientDatabaseRetry<T>(
	operation: () => Promise<T>,
	options: RetryOptions = {}
): Promise<T> {
	const attempts = Math.max(1, Math.trunc(options.attempts ?? DEFAULT_ATTEMPTS));
	const delayMs = Math.max(0, Math.trunc(options.delayMs ?? DEFAULT_DELAY_MS));

	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;

			if (attempt >= attempts || !isTransientDatabaseTransportError(error)) {
				throw error;
			}

			if (delayMs > 0) {
				await delay(delayMs);
			}
		}
	}

	throw lastError;
}

function collectErrorChain(error: unknown) {
	const chain: Array<{ message: string; code: string | null; status: number | null }> = [];
	const seen = new Set<unknown>();
	let current: unknown = error;

	while (current && !seen.has(current)) {
		seen.add(current);

		const entry = toErrorLike(current);
		chain.push({
			message: normalizeMessage(entry.message),
			code: typeof entry.code === 'string' ? entry.code : null,
			status: normalizeStatus(entry.status) ?? normalizeStatus(entry.statusCode)
		});

		current = entry.cause;
	}

	return chain;
}

function toErrorLike(error: unknown): ErrorLike {
	if (error instanceof Error) return error as ErrorLike;
	if (typeof error === 'object' && error !== null) return error as ErrorLike;
	return { message: String(error) };
}

function normalizeMessage(message: unknown): string {
	if (typeof message === 'string') return message;
	return String(message ?? '');
}

function normalizeStatus(status: unknown): number | null {
	if (typeof status !== 'number') return null;
	return Number.isFinite(status) ? status : null;
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
