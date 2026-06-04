import type { LayoutServerLoad } from './$types';
import { getOrCreateCart, mergeGuestCartIntoUserCart } from '$lib/server/modules/cart/cart.service';
import { listWishlist } from '$lib/server/modules/wishlist';
import { nanoid } from 'nanoid';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const actor = locals.user
		? {
				id: locals.user.id,
				role: locals.user.role,
				isAnonymous: locals.user.isAnonymous
			}
		: null;

	const ctx = { actor };

	let sessionToken = cookies.get('cart_session_token');
	let wishlistProductIds: string[] = [];

	if (actor) {
		if (sessionToken) {
			try {
				await mergeGuestCartIntoUserCart(ctx, { sessionToken });
			} catch (err) {
				console.error('Failed to merge guest cart into user cart:', err);
			}
			cookies.delete('cart_session_token', { path: '/' });
		}
		const [cart, wishlistRes] = await Promise.all([
			getOrCreateCart(ctx),
			!actor.isAnonymous ? listWishlist(ctx, { limit: 100 }) : Promise.resolve({ items: [] })
		]);
		wishlistProductIds = wishlistRes.items.map((item) => item.productId);

		return {
			user: locals.user,
			session: locals.session,
			cart,
			wishlistProductIds
		};
	} else {
		if (!sessionToken) {
			sessionToken = nanoid(32);
			cookies.set('cart_session_token', sessionToken, {
				path: '/',
				maxAge: 7 * 24 * 60 * 60, // 7 days
				httpOnly: true,
				sameSite: 'lax',
				secure: true
			});
		}
		const cart = await getOrCreateCart(ctx, { sessionToken });
		return {
			user: null,
			session: null,
			cart,
			wishlistProductIds
		};
	}
};

