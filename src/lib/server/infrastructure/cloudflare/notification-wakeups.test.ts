import { describe, expect, it } from 'vitest';
import { createFakeNotificationQueue } from '../../../../tests/fakes/queue';
import { createCloudflareNotificationWakeupPublisher } from './notification-wakeups';

describe('Cloudflare notification wakeup publisher', () => {
	it('publishes only outbox identifiers as queue messages', async () => {
		const queue = createFakeNotificationQueue();
		const publisher = createCloudflareNotificationWakeupPublisher(queue);

		await publisher?.publish([
			{
				outboxId: 'outbox_1',
				idempotencyKey: 'order:1:confirmation:email'
			}
		]);

		expect(queue.batches).toEqual([
			[
				{
					body: {
						outboxId: 'outbox_1',
						idempotencyKey: 'order:1:confirmation:email'
					},
					contentType: 'json'
				}
			]
		]);
	});

	it('returns null when the Queue binding is unavailable', () => {
		expect(createCloudflareNotificationWakeupPublisher(null)).toBeNull();
	});
});
