import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	getOrder,
	transitionOrderStatus,
	cancelOrder,
	updateOrderFulfillment,
	transitionOrderStatusFormSchema,
	cancelOrderFormSchema,
	updateOrderFulfillmentFormSchema,
	recordPaymentFormSchema,
	recordRefundFormSchema
} from '$lib/server/modules/orders';
import { recordPayment, recordRefund } from '$lib/server/modules/payments';
import { listCarriers } from '$lib/server/modules/shipping';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import type { ServiceContext } from '$lib/server/foundation/context';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const ctx = getAdminContext(locals, platform);
	const orderId = params.orderId;

	try {
		const order = await getOrder(ctx, {
			lookup: { id: orderId },
			includeItems: true,
			includePayments: true,
			includeStatusHistory: true
		});

		const [
			carriers,
			transitionStatusForm,
			cancelOrderForm,
			updateFulfillmentForm,
			recordPaymentForm,
			recordRefundForm
		] = await Promise.all([
			listCarriers(ctx),
			superValidate({ orderId }, zod4(transitionOrderStatusFormSchema), {
				id: 'transitionOrderStatus'
			}),
			superValidate({ orderId }, zod4(cancelOrderFormSchema), {
				id: 'cancelOrder'
			}),
			superValidate(
				{
					orderId,
					trackingNumber: order.trackingNumber || '',
					trackingCarrier: order.trackingCarrier || '',
					trackingUrl: order.trackingUrl || '',
					adminNote: order.adminNote || ''
				},
				zod4(updateOrderFulfillmentFormSchema),
				{ id: 'updateOrderFulfillment' }
			),
			superValidate({ orderId }, zod4(recordPaymentFormSchema), {
				id: 'recordPayment'
			}),
			superValidate(zod4(recordRefundFormSchema), {
				id: 'recordRefund'
			})
		]);

		return {
			order,
			carriers,
			transitionStatusForm,
			cancelOrderForm,
			updateFulfillmentForm,
			recordPaymentForm,
			recordRefundForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	transitionStatus: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(transitionOrderStatusFormSchema), {
			id: 'transitionOrderStatus'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const updatedOrder = await transitionOrderStatus(ctx, form.data);
			return message(form, `Order status updated to ${updatedOrder.status}.`);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	cancel: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(cancelOrderFormSchema), {
			id: 'cancelOrder'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await cancelOrder(ctx, form.data);
			return message(form, 'Order cancelled.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateFulfillment: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(updateOrderFulfillmentFormSchema), {
			id: 'updateOrderFulfillment'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateOrderFulfillment(ctx, form.data);
			return message(form, 'Fulfillment details updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	recordPayment: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(recordPaymentFormSchema), {
			id: 'recordPayment'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await recordPayment(ctx, form.data);
			return message(form, 'Payment recorded.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	recordRefund: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(recordRefundFormSchema), {
			id: 'recordRefund'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await recordRefund(ctx, form.data);
			return message(form, 'Refund recorded.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
