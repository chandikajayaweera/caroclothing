import { and, asc, count, desc, eq, inArray, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { requireAdmin } from '$lib/server/foundation/guards';
import {
	ErrorCode,
	NotificationError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow
} from '$lib/server/foundation/utils';
import {
	NOTIFICATION_OUTBOX_STATUSES,
	notificationOutbox,
	type NewNotificationOutbox,
	type NotificationChannel,
	type NotificationOutbox,
	type NotificationOutboxStatus,
	type NotificationOutboxType
} from './outbox.drizzle';
import { normalizeSmsRecipient } from '$lib/server/infrastructure/sms';
import type {
	CancelNotificationInput,
	ClaimNotificationInput,
	ClaimPendingNotificationsInput,
	ClaimedNotificationDTO,
	EnqueueAuthGoogleLinkedEmailInput,
	EnqueueAuthWelcomeEmailInput,
	EnqueueNotificationInput,
	EnqueueOrderConfirmationEmailInput,
	EnqueueOrderConfirmationSmsInput,
	EnqueueOrderStatusUpdateSmsInput,
	EnqueuePaymentUpdateSmsInput,
	EnqueueShippingUpdateEmailInput,
	EnqueueShippingUpdateSmsInput,
	GetNotificationOutboxInput,
	ListNotificationOutboxInput,
	MarkNotificationFailedInput,
	MarkNotificationSentInput,
	NotificationOutboxDTO,
	NotificationOutboxListResult,
	NotificationOutboxRowLike,
	NotificationOutboxSummaryDTO,
	NotificationOutboxSummaryInput,
	NotificationPayload,
	NotificationPayloadByType,
	NotificationQueueMessage,
	ReleaseStaleNotificationLocksInput,
	ReleaseStaleNotificationLocksResult
} from './outbox.types';

type Db = ReturnType<typeof getDb>;
export type NotificationOutboxTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | NotificationOutboxTx;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_MAX_ATTEMPTS = 20;
const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 2000;

const emailSchema = z.email();
const phoneSchema = z.e164({ error: 'Invalid phone recipient.' });
const EMAIL_SUPPORTED_TYPES = new Set<NotificationOutboxType>([
	'auth_welcome',
	'auth_google_linked',
	'order_confirmation',
	'shipping_update'
]);
const SMS_SUPPORTED_TYPES = new Set<NotificationOutboxType>([
	'order_confirmation',
	'shipping_update',
	'payment_update',
	'order_status_update'
]);

export async function getNotificationOutbox(
	ctx: ServiceContext,
	input: GetNotificationOutboxInput
): Promise<NotificationOutboxDTO> {
	requireAdmin(ctx.actor);
	const row = await loadNotificationOutboxByIdTx(getDb(), normalizeId(input.id, 'id'));
	return toNotificationOutboxDTO(row);
}

export async function listNotificationOutbox(
	ctx: ServiceContext,
	input: ListNotificationOutboxInput = {}
): Promise<NotificationOutboxListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(input.offset);
	const where = buildNotificationOutboxWhere(input);
	const db = getDb();
	const listQuery = db
		.select()
		.from(notificationOutbox)
		.orderBy(desc(notificationOutbox.createdAt))
		.limit(limit)
		.offset(offset);
	const countQuery = db.select({ total: count() }).from(notificationOutbox);
	const [rows, totalRows] = await Promise.all([
		where ? listQuery.where(where) : listQuery,
		where ? countQuery.where(where) : countQuery
	]);

	return {
		items: rows.map(toNotificationOutboxDTO),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function getNotificationOutboxSummary(
	ctx: ServiceContext,
	input: NotificationOutboxSummaryInput = {}
): Promise<NotificationOutboxSummaryDTO> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const db = getDb();
	const baseWhere = buildNotificationOutboxWhere(input);
	const dueWhere = combineConditions([baseWhere, buildDueNotificationWhere(now)]);
	const lockedWhere = combineConditions([baseWhere, eq(notificationOutbox.status, 'processing')]);
	const exhaustedWhere = combineConditions([
		baseWhere,
		eq(notificationOutbox.status, 'failed'),
		sql`${notificationOutbox.attemptCount} >= ${notificationOutbox.maxAttempts}`
	]);
	const statusQuery = db
		.select({ status: notificationOutbox.status, total: count() })
		.from(notificationOutbox)
		.groupBy(notificationOutbox.status);
	const totalQuery = db.select({ total: count() }).from(notificationOutbox);
	const dueQuery = db.select({ total: count() }).from(notificationOutbox);
	const lockedQuery = db.select({ total: count() }).from(notificationOutbox);
	const exhaustedQuery = db.select({ total: count() }).from(notificationOutbox);

	const [statusRows, totalRows, dueRows, lockedRows, exhaustedRows] = await Promise.all([
		baseWhere ? statusQuery.where(baseWhere) : statusQuery,
		baseWhere ? totalQuery.where(baseWhere) : totalQuery,
		dueWhere ? dueQuery.where(dueWhere) : dueQuery,
		lockedWhere ? lockedQuery.where(lockedWhere) : lockedQuery,
		exhaustedWhere ? exhaustedQuery.where(exhaustedWhere) : exhaustedQuery
	]);
	const byStatus = Object.fromEntries(
		NOTIFICATION_OUTBOX_STATUSES.map((status) => [status, 0])
	) as Record<NotificationOutboxStatus, number>;

	for (const row of statusRows) {
		byStatus[row.status] = Number(row.total);
	}

	return {
		total: Number(totalRows[0]?.total ?? 0),
		byStatus,
		dueCount: Number(dueRows[0]?.total ?? 0),
		lockedCount: Number(lockedRows[0]?.total ?? 0),
		exhaustedFailedCount: Number(exhaustedRows[0]?.total ?? 0)
	};
}

export async function cancelNotification(
	ctx: ServiceContext,
	input: CancelNotificationInput
): Promise<NotificationOutboxDTO> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const id = normalizeId(input.id, 'id');
	const existing = await loadNotificationOutboxByIdTx(getDb(), id);

	if (existing.status === 'sent') {
		throw new NotificationError('Sent notifications cannot be cancelled.', ErrorCode.CONFLICT, {
			id
		});
	}

	if (existing.status === 'cancelled') {
		return toNotificationOutboxDTO(existing);
	}

	const [updated] = await getDb()
		.update(notificationOutbox)
		.set({
			status: 'cancelled',
			cancelledAt: now,
			lockedAt: null,
			lockedBy: null,
			lockToken: null,
			lastError: normalizeOptionalText(input.reason, 'reason', MAX_ERROR_LENGTH),
			updatedAt: now
		})
		.where(eq(notificationOutbox.id, id))
		.returning();

	if (!updated) {
		throw new NotificationError('Notification not found.', ErrorCode.NOT_FOUND, { id });
	}

	return toNotificationOutboxDTO(updated);
}

