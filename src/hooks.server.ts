import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { AuthHook as Auth } from '$lib/server/modules/auth/handleHooks';

export const handle: Handle = sequence(Auth);

// -----------------------------------------------------------------------------
// Cloudflare Workers scheduled entry
// -----------------------------------------------------------------------------
//
// NOTE:
// This function is intentionally defined here and NOT obfuscated.
// It is used as a stable entry point for a custom Vite plugin to inject
//   into Cloudflare's `_worker.js` during build time.
import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import { runScheduledJobs } from '$lib/server/modules/cron/scheduled-jobs';

export const scheduled: ExportedHandlerScheduledHandler<App.Platform['env']> = (
	controller: ScheduledController,
	_env: App.Platform['env'],
	ctx: ExecutionContext
) => {
	ctx.waitUntil(runScheduledJobs(controller));
};
