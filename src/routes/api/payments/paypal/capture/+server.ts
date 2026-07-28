import { json, type RequestHandler } from '@sveltejs/kit';
import { capturePayPalPayment } from '$lib/server/modules/payments';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import { jsonFromRouteError } from '$lib/server/infrastructure/errors/route-adapter';
import { getErrorMessage, isAppError } from '$lib/server/infrastructure/errors';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;

	try {
		const body = (await request.json()) as Record<string, unknown>;
		const paypalOrderId = typeof body.paypalOrderId === 'string' ? body.paypalOrderId : '';
		const result = await capturePayPalPayment(
			{
				actor,
				notificationWakeups: createCloudflareNotificationWakeups(platform)
			},
			{ paypalOrderId }
		);
		return json(result, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (!isAppError(error) || error.statusCode >= 500) {
			console.error('[payments] PayPal capture failed:', {
				error: getErrorMessage(error)
			});
		}
		return jsonFromRouteError(error);
	}
};
