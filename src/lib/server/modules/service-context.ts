import type { RequestEvent } from '@sveltejs/kit';
import type { UserRole } from '$lib/shared/modules/access-control';

export type ServiceActor = {
	id: string;
	role: UserRole | string | null;
	isAnonymous?: boolean | null;
};

export type SystemActor = {
	id: `system:${string}`;
	role: 'adminUser';
};

export type ServiceContext = {
	actor?: ServiceActor | SystemActor | null;
	event?: Pick<RequestEvent, 'platform'>;
	now?: Date;
	requestId?: string;
};
