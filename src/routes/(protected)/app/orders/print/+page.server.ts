import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import type { ServiceContext } from '$lib/server/foundation/context';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

export const load: PageServerLoad = async ({ url, locals, platform }) => {
	const ctx = getAdminContext(locals, platform);
	const orderIdsString = url.searchParams.get('orderIds') || '';
	const orderIds = [
		...new Set(
			orderIdsString
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean)
		)
	];

	if (orderIds.length === 0) {
		throw error(400, 'No orderIds provided for printing.');
	}
	if (orderIds.length > 50) {
		throw error(400, 'A maximum of 50 orders can be printed at once.');
	}

	try {
		const orders = [];
		for (const id of orderIds) {
			orders.push(
				await getOrder(ctx, {
					lookup: { id },
					includeItems: true,
					includePayments: false,
					includeStatusHistory: false
				})
			);
		}

		return {
			orders
		};
	} catch (err) {
		throwHttpFromAppError(err);
	}
};
