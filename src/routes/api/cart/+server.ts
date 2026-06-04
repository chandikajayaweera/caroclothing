import { json, type RequestHandler } from '@sveltejs/kit';
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

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };
	const sessionToken = cookies.get('cart_session_token');

	try {
		const cart = await getOrCreateCart(ctx, { sessionToken });
		return json(cart);
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };
	const sessionToken = cookies.get('cart_session_token');

	try {
		const body = (await request.json()) as any;
		const { action, ...payload } = body;

		let updatedCart;

		switch (action) {
			case 'add': {
				const { variantId, quantity } = payload;
				updatedCart = await addItemToCart(ctx, {
					sessionToken,
					variantId,
					quantity: quantity ? Number(quantity) : 1
				});
				break;
			}
			case 'update': {
				const { cartItemId, quantity } = payload;
				updatedCart = await updateCartItemQuantity(ctx, {
					sessionToken,
					cartItemId,
					quantity: Number(quantity)
				});
				break;
			}
			case 'remove': {
				const { cartItemId } = payload;
				updatedCart = await removeCartItem(ctx, {
					sessionToken,
					cartItemId
				});
				break;
			}
			case 'applyPromo': {
				const { code } = payload;
				updatedCart = await applyPromoCodeToCart(ctx, {
					sessionToken,
					code
				});
				break;
			}
			case 'removePromo': {
				updatedCart = await removePromoCodeFromCart(ctx, {
					sessionToken
				});
				break;
			}
			case 'clear': {
				updatedCart = await clearCart(ctx, {
					sessionToken
				});
				break;
			}
			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}

		return json(updatedCart);
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
