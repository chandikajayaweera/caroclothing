import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	cancelExpiredPendingOrders,
	cancelExpiredPendingOrdersFormSchema,
	cancelOrder,
	cancelOrderFormSchema,
	listOrders,
	listOrdersFormSchema,
	recordPayment,
	recordPaymentFormSchema,
	recordRefund,
	recordRefundFormSchema,
	transitionOrderStatus,
	transitionOrderStatusFormSchema,
	updateOrderFulfillment,
	updateOrderFulfillmentFormSchema,
	getOrderAnalytics,
	bulkTransitionOrderStatus,
	bulkTransitionOrderStatusFormSchema
} from '$lib/server/modules/orders';
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

function getListOptions(url: URL) {
	const orderIdsParam = url.searchParams.get('orderIds');
	const orderIds = orderIdsParam
		? orderIdsParam
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean)
		: undefined;

	const result = listOrdersFormSchema.safeParse({
		status: url.searchParams.get('status') || undefined,
		query: url.searchParams.get('query') || undefined,
		userId: url.searchParams.get('userId') || undefined,
		paymentExpiredOnly: url.searchParams.get('paymentExpiredOnly') === 'true' || undefined,
		limit: url.searchParams.get('limit') || undefined,
		offset: url.searchParams.get('offset') || undefined
	});

	const data = result.success ? result.data : {};
	return {
		...data,
		orderIds
	};
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const orderOptions = getListOptions(url);

	try {
		const [
			orders,
			analytics,
			transitionStatusForm,
			cancelOrderForm,
			updateFulfillmentForm,
			recordPaymentForm,
			recordRefundForm,
			cancelExpiredForm,
			bulkTransitionForm
		] = await Promise.all([
			listOrders(ctx, orderOptions),
			getOrderAnalytics(ctx),
			superValidate(zod4(transitionOrderStatusFormSchema), {
				id: 'transitionOrderStatus'
			}),
			superValidate(zod4(cancelOrderFormSchema), {
				id: 'cancelOrder'
			}),
			superValidate(zod4(updateOrderFulfillmentFormSchema), {
				id: 'updateOrderFulfillment'
			}),
			superValidate(zod4(recordPaymentFormSchema), {
				id: 'recordPayment'
			}),
			superValidate(zod4(recordRefundFormSchema), {
				id: 'recordRefund'
			}),
			superValidate(zod4(cancelExpiredPendingOrdersFormSchema), {
				id: 'cancelExpiredPendingOrders'
			}),
			superValidate(zod4(bulkTransitionOrderStatusFormSchema), {
				id: 'bulkTransitionOrderStatus'
			})
		]);

		return {
			orders,
			analytics,
			filters: {
				status: url.searchParams.get('status') ?? '',
				query: url.searchParams.get('query')?.trim() ?? '',
				userId: url.searchParams.get('userId')?.trim() ?? '',
				paymentExpiredOnly: url.searchParams.get('paymentExpiredOnly') === 'true',
				limit: orders.limit,
				offset: orders.offset
			},
			transitionStatusForm,
			cancelOrderForm,
			updateFulfillmentForm,
			recordPaymentForm,
			recordRefundForm,
			cancelExpiredForm,
			bulkTransitionForm
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
			await transitionOrderStatus(ctx, form.data);
			return message(form, 'Order status updated.');
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
	},

	cancelExpired: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(cancelExpiredPendingOrdersFormSchema), {
			id: 'cancelExpiredPendingOrders'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const result = await cancelExpiredPendingOrders(ctx, { limit: form.data.limit });
			return message(form, `Cancelled ${result.cancelledCount} expired pending orders.`);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	bulkTransition: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(bulkTransitionOrderStatusFormSchema), {
			id: 'bulkTransitionOrderStatus'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const splitIds = form.data.orderIds
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
			const result = await bulkTransitionOrderStatus(ctx, {
				orderIds: splitIds,
				toStatus: form.data.toStatus,
				note: form.data.note ?? undefined
			});
			return message(
				form,
				`Successfully transitioned ${result.successCount} orders. Failed: ${result.failureCount}.`
			);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
