import type { PageServerLoad, Actions } from './$types';
import { getDrop, joinDropWaitlist } from '$lib/server/modules/drops';
import { getInventoryAvailabilityByVariantIds } from '$lib/server/modules/inventory';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = { actor: locals.user ?? null };

	try {
		const drop = await getDrop(ctx, { slug: params.slug });

		// Map stock/availability status to drop products
		const productsToMap = drop.products
			.map((p) => p.product)
			.filter((p): p is NonNullable<typeof p> => p !== null);
		const variantIds = productsToMap.flatMap((p) => p.variants.map((v) => v.id));
		const availability = variantIds.length > 0
			? await getInventoryAvailabilityByVariantIds(ctx, { variantIds })
			: [];
		const availabilityMap = new Map(availability.map((a) => [a.variantId, a]));

		for (const dp of drop.products) {
			if (dp.product) {
				let totalStock = 0;
				let trackAny = false;
				let hasAvailable = false;

				for (const v of dp.product.variants) {
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

				(dp.product as any).stockStatus = stockStatus;
				(dp.product as any).totalStock = totalStock;
				(dp.product as any).hasAvailable = hasAvailable;
			}
		}

		return {
			drop
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};


export const actions: Actions = {
	joinWaitlist: async ({ request, locals }) => {
		const ctx = { actor: locals.user ?? null };
		const formData = await request.formData();
		const dropId = formData.get('dropId') as string;
		const contact = (formData.get('contact') as string || '').trim();

		if (!contact) {
			return { success: false, message: 'Contact details are required' };
		}

		const contactType = contact.includes('@') ? 'email' : 'phone';

		try {
			await joinDropWaitlist(ctx, {
				dropId,
				contact,
				contactType
			});
			return { success: true, message: 'You have joined the waitlist!' };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
