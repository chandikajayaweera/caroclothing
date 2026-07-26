import type { LayoutServerLoad } from './$types';
import { getBag, mergeGuestBagIntoUserBag } from '$lib/server/modules/bag/bag.service';
import { listWishlist } from '$lib/server/modules/wishlist';
import { getErrorMessage, isAppError } from '$lib/server/infrastructure/errors';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const actor = locals.user
		? {
				id: locals.user.id,
				role: locals.user.role,
				isAnonymous: locals.user.isAnonymous
			}
		: null;

	const ctx = { actor };

	const sessionToken = cookies.get('bag_session_token');

	if (actor) {
		if (sessionToken) {
			const guestSessionToken = sessionToken;
			try {
				await mergeGuestBagIntoUserBag(ctx, { sessionToken: guestSessionToken });
				cookies.delete('bag_session_token', { path: '/' });
			} catch (err) {
				if (!isAppError(err) || err.statusCode >= 500) {
					console.error('[bag] Failed to merge guest bag into user bag:', {
						error: getErrorMessage(err)
					});
				}
			}
		}
		const bag = await loadGlobalBag(ctx);
		const wishlistProductIds = !actor.isAnonymous ? await loadGlobalWishlistProductIds(ctx) : [];

		return {
			user: locals.user,
			session: locals.session,
			bag,
			wishlistProductIds
		};
	} else {
		const bag = sessionToken ? await loadGlobalBag(ctx, { sessionToken }) : null;
		return {
			user: null,
			session: null,
			bag,
			wishlistProductIds: []
		};
	}
};

async function loadGlobalBag(
	ctx: Parameters<typeof getBag>[0],
	input: Parameters<typeof getBag>[1] = {}
) {
	return getBag(ctx, input);
}

async function loadGlobalWishlistProductIds(ctx: Parameters<typeof listWishlist>[0]) {
	const wishlistRes = await listWishlist(ctx, { limit: 100 });
	return wishlistRes.items.map((item) => item.productId);
}
