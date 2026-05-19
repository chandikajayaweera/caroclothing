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

		return {
			products,
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
