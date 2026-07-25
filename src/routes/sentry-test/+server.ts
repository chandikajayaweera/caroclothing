import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { env as dynamicPublicEnv } from '$env/dynamic/public';
import { error } from '@sveltejs/kit';
import { getSentryRuntimeOptions, getSentryServerRuntimeEnv } from '$lib/shared/sentry';

function getSentryEnvironment(platformEnv: App.Platform['env'] | undefined) {
	const sentryEnv = getSentryServerRuntimeEnv({
		isDev: dev,
		dynamicPublicEnv,
		platformEnv
	});

	return getSentryRuntimeOptions(sentryEnv).environment;
}

export const GET: RequestHandler = ({ platform }) => {
	if (getSentryEnvironment(platform?.env) === 'production') {
		error(404, 'Not found');
	}

	throw new Error('Sentry Server Verification: ' + new Date().toISOString());
};
