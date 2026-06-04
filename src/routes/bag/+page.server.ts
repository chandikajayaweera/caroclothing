import type { PageServerLoad, Actions } from './$types';
import {
	getOrCreateCart,
	addItemToCart,
	updateCartItemQuantity,
	removeCartItem,
	applyPromoCodeToCart,
	removePromoCodeFromCart,
	clearCart
} from '$lib/server/modules/cart';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };
	const sessionToken = cookies.get('cart_session_token');

	try {
		const cart = await getOrCreateCart(ctx, { sessionToken });
		return { cart };
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
	updateQuantity: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('cart_session_token');
		const formData = await request.formData();
		const cartItemId = formData.get('cartItemId') as string;
		const quantity = Number(formData.get('quantity'));

		try {
			const cart = await updateCartItemQuantity(ctx, { sessionToken, cartItemId, quantity });
			return { success: true, cart };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	removeItem: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('cart_session_token');
		const formData = await request.formData();
		const cartItemId = formData.get('cartItemId') as string;

		try {
			const cart = await removeCartItem(ctx, { sessionToken, cartItemId });
			return { success: true, cart };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	applyPromo: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('cart_session_token');
		const formData = await request.formData();
		const code = formData.get('code') as string;

		try {
			const cart = await applyPromoCodeToCart(ctx, { sessionToken, code });
			return { success: true, cart };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	removePromo: async ({ locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('cart_session_token');

		try {
			const cart = await removePromoCodeFromCart(ctx, { sessionToken });
			return { success: true, cart };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	clearCart: async ({ locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('cart_session_token');

		try {
			const cart = await clearCart(ctx, { sessionToken });
			return { success: true, cart };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
