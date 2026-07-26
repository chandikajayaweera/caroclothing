import {
	getNotificationQueueRetryDelaySeconds,
	processNotificationQueueMessage
} from '$lib/server/orchestration/notifications';
import type {
	NotificationDispatchResult,
	NotificationQueueBatchResult,
	NotificationQueueMessage
} from '$lib/server/modules/notifications/outbox/outbox.types';
import { getErrorMessage } from '$lib/server/infrastructure/errors';
import type { QueueBatchResult } from './queue.types';

const NOTIFICATION_QUEUE_NAMES = new Set([
	'caroclothing-notifications',
	'caroclothing-staging-notifications'
]);

export async function processCloudflareQueueBatch(
	batch: MessageBatch<NotificationQueueMessage>,
	env: App.Platform['env'],
	ctx: ExecutionContext
): Promise<QueueBatchResult> {
	void env;
	void ctx;

	if (NOTIFICATION_QUEUE_NAMES.has(batch.queue)) {
		const result = await processCloudflareNotificationQueueBatch(batch);

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

async function processCloudflareNotificationQueueBatch(
	batch: MessageBatch<NotificationQueueMessage>
): Promise<NotificationQueueBatchResult> {
	const results: NotificationDispatchResult[] = [];

	for (const message of batch.messages) {
		try {
			const result = await processNotificationQueueMessage({
				queue: batch.queue,
				messageId: message.id,
				body: message.body
			});
			results.push(result);
			ackOrRetryNotificationMessage(message, result);
		} catch (error) {
			console.error('[notification-outbox] Unexpected queue message failure:', {
				queue: batch.queue,
				messageId: message.id,
				error: getErrorMessage(error)
			});
			results.push({
				id: message.id,
				outcome: 'failed',
				message: 'Notification processing failed.'
			});
			message.retry({ delaySeconds: 60 });
		}
	}

	return {
		queue: batch.queue,
		processedCount: results.length,
		results
	};
}

function ackOrRetryNotificationMessage(
	message: Message<NotificationQueueMessage>,
	result: NotificationDispatchResult
): void {
	if (result.outcome === 'failed' && result.retryAt) {
		message.retry({ delaySeconds: getNotificationQueueRetryDelaySeconds(result.retryAt) });
		return;
	}

	message.ack();
}
