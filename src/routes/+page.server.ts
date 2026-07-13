import type { PageServerLoad } from './$types';
import { listProducts } from '$lib/server/modules/products';
import { listRecentApprovedReviews } from '$lib/server/modules/reviews';
import { getInventoryAvailabilityByVariantIds } from '$lib/server/modules/inventory';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { ProductDTO } from '$lib/server/modules/products/products.types';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };

	try {
		const [productsResult, reviewsResult] = await Promise.all([
			listProducts(ctx, { isNewArrival: true, limit: 8, includeInactive: false }),
			listRecentApprovedReviews({ limit: 6 })
		]);

		const featuredProduct = productsResult.items[0] || null;

		// Map stock status to new arrivals + featured product
		const allProducts = [...productsResult.items];
		if (featuredProduct && !allProducts.some((p) => p.id === featuredProduct.id)) {
			allProducts.push(featuredProduct);
		}

		const variantIds = allProducts.flatMap((p) => p.variants.map((v) => v.id));
		const availability =
			variantIds.length > 0 ? await getInventoryAvailabilityByVariantIds(ctx, { variantIds }) : [];
		const availabilityMap = new Map(availability.map((a) => [a.variantId, a]));

		const mapStockStatus = (p: ProductDTO) => {
			let totalStock = 0;
			let trackAny = false;
			let hasAvailable = false;

			for (const v of p.variants) {
				const stock = availabilityMap.get(v.id);
				if (stock) {
					if (stock.trackInventory) {
						trackAny = true;
						totalStock += stock.availableQuantity;
						if (stock.availableQuantity > 0) {
							hasAvailable = true;
						}
					} else {
						hasAvailable = true;
					}
				}
			}

			let stockStatus: 'available' | 'low-stock' | 'sold-out' = 'available';
			if (trackAny) {
				if (totalStock === 0) {
					stockStatus = 'sold-out';
				} else if (totalStock < 5) {
					stockStatus = 'low-stock';
				}
			} else {
				hasAvailable = true;
			}

			return {
				...p,
				stockStatus,
				totalStock,
				hasAvailable
			};
		};

		const newArrivals = productsResult.items.map(mapStockStatus);
		const mappedFeaturedProduct = featuredProduct ? mapStockStatus(featuredProduct) : null;

		return {
			newArrivals,
			recentReviews: reviewsResult.items,
			featuredProduct: mappedFeaturedProduct
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
