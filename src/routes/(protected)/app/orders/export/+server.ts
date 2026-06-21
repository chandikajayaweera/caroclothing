import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAllOrdersForExport, listOrdersFormSchema } from '$lib/server/modules/orders';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
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

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const orderOptions = getListOptions(url);

	try {
		const exportOrdersList = await listAllOrdersForExport(ctx, orderOptions);
		const csvHeaders = [
			'Order Number',
			'Date',
			'Status',
			'Customer ID',
			'Recipient Name',
			'Phone',
			'District',
			'City',
			'Total Amount',
			'Items Count',
			'Tracking Carrier',
			'Tracking Number'
		];

		const escapeCsv = (val: string | number | null | undefined): string => {
			if (val === null || val === undefined) return '';
			const str = String(val);
			if (/[",\n\r]/.test(str)) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			return str;
		};

		const csvRows = exportOrdersList.map((o) => {
			return [
				o.orderNumber,
				o.createdAt ? new Date(o.createdAt).toISOString() : '',
				o.status,
				o.userId ?? 'Guest',
				o.shippingAddressSnapshot?.recipientName ?? '',
				o.shippingAddressSnapshot?.phone ?? '',
				o.shippingAddressSnapshot?.district ?? '',
				o.shippingAddressSnapshot?.city ?? '',
				o.totalAmount,
				o.itemCount,
				o.trackingCarrier ?? '',
				o.trackingNumber ?? ''
			]
				.map(escapeCsv)
				.join(',');
		});

		const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="orders_export_${new Date().toISOString().slice(0, 10)}.csv"`
			}
		});
	} catch (err) {
		throwHttpFromAppError(err);
	}
};
