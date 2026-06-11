import type { LayoutServerLoad } from './$types';
import { getOrCreateBag, mergeGuestBagIntoUserBag } from '$lib/server/modules/bag/bag.service';
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

	let sessionToken = cookies.get('bag_session_token');
	let wishlistProductIds: string[] = [];

	if (actor) {
		if (sessionToken) {
			try {
				await mergeGuestBagIntoUserBag(ctx, { sessionToken });
			} catch (err) {
				console.error('Failed to merge guest bag into user bag:', err);
			}
			cookies.delete('bag_session_token', { path: '/' });
		}
		const [bag, wishlistRes] = await Promise.all([
			getOrCreateBag(ctx),
			!actor.isAnonymous ? listWishlist(ctx, { limit: 100 }) : Promise.resolve({ items: [] })
		]);
		wishlistProductIds = wishlistRes.items.map((item) => item.productId);

		return {
			user: locals.user,
			session: locals.session,
			bag,
			wishlistProductIds
		};
	} else {
		if (!sessionToken) {
			sessionToken = nanoid(32);
			cookies.set('bag_session_token', sessionToken, {
				path: '/',
				maxAge: 7 * 24 * 60 * 60, // 7 days
				httpOnly: true,
				sameSite: 'lax',
				secure: true
			});
		}
		const bag = await getOrCreateBag(ctx, { sessionToken });
		return {
			user: null,
			session: null,
			bag,
			wishlistProductIds
		};
	}
};
