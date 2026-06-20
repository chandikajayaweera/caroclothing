import type { ErrorEvent as SentryErrorEvent } from '@sentry/sveltekit';

type PublicSentryEnv = Record<string, string | undefined>;
type SentryFetchNoiseEvent = Pick<SentryErrorEvent, 'breadcrumbs' | 'exception' | 'request'>;

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0.05;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//;
const SVELTEKIT_DATA_RE = /\/__data\.json(?:\?|$)/;

export const SENTRY_RELEASE = `caroclothing@${__APP_VERSION__}`;

function optionalValue(value: string | undefined) {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

function sampleRate(value: string | undefined, fallback: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(parsed, 0), 1);
}

function isLocalSvelteKitDataUrl(value: unknown): boolean {
	return typeof value === 'string' && LOCALHOST_RE.test(value) && SVELTEKIT_DATA_RE.test(value);
}

export function shouldDropDevFetchNoise(
	event: SentryFetchNoiseEvent,
	environment: string
): boolean {
	if (environment !== 'development') return false;

	const exception = event.exception?.values?.[0];
	const isFetchError =
		exception?.type === 'TypeError' && exception.value?.includes('Failed to fetch');
	if (!isFetchError) return false;

	if (isLocalSvelteKitDataUrl(event.request?.url)) return true;

	return (
		event.breadcrumbs?.some((breadcrumb) => {
			if (breadcrumb.category !== 'fetch' && breadcrumb.type !== 'http') return false;
			if (breadcrumb.level && breadcrumb.level !== 'error') return false;
			return isLocalSvelteKitDataUrl(breadcrumb.data?.url);
		}) ?? false
	);
}

export function getSentryRuntimeOptions(env: PublicSentryEnv) {
	const dsn = optionalValue(env.PUBLIC_SENTRY_DSN);
	const environment = optionalValue(env.PUBLIC_SENTRY_ENVIRONMENT) ?? 'development';

	return {
		dsn,
		enabled: Boolean(dsn),
		environment,
		release: SENTRY_RELEASE,
		tracesSampleRate: sampleRate(env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE, DEFAULT_TRACES_SAMPLE_RATE),
		sendDefaultPii: false,
		dataCollection: {
			userInfo: false,
			httpBodies: []
		},
		enableLogs: true,
		beforeSend(event: SentryErrorEvent) {
			if (shouldDropDevFetchNoise(event, environment)) return null;
			return event;
		}
	};
}

export function getSentryReplaySampleRates(env: PublicSentryEnv) {
	return {
		replaysSessionSampleRate: sampleRate(
			env.PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
			DEFAULT_REPLAYS_SESSION_SAMPLE_RATE
		),
		replaysOnErrorSampleRate: sampleRate(
			env.PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
			DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE
		)
	};
}
