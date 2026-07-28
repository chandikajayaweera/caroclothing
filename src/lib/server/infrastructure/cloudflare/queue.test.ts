import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	NotificationDispatchResult,
	NotificationQueueMessage
} from '$lib/server/modules/notifications/outbox/outbox.types';
import { processCloudflareQueueBatch } from './queue';

const notificationMocks = vi.hoisted(() => ({
	processNotificationQueueMessage: vi.fn(),
	getNotificationQueueRetryDelaySeconds: vi.fn()
}));

vi.mock('$lib/server/orchestration/notifications', () => ({
	processNotificationQueueMessage: notificationMocks.processNotificationQueueMessage,
	getNotificationQueueRetryDelaySeconds: notificationMocks.getNotificationQueueRetryDelaySeconds
}));

type FakeMessage = Message<NotificationQueueMessage> & {
	ack: ReturnType<typeof vi.fn>;
	retry: ReturnType<typeof vi.fn>;
};

type FakeBatch = MessageBatch<NotificationQueueMessage> & {
	ackAll: ReturnType<typeof vi.fn>;
	retryAll: ReturnType<typeof vi.fn>;
	messages: FakeMessage[];
};

describe('processCloudflareQueueBatch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		notificationMocks.getNotificationQueueRetryDelaySeconds.mockReturnValue(123);
	});

	it('retries unsupported queue batches without processing message bodies', async () => {
		const batch = createBatch('unexpected-queue', [
			createMessage('message_1', {
				outboxId: 'outbox_1',
				idempotencyKey: 'key_1'
			})
		]);

		const result = await processCloudflareQueueBatch(
			batch,
			{} as App.Platform['env'],
			{} as ExecutionContext
		);

		expect(result).toEqual({
			queue: 'unexpected-queue',
			processor: 'unsupported',
			processedCount: 0,
			message: 'Unsupported queue name. Batch scheduled for retry.'
		});
		expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 300 });
		expect(notificationMocks.processNotificationQueueMessage).not.toHaveBeenCalled();
	});

	it('acks messages when notification processing reaches a terminal non-retry outcome', async () => {
		const message = createMessage('message_1', {
			outboxId: 'outbox_1',
			idempotencyKey: 'key_1'
		});
		notificationMocks.processNotificationQueueMessage.mockResolvedValueOnce({
			id: 'outbox_1',
			outcome: 'sent'
		} satisfies NotificationDispatchResult);

		const result = await processCloudflareQueueBatch(
			createBatch('caroclothing-notifications', [message]),
			{} as App.Platform['env'],
			{} as ExecutionContext
		);

		expect(result.processor).toBe('notifications');
		expect(message.ack).toHaveBeenCalledTimes(1);
		expect(message.retry).not.toHaveBeenCalled();
	});

	it('retries failed messages with the notification retry delay when retryAt is present', async () => {
		const retryAt = new Date('2026-06-21T10:05:00.000Z');
		const message = createMessage('message_1', {
			outboxId: 'outbox_1',
			idempotencyKey: 'key_1'
		});
		notificationMocks.processNotificationQueueMessage.mockResolvedValueOnce({
			id: 'outbox_1',
			outcome: 'failed',
			retryAt
		} satisfies NotificationDispatchResult);

		await processCloudflareQueueBatch(
			createBatch('caroclothing-notifications', [message]),
			{} as App.Platform['env'],
			{} as ExecutionContext
		);

		expect(notificationMocks.getNotificationQueueRetryDelaySeconds).toHaveBeenCalledWith(retryAt);
		expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 123 });
		expect(message.ack).not.toHaveBeenCalled();
	});

	it('retries messages with a short delay when processing throws unexpectedly', async () => {
		const message = createMessage('message_1', {
			outboxId: 'outbox_1',
			idempotencyKey: 'key_1'
		});
		notificationMocks.processNotificationQueueMessage.mockRejectedValueOnce(new Error('boom'));

		const result = await processCloudflareQueueBatch(
			createBatch('caroclothing-notifications', [message]),
			{} as App.Platform['env'],
			{} as ExecutionContext
		);

		expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
		expect(message.ack).not.toHaveBeenCalled();
		expect(result.processor).toBe('notifications');
		if (result.processor === 'notifications') {
			expect(result.result.results).toEqual([
				{
					id: 'message_1',
					outcome: 'failed',
					message: 'Notification processing failed.'
				}
			]);
		}
	});
});

function createBatch(queue: string, messages: FakeMessage[]): FakeBatch {
	return {
		queue,
		messages,
		ackAll: vi.fn(),
		retryAll: vi.fn()
	} as FakeBatch;
}

function createMessage(id: string, body: NotificationQueueMessage): FakeMessage {
	return {
		id,
		body,
		ack: vi.fn(),
		retry: vi.fn()
	} as FakeMessage;
}
