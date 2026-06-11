import type { PageServerLoad } from './$types';
import { listMyOrders, listMyOrdersFormSchema } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from '../_account.server';

function getListOptions(url: URL) {
	const result = listMyOrdersFormSchema.safeParse({
		status: url.searchParams.get('status') || undefined,
		limit: url.searchParams.get('limit') || undefined,
		offset: url.searchParams.get('offset') || undefined
	});

	return result.success ? result.data : {};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = requireAccountContext(locals, url);

	try {
		const orders = await listMyOrders(ctx, getListOptions(url));

		return {
			orders,
			filters: {
				status: url.searchParams.get('status') ?? '',
				limit: orders.limit,
				offset: orders.offset
			}
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
