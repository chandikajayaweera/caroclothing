import * as Sentry from '@sentry/sveltekit';
import { env as dynamicPublicEnv } from '$env/dynamic/public';
import type { ClientInit } from '@sveltejs/kit';
import { getSentryReplaySampleRates, getSentryRuntimeOptions } from '$lib/shared/sentry';

const sentryOptions = getSentryRuntimeOptions(dynamicPublicEnv);
let sentryInitialized = false;

export const init: ClientInit = () => {
	if (sentryInitialized || !sentryOptions.enabled) return;

	sentryInitialized = true;
	Sentry.init({
		...sentryOptions,
		...getSentryReplaySampleRates(dynamicPublicEnv),
		integrations: [
			Sentry.replayIntegration({
				maskAllText: true,
				maskAllInputs: true,
				blockAllMedia: true
			}),
			Sentry.feedbackIntegration({
				colorScheme: 'system'
			})
		]
	});
};

export const handleError = Sentry.handleErrorWithSentry();
