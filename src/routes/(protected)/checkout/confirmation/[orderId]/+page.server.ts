import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getOrder } from '$lib/server/modules/orders';
import { getCheckoutCustomer } from '$lib/server/modules/auth';
import {
	failFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	createPaymentSession,
	listAvailableCheckoutPaymentMethods,
	validateCheckoutPaymentSelection
} from '$lib/server/modules/payments';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';

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
		const [order, customer] = await Promise.all([
			getOrder(ctx, {
				lookup: { id: params.orderId },
				includeItems: true,
				includePayments: true,
				includeStatusHistory: false
			}),
			getCheckoutCustomer(ctx)
		]);

		return {
			order,
			customer,
			paymentMethods: listAvailableCheckoutPaymentMethods(ctx),
			paymentNotice: url.searchParams.get('payment'),
			serverNow: new Date()
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

const onlinePaymentMethods = new Set(['payhere', 'paypal']);

export const actions: Actions = {
	retryPayment: async ({ locals, params, url, request, platform }) => {
		const ctx = {
			...requireProtectedContext(locals, url),
			notificationWakeups: createCloudflareNotificationWakeups(platform)
		};

		try {
			const order = await getOrder(ctx, {
				lookup: { id: params.orderId },
				includeItems: false,
				includePayments: true,
				includeStatusHistory: false
			});
			const payment = order.payments?.find(
				(candidate) =>
					(candidate.status === 'pending' || candidate.status === 'failed') &&
					onlinePaymentMethods.has(candidate.method)
			);

			if (!payment) {
				return fail(409, { message: 'This order has no online payment waiting to be completed.' });
			}

			const formData = await request.formData();
			const selection = await validateCheckoutPaymentSelection(ctx, {
				method: payment.method,
				billingEmail:
					typeof formData.get('billingEmail') === 'string'
						? String(formData.get('billingEmail'))
						: null
			});
			const paymentSession = await createPaymentSession(ctx, {
				orderId: order.id,
				method: selection.method,
				billingEmail: selection.billingEmail
			});

			return { success: true, paymentSession };
		} catch (error) {
			return failFromAppError(error);
		}
	}
};
