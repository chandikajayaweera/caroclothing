import type { LayoutServerLoad } from './$types';
import { getBag, mergeGuestBagIntoUserBag } from '$lib/server/modules/bag/bag.service';
import { listWishlist } from '$lib/server/modules/wishlist';
import {
	isTransientDatabaseTransportError,
	withTransientDatabaseRetry
} from '$lib/server/infrastructure/errors/transient-database';
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

	if (actor) {
		if (sessionToken) {
			const guestSessionToken = sessionToken;
			try {
				await withTransientDatabaseRetry(() =>
					mergeGuestBagIntoUserBag(ctx, { sessionToken: guestSessionToken })
				);
				cookies.delete('bag_session_token', { path: '/' });
			} catch (err) {
				console.error('Failed to merge guest bag into user bag:', err);
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
		const bag = await loadGlobalBag(ctx, { sessionToken });
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
	try {
		return await withTransientDatabaseRetry(() => getBag(ctx, input));
	} catch (error) {
		if (!isGlobalLoadTransientDbError(error)) throw error;

		console.warn('Transient database error while loading global bag state.');
		return null;
	}
}

async function loadGlobalWishlistProductIds(ctx: Parameters<typeof listWishlist>[0]) {
	try {
		const wishlistRes = await withTransientDatabaseRetry(() => listWishlist(ctx, { limit: 100 }));
		return wishlistRes.items.map((item) => item.productId);
	} catch (error) {
		if (!isGlobalLoadTransientDbError(error)) throw error;

		console.warn('Transient database error while loading global wishlist state.');
		return [];
	}
}

function isGlobalLoadTransientDbError(error: unknown) {
	return isTransientDatabaseTransportError(error);
}
