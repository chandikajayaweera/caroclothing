import { deleteExpiredGuestCarts } from '$lib/server/modules/cart/cart.service';
import { transitionDueDropsToLive } from '$lib/server/modules/drops/drops.service';
import { processDueNotificationOutbox } from '$lib/server/infrastructure/notifications/outbox.dispatcher';
import { cancelExpiredPendingOrders } from '$lib/server/modules/orders/orders.service';
import { reconcilePromoCodeUsageCounts } from '$lib/server/modules/promotions/promotions.service';
import type { ServiceContext, SystemActor } from '$lib/server/foundation/context';

const DROP_LAUNCH_AND_NOTIFICATION_CRON = '*/5 * * * *';
const ORDER_PAYMENT_EXPIRY_CRON = '*/10 * * * *';
const CART_CLEANUP_CRON = '0 * * * *';
const PROMO_RECONCILE_CRON = '17 20 * * *';

const NOTIFICATION_OUTBOX_LIMIT = 50;
const DROP_LAUNCH_LIMIT = 50;
const ORDER_CANCEL_LIMIT = 50;
const CART_CLEANUP_LIMIT = 100;
const PROMO_RECONCILE_LIMIT = 100;
const PROMO_RECONCILE_MAX_PAGES = 100;

const cronActor = {
	id: 'system:cron',
	role: 'adminUser'
} satisfies SystemActor;

type ScheduledJobDetail = string | number | boolean | null;

export type ScheduledJobResult = {
	job: string;
	count: number;
	details?: Record<string, ScheduledJobDetail>;
};

export async function runScheduledJobs(
	controller: ScheduledController,
	env: App.Platform['env'],
	ctx: ExecutionContext
): Promise<ScheduledJobResult[]> {
	void ctx;

	const now = new Date(controller.scheduledTime);
	const serviceCtx = createCronServiceContext(now, env.NOTIFICATION_QUEUE);

	switch (controller.cron) {
		case DROP_LAUNCH_AND_NOTIFICATION_CRON:
			return runCronJobs([
				() => processDueNotificationOutboxJob(now),
				() => launchDueDrops(serviceCtx, now)
			]);
		case ORDER_PAYMENT_EXPIRY_CRON:
			return runCronJobs([() => cancelExpiredOrderPayments(serviceCtx, now)]);
		case CART_CLEANUP_CRON:
			return runCronJobs([() => cleanupExpiredGuestCarts(serviceCtx, now)]);
		case PROMO_RECONCILE_CRON:
			return runCronJobs([() => reconcilePromoUsageCounts(serviceCtx)]);
		default:
			console.warn('[cron] Unknown schedule ignored:', { cron: controller.cron });
			return [
				{
					job: 'cron.unknown',
					count: 0,
					details: { cron: controller.cron }
				}
			];
	}
}

function createCronServiceContext(
	now: Date,
	notificationQueue: App.Platform['env']['NOTIFICATION_QUEUE']
): ServiceContext {
	return {
		actor: cronActor,
		notificationQueue,
		now
	};
}

async function runCronJobs(
	jobs: Array<() => Promise<ScheduledJobResult>>
): Promise<ScheduledJobResult[]> {
	const settled = await Promise.allSettled(jobs.map((job) => job()));
	const results: ScheduledJobResult[] = [];
	const failures: string[] = [];

	for (const item of settled) {
		if (item.status === 'fulfilled') {
			results.push(item.value);
			continue;
		}

		const message = item.reason instanceof Error ? item.reason.message : 'UNKNOWN_CRON_ERROR';
		failures.push(message);
		console.error('[cron] Scheduled job failed:', { error: item.reason });
	}

	if (failures.length > 0) {
		throw new Error(`[cron] Scheduled job failure: ${failures.join('; ')}`);
	}

	return results;
}

async function processDueNotificationOutboxJob(now: Date): Promise<ScheduledJobResult> {
	const result = await processDueNotificationOutbox({
		now,
		limit: NOTIFICATION_OUTBOX_LIMIT
	});

	return {
		job: 'notifications.processDueOutbox',
		count: result.claimedCount,
		details: {
			releasedCount: result.releasedCount,
			sentCount: countNotificationOutcomes(result, 'sent'),
			failedCount: countNotificationOutcomes(result, 'failed'),
			skippedCount: countNotificationOutcomes(result, 'skipped'),
			invalidCount: countNotificationOutcomes(result, 'invalid')
		}
	};
}

async function launchDueDrops(ctx: ServiceContext, now: Date): Promise<ScheduledJobResult> {
	const result = await transitionDueDropsToLive(ctx, {
		now,
		limit: DROP_LAUNCH_LIMIT
	});

	return {
		job: 'drops.transitionDueDropsToLive',
		count: result.launchedCount,
		details: {
			skippedCount: result.skippedCount,
			failedCount: result.failedCount
		}
	};
}

async function cancelExpiredOrderPayments(
	ctx: ServiceContext,
	now: Date
): Promise<ScheduledJobResult> {
	const result = await cancelExpiredPendingOrders(ctx, {
		now,
		limit: ORDER_CANCEL_LIMIT
	});

	return {
		job: 'orders.cancelExpiredPendingOrders',
		count: result.cancelledCount
	};
}

async function cleanupExpiredGuestCarts(
	ctx: ServiceContext,
	now: Date
): Promise<ScheduledJobResult> {
	const result = await deleteExpiredGuestCarts(ctx, {
		now,
		limit: CART_CLEANUP_LIMIT
	});

	return {
		job: 'cart.deleteExpiredGuestCarts',
		count: result.deletedCount,
		details: {
			itemCount: result.itemCount,
			releasedQuantity: result.releasedQuantity
		}
	};
}

async function reconcilePromoUsageCounts(ctx: ServiceContext): Promise<ScheduledJobResult> {
	let offset = 0;
	let checkedCount = 0;
	let changedCount = 0;
	let pageCount = 0;
	let hasMore = false;

	do {
		const result = await reconcilePromoCodeUsageCounts(ctx, {
			limit: PROMO_RECONCILE_LIMIT,
			offset
		});

		checkedCount += result.checkedCount;
		changedCount += result.changedCount;
		hasMore = result.hasMore;
		offset += PROMO_RECONCILE_LIMIT;
		pageCount += 1;
	} while (hasMore && pageCount < PROMO_RECONCILE_MAX_PAGES);

	if (hasMore) {
		console.warn('[cron] Promo usage reconciliation stopped at page limit:', {
			pageCount,
			checkedCount
		});
	}

	return {
		job: 'promotions.reconcilePromoCodeUsageCounts',
		count: checkedCount,
		details: {
			changedCount,
			pageCount,
			truncated: hasMore
		}
	};
}

function countNotificationOutcomes(
	result: Awaited<ReturnType<typeof processDueNotificationOutbox>>,
	outcome: 'sent' | 'failed' | 'skipped' | 'invalid'
): number {
	return result.results.filter((item) => item.outcome === outcome).length;
}
