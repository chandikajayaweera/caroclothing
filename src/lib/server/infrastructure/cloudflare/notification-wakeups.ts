import type {
	NotificationWakeupMessage,
	NotificationWakeupPublisher
} from '$lib/server/foundation/context';

export function createCloudflareNotificationWakeupPublisher(
	queue: Queue<NotificationWakeupMessage> | null | undefined
): NotificationWakeupPublisher | null {
	if (!queue) return null;

	return {
		async publish(messages) {
			if (messages.length === 0) return;

			await queue.sendBatch(
				messages.map((body) => ({
					body,
					contentType: 'json' as const
				}))
			);
		}
	};
}

export function createCloudflareNotificationWakeups(
	platform: App.Platform | null | undefined
): NotificationWakeupPublisher | null {
	return createCloudflareNotificationWakeupPublisher(platform?.env?.NOTIFICATION_QUEUE);
}