export async function cancelNotificationsForAccountDeletionTx(
	tx: NotificationOutboxTx,
	input: { userId: string; now?: Date }
): Promise<number> {
	const now = resolveNow(null, input.now);
	const userId = normalizeId(input.userId, 'userId');
	const updated = await tx
		.update(notificationOutbox)
		.set({
			status: 'cancelled',
			cancelledAt: now,
			lockedAt: null,
			lockedBy: null,
			lockToken: null,
			lastError: 'Account deleted before delivery.',
			updatedAt: now
		})
		.where(
			and(
				eq(notificationOutbox.recipientUserId, userId),
				inArray(notificationOutbox.status, ['pending', 'processing', 'failed'])
			)
		)
		.returning({ id: notificationOutbox.id });

	return updated.length;
}

export async function claimNotification(
	ctx: ServiceContext,
	input: ClaimNotificationInput
): Promise<ClaimedNotificationDTO | null> {
	requireAdmin(ctx.actor);
	return claimNotificationTx(getDb(), ctx, input);
}

export async function claimPendingNotifications(
	ctx: ServiceContext,
	input: ClaimPendingNotificationsInput = {}
): Promise<ClaimedNotificationDTO[]> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const db = getDb();
	const rows = await db
		.select({ id: notificationOutbox.id })
		.from(notificationOutbox)
		.where(buildDueNotificationWhere(now))
		.orderBy(asc(notificationOutbox.nextAttemptAt), asc(notificationOutbox.createdAt))
		.limit(limit);
	const claimed: ClaimedNotificationDTO[] = [];

	for (const row of rows) {
		const notification = await claimNotificationTx(db, ctx, {
			outboxId: row.id,
			workerId: input.workerId,
			now
		});

		if (notification) claimed.push(notification);
	}

	return claimed;
}

