import type { PageServerLoad } from './$types';
import { getOrderDashboard } from '$lib/server/modules/orders';
import { getProductStats } from '$lib/server/modules/products';
import { getInventorySummary, listInventory } from '$lib/server/modules/inventory';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import type { ServiceContext } from '$lib/server/foundation/context';

function getAdminContext(locals: App.Locals, platform?: App.Platform): ServiceContext {
	return {
		actor: locals.user,
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const [orderDashboard, productStats, inventorySummary, lowStockInventory] = await Promise.all([
			getOrderDashboard(ctx, { limit: 5 }),
			getProductStats(ctx),
			getInventorySummary(ctx),
			listInventory(ctx, { stockStatus: 'low', limit: 5 })
		]);
		const { orders: ordersResult, analytics } = orderDashboard;

		return {
			recentOrders: ordersResult.items,
			totalOrders: ordersResult.total,
			analytics,
			productStats,
			inventorySummary,
			lowStockItems: lowStockInventory.items
		};
	} catch (err) {
		throw throwHttpFromAppError(err);
	}
};
