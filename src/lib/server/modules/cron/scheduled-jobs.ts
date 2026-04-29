import { getClientEnv } from '$lib/client/modules/env';
import { deleteExpiredGuestCarts } from '$lib/server/modules/cart/cart.service';
import {
	listUnnotifiedDropWaitlistEntries,
	markDropWaitlistEntryNotified
} from '$lib/server/modules/drops/waitlist.service';
import { listDrops, transitionDueDropsToLive } from '$lib/server/modules/drops/drop.service';
import { mediaUrl } from '$lib/server/modules/media/utils';
import { sendPromotionalEmail } from '$lib/server/modules/notifications/email/senders/marketing';
import { sendSms } from '$lib/server/modules/notifications/sms/client';
import { cancelExpiredPendingOrders } from '$lib/server/modules/orders/status.service';
import {
	listPromoCodes,
	reconcilePromoCodeUsageCount
} from '$lib/server/modules/promotions/code.service';

const DROP_LAUNCH_CRON = '*/5 * * * *';
const ORDER_PAYMENT_EXPIRY_CRON = '*/10 * * * *';
const CART_CLEANUP_CRON = '0 * * * *';
const PROMO_RECONCILE_CRON = '17 20 * * *';
const WAITLIST_BATCH_SIZE = 50;

const systemActor = {
	id: 'system:cron',
	role: 'adminUser'
};

type ScheduledJobResult = {
	job: string;
	count: number;
};

export async function runScheduledJobs(
	controller: ScheduledController
): Promise<ScheduledJobResult[]> {
	switch (controller.cron) {
		case DROP_LAUNCH_CRON:
			return [await launchDueDropsAndNotifyWaitlists(new Date(controller.scheduledTime))];
		case ORDER_PAYMENT_EXPIRY_CRON:
			return [await cancelExpiredOrderPayments(new Date(controller.scheduledTime))];
		case CART_CLEANUP_CRON:
			return [await cleanupExpiredGuestCarts(new Date(controller.scheduledTime))];
		case PROMO_RECONCILE_CRON:
			return [await reconcilePromoUsageCounts()];
		default:
			console.warn('[cron] Unknown schedule ignored:', controller.cron);
			return [];
	}
}

async function cleanupExpiredGuestCarts(now: Date): Promise<ScheduledJobResult> {
	const deleted = await deleteExpiredGuestCarts(now);
	console.info('[cron] Expired guest carts deleted:', deleted.length);
	return { job: 'cart.cleanupExpiredGuestCarts', count: deleted.length };
}

async function cancelExpiredOrderPayments(now: Date): Promise<ScheduledJobResult> {
	const cancelled = await cancelExpiredPendingOrders({ actor: systemActor, now, limit: 50 });
	console.info('[cron] Expired pending unpaid orders cancelled:', cancelled.length);
	return { job: 'orders.cancelExpiredPendingOrders', count: cancelled.length };
}

async function launchDueDropsAndNotifyWaitlists(now: Date): Promise<ScheduledJobResult> {
	const launchedDrops = await transitionDueDropsToLive({ actor: systemActor, now });
	const liveDrops = await listDrops({ status: 'live', sortBy: 'launchAt', limit: 100 });
	let notifiedCount = 0;

	for (const liveDrop of liveDrops) {
		notifiedCount += await notifyDropWaitlist(liveDrop);
	}

	console.info(
		'[cron] Due drops launched:',
		launchedDrops.length,
		'waitlist notified:',
		notifiedCount
	);
	return { job: 'drops.launchDueDropsAndNotifyWaitlists', count: launchedDrops.length };
}

async function notifyDropWaitlist(drop: {
	id: string;
	slug: string;
	name: string;
	tagline: string | null;
	heroImageR2Key: string | null;
}): Promise<number> {
	const entries = await listUnnotifiedDropWaitlistEntries(drop.id, {
		actor: systemActor,
		limit: WAITLIST_BATCH_SIZE
	});
	let notifiedCount = 0;

	for (const entry of entries) {
		const result =
			entry.contactType === 'email'
				? await sendDropLaunchEmail(entry.contact, drop)
				: await sendDropLaunchSms(entry.contact, drop);

		if (!result) continue;

		await markDropWaitlistEntryNotified(entry.id, { actor: systemActor });
		notifiedCount += 1;
	}

	return notifiedCount;
}

async function sendDropLaunchEmail(
	to: string,
	drop: { slug: string; name: string; tagline: string | null; heroImageR2Key: string | null }
): Promise<boolean> {
	const clientEnv = getClientEnv();
	const dropUrl = `${clientEnv.PUBLIC_APP_URL}/drops/${drop.slug}`;
	const heroImageUrl = drop.heroImageR2Key
		? `${clientEnv.PUBLIC_APP_URL}${mediaUrl(drop.heroImageR2Key)}`
		: undefined;
	const result = await sendPromotionalEmail({
		to,
		subject: `${drop.name} is live`,
		previewText: `${drop.name} is live now.`,
		headline: `${drop.name} is live`,
		body: drop.tagline ?? 'The drop is live now. Get it before it moves.',
		ctaLabel: 'Shop drop',
		ctaUrl: dropUrl,
		heroImageUrl
	});

	if (!result.ok) console.warn('[cron] Drop waitlist email failed:', { to, error: result.error });
	return result.ok;
}

async function sendDropLaunchSms(
	to: string,
	drop: { slug: string; name: string }
): Promise<boolean> {
	const clientEnv = getClientEnv();
	const result = await sendSms({
		to,
		message: `${drop.name} is live. Get it: ${clientEnv.PUBLIC_APP_URL}/drops/${drop.slug}`
	});

	if (!result.ok) console.warn('[cron] Drop waitlist SMS failed:', { to, error: result.error });
	return result.ok;
}

async function reconcilePromoUsageCounts(): Promise<ScheduledJobResult> {
	const limit = 100;
	let offset = 0;
	let reconciledCount = 0;

	while (true) {
		const codes = await listPromoCodes({
			actor: systemActor,
			includeInactive: true,
			limit,
			offset
		});

		for (const code of codes) {
			await reconcilePromoCodeUsageCount(code.id, { actor: systemActor });
			reconciledCount += 1;
		}

		if (codes.length < limit) break;
		offset += limit;
	}

	console.info('[cron] Promo usage counts reconciled:', reconciledCount);
	return { job: 'promotions.reconcilePromoUsageCounts', count: reconciledCount };
}
