import type { PageServerLoad, Actions } from './$types';
import { clearWishlist, listWishlist, removeFromWishlist } from '$lib/server/modules/wishlist';
import { listProductsByIds, type ProductVariantDTO } from '$lib/server/modules/products';
import { getInventoryAvailabilityByVariantIds } from '$lib/server/modules/inventory';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from '../_account.server';

export const load: PageServerLoad = async (event) => {
	const ctx = requireAccountContext(event);

	try {
		const wishlist = await listWishlist(ctx, { limit: 50 });

		// Fetch variants for all products in wishlist
		const uniqueProductIds = [...new Set(wishlist.items.map((item) => item.productId))];
		const productVariantsMap = new Map<string, ProductVariantDTO[]>();
		const products = await listProductsByIds(ctx, { productIds: uniqueProductIds });
		for (const product of products) {
			productVariantsMap.set(product.id, product.variants);
		}

		// Collect all variant IDs we need inventory for
		const variantIdsToQuery: string[] = [];
		for (const item of wishlist.items) {
			if (item.variantId) {
				variantIdsToQuery.push(item.variantId);
			} else {
				const vars = productVariantsMap.get(item.productId) || [];
				variantIdsToQuery.push(...vars.map((v) => v.id));
			}
		}

		const availability =
			variantIdsToQuery.length > 0
				? await getInventoryAvailabilityByVariantIds(ctx, { variantIds: variantIdsToQuery })
				: [];
		const availabilityMap = new Map(availability.map((a) => [a.variantId, a]));

		// Compute stockStatus for each wishlist item
		const mappedItems = wishlist.items.map((item) => {
			let totalStock = 0;
			let trackAny = false;
			let hasAvailable = false;

			const vars = item.variantId
				? item.variant
					? [item.variant]
					: []
				: productVariantsMap.get(item.productId) || [];

			for (const v of vars) {
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
				...item,
				stockStatus,
				totalStock,
				hasAvailable
			};
		});

		const wishlistWithStock = {
			...wishlist,
			items: mappedItems
		};

		return { wishlist: wishlistWithStock };
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	remove: async (event) => {
		const ctx = requireAccountContext(event);
		const formData = await event.request.formData();
		const productId = formData.get('productId') as string;
		const variantId = (formData.get('variantId') as string) || null;

		try {
			await removeFromWishlist(ctx, { productId, variantId });
			return { success: true };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},

	clear: async (event) => {
		const ctx = requireAccountContext(event);

		try {
			await clearWishlist(ctx);
			return { success: true, message: 'Wishlist cleared.' };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
