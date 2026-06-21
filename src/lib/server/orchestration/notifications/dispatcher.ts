import type { SystemActor } from '$lib/server/foundation/context';
import {
	claimNotification,
	claimPendingNotifications,
	markNotificationFailed,
	markNotificationSent,
	releaseStaleNotificationLocks
} from '$lib/server/modules/notifications/outbox/outbox.service';
import type {
	ClaimedNotificationDTO,
	NotificationCronProcessResult,
	NotificationDispatchResult,
	NotificationQueueMessage
} from '$lib/server/modules/notifications/outbox/outbox.types';
import { notificationCronActor, notificationQueueActor } from './actors';
import { parseNotificationQueueMessageBody } from './queue-message';
import { sendClaimedNotification } from './registry';
import { isRetryableSendFailure } from './results';
import { markDropLaunchWaitlistEntryNotified } from './waitlist';

const QUEUE_BATCH_PROCESS_LIMIT = 50;
const STALE_LOCK_RELEASE_LIMIT = 100;

export type NotificationQueueMessageEnvelope = {
	queue: string;
	messageId: string;
	body: unknown;
};

export async function processNotificationQueueMessage(
	message: NotificationQueueMessageEnvelope
): Promise<NotificationDispatchResult> {
	const body = parseNotificationQueueMessageBody(message.body);

	if (!body) {
		console.warn('[notification-outbox] Invalid queue message body:', {
			queue: message.queue,
			messageId: message.messageId
		});
		return {
			id: message.messageId,
			outcome: 'invalid',
			message: 'Invalid notification queue message body.'
		};
	}

	return processNotificationWakeup(body, message.messageId);
}

export async function processNotificationWakeup(
	body: NotificationQueueMessage,
	messageId: string
): Promise<NotificationDispatchResult> {
	const now = new Date();
	const notification = await claimNotification(
		{ actor: notificationQueueActor, now },
		{
			outboxId: body.outboxId,
			workerId: `${notificationQueueActor.id}:${messageId}`,
			now
		}
	);

	if (!notification) {
		return {
			id: body.outboxId,
			outcome: 'skipped',
			message: 'Notification is already processed, locked, terminal, or not due.'
		};
	}

	return dispatchClaimedNotification(notification, now, notificationQueueActor);
}

export async function processDueNotificationOutbox(
	input: { actor?: SystemActor; now?: Date; limit?: number } = {}
): Promise<NotificationCronProcessResult> {
	const now = input.now ?? new Date();
	const actor = input.actor ?? notificationCronActor;
	const released = await releaseStaleNotificationLocks(
		{ actor, now },
		{ now, limit: STALE_LOCK_RELEASE_LIMIT }
	);
	const claimed = await claimPendingNotifications(
		{ actor, now },
		{
			now,
			limit: input.limit ?? QUEUE_BATCH_PROCESS_LIMIT,
			workerId: actor.id
		}
	);
	const results: NotificationDispatchResult[] = [];

	for (const notification of claimed) {
		results.push(await dispatchClaimedNotification(notification, now, actor));
	}

	return {
		releasedCount: released.releasedCount,
		claimedCount: claimed.length,
		results
	};
}

export async function dispatchClaimedNotification(
	notification: ClaimedNotificationDTO,
	now: Date,
	actor: SystemActor
): Promise<NotificationDispatchResult> {
	const startedAt = Date.now();
	const queueDelayMs = Math.max(0, startedAt - notification.createdAt.getTime());

	try {
		const result = await sendClaimedNotification(notification);
		const providerDurationMs = Date.now() - startedAt;

		if (result.ok) {
			await markNotificationSent(
				{ actor, now },
				{
					id: notification.id,
					lockToken: notification.lockToken,
					provider: result.provider,
					providerMessageId: result.providerMessageId,
					sentAt: now
				}
			);
			await markDropLaunchWaitlistEntryNotified(notification, now, actor);
			logDispatchTiming(notification, 'sent', queueDelayMs, providerDurationMs);

			return { id: notification.id, outcome: 'sent' };
		}

		const retryable = isRetryableSendFailure(result.error);
		const failed = await markNotificationFailed(
			{ actor, now },
			{
				id: notification.id,
				lockToken: notification.lockToken,
				error: result.error,
				retryable,
				now
			}
		);
		logDispatchTiming(notification, 'failed', queueDelayMs, providerDurationMs);

		return {
			id: notification.id,
			outcome: 'failed',
			message: result.error,
			retryAt:
				failed.attemptCount < failed.maxAttempts && retryable ? failed.nextAttemptAt : undefined
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'UNKNOWN_DISPATCH_ERROR';
		let retryAt: Date | undefined;

		try {
			const failed = await markNotificationFailed(
				{ actor, now },
				{
					id: notification.id,
					lockToken: notification.lockToken,
					error: message,
					retryable: true,
					now
				}
			);
			if (failed.attemptCount < failed.maxAttempts) retryAt = failed.nextAttemptAt;
		} catch (markError) {
			console.error('[notification-outbox] Failed to mark dispatch failure:', {
				id: notification.id,
				error: markError
			});
		}
		logDispatchTiming(notification, 'failed', queueDelayMs, Date.now() - startedAt);

		return {
			id: notification.id,
			outcome: 'failed',
			message,
			retryAt
		};
	}
}

function logDispatchTiming(
	notification: ClaimedNotificationDTO,
	outcome: 'sent' | 'failed',
	queueDelayMs: number,
	providerDurationMs: number
): void {
	console.info('[notification-outbox] Dispatch timing:', {
		id: notification.id,
		type: notification.type,
		channel: notification.channel,
		outcome,
		queueDelayMs,
		providerDurationMs,
		attempt: notification.attemptCount
	});
}
