import { json, type RequestHandler } from '@sveltejs/kit';
import { getStorefrontVariantAvailability } from '$lib/server/modules/bag';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const GET: RequestHandler = async ({ url }) => {
	const variantIds = [
		...new Set(url.searchParams.getAll('variantId').map((id) => id.trim()))
	].filter(Boolean);

	if (variantIds.length === 0 || variantIds.length > 20) {
		return json({ error: 'Provide between 1 and 20 variant IDs.' }, { status: 400 });
	}

	try {
		const availability = await getStorefrontVariantAvailability(
			{ actor: null },
			{
				variantIds
			}
		);
		return json(availability, {
			headers: {
				'cache-control': 'no-store, max-age=0'
			}
		});
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
