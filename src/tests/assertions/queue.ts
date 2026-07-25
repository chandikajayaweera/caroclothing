import { expect } from 'vitest';
import type { FakeNotificationQueue } from '../fakes/queue';

export function queuedMessages(queue: FakeNotificationQueue) {
	return queue.batches.flat();
}

export function expectQueuedIdempotencyKeys(queue: FakeNotificationQueue, expectedKeys: string[]) {
	expect(
		queuedMessages(queue)
			.map((message) => message.body.idempotencyKey)
			.sort()
	).toEqual([...expectedKeys].sort());
}
