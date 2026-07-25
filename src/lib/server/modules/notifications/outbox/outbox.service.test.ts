import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { makeAdminCtx } from '../../../../../tests/context';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../../tests/db';
import { notificationOutbox } from './outbox.drizzle';
import {
	cancelNotification,
	claimNotification,
	enqueueNotificationTx,
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

async function enqueueWelcome(idempotencyKey: string, email = 'buyer@example.com') {
	return enqueueNotificationTx(db() as NotificationOutboxTx, {
		idempotencyKey,
		type: 'auth_welcome',
		channel: 'email',
		recipient: email,
		aggregateType: 'auth',
		payload: { email, name: 'Buyer' },
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
});
