import { getRequestEvent } from '$app/server';
import { getEnv } from '$lib/server/infrastructure/env';
import { OtpRateLimitError, AuthError, ErrorCode } from '$lib/server/infrastructure/errors';
import { normalizeSmsRecipient } from '$lib/server/infrastructure/sms';

const OTP_COOLDOWN_PREFIX = 'otp:cooldown:';
const MIN_KV_EXPIRATION_TTL_SECONDS = 60;

type OtpCooldownRecord = {
	expiresAt: number;
};

function normalizePhoneNumber(phoneNumber: string): string {
	const normalized = normalizeSmsRecipient(phoneNumber);
	if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
		throw new AuthError('Invalid phone number format', ErrorCode.INVALID_PHONE_NUMBER);
	}

	return normalized;
}

function getRetryAfterSeconds(value: string | null, fallbackSeconds: number) {
	if (!value) return 0;

	try {
		const record = JSON.parse(value) as Partial<OtpCooldownRecord>;
		if (typeof record.expiresAt !== 'number') return fallbackSeconds;

		return Math.max(0, Math.ceil((record.expiresAt - Date.now()) / 1000));
	} catch {
		return fallbackSeconds;
	}
}

export async function reserveOtpCooldown(phoneNumber: string) {
	const cooldownSeconds = Math.ceil(getEnv().PUBLIC_OTP_COOLDOWN_SECONDS);

	const event = getRequestEvent();

	if (!event?.platform?.env?.OTP_COOLDOWNS) {
		throw new AuthError(
			'OTP_COOLDOWNS KV namespace is not configured',
			ErrorCode.OTP_COOLDOWN_NOT_CONFIGURED
		);
	}

	const kv = event.platform.env.OTP_COOLDOWNS;
	const normalized = normalizePhoneNumber(phoneNumber);
	const key = `${OTP_COOLDOWN_PREFIX}${normalized}`;

	const existing = await kv.get(key);
	const retryAfter = getRetryAfterSeconds(existing, cooldownSeconds);
	if (retryAfter > 0) {
		throw new OtpRateLimitError({
			retryAfter
		});
	}

	await kv.put(
		key,
		JSON.stringify({
			expiresAt: Date.now() + cooldownSeconds * 1000
		} satisfies OtpCooldownRecord),
		{
			expirationTtl: Math.max(cooldownSeconds, MIN_KV_EXPIRATION_TTL_SECONDS)
		}
	);

	return { kv, key };
}
