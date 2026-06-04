import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { getProduct } from '$lib/server/modules/products';
import { getProductReviewSummary, listProductReviews, getReviewEligibility, createReview } from '$lib/server/modules/reviews';
import { isWishlisted, addToWishlist, removeFromWishlist } from '$lib/server/modules/wishlist';
import { addItemToCart } from '$lib/server/modules/cart';
import { getInventoryAvailabilityByVariantIdsTx } from '$lib/server/modules/inventory/inventory.service';
import { getDb } from '$lib/server/db';
import type { ServiceContext } from '$lib/server/foundation/context';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function getStorefrontContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user ?? null };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = getStorefrontContext(locals);

	try {
		const product = await getProduct(ctx, { slug: params.slug });
		const reviewsSummary = await getProductReviewSummary(ctx, { productId: product.id });
		const reviews = await listProductReviews(ctx, { productId: product.id, limit: 6 });

		const variantIds = product.variants.map((v) => v.id);
		const availability = variantIds.length > 0
			? await getInventoryAvailabilityByVariantIdsTx(getDb(), { variantIds })
			: [];

		let isWishlistedVal = false;
		let reviewEligibility = null;

		if (locals.user && !locals.user.isAnonymous) {
			isWishlistedVal = await isWishlisted(ctx, { productId: product.id });
			reviewEligibility = await getReviewEligibility(ctx, { productId: product.id });
		}

		return {
			product,
			reviewsSummary,
			reviews,
			availability,
			isWishlisted: isWishlistedVal,
			reviewEligibility
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	addToCart: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('cart_session_token');
		const formData = await request.formData();
		const variantId = formData.get('variantId') as string;
		const quantity = formData.get('quantity') ? Number(formData.get('quantity')) : 1;

		try {
			const cart = await addItemToCart(ctx, { sessionToken, variantId, quantity });
			return { success: true, cart };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	toggleWishlist: async ({ request, locals }) => {
		if (!locals.user || locals.user.isAnonymous) {
			throw redirect(302, `/sign-in`);
		}
		const actor = { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous };
		const ctx = { actor };
		const formData = await request.formData();
		const productId = formData.get('productId') as string;

		try {
			const wishlisted = await isWishlisted(ctx, { productId });
			if (wishlisted) {
				await removeFromWishlist(ctx, { productId });
			} else {
				await addToWishlist(ctx, { productId });
			}
			return { success: true };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	submitReview: async ({ request, locals }) => {
		if (!locals.user || locals.user.isAnonymous) {
			throw redirect(302, `/sign-in`);
		}
		const actor = { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous };
		const ctx = { actor };
		const formData = await request.formData();
		const productId = formData.get('productId') as string;
		const rating = Number(formData.get('rating'));
		const body = formData.get('body') as string;
		const title = (formData.get('title') as string) || null;

		try {
			await createReview(ctx, {
				productId,
				rating,
				title,
				body,
				orderId: null
			});
			return { success: true };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
