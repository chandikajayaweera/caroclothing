import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { listProducts } from '$lib/server/modules/products';
import { listDrops, joinDropWaitlist, joinDropWaitlistFormSchema } from '$lib/server/modules/drops';
import { listRecentApprovedReviews } from '$lib/server/modules/reviews';
import { getInventoryAvailabilityByVariantIds } from '$lib/server/modules/inventory';
import {
	throwHttpFromAppError,
	failFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({
		'cache-control': 'public, max-age=10, s-maxage=60, stale-while-revalidate=300'
	});

	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };

	try {
		const [productsResult, teaserDropsResult, liveDropsResult, reviewsResult] =
			await Promise.all([
				listProducts(ctx, { isNewArrival: true, limit: 8, includeInactive: false }),
				listDrops(ctx, { status: 'teaser', limit: 1, includeArchived: false }),
				listDrops(ctx, { status: 'live', limit: 1, includeArchived: false }),
				listRecentApprovedReviews({ limit: 6 })
			]);

		const featuredDrop = teaserDropsResult.items[0] || liveDropsResult.items[0] || null;
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

		const mapStockStatus = (p: any) => {
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
			featuredDrop,
			recentReviews: reviewsResult.items,
			featuredProduct: mappedFeaturedProduct
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	joinWaitlist: async ({ request, locals }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const formData = await request.formData();
		const contact = String(formData.get('contact') ?? '').trim();
		const result = joinDropWaitlistFormSchema.safeParse({
			dropId: formData.get('dropId'),
			contact,
			contactType: contact.includes('@') ? 'email' : 'phone'
		});

		if (!result.success) {
			return fail(400, {
				success: false,
				message: 'Use an email or +94 phone number.'
			});
		}

		try {
			await joinDropWaitlist(ctx, result.data);
			return { success: true, message: 'Drop alert locked.' };
		} catch (error) {
			return failFromAppError(error);
		}
	}
};
