import { json } from '@sveltejs/kit';
import { listShippingQuotes } from '$lib/server/modules/shipping';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { RequestHandler } from './$types';
import type { SriLankaDistrict } from '$lib/server/modules/addresses';

export const GET: RequestHandler = async ({ url }) => {
	const district = url.searchParams.get('district') as SriLankaDistrict;
	const subtotal = parseInt(url.searchParams.get('subtotal') || '0', 10);

	if (!district) {
		return json({ error: 'District is required' }, { status: 400 });
	}

	try {
		const quotes = await listShippingQuotes({ district, subtotal });
		return json(quotes);
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
