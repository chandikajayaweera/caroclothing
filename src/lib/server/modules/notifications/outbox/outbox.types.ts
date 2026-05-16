import type {
	DropLaunchEmailInput,
	GoogleLinkedEmailInput,
	OrderConfirmationInput,
	ShippingUpdateInput,
	WelcomeEmailInput
} from '$lib/server/infrastructure/email';
import type {
	DropLaunchSmsInput,
	OrderConfirmationSmsInput,
	OrderStatusUpdateSmsInput,
	PaymentUpdateSmsInput,
	ShippingUpdateSmsInput
} from '$lib/server/infrastructure/sms';
import type {
	NotificationAggregateType,
	NotificationChannel,
	NotificationOutbox,
	NotificationOutboxStatus,
	NotificationOutboxType
} from './outbox.drizzle';

export type DropLaunchOutboxEmailInput = Omit<DropLaunchEmailInput, 'to'> & {
	to: string;
};

export type DropLaunchOutboxSmsInput = DropLaunchSmsInput;

export type NotificationPayloadByType = {
	auth_welcome: WelcomeEmailInput;
	auth_google_linked: GoogleLinkedEmailInput;
	order_confirmation: OrderConfirmationInput | OrderConfirmationSmsInput;
	shipping_update: ShippingUpdateInput | ShippingUpdateSmsInput;
	payment_update: PaymentUpdateSmsInput;
	order_status_update: OrderStatusUpdateSmsInput;
	drop_launch: DropLaunchOutboxEmailInput | DropLaunchOutboxSmsInput;
};

export type NotificationPayload = NotificationPayloadByType[NotificationOutboxType];

export type NotificationQueueMessage = {
	outboxId: string;
	idempotencyKey: string;
};

export type NotificationOutboxDTO = {
	id: string;
	idempotencyKey: string;
	type: NotificationOutboxType;
	channel: NotificationChannel;
	status: NotificationOutboxStatus;
	recipient: string;
	recipientUserId: string | null;
	aggregateType: NotificationAggregateType;
	aggregateId: string | null;
	payload: NotificationPayload;
	metadata: Record<string, unknown> | null;
	attemptCount: number;
	maxAttempts: number;
	nextAttemptAt: Date;
	lastAttemptAt: Date | null;
	lockedAt: Date | null;
	lockedBy: string | null;
	lockToken: string | null;
	lastError: string | null;
	provider: string | null;
	providerMessageId: string | null;
	sentAt: Date | null;
	cancelledAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ClaimedNotificationDTO = NotificationOutboxDTO & {
	status: 'processing';
	lockToken: string;
};

export type EnqueueNotificationInput<
	TType extends NotificationOutboxType = NotificationOutboxType
> = {
	idempotencyKey: string;
	type: TType;
	channel: NotificationChannel;
	recipient: string;
	recipientUserId?: string | null;
	aggregateType: NotificationAggregateType;
	aggregateId?: string | null;
	payload: NotificationPayloadByType[TType];
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueAuthWelcomeEmailInput = {
	userId: string;
	payload: WelcomeEmailInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueAuthGoogleLinkedEmailInput = {
	userId: string;
	accountId: string;
	payload: GoogleLinkedEmailInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueOrderConfirmationEmailInput = {
	orderId: string;
	recipientUserId?: string | null;
	payload: OrderConfirmationInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueOrderConfirmationSmsInput = {
	orderId: string;
	recipientUserId?: string | null;
	payload: OrderConfirmationSmsInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueShippingUpdateEmailInput = {
	orderId: string;
	recipientUserId?: string | null;
	payload: ShippingUpdateInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueShippingUpdateSmsInput = {
	orderId: string;
	recipientUserId?: string | null;
	payload: ShippingUpdateSmsInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueuePaymentUpdateSmsInput = {
	orderId: string;
	paymentId: string;
	recipientUserId?: string | null;
	payload: PaymentUpdateSmsInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueOrderStatusUpdateSmsInput = {
	orderId: string;
	recipientUserId?: string | null;
	payload: OrderStatusUpdateSmsInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueDropLaunchEmailInput = {
	dropId: string;
	waitlistEntryId: string;
	recipientUserId?: string | null;
	payload: DropLaunchOutboxEmailInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type EnqueueDropLaunchSmsInput = {
	dropId: string;
	waitlistEntryId: string;
	recipientUserId?: string | null;
	payload: DropLaunchOutboxSmsInput;
	metadata?: Record<string, unknown> | null;
	maxAttempts?: number;
	nextAttemptAt?: Date;
	now?: Date;
};

export type GetNotificationOutboxInput = {
	id: string;
};

export type ListNotificationOutboxInput = {
	status?: NotificationOutboxStatus;
	type?: NotificationOutboxType;
	channel?: NotificationChannel;
	recipientUserId?: string | null;
	aggregateType?: NotificationAggregateType;
	aggregateId?: string | null;
	query?: string | null;
	limit?: number;
	offset?: number;
};

export type NotificationOutboxListResult = {
	items: NotificationOutboxDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type NotificationOutboxSummaryInput = Omit<
	ListNotificationOutboxInput,
	'status' | 'query' | 'limit' | 'offset'
> & {
	now?: Date;
};

export type NotificationOutboxSummaryDTO = {
	total: number;
	byStatus: Record<NotificationOutboxStatus, number>;
	dueCount: number;
	lockedCount: number;
	exhaustedFailedCount: number;
};

export type ClaimNotificationInput =
	| {
			outboxId: string;
			idempotencyKey?: never;
			workerId?: string;
			lockTimeoutMs?: number;
			now?: Date;
	  }
	| {
			outboxId?: never;
			idempotencyKey: string;
			workerId?: string;
			lockTimeoutMs?: number;
			now?: Date;
	  };

export type ClaimPendingNotificationsInput = {
	limit?: number;
	workerId?: string;
	lockTimeoutMs?: number;
	now?: Date;
};

export type MarkNotificationSentInput = {
	id: string;
	lockToken: string;
	provider: string;
	providerMessageId?: string | null;
	sentAt?: Date;
};

export type MarkNotificationFailedInput = {
	id: string;
	lockToken: string;
	error: string;
	retryable?: boolean;
	now?: Date;
};

export type ReleaseStaleNotificationLocksInput = {
	limit?: number;
	olderThanMs?: number;
	now?: Date;
};

export type ReleaseStaleNotificationLocksResult = {
	releasedCount: number;
	notificationIds: string[];
};

export type CancelNotificationInput = {
	id: string;
	reason?: string | null;
	now?: Date;
};

export type NotificationDispatchResult = {
	id: string;
	outcome: 'sent' | 'failed' | 'skipped' | 'invalid';
	message?: string;
};

export type NotificationQueueBatchResult = {
	queue: string;
	processedCount: number;
	results: NotificationDispatchResult[];
};

export type NotificationCronProcessResult = {
	releasedCount: number;
	claimedCount: number;
	results: NotificationDispatchResult[];
};

export type NotificationOutboxRowLike = Pick<NotificationOutbox, 'id' | 'idempotencyKey'>;
