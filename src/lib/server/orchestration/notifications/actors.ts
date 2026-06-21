import type { SystemActor } from '$lib/server/foundation/context';

export const notificationQueueActor = {
	id: 'system:notification-queue',
	role: 'adminUser'
} satisfies SystemActor;

export const notificationCronActor = {
	id: 'system:notification-cron',
	role: 'adminUser'
} satisfies SystemActor;
