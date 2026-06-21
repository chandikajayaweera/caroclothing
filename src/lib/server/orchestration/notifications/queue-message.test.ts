import { describe, expect, it } from 'vitest';
import {
	getNotificationQueueRetryDelaySeconds,
	parseNotificationQueueMessageBody
} from './queue-message';

describe('notification queue messages', () => {
	it('accepts only outbox id and idempotency key payloads', () => {
		expect(
			parseNotificationQueueMessageBody({
				outboxId: 'outbox_1',
				idempotencyKey: 'order:1:confirmation:email'
			})
		).toEqual({
			outboxId: 'outbox_1',
			idempotencyKey: 'order:1:confirmation:email'
		});

		expect(parseNotificationQueueMessageBody(null)).toBeNull();
		expect(parseNotificationQueueMessageBody({ outboxId: 'outbox_1' })).toBeNull();
		expect(parseNotificationQueueMessageBody({ outboxId: '', idempotencyKey: 'key' })).toBeNull();
		expect(parseNotificationQueueMessageBody({ outboxId: 'outbox_1', idempotencyKey: '' })).toBeNull();
	});

	it('rounds retry delays up to at least one second', () => {
		const now = new Date('2026-06-21T00:00:00.000Z');

		expect(getNotificationQueueRetryDelaySeconds(new Date(now.getTime() + 1500), now)).toBe(2);
		expect(getNotificationQueueRetryDelaySeconds(new Date(now.getTime() - 1000), now)).toBe(1);
	});
});
