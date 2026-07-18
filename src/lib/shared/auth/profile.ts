export const TEMPORARY_ACCOUNT_NAME = 'Caro Customer';
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 80;

function digitsOnly(value: string | null | undefined): string {
	return value?.replace(/\D/g, '') ?? '';
}

export function isPhoneDerivedDisplayName(
	name: string | null | undefined,
	phoneNumber: string | null | undefined
): boolean {
	const normalizedName = name?.trim() ?? '';
	if (!normalizedName) return true;
	if (normalizedName.toLowerCase() === TEMPORARY_ACCOUNT_NAME.toLowerCase()) return true;

	const nameDigits = digitsOnly(normalizedName);
	const phoneDigits = digitsOnly(phoneNumber);

	return Boolean(phoneDigits && nameDigits && nameDigits === phoneDigits);
}

export function isValidDisplayName(value: string): boolean {
	const normalized = value.trim().replace(/\s+/g, ' ');

	return (
		normalized.length >= MIN_DISPLAY_NAME_LENGTH &&
		normalized.length <= MAX_DISPLAY_NAME_LENGTH &&
		normalized.toLowerCase() !== TEMPORARY_ACCOUNT_NAME.toLowerCase() &&
		!/^[-+()\s\d]+$/.test(normalized)
	);
}
