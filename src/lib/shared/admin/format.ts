export function formatAdminMoney(
	value: number | null | undefined,
	decimals: number = 0,
	fallback: string = '—'
): string {
	if (value === null || value === undefined) return fallback;
	const options =
		decimals > 0 ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : undefined;
	return `LKR ${value.toLocaleString('en-LK', options)}`;
}

export function formatAdminDiscount(type: 'percentage' | 'fixed', value: number): string {
	return type === 'percentage' ? `${value}%` : formatAdminMoney(value);
}

export function formatAdminDate(
	value: Date | string | number | null | undefined,
	fallback: string = '—'
): string {
	if (!value) return fallback;
	const d = value instanceof Date ? value : new Date(value);
	if (isNaN(d.getTime())) return fallback;
	return d.toLocaleDateString('en-LK', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

export function formatAdminDateTime(
	value: Date | string | number | null | undefined,
	fallback: string = 'Never'
): string {
	if (!value) return fallback;
	const d = value instanceof Date ? value : new Date(value);
	if (isNaN(d.getTime())) return fallback;
	return new Intl.DateTimeFormat('en-LK', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(d);
}

export function formatAdminStatus(value: string | null | undefined): string {
	if (!value) return '';
	return value.replace(/_/g, ' ');
}
