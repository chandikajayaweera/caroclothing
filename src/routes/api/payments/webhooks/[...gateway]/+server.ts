import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processWebhook } from '$lib/server/modules/payments';

export const POST: RequestHandler = async ({ params, request }) => {
	const gateway = params.gateway;
	let payload: Record<string, unknown> = {};

	try {
		const contentType = request.headers.get('content-type') || '';
		if (contentType.includes('application/x-www-form-urlencoded')) {
			const formData = await request.formData();
			for (const [key, value] of formData.entries()) {
				payload[key] = value;
			}
		} else {
			payload = (await request.json()) as Record<string, unknown>;
		}
	} catch {
		return json({ error: 'Invalid payload body' }, { status: 400 });
	}

	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});

	const ctx = {
		actor: { id: `system:${gateway}`, role: 'adminUser' } as const
	};

	const result = await processWebhook(ctx, {
		gateway,
		payload,
		headers
	});

	if (result.success) {
		return json({ status: 'ok' });
	} else {
		return json({ error: result.errorMessage }, { status: 400 });
	}
};

export const GET: RequestHandler = async ({ params, url }) => {
	const gateway = params.gateway;

	if (gateway === 'paypal/return') {
		const token = url.searchParams.get('token');
		const payerId = url.searchParams.get('PayerID');

		if (!token) {
			throw redirect(302, '/checkout?payment=failed&reason=Missing+token');
		}

		const ctx = {
			actor: { id: 'system:paypal-return', role: 'adminUser' } as const
		};

		const result = await processWebhook(ctx, {
			gateway: 'paypal-return',
			payload: { token, payerId },
			headers: {}
		});

		if (result.success && result.orderId) {
			throw redirect(302, `/checkout/confirmation/${result.orderId}`);
		} else {
			throw redirect(
				302,
				`/checkout?payment=failed&reason=${encodeURIComponent(result.errorMessage || 'PayPal validation failed')}`
			);
		}
	}

	return json({ error: 'Method not allowed' }, { status: 405 });
};
