import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/modules/errors/route-adapter';

function requireAccountContext(locals: App.Locals, url: URL) {
	if (!locals.user || locals.user.isAnonymous) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	return { actor: locals.user };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const ctx = requireAccountContext(locals, url);

	try {
		const order = await getOrder(ctx, {
			lookup: { id: params.orderId },
			includeItems: true,
			includePayments: true,
			includeStatusHistory: true
		});

		return { order };
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
