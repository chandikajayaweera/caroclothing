import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processPayHereWebhook } from '$lib/server/modules/payments';
import { getErrorMessage, getErrorStatusCode } from '$lib/server/infrastructure/errors';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';

export const POST: RequestHandler = async ({ request, platform }) => {
	const formData = await request.formData();
	const payload: Record<string, unknown> = {};
	for (const [key, value] of formData.entries()) {
		payload[key] = typeof value === 'string' ? value : value.name;
	}
	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});

	try {
		await processPayHereWebhook(
			{
				actor: { id: 'system:payhere-webhook', role: 'adminUser' },
				notificationWakeups: createCloudflareNotificationWakeups(platform)
			},
			{ payload, headers }
		);
		return text('OK');
	} catch (error) {
		console.error('[payments] PayHere webhook failed:', {
			error: getErrorMessage(error)
		});
		return text('ERROR', {
			status: getErrorStatusCode(error)
		});
	}
};
