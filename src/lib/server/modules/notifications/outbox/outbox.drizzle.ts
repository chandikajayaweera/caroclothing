import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../../auth/auth.drizzle';

export const NOTIFICATION_OUTBOX_TYPES = [
	'order_confirmation',
	'shipping_update',
	'drop_launch'
] as const;

export const NOTIFICATION_CHANNELS = ['email', 'sms'] as const;

export const NOTIFICATION_OUTBOX_STATUSES = [
	'pending',
	'processing',
	'sent',
	'failed',
	'cancelled'
] as const;

export const NOTIFICATION_AGGREGATE_TYPES = [
	'order',
	'drop',
	'product',
	'promotion',
	'review',
	'cart',
	'auth',
	'campaign',
	'system'
] as const;

export type NotificationOutboxType = (typeof NOTIFICATION_OUTBOX_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationOutboxStatus = (typeof NOTIFICATION_OUTBOX_STATUSES)[number];
export type NotificationAggregateType = (typeof NOTIFICATION_AGGREGATE_TYPES)[number];

export const notificationOutbox = sqliteTable(
	'notification_outbox',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		idempotencyKey: text('idempotency_key').notNull(),
		type: text('type', { enum: NOTIFICATION_OUTBOX_TYPES }).notNull(),
		channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
		status: text('status', { enum: NOTIFICATION_OUTBOX_STATUSES }).default('pending').notNull(),
		recipient: text('recipient').notNull(),
		recipientUserId: text('recipient_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		aggregateType: text('aggregate_type', { enum: NOTIFICATION_AGGREGATE_TYPES }).notNull(),
		aggregateId: text('aggregate_id'),
		payloadJson: text('payload_json').notNull(),
		metadataJson: text('metadata_json'),
		attemptCount: integer('attempt_count').default(0).notNull(),
		maxAttempts: integer('max_attempts').default(5).notNull(),
		nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
		lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
		lockedBy: text('locked_by'),
		lockToken: text('lock_token'),
		lastError: text('last_error'),
		provider: text('provider'),
		providerMessageId: text('provider_message_id'),
		sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
		cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex('notification_outbox_idempotency_unique_idx').on(table.idempotencyKey),
		index('notification_outbox_status_next_idx').on(table.status, table.nextAttemptAt),
		index('notification_outbox_status_lock_idx').on(table.status, table.lockedAt),
		index('notification_outbox_aggregate_idx').on(table.aggregateType, table.aggregateId),
		index('notification_outbox_user_status_idx').on(table.recipientUserId, table.status),
		index('notification_outbox_type_channel_status_idx').on(
			table.type,
			table.channel,
			table.status
		),
		check(
			'notification_outbox_attempts_valid',
			sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} > 0 AND ${table.attemptCount} <= ${table.maxAttempts}`
		),
		check('notification_outbox_next_attempt_positive', sql`${table.nextAttemptAt} > 0`),
		check(
			'notification_outbox_processing_lock_valid',
			sql`(${table.status} = 'processing' AND ${table.lockedAt} IS NOT NULL AND ${table.lockedBy} IS NOT NULL AND ${table.lockToken} IS NOT NULL) OR (${table.status} <> 'processing' AND ${table.lockedAt} IS NULL AND ${table.lockedBy} IS NULL AND ${table.lockToken} IS NULL)`
		),
		check(
			'notification_outbox_sent_state_valid',
			sql`${table.status} <> 'sent' OR ${table.sentAt} IS NOT NULL`
		),
		check(
			'notification_outbox_cancelled_state_valid',
			sql`${table.status} <> 'cancelled' OR ${table.cancelledAt} IS NOT NULL`
		)
	]
);

export const notificationOutboxRelations = relations(notificationOutbox, ({ one }) => ({
	recipientUser: one(user, {
		fields: [notificationOutbox.recipientUserId],
		references: [user.id]
	})
}));

const idSchema = z.string().min(1).max(255);
const jsonStringSchema = z.string().refine(
	(value) => {
		try {
			JSON.parse(value);
			return true;
		} catch {
			return false;
		}
	},
	{ message: 'Must be valid JSON' }
);

export const insertNotificationOutboxSchema = createInsertSchema(notificationOutbox, {
	idempotencyKey: z.string().min(1).max(255),
	type: z.enum(NOTIFICATION_OUTBOX_TYPES),
	channel: z.enum(NOTIFICATION_CHANNELS),
	status: z.enum(NOTIFICATION_OUTBOX_STATUSES).optional(),
	recipient: z.string().min(1).max(320),
	recipientUserId: idSchema.optional().nullable(),
	aggregateType: z.enum(NOTIFICATION_AGGREGATE_TYPES),
	aggregateId: idSchema.optional().nullable(),
	payloadJson: jsonStringSchema,
	metadataJson: jsonStringSchema.optional().nullable(),
	attemptCount: z.number().int().min(0).optional(),
	maxAttempts: z.number().int().positive().optional(),
	nextAttemptAt: z.date().optional(),
	lastAttemptAt: z.date().optional().nullable(),
	lockedAt: z.date().optional().nullable(),
	lockedBy: z.string().min(1).max(255).optional().nullable(),
	lockToken: z.string().min(1).max(255).optional().nullable(),
	lastError: z.string().max(2000).optional().nullable(),
	provider: z.string().max(100).optional().nullable(),
	providerMessageId: z.string().max(255).optional().nullable(),
	sentAt: z.date().optional().nullable(),
	cancelledAt: z.date().optional().nullable()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export const selectNotificationOutboxSchema = createSelectSchema(notificationOutbox);
export const updateNotificationOutboxSchema = createUpdateSchema(notificationOutbox, {
	status: z.enum(NOTIFICATION_OUTBOX_STATUSES).optional(),
	attemptCount: z.number().int().min(0).optional(),
	maxAttempts: z.number().int().positive().optional(),
	nextAttemptAt: z.date().optional(),
	lastAttemptAt: z.date().optional().nullable(),
	lockedAt: z.date().optional().nullable(),
	lockedBy: z.string().min(1).max(255).optional().nullable(),
	lockToken: z.string().min(1).max(255).optional().nullable(),
	lastError: z.string().max(2000).optional().nullable(),
	provider: z.string().max(100).optional().nullable(),
	providerMessageId: z.string().max(255).optional().nullable(),
	sentAt: z.date().optional().nullable(),
	cancelledAt: z.date().optional().nullable()
}).omit({
	id: true,
	idempotencyKey: true,
	type: true,
	channel: true,
	recipient: true,
	recipientUserId: true,
	aggregateType: true,
	aggregateId: true,
	payloadJson: true,
	metadataJson: true,
	createdAt: true,
	updatedAt: true
});

export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutbox = typeof notificationOutbox.$inferInsert;
export type InsertNotificationOutbox = z.infer<typeof insertNotificationOutboxSchema>;
export type SelectNotificationOutbox = z.infer<typeof selectNotificationOutboxSchema>;
export type UpdateNotificationOutbox = z.infer<typeof updateNotificationOutboxSchema>;
