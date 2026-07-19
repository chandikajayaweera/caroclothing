import type { PageServerLoad } from './$types';
import { listWishlistSignals, listUserWishlist } from '$lib/server/modules/wishlist';
import { listUsers } from '$lib/server/modules/auth';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { ServiceContext } from '$lib/server/foundation/context';
import type { WishlistSignalAlertStatus } from '$lib/server/modules/wishlist';

function getAdminContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user };
}

function getAlertLevel(value: string | null): WishlistSignalAlertStatus | undefined {
	return value === 'high' || value === 'watch' || value === 'normal' ? value : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);

	const tab = url.searchParams.get('tab') === 'users' ? 'users' : 'signals';

	// Standard filters
	const query = url.searchParams.get('query')?.trim() || '';
	const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 25));
	const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

	const alertLevel = getAlertLevel(url.searchParams.get('alertLevel'));
	const includeUnavailable = url.searchParams.get('includeUnavailable') === 'true';
	const userId = url.searchParams.get('userId')?.trim() || '';

	try {
		// Fetch only the requested page; aggregate statistics are calculated in D1.
		const signals =
			tab === 'signals'
				? await listWishlistSignals(ctx, {
						productId: query || undefined,
						includeUnavailable,
						alertLevel,
						limit,
						offset
					})
				: {
						items: [],
						total: 0,
						limit,
						offset,
						stats: { totalSaves: 0, totalSignals: 0, highRiskVariants: 0 }
					};

		// 2. Fetch Users (if search query is active on users tab)
		let searchedUsers: import('$lib/server/modules/auth').UserListResult = {
			items: [],
			total: 0,
			limit: 10,
			offset: 0
		};
		if (tab === 'users' && query) {
			searchedUsers = await listUsers(ctx, {
				query,
				limit: 10
			});
		}

		// 3. Fetch User specific wishlist
		let userWishlist = null;
		if (tab === 'users' && userId) {
			userWishlist = await listUserWishlist(ctx, {
				userId,
				includeUnavailable: true,
				limit,
				offset
			});
		}

		return {
			tab,
			signals,
			searchedUsers,
			userWishlist,
			stats: signals.stats,
			filters: {
				query,
				limit,
				offset,
				includeUnavailable,
				alertLevel: alertLevel ?? 'all',
				userId
			}
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
