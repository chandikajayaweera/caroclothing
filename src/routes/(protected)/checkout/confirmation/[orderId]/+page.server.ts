import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function requireProtectedContext(locals: App.Locals, url: URL) {
	if (!locals.user) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	return { actor: locals.user };
}

export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
	const ctx = requireProtectedContext(locals, url);
	depends('app:checkout-order-status');

	try {
		const order = await getOrder(ctx, {
			lookup: { id: params.orderId },
			includeItems: true,
			includePayments: true,
			includeStatusHistory: false
		});

		return {
			order,
			paymentNotice: url.searchParams.get('payment'),
			serverNow: new Date()
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
