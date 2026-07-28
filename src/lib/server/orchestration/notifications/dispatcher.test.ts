import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedNotificationDTO } from '$lib/server/modules/notifications/outbox/outbox.types';

const outboxMocks = vi.hoisted(() => ({
	getNotificationOutbox: vi.fn(),
	markNotificationFailed: vi.fn(),
	markNotificationSent: vi.fn()
}));
const registryMocks = vi.hoisted(() => ({
	sendClaimedNotification: vi.fn()
}));

vi.mock('$lib/server/modules/notifications/outbox/outbox.service', () => ({
	claimNotification: vi.fn(),
	claimPendingNotifications: vi.fn(),
	getNotificationOutbox: outboxMocks.getNotificationOutbox,
	markNotificationFailed: outboxMocks.markNotificationFailed,
	markNotificationSent: outboxMocks.markNotificationSent,
	releaseStaleNotificationLocks: vi.fn()
}));

vi.mock('./registry', () => ({
	sendClaimedNotification: registryMocks.sendClaimedNotification
}));

import { dispatchClaimedNotification } from './dispatcher';

describe('notification dispatcher persistence boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		registryMocks.sendClaimedNotification.mockResolvedValue({
			ok: true,
			provider: 'text.lk',
			providerMessageId: 'sms-1'
		});
	});

	it('reconciles an ambiguous sent-state write without recording a false failure', async () => {
		const notification = claimedNotification();
		outboxMocks.markNotificationSent.mockRejectedValueOnce(new Error('D1 reset'));
		outboxMocks.getNotificationOutbox.mockResolvedValueOnce({
			...notification,
			status: 'sent',
			provider: 'text.lk',
			providerMessageId: 'sms-1',
			lockToken: null
		});

		await expect(
			dispatchClaimedNotification(notification, notification.updatedAt, {
				id: 'system:test',
				role: 'adminUser'
			})
		).resolves.toEqual({ id: notification.id, outcome: 'sent' });
		expect(outboxMocks.markNotificationFailed).not.toHaveBeenCalled();
	});

	it('quarantines an unreconciled provider success instead of scheduling a duplicate send', async () => {
		const notification = claimedNotification();
		outboxMocks.markNotificationSent.mockRejectedValueOnce(new Error('D1 reset'));
		outboxMocks.getNotificationOutbox.mockResolvedValueOnce(notification);
		outboxMocks.markNotificationFailed.mockResolvedValueOnce({
			...notification,
			status: 'failed',
			attemptCount: notification.maxAttempts
		});

		await expect(
			dispatchClaimedNotification(notification, notification.updatedAt, {
				id: 'system:test',
				role: 'adminUser'
			})
		).resolves.toMatchObject({
			id: notification.id,
			outcome: 'failed'
		});
		expect(outboxMocks.markNotificationFailed).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: notification.id, retryable: false })
		);
	});

	it('quarantines an SMS delivery with an unknown provider outcome', async () => {
		const notification = claimedNotification();
		registryMocks.sendClaimedNotification.mockResolvedValueOnce({
			ok: false,
			error: 'DELIVERY_UNKNOWN:The operation was aborted.',
			retryable: false
		});
		outboxMocks.markNotificationFailed.mockResolvedValueOnce({
			...notification,
			status: 'failed',
			nextAttemptAt: null
		});

		await expect(
			dispatchClaimedNotification(notification, notification.updatedAt, {
				id: 'system:test',
				role: 'adminUser'
			})
		).resolves.toEqual({
			id: notification.id,
			outcome: 'failed',
			message: 'DELIVERY_UNKNOWN:The operation was aborted.',
			retryAt: undefined
		});
		expect(outboxMocks.markNotificationFailed).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ retryable: false })
		);
	});
});

function claimedNotification(): ClaimedNotificationDTO {
	const now = new Date('2026-07-23T10:00:00.000Z');
	return {
		id: 'outbox-1',
		idempotencyKey: 'order:order-1:confirmation:sms',
		type: 'order_confirmation',
		channel: 'sms',
		status: 'processing',
		recipient: '+94770000000',
		recipientUserId: 'user-1',
		aggregateType: 'order',
		aggregateId: 'order-1',
		payload: {
			to: '+94770000000',
			customerName: 'Buyer',
			orderId: 'order-1',
			orderNumber: 'CARO-1',
			total: 'LKR 5,000',
			orderUrl: 'https://caro.example/orders/order-1'
		},
		metadata: null,
		attemptCount: 1,
		maxAttempts: 5,
		nextAttemptAt: now,
		lastAttemptAt: now,
		lockedAt: now,
		lockedBy: 'test-worker',
		lockToken: 'lock-1',
		lastError: null,
		provider: null,
		providerMessageId: null,
		sentAt: null,
		cancelledAt: null,
		createdAt: now,
		updatedAt: now
	};
}
