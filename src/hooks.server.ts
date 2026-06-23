import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { env as dynamicPublicEnv } from '$env/dynamic/public';
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { AuthHook as Auth } from '$lib/server/modules/auth/handleHooks';
import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';
import {
	processCloudflareQueueBatch,
	runCloudflareScheduledJobs
} from '$lib/server/infrastructure/cloudflare';
import { getSentryRuntimeOptions, getSentryServerRuntimeEnv } from '$lib/shared/sentry';

const SENTRY_FLUSH_TIMEOUT_MS = 2000;
let _handle: Handle | null = null;

function getServerSentryOptions(platformEnv: App.Platform['env'] | undefined) {
	const sentryEnv = getSentryServerRuntimeEnv({
		isDev: dev,
		dynamicPublicEnv,
		platformEnv
	});

	return getSentryRuntimeOptions(sentryEnv);
}

function isExpectedClientError(input: Parameters<HandleServerError>[0]) {
	const { error, event, status } = input;
	if (status >= 400 && status < 500) return true;

	const stack = error instanceof Error ? error.stack : undefined;
	return !event.route?.id && Boolean(stack?.startsWith('Error: Not found:'));
}

async function captureAndFlushCloudflareRuntimeError(
	error: unknown,
	mechanismType: string
) {
	try {
		if (!Sentry.isEnabled()) return undefined;

		const eventId = Sentry.captureException(error, {
			mechanism: {
				type: mechanismType,
				handled: false
			}
		});

		await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);
		return eventId;
	} catch (captureError) {
		console.error('Sentry Cloudflare runtime error capture failed', captureError);
		return undefined;
	}
}

async function runCloudflareRuntimeWithSentry<T>(
	mechanismType: string,
	task: () => Promise<T>
) {
	try {
		return await task();
	} catch (error) {
		await captureAndFlushCloudflareRuntimeError(error, mechanismType);
		throw error;
	}
}

export const handle: Handle = (input) => {
	const sentryOptions = getServerSentryOptions(input.event.platform?.env);
	if (!sentryOptions.enabled) return Auth(input);

	if (!_handle) {
		_handle = sequence(
			Sentry.initCloudflareSentryHandle(sentryOptions),
			Sentry.sentryHandle(),
			Auth
		);
	}

	return _handle(input);
};

const appHandleError: HandleServerError = (input) => {
	if (isExpectedClientError(input)) {
		return { message: input.message };
	}

	const sentryEventId = Sentry.isEnabled() ? Sentry.lastEventId() : undefined;
	if (dynamicPublicEnv.PUBLIC_SENTRY_ENVIRONMENT === 'development' && sentryEventId) {
		console.info(`[sentry] captured server event ${sentryEventId}`);
	}

	console.error(input.error);

	return {
		message: input.message,
		...(sentryEventId ? { sentryEventId } : {})
	};
};

export const handleError = Sentry.handleErrorWithSentry(appHandleError);

// Stable Cloudflare Worker entry points appended into the SvelteKit Worker by
// scripts/cloudflare-append-worker-handlers.ts until adapter-cloudflare wires them natively.
export const queue: ExportedHandlerQueueHandler<App.Platform['env'], NotificationQueueMessage> = (
	batch,
	env,
	ctx
) => {
	ctx.waitUntil(
		runCloudflareRuntimeWithSentry('auto.function.cloudflare.queue', () =>
			processCloudflareQueueBatch(batch, env, ctx)
		)
	);
};

export const scheduled: ExportedHandlerScheduledHandler<App.Platform['env']> = (
	controller,
	env,
	ctx
) => {
	ctx.waitUntil(
		runCloudflareRuntimeWithSentry('auto.function.cloudflare.scheduled', () =>
			runCloudflareScheduledJobs(controller, env, ctx)
		)
	);
};
