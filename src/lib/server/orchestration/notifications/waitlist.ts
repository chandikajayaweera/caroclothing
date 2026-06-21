import type { SystemActor } from '$lib/server/foundation/context';
import { markDropWaitlistEntryNotified } from '$lib/server/modules/drops/drops.service';
import type { ClaimedNotificationDTO } from '$lib/server/modules/notifications/outbox/outbox.types';

export async function markDropLaunchWaitlistEntryNotified(
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
