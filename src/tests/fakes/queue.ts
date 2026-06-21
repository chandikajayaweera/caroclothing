import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';
import type { NotificationWakeupPublisher } from '$lib/server/foundation/context';

export type FakeNotificationQueueBatchMessage = {
	body: NotificationQueueMessage;
	contentType?: 'json';
};

export type FakeNotificationQueue = Queue<NotificationQueueMessage> & {
	batches: FakeNotificationQueueBatchMessage[][];
	clear: () => void;
};

export function createFakeNotificationQueue(): FakeNotificationQueue {
	const batches: FakeNotificationQueueBatchMessage[][] = [];

	return {
		batches,
		async sendBatch(messages: FakeNotificationQueueBatchMessage[]) {
			batches.push(messages);
		},
		clear() {
			batches.length = 0;
		}
	} as unknown as FakeNotificationQueue;
}

export function createFakeNotificationWakeupPublisher(
	queue = createFakeNotificationQueue()
): NotificationWakeupPublisher & { queue: FakeNotificationQueue } {
	return {
		queue,
		async publish(messages) {
			await queue.sendBatch(
				messages.map((body) => ({
					body,
					contentType: 'json'
				}))
			);
		}
	};
}
