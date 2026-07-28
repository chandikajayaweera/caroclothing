import type { LayoutServerLoad } from './$types';
import { getBag, mergeGuestBagIntoUserBag } from '$lib/server/modules/bag/bag.service';
import { listWishlistProductIds } from '$lib/server/modules/wishlist';
import { getErrorMessage, isAppError } from '$lib/server/infrastructure/errors';

export const load: LayoutServerLoad = async ({ locals, cookies, url, untrack }) => {
	const actor = locals.user
		? {
				id: locals.user.id,
				role: locals.user.role,
				isAnonymous: locals.user.isAnonymous
			}
		: null;

	const ctx = { actor };
	const pathname = untrack(() => url.pathname);

	if (isAppPathname(pathname)) {
		void url.pathname;
		return {
			user: locals.user,
			session: locals.session,
			bag: null,
			wishlistProductIds: []
		};
	}

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
		const [bag, wishlistProductIds] = await Promise.all([
			loadGlobalBag(ctx),
			!actor.isAnonymous ? loadGlobalWishlistProductIds(ctx) : Promise.resolve([])
		]);

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

async function loadGlobalWishlistProductIds(ctx: Parameters<typeof listWishlistProductIds>[0]) {
	return listWishlistProductIds(ctx, { limit: 100 });
}

function isAppPathname(pathname: string): boolean {
	return pathname === '/app' || pathname.startsWith('/app/');
}
