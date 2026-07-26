import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedNotificationDTO } from '$lib/server/modules/notifications/outbox/outbox.types';

const senders = vi.hoisted(() => ({
	sendWelcomeEmail: vi.fn(),
	sendGoogleLinkedEmail: vi.fn(),
	sendOrderConfirmationEmail: vi.fn(),
	sendShippingUpdateEmail: vi.fn(),
	sendOrderConfirmationSms: vi.fn(),
	sendOrderStatusUpdateSms: vi.fn(),
	sendPaymentUpdateSms: vi.fn(),
	sendShippingUpdateSms: vi.fn()
}));

vi.mock('$lib/server/infrastructure/email', () => ({
	sendWelcomeEmail: senders.sendWelcomeEmail,
	sendGoogleLinkedEmail: senders.sendGoogleLinkedEmail,
	sendOrderConfirmationEmail: senders.sendOrderConfirmationEmail,
	sendShippingUpdateEmail: senders.sendShippingUpdateEmail
}));

vi.mock('$lib/server/infrastructure/sms', () => ({
	sendOrderConfirmationSms: senders.sendOrderConfirmationSms,
	sendOrderStatusUpdateSms: senders.sendOrderStatusUpdateSms,
	sendPaymentUpdateSms: senders.sendPaymentUpdateSms,
	sendShippingUpdateSms: senders.sendShippingUpdateSms
}));

import { sendClaimedNotification } from './registry';

describe('notification dispatch registry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const sender of Object.values(senders)) {
			sender.mockResolvedValue({
				ok: true,
				id: 'provider-message-1',
				messageId: 'provider-message-1'
			});
		}
	});

	it('uses the durable outbox key as the Resend idempotency key', async () => {
		const notification = claimedNotification({
			type: 'auth_welcome',
			channel: 'email',
			payload: { email: 'buyer@example.com', name: 'Buyer' }
		});

		await expect(sendClaimedNotification(notification)).resolves.toMatchObject({ ok: true });
		expect(senders.sendWelcomeEmail).toHaveBeenCalledWith('buyer@example.com', 'Buyer', {
			idempotencyKey: notification.idempotencyKey
		});
	});

	it('preserves permanent Resend failures for outbox quarantine', async () => {
		const notification = claimedNotification({
			type: 'auth_welcome',
			channel: 'email',
			payload: { email: 'buyer@example.com', name: 'Buyer' }
		});
		senders.sendWelcomeEmail.mockResolvedValueOnce({
			ok: false,
			error: 'Invalid sender domain.',
			retryable: false
		});

		await expect(sendClaimedNotification(notification)).resolves.toEqual({
			ok: false,
			error: 'Invalid sender domain.',
			retryable: false
		});
	});
});

function claimedNotification(
	input: Pick<ClaimedNotificationDTO, 'type' | 'channel' | 'payload'>
): ClaimedNotificationDTO {
	const now = new Date('2026-07-23T10:00:00.000Z');
	return {
		id: 'outbox-1',
		idempotencyKey: 'auth:user:user-1:welcome:email',
		type: input.type,
		channel: input.channel,
		status: 'processing',
		recipient: 'buyer@example.com',
		recipientUserId: 'user-1',
		aggregateType: 'auth',
		aggregateId: 'user-1',
		payload: input.payload,
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
