import type { PageServerLoad, Actions } from './$types';
import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import {
	getProduct,
	listProducts,
	toPublicProductDTO,
	type PublicProductDTO
} from '$lib/server/modules/products';
import {
	createReview,
	createReviewFormSchema,
	getProductReviewSummary,
	getReviewEligibility,
	listProductReviews
} from '$lib/server/modules/reviews';
import { isWishlisted, addToWishlist, removeFromWishlist } from '$lib/server/modules/wishlist';
import {
	addBagItemFormSchema,
	addItemToBag,
	getStorefrontVariantAvailability
} from '$lib/server/modules/bag';
import {
	getInventoryAvailabilityByVariantIds,
	type InventoryAvailabilityDTO
} from '$lib/server/modules/inventory';
import { listShippingQuotes } from '$lib/server/modules/shipping';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	failFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

type StockStatus = 'available' | 'low-stock' | 'sold-out';
type ProductWithStockStatus = PublicProductDTO & {
	stockStatus: StockStatus;
	totalStock: number;
	hasAvailable: boolean;
};

function getStorefrontContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user ?? null };
}

async function withStockStatus(
	ctx: ServiceContext,
	products: PublicProductDTO[]
): Promise<ProductWithStockStatus[]> {
	const variantIds = products.flatMap((product) => product.variants.map((variant) => variant.id));
	const availability =
		variantIds.length > 0 ? await getInventoryAvailabilityByVariantIds(ctx, { variantIds }) : [];
	const availabilityMap = new Map(availability.map((row) => [row.variantId, row]));

	return products.map((product) => {
		const stock = deriveProductStockStatus(product, availabilityMap);

		return {
			...product,
			...stock
		};
	});
}

function deriveProductStockStatus(
	product: PublicProductDTO,
	availabilityMap: Map<string, InventoryAvailabilityDTO>
): { stockStatus: StockStatus; totalStock: number; hasAvailable: boolean } {
	let totalStock = 0;
	let hasTrackedStock = false;
	let hasKnownInventory = false;
	let hasAvailable = false;
	let hasBackorder = false;
	let isLowStock = false;

	for (const variant of product.variants) {
		const stock = availabilityMap.get(variant.id);
		if (!stock) continue;

		hasKnownInventory = true;

		if (!stock.trackInventory) {
			hasAvailable = true;
			continue;
		}

		hasTrackedStock = true;
		totalStock += stock.availableQuantity;
		hasBackorder ||= stock.allowBackorder;

		if (stock.availableQuantity > 0) {
			hasAvailable = true;
			isLowStock ||= stock.isLowStock;
		}
	}

	if (!hasKnownInventory) {
		return { stockStatus: 'sold-out', totalStock, hasAvailable: false };
	}

	if (!hasAvailable && !hasBackorder) {
		return { stockStatus: 'sold-out', totalStock, hasAvailable: false };
	}

	return {
		stockStatus: hasTrackedStock && isLowStock ? 'low-stock' : 'available',
		totalStock,
		hasAvailable: true
	};
}