export async function markNotificationSent(
	ctx: ServiceContext,
	input: MarkNotificationSentInput
): Promise<NotificationOutboxDTO> {
	requireAdmin(ctx.actor);

	const sentAt = resolveNow(ctx, input.sentAt);
	const id = normalizeId(input.id, 'id');
	const lockToken = normalizeId(input.lockToken, 'lockToken');
	const provider = normalizeText(input.provider, 'provider', 100);
	const providerMessageId = normalizeOptionalText(
		input.providerMessageId,
		'providerMessageId',
		255
	);
	const [updated] = await getDb()
		.update(notificationOutbox)
		.set({
			status: 'sent',
			sentAt,
			provider,
			providerMessageId,
			lastError: null,
			lockedAt: null,
			lockedBy: null,
			lockToken: null,
			updatedAt: sentAt
		})
		.where(
			and(
				eq(notificationOutbox.id, id),
				eq(notificationOutbox.status, 'processing'),
				eq(notificationOutbox.lockToken, lockToken)
			)
		)
		.returning();

	if (!updated) {
		throw new NotificationError('Notification lock is no longer valid.', ErrorCode.CONFLICT, {
			id
		});
	}

	return toNotificationOutboxDTO(updated);
}

export async function markNotificationFailed(
	ctx: ServiceContext,
	input: MarkNotificationFailedInput
): Promise<NotificationOutboxDTO> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const id = normalizeId(input.id, 'id');
	const lockToken = normalizeId(input.lockToken, 'lockToken');
	const existing = await loadProcessingNotificationByLockTx(getDb(), id, lockToken);
	const shouldRetry = (input.retryable ?? true) && existing.attemptCount < existing.maxAttempts;
	const nextAttemptAt = shouldRetry ? calculateNextAttemptAt(existing.attemptCount, now) : now;
	const [updated] = await getDb()
		.update(notificationOutbox)
		.set({
			status: 'failed',
			attemptCount: shouldRetry ? existing.attemptCount : existing.maxAttempts,
			nextAttemptAt,
			lastError: normalizeErrorMessage(input.error),
			lockedAt: null,
			lockedBy: null,
			lockToken: null,
			updatedAt: now
		})
		.where(
			and(
				eq(notificationOutbox.id, id),
				eq(notificationOutbox.status, 'processing'),
				eq(notificationOutbox.lockToken, lockToken)
			)
		)
		.returning();

	if (!updated) {
		throw new NotificationError('Notification lock is no longer valid.', ErrorCode.CONFLICT, {
			id
		});
	}

	return toNotificationOutboxDTO(updated);
}

export async function releaseStaleNotificationLocks(
	ctx: ServiceContext,
	input: ReleaseStaleNotificationLocksInput = {}
): Promise<ReleaseStaleNotificationLocksResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const olderThanMs = normalizePositiveInteger(
		input.olderThanMs ?? DEFAULT_LOCK_TIMEOUT_MS,
		'olderThanMs',
		24 * 60 * 60 * 1000
	);
	const staleBefore = new Date(now.getTime() - olderThanMs);
	const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const db = getDb();
	const staleRows = await db
		.select({ id: notificationOutbox.id })
		.from(notificationOutbox)
		.where(
			and(
				eq(notificationOutbox.status, 'processing'),
				lte(notificationOutbox.lockedAt, staleBefore)
			)
		)
		.orderBy(asc(notificationOutbox.lockedAt), asc(notificationOutbox.createdAt))
		.limit(limit);

	if (staleRows.length === 0) {
		return { releasedCount: 0, skippedCount: 0, notificationIds: [] };
	}

	const ids = staleRows.map((row) => row.id);
	const released = await db
		.update(notificationOutbox)
		.set({
			status: 'failed',
			nextAttemptAt: now,
			lockedAt: null,
			lockedBy: null,
			lockToken: null,
			lastError: 'Processing lock expired.',
			updatedAt: now
		})
		.where(
			and(
				inArray(notificationOutbox.id, ids),
				eq(notificationOutbox.status, 'processing'),
				isNotNull(notificationOutbox.lockedAt),
				isNotNull(notificationOutbox.lockedBy),
				isNotNull(notificationOutbox.lockToken),
				lte(notificationOutbox.lockedAt, staleBefore)
			)
		)
		.returning({ id: notificationOutbox.id });

	return {
		releasedCount: released.length,
		skippedCount: ids.length - released.length,
		notificationIds: released.map((row) => row.id)
	};
}

