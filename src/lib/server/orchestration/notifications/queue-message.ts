import type { NotificationQueueMessage } from '$lib/server/modules/notifications/outbox/outbox.types';

export function parseNotificationQueueMessageBody(body: unknown): NotificationQueueMessage | null {
	if (typeof body !== 'object' || body === null) return null;
	if (!('outboxId' in body) || !('idempotencyKey' in body)) return null;

	const outboxId = body.outboxId;
	const idempotencyKey = body.idempotencyKey;

	if (typeof outboxId !== 'string' || outboxId.trim().length === 0) return null;
	if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) return null;

	return {
		outboxId,
		idempotencyKey
	};
}

export function getNotificationQueueRetryDelaySeconds(retryAt: Date, now = new Date()): number {
	return Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000));
}
