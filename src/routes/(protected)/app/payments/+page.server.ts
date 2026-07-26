import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	getPaymentDashboardSummary,
	listPayments,
	recordPayment,
	recordRefund
} from '$lib/server/modules/payments';
import {
	recordPaymentFormSchema,
	recordRefundFormSchema,
	listPaymentsFormSchema
} from '$lib/server/modules/orders/orders.forms';
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
	const query = url.searchParams.get('query') || url.searchParams.get('orderId') || undefined;
	const result = listPaymentsFormSchema.safeParse({
		orderId: query,
		status: url.searchParams.get('status') || undefined,
		method: url.searchParams.get('method') || undefined,
		limit: url.searchParams.get('limit') || undefined,
		offset: url.searchParams.get('offset') || undefined
	});

	return result.success ? result.data : {};
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const options = getListOptions(url);

	try {
		const payments = await listPayments(ctx, options);
		const stats = await getPaymentDashboardSummary(ctx);
		const [recordPaymentForm, recordRefundForm] = await Promise.all([
			superValidate(zod4(recordPaymentFormSchema), { id: 'recordPayment' }),
			superValidate(zod4(recordRefundFormSchema), { id: 'recordRefund' })
		]);

		const query = url.searchParams.get('query') || url.searchParams.get('orderId') || '';

		return {
			payments,
			stats,
			filters: {
				query: query.trim(),
				status: url.searchParams.get('status') ?? '',
				method: url.searchParams.get('method') ?? '',
				limit: payments.limit,
				offset: payments.offset
			},
			recordPaymentForm,
			recordRefundForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	recordPayment: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(recordPaymentFormSchema), {
			id: 'recordPayment'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await recordPayment(ctx, form.data);
			return message(form, 'Payment successfully recorded.');
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
			return message(form, 'Refund successfully recorded.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
