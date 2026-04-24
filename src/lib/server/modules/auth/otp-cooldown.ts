import { getRequestEvent } from '$app/server';
import { getClientEnv } from '$lib/client/modules/env';
import { OtpRateLimitError } from '$lib/server/modules/errors';

const OTP_COOLDOWN_PREFIX = 'otp:cooldown:';

function normalizePhoneNumber(phoneNumber: string): string {
	const digits = phoneNumber.replace(/\D/g, '');

	if (digits.length < 8 || digits.length > 15) {
		throw new Error('[auth] Invalid phone number format');
	}

	return `+${digits}`;
}

export async function reserveOtpCooldown(phoneNumber: string) {
	const { PUBLIC_OTP_COOLDOWN_SECONDS } = getClientEnv();

	const event = getRequestEvent();

	if (!event?.platform?.env?.OTP_COOLDOWNS) {
		throw new Error('[auth] OTP_COOLDOWNS KV namespace is not configured');
	}

	const kv = event.platform.env.OTP_COOLDOWNS;
	const normalized = normalizePhoneNumber(phoneNumber);
	const key = `${OTP_COOLDOWN_PREFIX}${normalized}`;

	const existing = await kv.get(key);
	if (existing) {
		throw new OtpRateLimitError({
			phoneNumber: normalized,
			retryAfter: PUBLIC_OTP_COOLDOWN_SECONDS
		});
	}

	await kv.put(key, '1', {
		expirationTtl: PUBLIC_OTP_COOLDOWN_SECONDS
	});

	return { kv, key };
}
