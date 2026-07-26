import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUDFLARE_CRON_TRIGGER, CRON_SCHEDULES } from './schedules';
import { runScheduledJobs, SCHEDULED_JOB_REGISTRY } from './scheduled-jobs';

const jobMocks = vi.hoisted(() => ({
	deleteExpiredGuestBags: vi.fn(),
	expireDueBagCheckouts: vi.fn(),
	cancelExpiredPendingOrders: vi.fn(),
	reconcilePromoCodeUsageCounts: vi.fn(),
	processDueNotificationOutbox: vi.fn()
}));

vi.mock('$lib/server/modules/bag/bag.service', () => ({
	deleteExpiredGuestBags: jobMocks.deleteExpiredGuestBags,
	expireDueBagCheckouts: jobMocks.expireDueBagCheckouts
}));

vi.mock('$lib/server/modules/orders/orders.service', () => ({
	cancelExpiredPendingOrders: jobMocks.cancelExpiredPendingOrders
}));

vi.mock('$lib/server/modules/promotions/promotions.service', () => ({
	reconcilePromoCodeUsageCounts: jobMocks.reconcilePromoCodeUsageCounts
}));

vi.mock('$lib/server/orchestration/notifications', () => ({
	processDueNotificationOutbox: jobMocks.processDueNotificationOutbox
}));

const scheduledTime = Date.parse('2026-06-21T10:00:00.000Z');

describe('runScheduledJobs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		jobMocks.processDueNotificationOutbox.mockResolvedValue({
			releasedCount: 1,
			releaseSkippedCount: 0,
			claimedCount: 2,
			results: [{ id: 'outbox_1', outcome: 'sent' }]
		});
		jobMocks.cancelExpiredPendingOrders.mockResolvedValue({
			cancelledCount: 1,
			orderIds: ['order_1'],
			orders: [],
			skippedCount: 0,
			failedCount: 0,
			failedOrderIds: []
		});
		jobMocks.expireDueBagCheckouts.mockResolvedValue({
			expiredCount: 1,
			bagIds: ['bag_1'],
			releasedQuantity: 2,
			skippedCount: 0,
			failedCount: 0,
			failedBagIds: []
		});
		jobMocks.deleteExpiredGuestBags.mockResolvedValue({
			deletedCount: 1,
			bagIds: ['bag_1'],
			itemCount: 2,
			releasedQuantity: 0,
			skippedCount: 0,
			failedCount: 0,
			failedBagIds: []
		});
		jobMocks.reconcilePromoCodeUsageCounts.mockResolvedValue({
			items: [],
			failedItems: [],
			checkedCount: 3,
			changedCount: 1,
			unchangedCount: 2,
			failedCount: 0,
			limit: 100,
			offset: 0,
			hasMore: false
		});
	});

	it('registers exactly one job definition for every logical job cadence', () => {
		const registeredSchedules = SCHEDULED_JOB_REGISTRY.map((definition) => definition.schedule);

		expect(new Set(registeredSchedules)).toEqual(new Set(Object.values(CRON_SCHEDULES)));
		expect(new Set(registeredSchedules).size).toBe(registeredSchedules.length);
	});

	it.each([
		['2026-06-21T10:01:00.000Z', ['bag.expireDueCheckouts']],
		['2026-06-21T10:05:00.000Z', ['bag.expireDueCheckouts', 'notifications.processDueOutbox']],
		[
			'2026-06-21T10:10:00.000Z',
			[
				'bag.expireDueCheckouts',
				'notifications.processDueOutbox',
				'orders.cancelExpiredPendingOrders'
			]
		],
		[
			'2026-06-21T11:00:00.000Z',
			[
				'bag.expireDueCheckouts',
				'notifications.processDueOutbox',
				'orders.cancelExpiredPendingOrders',
				'bag.deleteExpiredGuestBags'
			]
		],
		[
			'2026-06-21T20:17:00.000Z',
			['bag.expireDueCheckouts', 'promotions.reconcilePromoCodeUsageCounts']
		]
	])('runs only jobs due at UTC minute %s', async (isoTime, expectedJobs) => {
		const results = await runScheduledJobs({
			cron: CLOUDFLARE_CRON_TRIGGER,
			scheduledTime: Date.parse(isoTime)
		});

		expect(results.map((result) => result.job)).toEqual(expectedJobs);
	});

	it('passes the scheduled time through to the notification recovery job', async () => {
		const notificationTime = Date.parse('2026-06-21T10:05:00.000Z');

		await runScheduledJobs({
			cron: CLOUDFLARE_CRON_TRIGGER,
			scheduledTime: notificationTime
		});

		expect(jobMocks.processDueNotificationOutbox).toHaveBeenCalledWith({
			now: new Date(notificationTime),
			limit: 50
		});
	});

	it('returns an explicit result for unknown cron schedules', async () => {
		const results = await runScheduledJobs({
			cron: '1 2 3 4 5',
			scheduledTime
		});

		expect(results).toEqual([
			{
				job: 'cron.unknown',
				count: 0,
				details: { cron: '1 2 3 4 5' }
			}
		]);
		expect(jobMocks.processDueNotificationOutbox).not.toHaveBeenCalled();
	});

	it('continues sequential sibling jobs and fails the invocation when any job fails', async () => {
		jobMocks.processDueNotificationOutbox.mockRejectedValueOnce(new Error('outbox job failed'));

		await expect(
			runScheduledJobs({
				cron: CLOUDFLARE_CRON_TRIGGER,
				scheduledTime: Date.parse('2026-06-21T10:05:00.000Z')
			})
		).rejects.toThrow('[cron] Scheduled job failure: outbox job failed');
		expect(jobMocks.processDueNotificationOutbox).toHaveBeenCalledTimes(1);
		expect(jobMocks.expireDueBagCheckouts).toHaveBeenCalledTimes(1);
	});
});
