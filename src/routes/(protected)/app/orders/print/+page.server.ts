import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { ServiceContext } from '$lib/server/foundation/context';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationQueue: platform?.env?.NOTIFICATION_QUEUE ?? null
	};
}

export const load: PageServerLoad = async ({ url, locals, platform }) => {
	const ctx = getAdminContext(locals, platform);
	const orderIdsString = url.searchParams.get('orderIds') || '';
	const orderIds = orderIdsString
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	if (orderIds.length === 0) {
		throw error(400, 'No orderIds provided for printing.');
	}

	try {
		const orders = await Promise.all(
			orderIds.map((id) =>
				getOrder(ctx, {
					lookup: { id },
					includeItems: true,
					includePayments: false,
					includeStatusHistory: false
				})
			)
		);

		return {
			orders
		};
	} catch (err) {
		throwHttpFromAppError(err);
	}
};
