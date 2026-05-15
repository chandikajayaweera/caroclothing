import { and, asc, count, desc, eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { requireAdmin } from '$lib/server/modules/auth/guards';
import {
	ErrorCode,
	NotificationError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';
import type { ServiceContext } from '$lib/server/modules/service-context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow
} from '$lib/server/modules/service-utils';
import {
	NOTIFICATION_OUTBOX_STATUSES,
	notificationOutbox,
	type NewNotificationOutbox,
	type NotificationChannel,
	type NotificationOutbox,
	type NotificationOutboxStatus,
	type NotificationOutboxType
} from './outbox.drizzle';
import type {
	CancelNotificationInput,
	ClaimNotificationInput,
	ClaimPendingNotificationsInput,
	ClaimedNotificationDTO,
	EnqueueDropLaunchEmailInput,
	EnqueueDropLaunchSmsInput,
	EnqueueNotificationInput,
	EnqueueOrderConfirmationEmailInput,
	EnqueueShippingUpdateEmailInput,
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
			lockTimeoutMs: input.lockTimeoutMs,
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
		return { releasedCount: 0, notificationIds: [] };
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
		.where(inArray(notificationOutbox.id, ids))
		.returning({ id: notificationOutbox.id });

	return {
		releasedCount: released.length,
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

export async function enqueueDropLaunchEmailTx(
	tx: NotificationOutboxTx,
	input: EnqueueDropLaunchEmailInput
): Promise<NotificationOutboxDTO> {
	const dropId = normalizeId(input.dropId, 'dropId');
	const waitlistEntryId = normalizeId(input.waitlistEntryId, 'waitlistEntryId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `drop:${dropId}:launch:${waitlistEntryId}:email`,
		type: 'drop_launch',
		channel: 'email',
		recipient: input.payload.to,
		recipientUserId: input.recipientUserId,
		aggregateType: 'drop',
		aggregateId: dropId,
		payload: input.payload,
		metadata: { waitlistEntryId, ...input.metadata },
		maxAttempts: input.maxAttempts,
		nextAttemptAt: input.nextAttemptAt,
		now: input.now
	});
}

export async function enqueueDropLaunchSmsTx(
	tx: NotificationOutboxTx,
	input: EnqueueDropLaunchSmsInput
): Promise<NotificationOutboxDTO> {
	const dropId = normalizeId(input.dropId, 'dropId');
	const waitlistEntryId = normalizeId(input.waitlistEntryId, 'waitlistEntryId');
	return enqueueNotificationTx(tx, {
		idempotencyKey: `drop:${dropId}:launch:${waitlistEntryId}:sms`,
		type: 'drop_launch',
		channel: 'sms',
		recipient: input.payload.to,
		recipientUserId: input.recipientUserId,
		aggregateType: 'drop',
		aggregateId: dropId,
		payload: input.payload,
		metadata: { waitlistEntryId, ...input.metadata },
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

export async function publishNotificationQueueMessages(
	ctx: ServiceContext,
	rows: NotificationOutboxRowLike[]
): Promise<void> {
	if (rows.length === 0) return;

	const queue = ctx.notificationQueue ?? ctx.event?.platform?.env?.NOTIFICATION_QUEUE ?? null;
	if (!queue) return;

	try {
		await queue.sendBatch(
			rows.map((row) => ({
				body: toNotificationQueueMessage(row),
				contentType: 'json' as const
			}))
		);
	} catch (error) {
		console.error('[notification-outbox] Failed to publish queue wakeups:', {
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
		payloadJson: JSON.stringify(payload),
		metadataJson: metadata ? JSON.stringify(metadata) : null,
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
	const payload = parseJson(row.payloadJson, 'payloadJson');
	return normalizeNotificationPayload(row.type, row.channel, payload);
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

	if (type === 'order_confirmation') {
		requireString(payload.email, 'payload.email');
		requireString(payload.customerName, 'payload.customerName');
		requireString(payload.orderId, 'payload.orderId');
		requireString(payload.orderDate, 'payload.orderDate');
		requireString(payload.subtotal, 'payload.subtotal');
		requireString(payload.shipping, 'payload.shipping');
		requireString(payload.total, 'payload.total');
		requireString(payload.shippingAddress, 'payload.shippingAddress');
		if (!Array.isArray(payload.items)) {
			throw new NotificationError(
				'Order confirmation items are required.',
				ErrorCode.VALIDATION_ERROR
			);
		}
	}

	if (type === 'shipping_update') {
		requireString(payload.email, 'payload.email');
		requireString(payload.customerName, 'payload.customerName');
		requireString(payload.orderId, 'payload.orderId');
		requireString(payload.trackingNumber, 'payload.trackingNumber');
	}

	if (type === 'drop_launch') {
		requireString(payload.to, 'payload.to');
		requireString(payload.dropName, 'payload.dropName');
		requireString(payload.dropUrl, 'payload.dropUrl');

		if (channel === 'email') {
			requireString(payload.dropSlug, 'payload.dropSlug');
		}
	}

	return payload as NotificationPayloadByType[TType];
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
	if (value === null) return null;
	const parsed = parseJson(value, 'metadataJson');

	if (!isRecord(parsed)) {
		throw new NotificationError(
			'Notification metadata must be an object.',
			ErrorCode.INTERNAL_ERROR
		);
	}

	return parsed;
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
	if (channel === 'email') return;
	if (type === 'drop_launch' && channel === 'sms') return;

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

	const result = phoneSchema.safeParse(normalized);
	if (!result.success) {
		throw new NotificationError('Invalid phone recipient.', ErrorCode.VALIDATION_ERROR, {
			recipient
		});
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

function parseJson(value: string, field: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		throw new NotificationError(
			`Stored notification ${field} is invalid.`,
			ErrorCode.INTERNAL_ERROR
		);
	}
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
