import { describe, expect, it } from 'vitest';
import { envSchema } from './env.zod';

const validEnv = {
	PUBLIC_APP_NAME: 'Caro Clothing',
	PUBLIC_APP_URL: 'https://caroclothing.lk',
	BETTER_AUTH_SECRET: 'test-secret-at-least-thirty-two-characters',
	RESEND_API_KEY: 'test-resend-key',
	EMAIL_FROM_ADDRESS: 'test@caroclothing.lk',
	TEXT_LK_API_KEY: 'test-text-lk-key',
	TEXT_LK_OTP_SENDER_ID: 'Caro OTP',
	TEXT_LK_TRANSACTIONAL_SENDER_ID: 'Caro',
	TEXT_LK_PROMOTIONAL_SENDER_ID: 'Caro Promo',
	PUBLIC_OTP_COOLDOWN_SECONDS: '60'
};

describe('server environment schema', () => {
	it('allows Google OAuth to be disabled', () => {
		expect(
			envSchema.parse({
				...validEnv,
				PUBLIC_GOOGLE_CLIENT_ID: '',
				GOOGLE_CLIENT_SECRET: ''
			})
		).toMatchObject({
			PUBLIC_GOOGLE_CLIENT_ID: undefined,
			GOOGLE_CLIENT_SECRET: undefined
		});
	});

	it('accepts a complete Google OAuth credential pair', () => {
		expect(
			envSchema.safeParse({
				...validEnv,
				PUBLIC_GOOGLE_CLIENT_ID: 'google-client-id',
				GOOGLE_CLIENT_SECRET: 'google-client-secret'
			}).success
		).toBe(true);
	});

	it('rejects a partial Google OAuth configuration', () => {
		expect(
			envSchema.safeParse({
				...validEnv,
				PUBLIC_GOOGLE_CLIENT_ID: 'google-client-id',
				GOOGLE_CLIENT_SECRET: ''
			}).success
		).toBe(false);
	});
});