export async function enqueueNotificationTx<TType extends NotificationOutboxType>(
	tx: NotificationOutboxTx,
	input: EnqueueNotificationInput<TType>
): Promise<NotificationOutboxDTO> {
	const now = resolveNow(null, input.now);
	const values = toNewNotificationOutbox(input, now);

	try {
		const [created] = await tx.insert(notificationOutbox).values(values).returning();

		if (!created) {
			throw new NotificationError('Notification was not enqueued.', ErrorCode.INTERNAL_ERROR);
		}

		return toNotificationOutboxDTO(created);
	} catch (error) {
		if (isUniqueConstraintError(getErrorMessage(error))) {
			const existing = await loadNotificationOutboxByIdempotencyKeyTx(tx, values.idempotencyKey);
			return toNotificationOutboxDTO(existing);
		}

		throw mapNotificationOutboxPersistenceError(error);
	}
}

export async function enqueueAuthWelcomeEmailTx(
	tx: NotificationOutboxTx,
	input: EnqueueAuthWelcomeEmailInput
): Promise<NotificationOutboxDTO> {
	const userId = normalizeId(input.userId, 'userId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `auth:user:${userId}:welcome:email`,
		type: 'auth_welcome',
		channel: 'email',
		recipient: input.payload.email,
		recipientUserId: userId,
		aggregateType: 'auth',
		aggregateId: userId,
		payload: input.payload,
		metadata: input.metadata,
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueAuthGoogleLinkedEmailTx(
	tx: NotificationOutboxTx,
	input: EnqueueAuthGoogleLinkedEmailInput
): Promise<NotificationOutboxDTO> {
	const userId = normalizeId(input.userId, 'userId');
	const accountId = normalizeId(input.accountId, 'accountId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `auth:account:${accountId}:google_linked:email`,
		type: 'auth_google_linked',
		channel: 'email',
		recipient: input.payload.email,
		recipientUserId: userId,
		aggregateType: 'auth',
		aggregateId: userId,
		payload: input.payload,
		metadata: { accountId, ...input.metadata },
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueOrderConfirmationEmailTx(
	tx: NotificationOutboxTx,
	input: EnqueueOrderConfirmationEmailInput
): Promise<NotificationOutboxDTO> {
	const orderId = normalizeId(input.orderId, 'orderId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `order:${orderId}:confirmation:email`,
		type: 'order_confirmation',
		channel: 'email',
		recipient: input.payload.email,
		recipientUserId: input.recipientUserId,
		aggregateType: 'order',
		aggregateId: orderId,
		payload: input.payload,
		metadata: input.metadata,
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueOrderConfirmationSmsTx(
	tx: NotificationOutboxTx,
	input: EnqueueOrderConfirmationSmsInput
): Promise<NotificationOutboxDTO> {
	const orderId = normalizeId(input.orderId, 'orderId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `order:${orderId}:confirmation:sms`,
		type: 'order_confirmation',
		channel: 'sms',
		recipient: input.payload.to,
		recipientUserId: input.recipientUserId,
		aggregateType: 'order',
		aggregateId: orderId,
		payload: input.payload,
		metadata: input.metadata,
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueShippingUpdateEmailTx(
	tx: NotificationOutboxTx,
	input: EnqueueShippingUpdateEmailInput
): Promise<NotificationOutboxDTO> {
	const orderId = normalizeId(input.orderId, 'orderId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `order:${orderId}:shipping_update:email`,
		type: 'shipping_update',
		channel: 'email',
		recipient: input.payload.email,
		recipientUserId: input.recipientUserId,
		aggregateType: 'order',
		aggregateId: orderId,
		payload: input.payload,
		metadata: input.metadata,
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueShippingUpdateSmsTx(
	tx: NotificationOutboxTx,
	input: EnqueueShippingUpdateSmsInput
): Promise<NotificationOutboxDTO> {
	const orderId = normalizeId(input.orderId, 'orderId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `order:${orderId}:shipping_update:sms`,
		type: 'shipping_update',
		channel: 'sms',
		recipient: input.payload.to,
		recipientUserId: input.recipientUserId,
		aggregateType: 'order',
		aggregateId: orderId,
		payload: input.payload,
		metadata: input.metadata,
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueuePaymentUpdateSmsTx(
	tx: NotificationOutboxTx,
	input: EnqueuePaymentUpdateSmsInput
): Promise<NotificationOutboxDTO> {
	const orderId = normalizeId(input.orderId, 'orderId');
	const paymentId = normalizeId(input.paymentId, 'paymentId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `order:${orderId}:payment:${paymentId}:${input.payload.status}:sms`,
		type: 'payment_update',
		channel: 'sms',
		recipient: input.payload.to,
		recipientUserId: input.recipientUserId,
		aggregateType: 'order',
		aggregateId: orderId,
		payload: input.payload,
		metadata: { paymentId, ...input.metadata },
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueOrderStatusUpdateSmsTx(
	tx: NotificationOutboxTx,
	input: EnqueueOrderStatusUpdateSmsInput
): Promise<NotificationOutboxDTO> {
	const orderId = normalizeId(input.orderId, 'orderId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `order:${orderId}:status:${input.payload.status}:sms`,
		type: 'order_status_update',
		channel: 'sms',
		recipient: input.payload.to,
		recipientUserId: input.recipientUserId,
		aggregateType: 'order',
		aggregateId: orderId,
		payload: input.payload,
		metadata: input.metadata,
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export function toNotificationQueueMessage(
	row: NotificationOutboxRowLike
): NotificationQueueMessage {
	return {
		outboxId: row.id,
		idempotencyKey: row.idempotencyKey
	};
}

export async function publishNotificationWakeups(
	ctx: ServiceContext,
	rows: NotificationOutboxRowLike[]
): Promise<void> {
	if (rows.length === 0) return;

	const publisher = ctx.notificationWakeups ?? null;
	if (!publisher) {
		console.warn(
			'[notification-outbox] Notification wakeup publisher unavailable; Cron will deliver notifications.',
			{
				count: rows.length,
				requestId: ctx.requestId
			}
		);
		return;
	}

	const startedAt = Date.now();
	try {
		await publisher.publish(rows.map(toNotificationQueueMessage));
		console.info('[notification-outbox] Notification wakeups published:', {
			count: rows.length,
			durationMs: Date.now() - startedAt,
			requestId: ctx.requestId
		});
	} catch (error) {
		console.error('[notification-outbox] Failed to publish notification wakeups:', {
			count: rows.length,
			error
		});
	}
}

async function claimNotificationTx(
	db: QueryExecutor,
	ctx: ServiceContext,
	input: ClaimNotificationInput
): Promise<ClaimedNotificationDTO | null> {
	const now = resolveNow(ctx, input.now);
	const lockToken = crypto.randomUUID();
	const lockedBy = normalizeText(
		input.workerId ?? ctx.actor?.id ?? 'system:notification-worker',
		'workerId',
		255
	);
	const lookupPredicate = buildClaimLookupPredicate(input);
	const [claimed] = await db
		.update(notificationOutbox)
		.set({
			status: 'processing',
			attemptCount: sql`${notificationOutbox.attemptCount} + 1`,
			lastAttemptAt: now,
			lockedAt: now,
			lockedBy,
			lockToken,
			updatedAt: now
		})
		.where(and(lookupPredicate, buildDueNotificationWhere(now)))
		.returning();

	if (!claimed) return null;
	return toClaimedNotificationDTO(claimed);
}

async function loadNotificationOutboxByIdTx(
	db: QueryExecutor,
	id: string
): Promise<NotificationOutbox> {
	const [row] = await db
		.select()
		.from(notificationOutbox)
		.where(eq(notificationOutbox.id, id))
		.limit(1);

	if (!row) {
		throw new NotificationError('Notification not found.', ErrorCode.NOT_FOUND, { id });
	}

	return row;
}

async function loadNotificationOutboxByIdempotencyKeyTx(
	db: QueryExecutor,
	idempotencyKey: string
): Promise<NotificationOutbox> {
	const [row] = await db
		.select()
		.from(notificationOutbox)
		.where(eq(notificationOutbox.idempotencyKey, idempotencyKey))
		.limit(1);

	if (!row) {
		throw new NotificationError('Notification not found.', ErrorCode.NOT_FOUND, {
			idempotencyKey
		});
	}

	return row;
}

async function loadProcessingNotificationByLockTx(
	db: QueryExecutor,
	id: string,
	lockToken: string
): Promise<NotificationOutbox> {
	const [row] = await db
		.select()
		.from(notificationOutbox)
		.where(
			and(
				eq(notificationOutbox.id, id),
				eq(notificationOutbox.status, 'processing'),
				eq(notificationOutbox.lockToken, lockToken)
			)
		)
		.limit(1);

	if (!row) {
		throw new NotificationError('Notification lock is no longer valid.', ErrorCode.CONFLICT, {
			id
		});
	}

	return row;
}

function toNewNotificationOutbox<TType extends NotificationOutboxType>(
	input: EnqueueNotificationInput<TType>,
	now: Date
): NewNotificationOutbox {
	assertSupportedTypeChannel(input.type, input.channel);
	const recipient = normalizeRecipient(input.channel, input.recipient);
	const payload = normalizeNotificationPayload(input.type, input.channel, input.payload);
	const metadata = normalizeMetadata(input.metadata);

	return removeUndefinedValues({
		idempotencyKey: normalizeText(input.idempotencyKey, 'idempotencyKey', 255),
		type: input.type,
		channel: input.channel,
		status: 'pending',
		recipient,
		recipientUserId: normalizeOptionalId(input.recipientUserId, 'recipientUserId'),
		aggregateType: input.aggregateType,
		aggregateId: normalizeOptionalId(input.aggregateId, 'aggregateId'),
		payloadJson: payload,
		metadataJson: metadata,
		attemptCount: 0,
		maxAttempts: normalizeMaxAttempts(input.maxAttempts),
		nextAttemptAt: input.nextAttemptAt ?? now,
		lastAttemptAt: null,
		lockedAt: null,
		lockedBy: null,
		lockToken: null,
		lastError: null,
		provider: null,
		providerMessageId: null,
		sentAt: null,
		cancelledAt: null,
		createdAt: now,
		updatedAt: now
	}) as NewNotificationOutbox;
}

function toNotificationOutboxDTO(row: NotificationOutbox): NotificationOutboxDTO {
	return {
		id: row.id,
		idempotencyKey: row.idempotencyKey,
		type: row.type,
		channel: row.channel,
		status: row.status,
		recipient: row.recipient,
		recipientUserId: row.recipientUserId,
		aggregateType: row.aggregateType,
		aggregateId: row.aggregateId,
		payload: parseNotificationPayload(row),
		metadata: parseMetadata(row.metadataJson),
		attemptCount: row.attemptCount,
		maxAttempts: row.maxAttempts,
		nextAttemptAt: row.nextAttemptAt,
		lastAttemptAt: row.lastAttemptAt,
		lockedAt: row.lockedAt,
		lockedBy: row.lockedBy,
		lockToken: row.lockToken,
		lastError: row.lastError,
		provider: row.provider,
		providerMessageId: row.providerMessageId,
		sentAt: row.sentAt,
		cancelledAt: row.cancelledAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function toClaimedNotificationDTO(row: NotificationOutbox): ClaimedNotificationDTO {
	if (row.status !== 'processing' || !row.lockToken) {
		throw new NotificationError(
			'Claimed notification is missing lock state.',
			ErrorCode.INTERNAL_ERROR,
			{
				id: row.id
			}
		);
	}

	return {
		...toNotificationOutboxDTO(row),
		status: 'processing',
		lockToken: row.lockToken
	};
}

function parseNotificationPayload(row: NotificationOutbox): NotificationPayload {
	return normalizeNotificationPayload(row.type, row.channel, row.payloadJson);
}

function normalizeNotificationPayload<TType extends NotificationOutboxType>(
	type: TType,
	channel: NotificationChannel,
	payload: unknown
): NotificationPayloadByType[TType] {
	assertSupportedTypeChannel(type, channel);

	if (!isRecord(payload)) {
		throw new NotificationError(
			'Notification payload must be an object.',
			ErrorCode.VALIDATION_ERROR,
			{
				type,
				channel
			}
		);
	}

	const normalizedPayload = { ...payload };
	if (channel === 'sms') {
		normalizedPayload.to = normalizePhoneRecipientField(payload.to, 'payload.to');
	}

	if (type === 'auth_welcome') {
		requireString(normalizedPayload.email, 'payload.email');
		requireString(normalizedPayload.name, 'payload.name');
	}

	if (type === 'auth_google_linked') {
		requireString(normalizedPayload.email, 'payload.email');
	}

	if (type === 'order_confirmation') {
		requireString(normalizedPayload.customerName, 'payload.customerName');
		requireString(normalizedPayload.orderId, 'payload.orderId');
		requireString(normalizedPayload.total, 'payload.total');

		if (channel === 'email') {
			requireString(normalizedPayload.email, 'payload.email');
			requireString(normalizedPayload.orderDate, 'payload.orderDate');
			requireString(normalizedPayload.subtotal, 'payload.subtotal');
			requireString(normalizedPayload.shipping, 'payload.shipping');
			requireString(normalizedPayload.shippingAddress, 'payload.shippingAddress');
		}

		if (channel === 'email' && !Array.isArray(normalizedPayload.items)) {
			throw new NotificationError(
				'Order confirmation items are required.',
				ErrorCode.VALIDATION_ERROR
			);
		}
	}

	if (type === 'shipping_update') {
		requireString(normalizedPayload.orderId, 'payload.orderId');
		requireString(normalizedPayload.trackingNumber, 'payload.trackingNumber');

		if (channel === 'email') {
			requireString(normalizedPayload.email, 'payload.email');
			requireString(normalizedPayload.customerName, 'payload.customerName');
		}
	}

	if (type === 'payment_update') {
		requireString(normalizedPayload.orderId, 'payload.orderId');
		requireString(normalizedPayload.status, 'payload.status');
	}

	if (type === 'order_status_update') {
		requireString(normalizedPayload.orderId, 'payload.orderId');
		requireString(normalizedPayload.status, 'payload.status');
	}

	return normalizedPayload as unknown as NotificationPayloadByType[TType];
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
	if (value === null || value === undefined) return null;

	if (!isRecord(value)) {
		throw new NotificationError(
			'Notification metadata must be an object.',
			ErrorCode.INTERNAL_ERROR
		);
	}

	return value;
}

function normalizeMetadata(
	value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
	if (value == null) return null;
	return value;
}

function buildNotificationOutboxWhere(
	input: ListNotificationOutboxInput | NotificationOutboxSummaryInput
): SQL | undefined {
	const conditions: SQL[] = [];

	if ('status' in input && input.status)
		conditions.push(eq(notificationOutbox.status, input.status));
	if (input.type) conditions.push(eq(notificationOutbox.type, input.type));
	if (input.channel) conditions.push(eq(notificationOutbox.channel, input.channel));
	if (input.recipientUserId !== undefined) {
		if (input.recipientUserId === null) {
			conditions.push(sql`${notificationOutbox.recipientUserId} IS NULL`);
		} else {
			conditions.push(
				eq(
					notificationOutbox.recipientUserId,
					normalizeId(input.recipientUserId, 'recipientUserId')
				)
			);
		}
	}
	if (input.aggregateType)
		conditions.push(eq(notificationOutbox.aggregateType, input.aggregateType));
	if (input.aggregateId !== undefined) {
		if (input.aggregateId === null) {
			conditions.push(sql`${notificationOutbox.aggregateId} IS NULL`);
		} else {
			conditions.push(
				eq(notificationOutbox.aggregateId, normalizeId(input.aggregateId, 'aggregateId'))
			);
		}
	}
	if ('query' in input && input.query) {
		const term = `%${sanitizeLikeTerm(input.query)}%`;
		conditions.push(
			sql`(${notificationOutbox.id} LIKE ${term} OR ${notificationOutbox.idempotencyKey} LIKE ${term} OR ${notificationOutbox.recipient} LIKE ${term})`
		);
	}

	return combineConditions(conditions);
}

function buildDueNotificationWhere(now: Date): SQL {
	return and(
		inArray(notificationOutbox.status, ['pending', 'failed']),
		lte(notificationOutbox.nextAttemptAt, now),
		sql`${notificationOutbox.attemptCount} < ${notificationOutbox.maxAttempts}`
	) as SQL;
}

function buildClaimLookupPredicate(input: ClaimNotificationInput): SQL {
	if ('outboxId' in input && input.outboxId) {
		return eq(notificationOutbox.id, normalizeId(input.outboxId, 'outboxId'));
	}

	if (!input.idempotencyKey) {
		throw new NotificationError(
			'Notification claim lookup is required.',
			ErrorCode.VALIDATION_ERROR
		);
	}

	return eq(
		notificationOutbox.idempotencyKey,
		normalizeText(input.idempotencyKey, 'idempotencyKey', 255)
	);
}

function calculateNextAttemptAt(attemptCount: number, now: Date): Date {
	const delayMs = Math.min(
		DEFAULT_RETRY_DELAY_MS * 2 ** Math.max(attemptCount - 1, 0),
		MAX_RETRY_DELAY_MS
	);
	return new Date(now.getTime() + delayMs);
}

function assertSupportedTypeChannel(
	type: NotificationOutboxType,
	channel: NotificationChannel
): void {
	if (channel === 'email' && EMAIL_SUPPORTED_TYPES.has(type)) return;
	if (channel === 'sms' && SMS_SUPPORTED_TYPES.has(type)) return;

	throw new NotificationError(
		'Notification channel is not supported yet.',
		ErrorCode.VALIDATION_ERROR,
		{
			type,
			channel
		}
	);
}

function normalizeRecipient(channel: NotificationChannel, recipient: string): string {
	const normalized = normalizeText(recipient, 'recipient', 320);

	if (channel === 'email') {
		const result = emailSchema.safeParse(normalized);
		if (!result.success) {
			throw new NotificationError('Invalid email recipient.', ErrorCode.VALIDATION_ERROR, {
				recipient
			});
		}

		return result.data.toLowerCase();
	}

	const result = phoneSchema.safeParse(normalizeSmsRecipient(normalized));
	if (!result.success) {
		throw new NotificationError('Invalid phone recipient.', ErrorCode.VALIDATION_ERROR, {
			recipient
		});
	}

	return result.data;
}

function normalizePhoneRecipientField(value: unknown, field: string): string {
	const raw = requireString(value, field);
	const result = phoneSchema.safeParse(normalizeSmsRecipient(raw));

	if (!result.success) {
		throw new NotificationError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR);
	}

	return result.data;
}

function normalizeMaxAttempts(value: number | undefined): number {
	if (value === undefined) return DEFAULT_MAX_ATTEMPTS;
	return normalizePositiveInteger(value, 'maxAttempts', MAX_MAX_ATTEMPTS);
}

function normalizePositiveInteger(value: number, field: string, maxValue: number): number {
	if (!Number.isInteger(value) || value <= 0 || value > maxValue) {
		throw new NotificationError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			[field]: value,
			maxValue
		});
	}

	return value;
}

function normalizeId(value: string, field: string): string {
	return normalizeText(value, field, 255);
}

function normalizeOptionalId(value: string | null | undefined, field: string): string | null {
	if (value == null) return null;
	return normalizeId(value, field);
}

function normalizeText(value: string, field: string, maxLength: number): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > maxLength) {
		throw new NotificationError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			[field]: value,
			maxLength
		});
	}

	return normalized;
}

function normalizeOptionalText(
	value: string | null | undefined,
	field: string,
	maxLength: number
): string | null {
	if (value == null) return null;
	return truncateText(normalizeText(value, field, maxLength), maxLength);
}

function normalizeErrorMessage(value: string): string {
	const normalized = value.trim();
	return truncateText(normalized || 'UNKNOWN_ERROR', MAX_ERROR_LENGTH);
}

function truncateText(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new NotificationError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR);
	}

	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function combineConditions(conditions: Array<SQL | undefined>): SQL | undefined {
	const filtered = conditions.filter((condition): condition is SQL => condition !== undefined);
	if (filtered.length === 0) return undefined;
	if (filtered.length === 1) return filtered[0];
	return and(...filtered);
}

function sanitizeLikeTerm(value: string): string {
	return value.trim().replace(/[%_]/g, '');
}

function mapNotificationOutboxPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new NotificationError('Notification already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new NotificationError('Related notification record not found.', ErrorCode.NOT_FOUND);
	}

	if (isCheckConstraintError(message)) {
		throw new NotificationError('Invalid notification data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}
