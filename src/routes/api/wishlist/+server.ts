import { json, type RequestHandler } from '@sveltejs/kit';
import { addToWishlist, removeFromWishlist, listWishlist } from '$lib/server/modules/wishlist';
import { getProduct } from '$lib/server/modules/products';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { isAppError } from '$lib/server/infrastructure/errors';

export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };

	try {
		// 1. If user is authenticated and not anonymous, return their DB wishlist
		if (locals.user && !locals.user.isAnonymous) {
			const list = await listWishlist(ctx, { limit: 100 });
			return json({ items: list.items });
		}

		// 2. If guest, read ids from query parameter (comma-separated list of product IDs)
		const idsParam = url.searchParams.get('ids') || '';
		const ids = idsParam
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);

		if (ids.length === 0) {
			return json({ items: [] });
		}

		// Fetch details for each product using getProduct service helper
		const products = await Promise.all(
			ids.map(async (id) => {
				try {
					const prod = await getProduct(ctx, { id });
					return {
						id,
						productId: id,
						variantId: null,
						product: {
							id: prod.id,
							name: prod.name,
							slug: prod.slug,
							tier: prod.tier,
							basePrice: prod.basePrice,
							compareAtPrice: prod.compareAtPrice,
							imageUrl: prod.primaryImageUrl || prod.images?.[0]?.imageUrl || null
						},
						imageUrl: prod.primaryImageUrl || prod.images?.[0]?.imageUrl || null,
						effectivePrice: prod.basePrice,
						isAvailable: prod.isActive
					};
				} catch (err) {
					if (!isAppError(err) || err.statusCode >= 500) {
						console.error(`Failed to load product ${id} for guest wishlist:`, err);
					}
					return null;
				}
			})
		);

		const items = products.filter((p) => p !== null);
		return json({ items });
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	// Guest users can't write to DB wishlist directly (handled client-side in store)
	if (!locals.user || locals.user.isAnonymous) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const actor = {
		id: locals.user.id,
		role: locals.user.role,
		isAnonymous: locals.user.isAnonymous
	};
	const ctx = { actor };

	try {
		const body = (await request.json()) as { productId?: string; action?: string };
		const { productId, action } = body;

		if (!productId) {
			return json({ error: 'productId is required' }, { status: 400 });
		}

		if (action === 'add') {
			await addToWishlist(ctx, { productId });
		} else if (action === 'remove') {
			await removeFromWishlist(ctx, { productId });
		} else {
			return json({ error: 'Invalid action' }, { status: 400 });
		}

		return json({ success: true });
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