async function loadRelatedProducts(
	ctx: ServiceContext,
	product: PublicProductDTO
): Promise<ProductWithStockStatus[]> {
	const related = await listProducts(ctx, {
		categoryId: product.categoryId ?? undefined,
		limit: 8,
		includeInactive: false
	});
	const candidates = related.items
		.map(toPublicProductDTO)
		.filter((item) => item.id !== product.id)
		.slice(0, 4);

	if (candidates.length > 0) return withStockStatus(ctx, candidates);

	const fallback = await listProducts(ctx, {
		limit: 8,
		includeInactive: false
	});

	return withStockStatus(
		ctx,
		fallback.items
			.map(toPublicProductDTO)
			.filter((item) => item.id !== product.id)
			.slice(0, 4)
	);
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = getStorefrontContext(locals);

	try {
		const product = toPublicProductDTO(await getProduct(ctx, { slug: params.slug }));
		const variantIds = product.variants.map((v) => v.id);
		const isFullUser = Boolean(locals.user && !locals.user.isAnonymous);
		const [
			reviewsSummary,
			reviews,
			availability,
			shippingQuotes,
			relatedProducts,
			isWishlistedVal,
			reviewEligibility
		] = await Promise.all([
			getProductReviewSummary(ctx, { productId: product.id }),
			listProductReviews(ctx, { productId: product.id, limit: 100 }),
			variantIds.length > 0
				? getStorefrontVariantAvailability(ctx, { variantIds })
				: Promise.resolve([]),
			listShippingQuotes({ subtotal: 0 }),
			loadRelatedProducts(ctx, product),
			isFullUser ? isWishlisted(ctx, { productId: product.id }) : Promise.resolve(false),
			isFullUser ? getReviewEligibility(ctx, { productId: product.id }) : Promise.resolve(null)
		]);

		return {
			product,
			reviewsSummary,
			reviews,
			availability,
			shippingQuotes,
			relatedProducts,
			isWishlisted: isWishlistedVal,
			reviewEligibility
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	addToBag: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		let sessionToken = cookies.get('bag_session_token');
		const formData = await request.formData();
		const result = addBagItemFormSchema.safeParse(Object.fromEntries(formData));

		if (!result.success) {
			return fail(400, {
				success: false,
				message: 'Select an available size.'
			});
		}

		const shouldSetSessionCookie = !actor && !sessionToken;
		if (shouldSetSessionCookie) sessionToken = nanoid(32);

		try {
			const bag = await addItemToBag(ctx, { sessionToken, ...result.data });
			if (shouldSetSessionCookie && sessionToken) {
				cookies.set('bag_session_token', sessionToken, {
					path: '/',
					maxAge: 7 * 24 * 60 * 60,
					httpOnly: true,
					sameSite: 'lax',
					secure: !dev
				});
			}
			return { success: true, bag };
		} catch (error) {
			return failFromAppError(error);
		}
	},
	toggleWishlist: async ({ request, locals }) => {
		if (!locals.user || locals.user.isAnonymous) {
			redirect(302, `/sign-in`);
		}
		const actor = {
			id: locals.user.id,
			role: locals.user.role,
			isAnonymous: locals.user.isAnonymous
		};
		const ctx = { actor };
		const formData = await request.formData();
		const productId = String(formData.get('productId') ?? '').trim();

		if (!productId) {
			return fail(400, {
				success: false,
				message: 'Product is required.'
			});
		}

		try {
			const wishlisted = await isWishlisted(ctx, { productId });
			if (wishlisted) {
				await removeFromWishlist(ctx, { productId });
			} else {
				await addToWishlist(ctx, { productId });
			}
			return { success: true };
		} catch (error) {
			return failFromAppError(error);
		}
	},
	submitReview: async ({ request, locals, platform }) => {
		if (!locals.user || locals.user.isAnonymous) {
			redirect(302, `/sign-in`);
		}
		const actor = {
			id: locals.user.id,
			role: locals.user.role,
			isAnonymous: locals.user.isAnonymous
		};
		const ctx: ServiceContext = { actor, event: { platform } };
		const formData = await request.formData();
		const files = formData
			.getAll('files')
			.filter((file): file is File => file instanceof File && file.size > 0);
		const result = createReviewFormSchema.safeParse({
			productId: formData.get('productId'),
			rating: Number(formData.get('rating')),
			title: String(formData.get('title') ?? '').trim() || null,
			body: String(formData.get('body') ?? '').trim(),
			files: files.length > 0 ? files : undefined
		});

		if (!result.success) {
			return fail(400, {
				success: false,
				message: 'Review needs a rating and at least 10 characters.'
			});
		}

		try {
			const eligibility = await getReviewEligibility(ctx, { productId: result.data.productId });
			const orderId = eligibility.eligibleOrders[0]?.orderId || null;

			await createReview(ctx, {
				productId: result.data.productId,
				rating: result.data.rating,
				title: result.data.title ?? null,
				body: result.data.body ?? null,
				orderId,
				files: result.data.files ?? null
			});
			return { success: true };
		} catch (error) {
			return failFromAppError(error);
		}
	}
};
