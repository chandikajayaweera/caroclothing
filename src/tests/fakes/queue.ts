import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';

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
