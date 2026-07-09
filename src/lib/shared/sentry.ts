import type { ErrorEvent as SentryErrorEvent } from '@sentry/sveltekit';

type PublicSentryEnv = Record<string, string | undefined>;
type SentryRuntimeEnvSource = object | null | undefined;
type SentryFetchNoiseEvent = Pick<SentryErrorEvent, 'breadcrumbs' | 'exception' | 'request'>;

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0.05;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
const LOCALHOST_RE =
	/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.\d+\.\d+)(?::\d+)?\//;
const SVELTEKIT_DATA_RE = /\/__data\.json(?:\?|$)/;
const PUBLIC_SENTRY_ENV_KEYS = [
	'PUBLIC_SENTRY_DSN',
	'PUBLIC_SENTRY_ENVIRONMENT',
	'PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
	'PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE',
	'PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE'
] as const;

export const SENTRY_RELEASE = `caroclothing@${
	typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'
}`;

function stringEnvValue(source: object, key: string): string | undefined {
	if (!(key in source)) return undefined;

	const value = (source as Record<string, unknown>)[key];
	return typeof value === 'string' ? value : undefined;
}

export function getSentryPublicRuntimeEnv(...sources: SentryRuntimeEnvSource[]): PublicSentryEnv {
	const env: PublicSentryEnv = {};

	for (const source of sources) {
		if (!source) continue;

		for (const key of PUBLIC_SENTRY_ENV_KEYS) {
			const value = stringEnvValue(source, key);
			if (value !== undefined) {
				env[key] = value;
			}
		}
	}

	return env;
}

export function getSentryServerRuntimeEnv({
	isDev,
	dynamicPublicEnv,
	platformEnv
}: {
	isDev: boolean;
	dynamicPublicEnv: SentryRuntimeEnvSource;
	platformEnv: SentryRuntimeEnvSource;
}): PublicSentryEnv {
	return isDev
		? getSentryPublicRuntimeEnv(platformEnv, dynamicPublicEnv)
		: getSentryPublicRuntimeEnv(dynamicPublicEnv, platformEnv);
}

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

export function shouldDropSvelteKitDataFetchNoise(event: SentryFetchNoiseEvent): boolean {
	const exception = event.exception?.values?.[0];
	if (!exception) return false;

	const type = exception.type;
	const value = exception.value;
	if (type !== 'TypeError' && type !== 'Error' && type !== 'Exception') return false;
	if (!value) return false;

	const val = value.toLowerCase();
	const isFetchError =
		val.includes('failed to fetch') ||
		val.includes('load failed') ||
		val.includes('networkerror') ||
		val.includes('cancelled');
	if (!isFetchError) return false;

	const requestUrl = event.request?.url;
	if (typeof requestUrl === 'string' && SVELTEKIT_DATA_RE.test(requestUrl)) {
		return true;
	}

	return (
		event.breadcrumbs?.some((breadcrumb) => {
			if (breadcrumb.category !== 'fetch' && breadcrumb.type !== 'http') return false;
			if (breadcrumb.level && breadcrumb.level !== 'error') return false;
			const url = breadcrumb.data?.url;
			return typeof url === 'string' && SVELTEKIT_DATA_RE.test(url);
		}) ?? false
	);
}

const PII_REGEX_PATTERNS = [
	/(?:\+94|0)?7[0-9]{8}\b/g,
	/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	/\b(?:otp|password|token|secret|key|authorization)=([^&]+)/gi
];

export function sanitizeStringPii(text: string): string {
	let sanitized = text;
	for (const pattern of PII_REGEX_PATTERNS) {
		sanitized = sanitized.replace(pattern, '[REDACTED_PII]');
	}
	return sanitized;
}

export function sanitizeSentryEventPii(event: SentryErrorEvent): SentryErrorEvent {
	if (event.request?.url) {
		event.request.url = sanitizeStringPii(event.request.url);
	}

	if (event.breadcrumbs) {
		for (const breadcrumb of event.breadcrumbs) {
			if (breadcrumb.message) {
				breadcrumb.message = sanitizeStringPii(breadcrumb.message);
			}
			if (breadcrumb.data && typeof breadcrumb.data === 'object') {
				for (const [key, val] of Object.entries(breadcrumb.data)) {
					if (typeof val === 'string') {
						breadcrumb.data[key] = sanitizeStringPii(val);
					}
				}
			}
		}
	}

	if (event.user) {
		if (event.user.email) event.user.email = '[REDACTED_PII]';
		if (event.user.username) event.user.username = '[REDACTED_PII]';
		if (event.user.ip_address) event.user.ip_address = '[REDACTED_PII]';
	}

	return event;
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
		beforeSend(event: SentryErrorEvent, hint?: { originalException?: unknown }) {
			if (shouldDropDevFetchNoise(event, environment)) return null;
			if (shouldDropSvelteKitDataFetchNoise(event)) return null;

			const error = hint?.originalException;
			if (error && typeof error === 'object') {
				const err = error as Record<string, unknown>;

				// Drop SvelteKit client-side navigation/load errors (expected 4xx status codes)
				if (
					typeof err.status === 'number' &&
					err.status >= 400 &&
					err.status < 500 &&
					err.type === 'error' &&
					'error' in err
				) {
					return null;
				}

				// Drop SvelteKit client-side redirects (expected 3xx status codes)
				if (
					typeof err.status === 'number' &&
					err.status >= 300 &&
					err.status < 400 &&
					'location' in err
				) {
					return null;
				}
			}

			return sanitizeSentryEventPii(event);
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
