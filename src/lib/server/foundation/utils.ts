type ClockContext = {
	now?: Date | null;
};

export function normalizeLimit(
	limit: number | undefined,
	defaultLimit = 100,
	maxLimit = 200
): number {
	if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
	return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

export function normalizeOffset(offset: number | undefined): number {
	if (offset === undefined || !Number.isFinite(offset)) return 0;
	return Math.max(Math.trunc(offset), 0);
}

export function resolveNow(ctx: ClockContext | null | undefined, now?: Date): Date {
	return now ?? ctx?.now ?? new Date();
}

export function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
	) as T;
}

export function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

export function isString(value: string | null | undefined): value is string {
	return typeof value === 'string';
}

/**
 * Collects useful messages from Error/cause chains without trusting their shape.
 * Drizzle and Cloudflare frequently wrap the actionable D1 message in one or
 * more plain-object causes.
 */
export function collectErrorMessages(error: unknown, maxDepth = 8): string[] {
	const messages: string[] = [];
	const seen = new Set<unknown>();
	let current = error;

	for (
		let depth = 0;
		current != null && depth < Math.max(1, maxDepth) && !seen.has(current);
		depth += 1
	) {
		seen.add(current);

		if (typeof current === 'string') {
			messages.push(current);
			break;
		}

		if (typeof current !== 'object') {
			messages.push(String(current));
			break;
		}

		const message = 'message' in current ? current.message : undefined;
		if (typeof message === 'string' && message.length > 0) messages.push(message);

		current = 'cause' in current ? current.cause : null;
	}

	return messages;
}

export function isUniqueConstraintError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('unique constraint failed') ||
		normalized.includes('sqlite_constraint_unique') ||
		normalized.includes('sqlite_constraint: unique') ||
		normalized.includes('constraint_unique')
	);
}

export function isForeignKeyConstraintError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('foreign key constraint failed') ||
		normalized.includes('sqlite_constraint_foreignkey') ||
		normalized.includes('constraint_foreign')
	);
}

export function isCheckConstraintError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('check constraint failed') ||
		normalized.includes('sqlite_constraint_check') ||
		normalized.includes('constraint_check')
	);
}
