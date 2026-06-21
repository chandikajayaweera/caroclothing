import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIGURED_CRON_SCHEDULES, CRON_SCHEDULES } from './schedules';
import { runScheduledJobs, SCHEDULED_JOB_REGISTRY } from './scheduled-jobs';

const jobMocks = vi.hoisted(() => ({
	deleteExpiredGuestBags: vi.fn(),
	expireDueBagCheckouts: vi.fn(),
	transitionDueDropsToLive: vi.fn(),
	cancelExpiredPendingOrders: vi.fn(),
	reconcilePromoCodeUsageCounts: vi.fn(),
	processDueNotificationOutbox: vi.fn()
}));

vi.mock('$lib/server/modules/bag/bag.service', () => ({
	deleteExpiredGuestBags: jobMocks.deleteExpiredGuestBags,
	expireDueBagCheckouts: jobMocks.expireDueBagCheckouts
}));

vi.mock('$lib/server/modules/drops/drops.service', () => ({
	transitionDueDropsToLive: jobMocks.transitionDueDropsToLive
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
		jobMocks.transitionDueDropsToLive.mockResolvedValue({
			launchedCount: 1,
			launched: [],
			skippedCount: 0,
			skipped: [],
			failedCount: 0,
			failed: [],
			limit: 50
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

	it('registers exactly one job definition for every configured cron schedule', () => {
		const registeredSchedules = SCHEDULED_JOB_REGISTRY.map((definition) => definition.schedule);

		expect(registeredSchedules).toEqual([...CONFIGURED_CRON_SCHEDULES]);
		expect(new Set(registeredSchedules).size).toBe(registeredSchedules.length);
	});

	it('runs all jobs registered for the drop launch and notification schedule', async () => {
		const results = await runScheduledJobs({
			cron: CRON_SCHEDULES.dropLaunchAndNotifications,
			scheduledTime
		});

		expect(results.map((result) => result.job)).toEqual([
			'notifications.processDueOutbox',
			'drops.transitionDueDropsToLive'
		]);
		expect(jobMocks.processDueNotificationOutbox).toHaveBeenCalledWith({
			now: new Date(scheduledTime),
			limit: 50
		});
		expect(jobMocks.transitionDueDropsToLive).toHaveBeenCalledWith(
			expect.objectContaining({
				actor: { id: 'system:cron', role: 'adminUser' },
				now: new Date(scheduledTime)
			}),
			{ now: new Date(scheduledTime), limit: 50 }
		);
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

	it('waits for sibling jobs and fails the scheduled invocation when any job fails', async () => {
		jobMocks.transitionDueDropsToLive.mockRejectedValueOnce(new Error('drop job failed'));

		await expect(
			runScheduledJobs({
				cron: CRON_SCHEDULES.dropLaunchAndNotifications,
				scheduledTime
			})
		).rejects.toThrow('[cron] Scheduled job failure: drop job failed');
		expect(jobMocks.processDueNotificationOutbox).toHaveBeenCalledTimes(1);
		expect(jobMocks.transitionDueDropsToLive).toHaveBeenCalledTimes(1);
	});
});
