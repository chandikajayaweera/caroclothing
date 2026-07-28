import { deleteExpiredGuestBags, expireDueBagCheckouts } from '$lib/server/modules/bag/bag.service';
import { cancelExpiredPendingOrders } from '$lib/server/modules/orders/orders.service';
import { reconcilePromoCodeUsageCounts } from '$lib/server/modules/promotions/promotions.service';
import type {
	NotificationWakeupPublisher,
	ServiceContext,
	SystemActor
} from '$lib/server/foundation/context';
import { processDueNotificationOutbox } from '$lib/server/orchestration/notifications';
import { getErrorMessage } from '$lib/server/infrastructure/errors';
import { CLOUDFLARE_CRON_TRIGGER, CRON_SCHEDULES, type CronSchedule } from './schedules';

const NOTIFICATION_OUTBOX_LIMIT = 50;
const ORDER_CANCEL_LIMIT = 50;
const BAG_CHECKOUT_EXPIRY_LIMIT = 100;
const BAG_CLEANUP_LIMIT = 100;
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

export type RunScheduledJobsInput = {
	cron: string;
	scheduledTime: number;
	notificationWakeups?: NotificationWakeupPublisher | null;
};

type ScheduledJobContext = {
	now: Date;
	serviceCtx: ServiceContext;
};

export type ScheduledJobDefinition = {
	schedule: CronSchedule;
	isDue: (now: Date) => boolean;
	jobs: (context: ScheduledJobContext) => Array<() => Promise<ScheduledJobResult>>;
};

export const SCHEDULED_JOB_REGISTRY = [
	{
		schedule: CRON_SCHEDULES.bagCheckoutExpiry,
		isDue: () => true,
		jobs: ({ now, serviceCtx }) => [() => expireBagCheckouts(serviceCtx, now)]
	},
	{
		schedule: CRON_SCHEDULES.notifications,
		isDue: (now) => now.getUTCMinutes() % 5 === 0,
		jobs: ({ now }) => [() => processDueNotificationOutboxJob(now)]
	},
	{
		schedule: CRON_SCHEDULES.orderPaymentExpiry,
		isDue: (now) => now.getUTCMinutes() % 10 === 0,
		jobs: ({ now, serviceCtx }) => [() => cancelExpiredOrderPayments(serviceCtx, now)]
	},
	{
		schedule: CRON_SCHEDULES.bagCleanup,
		isDue: (now) => now.getUTCMinutes() === 0,
		jobs: ({ now, serviceCtx }) => [() => cleanupExpiredGuestBags(serviceCtx, now)]
	},
	{
		schedule: CRON_SCHEDULES.promoReconcile,
		isDue: (now) => now.getUTCHours() === 20 && now.getUTCMinutes() === 17,
		jobs: ({ serviceCtx }) => [() => reconcilePromoUsageCounts(serviceCtx)]
	}
] as const satisfies readonly ScheduledJobDefinition[];

export async function runScheduledJobs(
	input: RunScheduledJobsInput
): Promise<ScheduledJobResult[]> {
	const now = new Date(input.scheduledTime);
	const serviceCtx = createCronServiceContext(now, input.notificationWakeups);

	if (input.cron !== CLOUDFLARE_CRON_TRIGGER) {
		console.warn('[cron] Unknown schedule ignored:', { cron: input.cron });
		return [
			{
				job: 'cron.unknown',
				count: 0,
				details: { cron: input.cron }
			}
		];
	}

	const dueJobs = SCHEDULED_JOB_REGISTRY.filter((definition) => definition.isDue(now)).flatMap(
		(definition) => definition.jobs({ now, serviceCtx })
	);

	return runCronJobs(dueJobs);
}

function createCronServiceContext(
	now: Date,
	notificationWakeups: NotificationWakeupPublisher | null | undefined
): ServiceContext {
	return {
		actor: cronActor,
		notificationWakeups,
		now
	};
}

async function runCronJobs(
	jobs: Array<() => Promise<ScheduledJobResult>>
): Promise<ScheduledJobResult[]> {
	const results: ScheduledJobResult[] = [];
	const failures: string[] = [];

	// All jobs share one D1 binding. D1 executes a database serially, so starting
	// several maintenance jobs together only creates queueing and timeout pressure.
	for (const job of jobs) {
		try {
			results.push(await job());
		} catch (error) {
			const message = getErrorMessage(error);
			failures.push(message);
			console.error('[cron] Scheduled job failed:', { error: message });
		}
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
			releasedSkippedCount: result.releaseSkippedCount,
			sentCount: countNotificationOutcomes(result, 'sent'),
			failedCount: countNotificationOutcomes(result, 'failed'),
			skippedCount: countNotificationOutcomes(result, 'skipped'),
			invalidCount: countNotificationOutcomes(result, 'invalid')
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
		count: result.cancelledCount,
		details: {
			skippedCount: result.skippedCount,
			failedCount: result.failedCount
		}
	};
}

async function cleanupExpiredGuestBags(
	ctx: ServiceContext,
	now: Date
): Promise<ScheduledJobResult> {
	const result = await deleteExpiredGuestBags(ctx, {
		now,
		limit: BAG_CLEANUP_LIMIT
	});

	return {
		job: 'bag.deleteExpiredGuestBags',
		count: result.deletedCount,
		details: {
			itemCount: result.itemCount,
			releasedQuantity: result.releasedQuantity,
			skippedCount: result.skippedCount,
			failedCount: result.failedCount
		}
	};
}

async function expireBagCheckouts(ctx: ServiceContext, now: Date): Promise<ScheduledJobResult> {
	const result = await expireDueBagCheckouts(ctx, {
		now,
		limit: BAG_CHECKOUT_EXPIRY_LIMIT
	});

	return {
		job: 'bag.expireDueCheckouts',
		count: result.expiredCount,
		details: {
			releasedQuantity: result.releasedQuantity,
			skippedCount: result.skippedCount,
			failedCount: result.failedCount
		}
	};
}

async function reconcilePromoUsageCounts(ctx: ServiceContext): Promise<ScheduledJobResult> {
	let offset = 0;
	let checkedCount = 0;
	let changedCount = 0;
	let failedCount = 0;
	let pageCount = 0;
	let hasMore = false;

	do {
		const result = await reconcilePromoCodeUsageCounts(ctx, {
			limit: PROMO_RECONCILE_LIMIT,
			offset
		});

		checkedCount += result.checkedCount;
		changedCount += result.changedCount;
		failedCount += result.failedCount;
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
			failedCount,
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
