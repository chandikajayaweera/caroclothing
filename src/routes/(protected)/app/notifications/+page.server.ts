import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	listNotificationOutbox,
	getNotificationOutboxSummary,
	cancelNotification
} from '$lib/server/modules/notifications/outbox';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { ServiceContext } from '$lib/server/foundation/context';
import type {
	NotificationOutboxStatus,
	NotificationOutboxType,
	NotificationChannel
} from '$lib/server/modules/notifications/outbox/outbox.drizzle';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationQueue: platform?.env?.NOTIFICATION_QUEUE ?? null
	};
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);

	const status = (url.searchParams.get('status') || undefined) as
		| NotificationOutboxStatus
		| undefined;
	const type = (url.searchParams.get('type') || undefined) as NotificationOutboxType | undefined;
	const channel = (url.searchParams.get('channel') || undefined) as NotificationChannel | undefined;
	const query = url.searchParams.get('query') || undefined;
	const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 25;
	const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : 0;

	try {
		const [logs, summary] = await Promise.all([
			listNotificationOutbox(ctx, {
				status,
				type,
				channel,
				query,
				limit,
				offset
			}),
			getNotificationOutboxSummary(ctx, {
				type,
				channel
			})
		]);

		return {
			logs,
			summary,
			filters: {
				status,
				type,
				channel,
				query,
				limit,
				offset
			}
		};
	} catch (err) {
		throw throwHttpFromAppError(err);
	}
};

export const actions: Actions = {
	cancel: async ({ request, locals, platform }) => {
		const ctx = getAdminContext(locals, platform);
		const data = await request.formData();
		const id = data.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Notification ID is required.' });
		}

		try {
			await cancelNotification(ctx, {
				id,
				reason: 'Cancelled via Admin Dashboard'
			});
			return { success: true, message: 'Notification cancelled successfully.' };
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'Failed to cancel notification.'
			});
		}
	}
};
