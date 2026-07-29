import type { ErrorEvent as SentryErrorEvent } from '@sentry/sveltekit';
import { describe, expect, it } from 'vitest';
import {
	getSentryPublicRuntimeEnv,
	getSentryRuntimeOptions,
	getSentryServerRuntimeEnv,
	sanitizeSentryEventPii,
	sanitizeStringPii,
	shouldDropDevFetchNoise,
	shouldDropSvelteKitDataFetchNoise
} from './sentry';

const devFetchEvent = {
	type: undefined,
	exception: {
		values: [
			{
				type: 'TypeError',
				value: 'Failed to fetch (localhost:5173)'
			}
		]
	},
	breadcrumbs: [
		{
			type: 'http',
			category: 'fetch',
			level: 'error',
			data: {
				url: 'http://localhost:5173/app/inventory/__data.json?x-sveltekit-invalidated=0101'
			}
		}
	]
} satisfies SentryErrorEvent;

describe('Sentry runtime options', () => {
	it('merges public Sentry env values from later runtime sources', () => {
		const env = getSentryPublicRuntimeEnv(
			{
				PUBLIC_SENTRY_DSN: '',
				PUBLIC_SENTRY_ENVIRONMENT: 'development',
				PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0.1'
			},
			{
				PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
				PUBLIC_SENTRY_ENVIRONMENT: 'staging',
				PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '0.25'
			}
		);

		expect(env).toEqual({
			PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'staging',
			PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0.1',
			PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '0.25'
		});
	});

	it('ignores non-string Cloudflare bindings while merging Sentry runtime env', () => {
		const env = getSentryPublicRuntimeEnv({
			PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'staging',
			MEDIA: {},
			NOTIFICATION_QUEUE: {},
			PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 1
		});

		expect(env).toEqual({
			PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'staging'
		});
	});

	it('prefers local dynamic env over platform env during development', () => {
		const env = getSentryServerRuntimeEnv({
			isDev: true,
			platformEnv: {
				PUBLIC_SENTRY_DSN: 'https://platformKey@example.ingest.sentry.io/1',
				PUBLIC_SENTRY_ENVIRONMENT: 'production'
			},
			dynamicPublicEnv: {
				PUBLIC_SENTRY_DSN: 'https://localKey@example.ingest.sentry.io/1',
				PUBLIC_SENTRY_ENVIRONMENT: 'development'
			}
		});

		expect(env).toEqual({
			PUBLIC_SENTRY_DSN: 'https://localKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'development'
		});
	});

	it('prefers platform env over build env outside development', () => {
		const env = getSentryServerRuntimeEnv({
			isDev: false,
			dynamicPublicEnv: {
				PUBLIC_SENTRY_DSN: 'https://buildKey@example.ingest.sentry.io/1',
				PUBLIC_SENTRY_ENVIRONMENT: 'development'
			},
			platformEnv: {
				PUBLIC_SENTRY_DSN: 'https://stagingKey@example.ingest.sentry.io/1',
				PUBLIC_SENTRY_ENVIRONMENT: 'staging'
			}
		});

		expect(env).toEqual({
			PUBLIC_SENTRY_DSN: 'https://stagingKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'staging'
		});
	});

	it('filters development localhost SvelteKit data fetch noise', () => {
		expect(shouldDropDevFetchNoise(devFetchEvent, 'development')).toBe(true);
	});

	it('keeps the same fetch error outside development', () => {
		expect(shouldDropDevFetchNoise(devFetchEvent, 'production')).toBe(false);
	});

	it('keeps non-fetch application exceptions', () => {
		const event = {
			type: undefined,
			exception: {
				values: [
					{ type: 'TypeError', value: "Cannot read properties of undefined (reading 'call')" }
				]
			},
			request: {
				url: 'http://localhost:5173/app/orders'
			}
		} satisfies SentryErrorEvent;

		expect(shouldDropDevFetchNoise(event, 'development')).toBe(false);
	});

	it('wires the development fetch-noise filter into beforeSend', () => {
		const options = getSentryRuntimeOptions({
			PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'development'
		});

		expect(options.beforeSend(devFetchEvent)).toBeNull();
	});

	it('redacts Better Auth verification parameters from exception values', () => {
		const event = {
			type: undefined,
			exception: {
				values: [
					{
						type: 'Error',
						value:
							'Failed query: insert into "verification" ("id", "identifier", "value") values (?, ?, ?)\nparams: row-id,oauth-state,{"codeVerifier":"private-verifier","oauthState":"private-state"}'
					}
				]
			}
		} satisfies SentryErrorEvent;

		sanitizeSentryEventPii(event);

		expect(event.exception?.values?.[0]?.value).toContain('params: [REDACTED_VERIFICATION_PARAMS]');
		expect(event.exception?.values?.[0]?.value).not.toContain('private-verifier');
		expect(event.exception?.values?.[0]?.value).not.toContain('private-state');
	});

	it('redacts OAuth secret fields in other diagnostic strings', () => {
		const sanitized = sanitizeStringPii(
			'{"codeVerifier":"private-verifier","oauthState":"private-state"}'
		);

		expect(sanitized).not.toContain('private-verifier');
		expect(sanitized).not.toContain('private-state');
	});

	it('drops only a 5xx HttpError already reported by the route adapter', () => {
		const options = getSentryRuntimeOptions({
			PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
			PUBLIC_SENTRY_ENVIRONMENT: 'staging'
		});
		const event = {
			type: undefined,
			exception: {
				values: [{ type: 'Error', value: 'HttpError' }]
			}
		} satisfies SentryErrorEvent;

		expect(
			options.beforeSend(event, {
				originalException: {
					status: 503,
					body: { message: 'Please try again.', sentryEventId: 'event-id' }
				}
			})
		).toBeNull();

		expect(
			options.beforeSend(event, {
				originalException: {
					status: 503,
					body: { message: 'Please try again.' }
				}
			})
		).toBe(event);
	});

	describe('shouldDropSvelteKitDataFetchNoise', () => {
		it('filters TypeError: Load failed on SvelteKit data endpoints in staging/production', () => {
			const event = {
				type: undefined,
				exception: {
					values: [
						{
							type: 'TypeError',
							value: 'Load failed (staging.caroclothing.lk)'
						}
					]
				},
				breadcrumbs: [
					{
						type: 'http',
						category: 'fetch',
						level: 'error',
						data: {
							url: 'https://staging.caroclothing.lk/shop/__data.json?x-sveltekit-invalidated=01'
						}
					}
				]
			} satisfies SentryErrorEvent;

			expect(shouldDropSvelteKitDataFetchNoise(event)).toBe(true);

			// Wires into beforeSend
			const options = getSentryRuntimeOptions({
				PUBLIC_SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
				PUBLIC_SENTRY_ENVIRONMENT: 'staging'
			});
			expect(options.beforeSend(event)).toBeNull();
		});

		it('filters TypeError: Failed to fetch on SvelteKit data endpoints', () => {
			const event = {
				type: undefined,
				exception: {
					values: [
						{
							type: 'TypeError',
							value: 'Failed to fetch'
						}
					]
				},
				breadcrumbs: [
					{
						type: 'http',
						category: 'fetch',
						level: 'error',
						data: {
							url: 'https://caroclothing.lk/about/__data.json'
						}
					}
				]
			} satisfies SentryErrorEvent;

			expect(shouldDropSvelteKitDataFetchNoise(event)).toBe(true);
		});

		it('keeps fetch errors on non-SvelteKit data URLs', () => {
			const event = {
				type: undefined,
				exception: {
					values: [
						{
							type: 'TypeError',
							value: 'Failed to fetch'
						}
					]
				},
				breadcrumbs: [
					{
						type: 'http',
						category: 'fetch',
						level: 'error',
						data: {
							url: 'https://api.better-auth.com/login'
						}
					}
				]
			} satisfies SentryErrorEvent;

			expect(shouldDropSvelteKitDataFetchNoise(event)).toBe(false);
		});

		it('keeps non-fetch exceptions on SvelteKit data URLs', () => {
			const event = {
				type: undefined,
				exception: {
					values: [
						{
							type: 'TypeError',
							value: 'Cannot read properties of undefined'
						}
					]
				},
				breadcrumbs: [
					{
						type: 'http',
						category: 'fetch',
						level: 'error',
						data: {
							url: 'https://staging.caroclothing.lk/shop/__data.json'
						}
					}
				]
			} satisfies SentryErrorEvent;

			expect(shouldDropSvelteKitDataFetchNoise(event)).toBe(false);
		});
	});
});
