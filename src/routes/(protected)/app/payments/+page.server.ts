import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';
import {
	listPayments,
	recordPayment,
	recordRefund,
	payment as paymentTable
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
import type { ServiceContext } from '$lib/server/foundation/context';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationQueue: platform?.env?.NOTIFICATION_QUEUE ?? null
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
	const db = getDb();

	try {
		const [payments, statsResult, recordPaymentForm, recordRefundForm] = await Promise.all([
			listPayments(ctx, options),
			db
				.select({
					totalVolume: sql<number>`sum(amount)`,
					totalCaptured: sql<number>`sum(case when status = 'captured' then amount else 0 end)`,
					totalPending: sql<number>`sum(case when status = 'pending' then amount else 0 end)`,
					totalRefunded: sql<number>`sum(case when status = 'refunded' or status = 'partially_refunded' then coalesce(refund_amount, 0) else 0 end)`
				})
				.from(paymentTable),
			superValidate(zod4(recordPaymentFormSchema), {
				id: 'recordPayment'
			}),
			superValidate(zod4(recordRefundFormSchema), {
				id: 'recordRefund'
			})
		]);

		const rawStats = statsResult[0] || {
			totalVolume: 0,
			totalCaptured: 0,
			totalPending: 0,
			totalRefunded: 0
		};
		const stats = {
			totalVolume: Number(rawStats.totalVolume ?? 0),
			totalCaptured: Number(rawStats.totalCaptured ?? 0),
			totalPending: Number(rawStats.totalPending ?? 0),
			totalRefunded: Number(rawStats.totalRefunded ?? 0)
		};

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
