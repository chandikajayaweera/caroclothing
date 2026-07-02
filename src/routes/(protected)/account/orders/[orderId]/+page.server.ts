import type { PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from '../../_account.server';

export const load: PageServerLoad = async (event) => {
	const ctx = requireAccountContext(event);

	try {
		const order = await getOrder(ctx, {
			lookup: { id: event.params.orderId },
			includeItems: true,
			includePayments: true,
			includeStatusHistory: true
		});

		return { order };
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
