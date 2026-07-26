import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { makeAdminCtx } from '../../../../../tests/context';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../../tests/db';
import { seedUser } from '../../../../../tests/factories/auth';
import { notificationOutbox } from './outbox.drizzle';
import {
	cancelNotification,
	claimNotification,
	claimPendingNotifications,
	enqueueNotificationTx,
	getNotificationOutbox,
	markNotificationSent,
	prepareAccountNotificationCancellation,
	releaseStaleNotificationLocks,
	type NotificationOutboxTx
} from './outbox.service';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

vi.mock('$lib/server/infrastructure/sms', () => ({
	normalizeSmsRecipient: (value: string) => value.trim().replace(/^0/, '+94')
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-07-19T10:00:00.000Z');

function db() {
	return harness.db;
}

async function enqueueWelcome(
	idempotencyKey: string,
	email = 'buyer@example.com',
	recipientUserId?: string
) {
	return enqueueNotificationTx(db() as NotificationOutboxTx, {
		idempotencyKey,
		type: 'auth_welcome',
		channel: 'email',
		recipient: email,
		recipientUserId,
		aggregateType: 'auth',
		payload: { email, name: 'Buyer' },
		now
	});
}

async function enqueueOrderConfirmationSms(idempotencyKey: string) {
	return enqueueNotificationTx(db() as NotificationOutboxTx, {
		idempotencyKey,
		type: 'order_confirmation',
		channel: 'sms',
		recipient: '+94771234567',
		aggregateType: 'order',
		aggregateId: 'order-1',
		payload: {
			to: '+94771234567',
			customerName: 'Buyer',
			orderId: 'order-1',
			total: 'LKR 5,000.00'
		},
		now
	});
}

describe('notification outbox service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	it('normalizes matching recipients and rejects payload recipient mismatches', async () => {
		const created = await enqueueWelcome('welcome:matching', 'Buyer@Example.com');
		expect(created.recipient).toBe('buyer@example.com');
		expect(created.payload).toMatchObject({ email: 'buyer@example.com' });

		await expect(
			enqueueNotificationTx(db() as NotificationOutboxTx, {
				idempotencyKey: 'welcome:mismatch',
				type: 'auth_welcome',
				channel: 'email',
				recipient: 'buyer@example.com',
				aggregateType: 'auth',
				payload: { email: 'someone-else@example.com', name: 'Buyer' },
				now
			})
		).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
	});

	it('cancels pending rows idempotently but never steals an active processing lock', async () => {
		const pending = await enqueueWelcome('welcome:pending');
		const cancelled = await cancelNotification(makeAdminCtx({ now }), {
			id: pending.id,
			reason: 'Customer request',
			now
		});
		expect(cancelled).toMatchObject({ status: 'cancelled', lastError: 'Customer request' });
		await expect(
			cancelNotification(makeAdminCtx({ now }), { id: pending.id, now })
		).resolves.toMatchObject({ status: 'cancelled' });

		const active = await enqueueWelcome('welcome:processing', 'processing@example.com');
		const claimed = await claimNotification(makeAdminCtx({ now }), {
			outboxId: active.id,
			workerId: 'test-worker',
			now
		});
		expect(claimed).toMatchObject({ status: 'processing' });

		await expect(
			cancelNotification(makeAdminCtx({ now }), { id: active.id, now })
		).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
		await expect(
			db().select().from(notificationOutbox).where(eq(notificationOutbox.id, active.id)).get()
		).resolves.toMatchObject({
			status: 'processing',
			lockToken: claimed?.lockToken,
			lockedBy: 'test-worker'
		});
	});

	it('claims queue wakeups only when both row identifiers match', async () => {
		const pending = await enqueueWelcome('welcome:composite-claim');

		await expect(
			claimNotification(makeAdminCtx({ now }), {
				outboxId: pending.id,
				idempotencyKey: 'welcome:wrong-key',
				workerId: 'test-worker',
				now
			})
		).resolves.toBeNull();

		await expect(
			db().select().from(notificationOutbox).where(eq(notificationOutbox.id, pending.id)).get()
		).resolves.toMatchObject({ status: 'pending', lockToken: null });

		await expect(
			claimNotification(makeAdminCtx({ now }), {
				outboxId: pending.id,
				idempotencyKey: pending.idempotencyKey,
				workerId: 'test-worker',
				now
			})
		).resolves.toMatchObject({
			id: pending.id,
			idempotencyKey: pending.idempotencyKey,
			status: 'processing'
		});
	});

	it('marks a provider success idempotently without accepting a different provider result', async () => {
		const pending = await enqueueWelcome('welcome:idempotent-send');
		const claimed = await claimNotification(makeAdminCtx({ now }), {
			outboxId: pending.id,
			idempotencyKey: pending.idempotencyKey,
			workerId: 'test-worker',
			now
		});
		expect(claimed).not.toBeNull();

		const input = {
			id: pending.id,
			lockToken: claimed!.lockToken,
			provider: 'resend',
			providerMessageId: 'email-1',
			sentAt: now
		};
		await expect(markNotificationSent(makeAdminCtx({ now }), input)).resolves.toMatchObject({
			status: 'sent',
			provider: 'resend',
			providerMessageId: 'email-1'
		});
		await expect(markNotificationSent(makeAdminCtx({ now }), input)).resolves.toMatchObject({
			status: 'sent',
			providerMessageId: 'email-1'
		});
		await expect(
			markNotificationSent(makeAdminCtx({ now }), {
				...input,
				providerMessageId: 'email-2'
			})
		).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
	});

	it('retries stale email locks but quarantines SMS with an unknown delivery outcome', async () => {
		const email = await enqueueWelcome('welcome:stale-email');
		const sms = await enqueueOrderConfirmationSms('order:stale-sms');
		for (const notification of [email, sms]) {
			await claimNotification(makeAdminCtx({ now }), {
				outboxId: notification.id,
				workerId: 'crashed-worker',
				now
			});
		}

		const releaseAt = new Date(now.getTime() + 2 * 60_000);
		await expect(
			releaseStaleNotificationLocks(makeAdminCtx({ now: releaseAt }), {
				now: releaseAt,
				olderThanMs: 60_000
			})
		).resolves.toMatchObject({ releasedCount: 2, skippedCount: 0 });

		await expect(
			getNotificationOutbox(makeAdminCtx({ now: releaseAt }), { id: email.id })
		).resolves.toMatchObject({
			status: 'failed',
			attemptCount: 1,
			lastError: 'Processing lock expired before delivery state was persisted.'
		});
		await expect(
			getNotificationOutbox(makeAdminCtx({ now: releaseAt }), { id: sms.id })
		).resolves.toMatchObject({
			status: 'failed',
			attemptCount: 5,
			maxAttempts: 5,
			lastError:
				'SMS delivery outcome is unknown after the processing lock expired. Manual review required.'
		});

		const due = await claimPendingNotifications(makeAdminCtx({ now: releaseAt }), {
			now: releaseAt,
			workerId: 'recovery-worker'
		});
		expect(due.map((item) => item.id)).toEqual([email.id]);
	});

	it('scrubs account PII while preserving sent delivery audit state', async () => {
		const userId = 'user-being-deleted';
		await seedUser(db(), { id: userId });
		const pending = await enqueueWelcome(
			'welcome:delete-pending',
			'pending-delete@example.com',
			userId
		);
		const sent = await enqueueWelcome('welcome:delete-sent', 'sent-delete@example.com', userId);
		const claimed = await claimNotification(makeAdminCtx({ now }), {
			outboxId: sent.id,
			idempotencyKey: sent.idempotencyKey,
			workerId: 'test-worker',
			now
		});
		await markNotificationSent(makeAdminCtx({ now }), {
			id: sent.id,
			lockToken: claimed!.lockToken,
			provider: 'resend',
			providerMessageId: 'email-sent-before-deletion',
			sentAt: now
		});

		await db().batch([prepareAccountNotificationCancellation(db(), { userId, now })]);

		await expect(
			getNotificationOutbox(makeAdminCtx({ now }), { id: pending.id })
		).resolves.toMatchObject({
			status: 'cancelled',
			recipient: '[deleted-account]',
			recipientUserId: null,
			payload: { redacted: true },
			metadata: null,
			lastError: 'Account deleted before delivery.'
		});
		await expect(
			getNotificationOutbox(makeAdminCtx({ now }), { id: sent.id })
		).resolves.toMatchObject({
			status: 'sent',
			recipient: '[deleted-account]',
			recipientUserId: null,
			payload: { redacted: true },
			metadata: null,
			provider: 'resend',
			providerMessageId: 'email-sent-before-deletion',
			sentAt: now,
			cancelledAt: null
		});
	});
});
