import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { runWithPlatformEnv } from '$lib/server/infrastructure/cloudflare/runtime-context';
import { getAuth } from './index';

vi.mock('$app/server', () => ({
	getRequestEvent: () => ({
		cookies: {
			getAll: () => [],
			set: vi.fn()
		},
		request: new Request('https://test.caroclothing.lk/')
	})
}));

vi.mock('$lib/server/infrastructure/env', () => ({
	getEnv: () => ({
		PUBLIC_APP_NAME: 'Caro Clothing',
		PUBLIC_APP_URL: 'https://test.caroclothing.lk',
		PUBLIC_SENTRY_DSN: '',
		PUBLIC_SENTRY_ENVIRONMENT: 'test',
		PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 0,
		PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: 0,
		PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: 0,
		BETTER_AUTH_SECRET: 'test-secret-at-least-thirty-two-characters',
		PUBLIC_GOOGLE_CLIENT_ID: undefined,
		GOOGLE_CLIENT_SECRET: undefined,
		RESEND_API_KEY: 'test-resend-key',
		EMAIL_FROM_ADDRESS: 'test@caroclothing.lk',
		TEXT_LK_API_KEY: 'test-text-lk-key',
		TEXT_LK_OTP_SENDER_ID: 'Caro OTP',
		TEXT_LK_TRANSACTIONAL_SENDER_ID: 'Caro',
		TEXT_LK_PROMOTIONAL_SENDER_ID: 'Caro Promo',
		PUBLIC_OTP_COOLDOWN_SECONDS: 60,
		PAYHERE_IS_SANDBOX: 'true',
		PAYPAL_IS_SANDBOX: 'true'
	})
}));

describe('Better Auth D1 runtime', () => {
	it('initializes the D1-backed Drizzle adapter without an optional Google provider', async () => {
		const result = await runWithPlatformEnv(env as App.Platform['env'], () =>
			getAuth().api.getSession({ headers: new Headers() })
		);

		expect(result).toBeNull();
	});
});
