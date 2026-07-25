const PHONE_PUNCTUATION_PATTERN = /[\s().-]/g;

export function normalizeSmsRecipient(value: string): string {
	const compact = value.trim().replace(PHONE_PUNCTUATION_PATTERN, '');

	if (/^\+94\d{9}$/.test(compact)) return compact;
	if (/^94\d{9}$/.test(compact)) return `+${compact}`;
	if (/^0\d{9}$/.test(compact)) return `+94${compact.slice(1)}`;

	return compact;
}

export function maskSmsRecipient(value: string): string {
	const normalized = normalizeSmsRecipient(value);
	if (normalized.length <= 6) return '***';
	return `${normalized.slice(0, 4)}***${normalized.slice(-3)}`;
}
