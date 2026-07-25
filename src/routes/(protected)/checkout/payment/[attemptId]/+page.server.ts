import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCheckoutPaymentAttempt } from '$lib/server/modules/payments';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
	if (!locals.user) {
		throw redirect(
			302,
			`/sign-in?redirectTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`
		);
	}

	depends('app:checkout-payment-attempt');
	let attempt;
	try {
		attempt = await getCheckoutPaymentAttempt({ actor: locals.user }, params.attemptId);
	} catch (error) {
		throwHttpFromAppError(error);
	}

	if (attempt.orderId) {
		throw redirect(303, `/checkout/confirmation/${attempt.orderId}?payment=completed`);
	}

	return {
		attempt,
		paymentNotice: url.searchParams.get('payment'),
		serverNow: new Date()
	};
};
