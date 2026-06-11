import type { PageServerLoad } from './$types';
import {
	GENDER_TIERS,
	PRODUCT_TIERS,
	listCategories,
	listProducts,
	listProductsFormSchema,
	type GenderTier,
	type ListProductsOptions,
	type ProductTier
} from '$lib/server/modules/products';
import { getInventoryAvailabilityByVariantIds } from '$lib/server/modules/inventory';
import type { ServiceContext } from '$lib/server/foundation/context';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function getStorefrontContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user ?? null };
}

function getListOptions(url: URL): ListProductsOptions {
	const result = listProductsFormSchema.safeParse({
		categoryId: getTrimmedParam(url.searchParams.get('categoryId')),
		tier: getTierParam(url.searchParams.get('tier')),
		gender: getGenderParam(url.searchParams.get('gender')),
		isFeatured: getBooleanParam(url.searchParams.get('isFeatured')),
		isNewArrival:
			url.searchParams.get('sort') === 'new'
				? true
				: getBooleanParam(url.searchParams.get('isNewArrival')),
		includeInactive: false,
		limit: getIntegerParam(url.searchParams.get('limit')),
		offset: getIntegerParam(url.searchParams.get('offset'))
	});

	return result.success ? result.data : {};
}

function getTrimmedParam(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getTierParam(value: string | null): ProductTier | undefined {
	return PRODUCT_TIERS.includes(value as ProductTier) ? (value as ProductTier) : undefined;
}

function getGenderParam(value: string | null): GenderTier | undefined {
	return GENDER_TIERS.includes(value as GenderTier) ? (value as GenderTier) : undefined;
}

function getBooleanParam(value: string | null): boolean | undefined {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function toOption(value: string) {
	return { value, label: value };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getStorefrontContext(locals);
	const productOptions = getListOptions(url);

	try {
		const [products, categories] = await Promise.all([
			listProducts(ctx, productOptions),
			listCategories(null, { limit: 100 })
		]);

		// Map stock status to products list
		const variantIds = products.items.flatMap((p) => p.variants.map((v) => v.id));
		const availability =
			variantIds.length > 0 ? await getInventoryAvailabilityByVariantIds(ctx, { variantIds }) : [];
		const availabilityMap = new Map(availability.map((a) => [a.variantId, a]));

		const mappedItems = products.items.map((p) => {
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
		});

		const productsWithStock = {
			...products,
			items: mappedItems
		};

		return {
			products: productsWithStock,
			categories,
			tierOptions: PRODUCT_TIERS.map(toOption),
			genderOptions: GENDER_TIERS.map(toOption),
			filters: {
				categoryId: productOptions.categoryId ?? '',
				tier: productOptions.tier ?? '',
				gender: productOptions.gender ?? '',
				isFeatured:
					productOptions.isFeatured === undefined ? '' : String(productOptions.isFeatured),
				isNewArrival:
					productOptions.isNewArrival === undefined ? '' : String(productOptions.isNewArrival),
				sort: url.searchParams.get('sort') ?? '',
				limit: products.limit,
				offset: products.offset
			}
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
