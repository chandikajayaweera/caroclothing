import type { RequestEvent } from '@sveltejs/kit';
import type { UserRole } from '$lib/shared/auth/access-control';

export type ServiceActor = {
	id: string;
	role: UserRole | string | null;
	isAnonymous?: boolean | null;
};

export type SystemActor = {
	id: `system:${string}`;
	role: 'adminUser';
};

export type NotificationWakeupMessage = {
	outboxId: string;
	idempotencyKey: string;
};

export type NotificationWakeupPublisher = {
	publish(messages: NotificationWakeupMessage[]): Promise<void>;
};

export type ServiceContext = {
	actor?: ServiceActor | SystemActor | null;
	event?: Pick<RequestEvent, 'platform'>;
	notificationWakeups?: NotificationWakeupPublisher | null;
	now?: Date;
	requestId?: string;
};
