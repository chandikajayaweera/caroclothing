import type { SystemActor } from '$lib/server/modules/service-context';
import { markDropWaitlistEntryNotified } from '$lib/server/modules/drops/drops.service';
import { sendDropLaunchEmail, sendOrderConfirmationEmail, sendShippingUpdateEmail } from '../email';
import type { EmailResult, OrderConfirmationInput, ShippingUpdateInput } from '../email';
import { sendDropLaunchSms } from '../sms';
import type { SmsResult } from '../sms';
import {
	claimNotification,
	claimPendingNotifications,
	markNotificationFailed,
	markNotificationSent,
	releaseStaleNotificationLocks
} from './outbox.service';
import type {
	ClaimedNotificationDTO,
	DropLaunchOutboxEmailInput,
	DropLaunchOutboxSmsInput,
	NotificationCronProcessResult,
	NotificationDispatchResult,
	NotificationQueueBatchResult,
	NotificationQueueMessage
} from './outbox.types';

const QUEUE_BATCH_PROCESS_LIMIT = 50;
const STALE_LOCK_RELEASE_LIMIT = 100;

type ProviderDispatchResult =
	| { ok: true; provider: string; providerMessageId: string }
	| { ok: false; error: string };

const queueActor = {
	id: 'system:notification-queue',
	role: 'adminUser'
} satisfies SystemActor;

const cronActor = {
	id: 'system:notification-cron',
	role: 'adminUser'
} satisfies SystemActor;

export async function processNotificationQueueBatch(
	batch: MessageBatch<NotificationQueueMessage>
): Promise<NotificationQueueBatchResult> {
	const results: NotificationDispatchResult[] = [];

	for (const message of batch.messages) {
		try {
			results.push(await processQueueMessage(batch.queue, message));
		} catch (error) {
			console.error('[notification-outbox] Unexpected queue message failure:', {
				queue: batch.queue,
				messageId: message.id,
				error
			});
			results.push({
				id: message.id,
				outcome: 'failed',
				message: error instanceof Error ? error.message : 'UNKNOWN_QUEUE_PROCESSING_ERROR'
			});
		} finally {
			message.ack();
		}
	}

	return {
		queue: batch.queue,
		processedCount: results.length,
		results
	};
}

export async function processDueNotificationOutbox(
	input: { actor?: SystemActor; now?: Date; limit?: number } = {}
): Promise<NotificationCronProcessResult> {
	const now = input.now ?? new Date();
	const actor = input.actor ?? cronActor;
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

async function processQueueMessage(
	queueName: string,
	message: Message<NotificationQueueMessage>
): Promise<NotificationDispatchResult> {
	const body = parseQueueMessageBody(message.body);

	if (!body) {
		console.warn('[notification-outbox] Invalid queue message body:', {
			queue: queueName,
			messageId: message.id
		});
		return {
			id: message.id,
			outcome: 'invalid',
			message: 'Invalid notification queue message body.'
		};
	}

	const now = new Date();
	const notification = await claimNotification(
		{ actor: queueActor, now },
		{
			outboxId: body.outboxId,
			workerId: `${queueActor.id}:${message.id}`,
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

	return dispatchClaimedNotification(notification, now, queueActor);
}

async function dispatchClaimedNotification(
	notification: ClaimedNotificationDTO,
	now: Date,
	actor: SystemActor
): Promise<NotificationDispatchResult> {
	try {
		const result = await sendClaimedNotification(notification);

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

			return { id: notification.id, outcome: 'sent' };
		}

		await markNotificationFailed(
			{ actor, now },
			{
				id: notification.id,
				lockToken: notification.lockToken,
				error: result.error,
				retryable: isRetryableSendFailure(result.error),
				now
			}
		);

		return {
			id: notification.id,
			outcome: 'failed',
			message: result.error
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'UNKNOWN_DISPATCH_ERROR';

		try {
			await markNotificationFailed(
				{ actor, now },
				{
					id: notification.id,
					lockToken: notification.lockToken,
					error: message,
					retryable: true,
					now
				}
			);
		} catch (markError) {
			console.error('[notification-outbox] Failed to mark dispatch failure:', {
				id: notification.id,
				error: markError
			});
		}

		return {
			id: notification.id,
			outcome: 'failed',
			message
		};
	}
}

async function sendClaimedNotification(
	notification: ClaimedNotificationDTO
): Promise<ProviderDispatchResult> {
	if (notification.type === 'order_confirmation') {
		if (notification.channel !== 'email') {
			return { ok: false, error: `UNSUPPORTED_CHANNEL:${notification.channel}` };
		}

		return toEmailDispatchResult(
			await sendOrderConfirmationEmail(notification.payload as OrderConfirmationInput)
		);
	}

	if (notification.type === 'shipping_update') {
		if (notification.channel !== 'email') {
			return { ok: false, error: `UNSUPPORTED_CHANNEL:${notification.channel}` };
		}

		return toEmailDispatchResult(
			await sendShippingUpdateEmail(notification.payload as ShippingUpdateInput)
		);
	}

	if (notification.type === 'drop_launch') {
		if (notification.channel === 'email') {
			return toEmailDispatchResult(
				await sendDropLaunchEmail(notification.payload as DropLaunchOutboxEmailInput)
			);
		}

		if (notification.channel === 'sms') {
			return toSmsDispatchResult(
				await sendDropLaunchSms(notification.payload as DropLaunchOutboxSmsInput)
			);
		}

		return { ok: false, error: `UNSUPPORTED_CHANNEL:${notification.channel}` };
	}

	return { ok: false, error: `UNSUPPORTED_NOTIFICATION_TYPE:${notification.type}` };
}

function toEmailDispatchResult(result: EmailResult): ProviderDispatchResult {
	if (!result.ok) return result;
	return {
		ok: true,
		provider: 'resend',
		providerMessageId: result.id
	};
}

function toSmsDispatchResult(result: SmsResult): ProviderDispatchResult {
	if (!result.ok) return result;
	return {
		ok: true,
		provider: 'text.lk',
		providerMessageId: result.messageId
	};
}

async function markDropLaunchWaitlistEntryNotified(
	notification: ClaimedNotificationDTO,
	now: Date,
	actor: SystemActor
): Promise<void> {
	if (notification.type !== 'drop_launch') return;

	const waitlistEntryId = notification.metadata?.waitlistEntryId;
	if (typeof waitlistEntryId !== 'string' || waitlistEntryId.trim().length === 0) {
		console.warn('[notification-outbox] Drop launch notification missing waitlist metadata:', {
			id: notification.id
		});
		return;
	}

	try {
		await markDropWaitlistEntryNotified(
			{ actor, now },
			{
				entryId: waitlistEntryId,
				notifiedAt: now
			}
		);
	} catch (error) {
		console.error('[notification-outbox] Failed to mark drop waitlist entry notified:', {
			id: notification.id,
			waitlistEntryId,
			error
		});
	}
}

function isRetryableSendFailure(error: string): boolean {
	return !error.startsWith('UNSUPPORTED_');
}

function parseQueueMessageBody(body: unknown): NotificationQueueMessage | null {
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
