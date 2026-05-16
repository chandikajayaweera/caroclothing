import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { AuthHook as Auth } from '$lib/server/modules/auth/handleHooks';
import { runScheduledJobs } from '$lib/server/infrastructure/cron';
import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';
import { processQueueBatch } from '$lib/server/infrastructure/queue';

export const handle: Handle = sequence(Auth);

// Stable Cloudflare Worker entry points appended into the SvelteKit Worker by
// scripts/cloudflare-append-worker-handlers.ts until adapter-cloudflare wires them natively.
export const queue: ExportedHandlerQueueHandler<App.Platform['env'], NotificationQueueMessage> = (
	batch,
	env,
	ctx
) => {
	ctx.waitUntil(processQueueBatch(batch, env, ctx));
};

export const scheduled: ExportedHandlerScheduledHandler<App.Platform['env']> = (
	controller,
	env,
	ctx
) => {
	ctx.waitUntil(runScheduledJobs(controller, env, ctx));
};
