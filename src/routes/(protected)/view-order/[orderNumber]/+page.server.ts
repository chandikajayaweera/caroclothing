import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const order = await getOrder(
			{ actor: locals.user },
			{
				lookup: { orderNumber: params.orderNumber },
				includeItems: false,
				includePayments: false,
				includeStatusHistory: false
			}
		);

		throw redirect(302, `/account/orders/${order.id}`);
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
