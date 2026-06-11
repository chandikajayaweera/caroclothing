import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { capturePayPalReturn } from '$lib/server/modules/payments';

export const GET: RequestHandler = async ({ url, platform }) => {
	const paypalOrderId = url.searchParams.get('token');
	const payerId = url.searchParams.get('PayerID');
	const fallbackOrderId = url.searchParams.get('orderId');

	if (!paypalOrderId) {
		throw redirect(303, '/account/orders?payment=failed');
	}

	try {
		const result = await capturePayPalReturn(
			{
				actor: { id: 'system:paypal-return', role: 'adminUser' },
				notificationQueue: platform?.env?.NOTIFICATION_QUEUE ?? null
			},
			{ paypalOrderId, payerId }
		);
		if (!result.orderId) {
			throw new Error('PayPal capture did not return an order ID.');
		}
		throw redirect(303, `/checkout/confirmation/${result.orderId}?payment=completed`);
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error && 'location' in error) {
			throw error;
		}
		console.error('[payments] PayPal return failed:', {
			paypalOrderId,
			error
		});
		const destination = fallbackOrderId
			? `/checkout/confirmation/${encodeURIComponent(fallbackOrderId)}?payment=failed`
			: '/account/orders?payment=failed';
		throw redirect(303, destination);
	}
};
