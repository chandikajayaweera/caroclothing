type PublicSentryEnv = Record<string, string | undefined>;

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0.05;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;

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

export function getSentryRuntimeOptions(env: PublicSentryEnv) {
	const dsn = optionalValue(env.PUBLIC_SENTRY_DSN);

	return {
		dsn,
		enabled: Boolean(dsn),
		environment: optionalValue(env.PUBLIC_SENTRY_ENVIRONMENT) ?? 'development',
		release: SENTRY_RELEASE,
		tracesSampleRate: sampleRate(env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE, DEFAULT_TRACES_SAMPLE_RATE),
		sendDefaultPii: false,
		dataCollection: {
			userInfo: false,
			httpBodies: []
		},
		enableLogs: true
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
