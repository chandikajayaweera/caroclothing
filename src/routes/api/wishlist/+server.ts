import { json, type RequestHandler } from '@sveltejs/kit';
import { addToWishlist, removeFromWishlist, listWishlist } from '$lib/server/modules/wishlist';
import { listProductsByIds } from '$lib/server/modules/products';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

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
		const ids = [
			...new Set(
				idsParam
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			)
		].slice(0, 100);

		if (ids.length === 0) {
			return json({ items: [] });
		}

		const products = await listProductsByIds(ctx, { productIds: ids });
		const items = products.map((product) => ({
			id: product.id,
			productId: product.id,
			variantId: null,
			product: {
				id: product.id,
				name: product.name,
				slug: product.slug,
				basePrice: product.basePrice,
				compareAtPrice: product.compareAtPrice,
				imageUrl: product.primaryImageUrl || product.images[0]?.imageUrl || null
			},
			imageUrl: product.primaryImageUrl || product.images[0]?.imageUrl || null,
			effectivePrice: product.basePrice,
			isAvailable: product.isActive
		}));
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
