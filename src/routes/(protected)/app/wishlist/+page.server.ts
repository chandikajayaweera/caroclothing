import type { PageServerLoad } from './$types';
import { listWishlistSignals, listUserWishlist } from '$lib/server/modules/wishlist';
import { listUsers } from '$lib/server/modules/auth';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { ServiceContext } from '$lib/server/foundation/context';

function getAdminContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);

	const tab = url.searchParams.get('tab') === 'users' ? 'users' : 'signals';

	// Standard filters
	const query = url.searchParams.get('query')?.trim() || '';
	const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 25));
	const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

	const alertLevel = url.searchParams.get('alertLevel')?.trim() || 'all';
	const includeUnavailable = url.searchParams.get('includeUnavailable') === 'true';
	const userId = url.searchParams.get('userId')?.trim() || '';

	try {
		// 1. Fetch Signals (always fetch to compute global stats)
		const signals = await listWishlistSignals(ctx, {
			productId: tab === 'signals' && query ? query : undefined,
			includeUnavailable: tab === 'signals' ? includeUnavailable : true,
			limit: 1000,
			offset: 0
		});

		// Compute stock alert level for each signal item and inject unique id
		const itemsWithAlert = signals.items.map((item) => {
			let alertStatus: 'high' | 'watch' | 'normal' = 'normal';
			if (item.variant && item.variant.trackInventory) {
				const stock = item.variant.inventoryQuantity ?? 0;
				const saves = item.saveCount;
				if (stock <= 5 && saves > stock) {
					alertStatus = 'high';
				} else if (stock <= 15 && saves > stock * 0.5) {
					alertStatus = 'watch';
				}
			}
			return {
				...item,
				id: item.variantId ? `${item.productId}:${item.variantId}` : item.productId,
				alertStatus
			};
		});

		// Calculate stats over the entire list of signals
		const totalUniqueSaves = itemsWithAlert.length;
		const totalSavesCount = itemsWithAlert.reduce((sum, item) => sum + item.saveCount, 0);
		const totalHighRiskCount = itemsWithAlert.filter((item) => item.alertStatus === 'high').length;

		const stats = {
			total: totalSavesCount,
			active: totalUniqueSaves,
			inactive: totalHighRiskCount
		};

		// Filter signals if tab is signals
		let filteredSignals = itemsWithAlert;
		if (tab === 'signals') {
			if (alertLevel && alertLevel !== 'all') {
				filteredSignals = itemsWithAlert.filter((item) => item.alertStatus === alertLevel);
			}
		}

		const paginatedSignals = {
			items: tab === 'signals' ? filteredSignals.slice(offset, offset + limit) : [],
			total: filteredSignals.length,
			limit,
			offset
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
			signals: paginatedSignals,
			searchedUsers,
			userWishlist,
			stats,
			filters: {
				query,
				limit,
				offset,
				includeUnavailable,
				alertLevel,
				userId
			}
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
