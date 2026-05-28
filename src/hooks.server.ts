import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { AuthHook as Auth } from '$lib/server/modules/auth/handleHooks';
import { dev } from '$app/environment';
import { runScheduledJobs } from '$lib/server/infrastructure/cron';
import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';
import { processQueueBatch } from '$lib/server/infrastructure/queue';

const DevAuthMock: Handle = async ({ event, resolve }) => {
	if (dev) {
		event.locals.user = {
			id: 'dev-admin-id',
			name: 'Dev Admin',
			email: 'admin@caroclothing.lk',
			role: 'adminUser',
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		};
		event.locals.session = {
			id: 'dev-session-id',
			userId: 'dev-admin-id',
			token: 'dev-token',
			expiresAt: new Date(Date.now() + 3600 * 1000),
			createdAt: new Date(),
			updatedAt: new Date()
		};
	}
	return resolve(event);
};

export const handle: Handle = dev ? sequence(DevAuthMock, Auth) : sequence(Auth);

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
