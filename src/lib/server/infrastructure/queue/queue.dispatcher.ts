import { processNotificationQueueBatch } from '$lib/server/infrastructure/notifications/outbox.dispatcher';
import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';
import type { QueueBatchResult } from './queue.types';

const NOTIFICATION_QUEUE_NAMES = new Set([
	'caroclothing-notifications',
	'caroclothing-staging-notifications'
]);

export async function processQueueBatch(
	batch: MessageBatch<NotificationQueueMessage>,
	env: App.Platform['env'],
	ctx: ExecutionContext
): Promise<QueueBatchResult> {
	void env;
	void ctx;

	if (NOTIFICATION_QUEUE_NAMES.has(batch.queue)) {
		const result = await processNotificationQueueBatch(batch);

		return {
			queue: batch.queue,
			processor: 'notifications',
			processedCount: result.processedCount,
			result
		};
	}

	console.error('[queue] Unsupported queue batch received:', {
		queue: batch.queue,
		messageCount: batch.messages.length
	});
	batch.retryAll({ delaySeconds: 300 });

	return {
		queue: batch.queue,
		processor: 'unsupported',
		processedCount: 0,
		message: 'Unsupported queue name. Batch scheduled for retry.'
	};
}
