import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { nanoid } from 'nanoid';
import {
	getBag,
	addItemToBag,
	updateBagItemQuantity,
	removeBagItem,
	applyPromoCodeToBag,
	removePromoCodeFromBag,
	cancelCheckout,
	clearBag
} from '$lib/server/modules/bag';
import { jsonFromRouteError } from '$lib/server/infrastructure/errors/route-adapter';
import { isAppError } from '$lib/server/infrastructure/errors';
import { withTransientDatabaseRetry } from '$lib/server/infrastructure/errors/transient-database';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };
	const sessionToken = cookies.get('bag_session_token');

	try {
		const bag = await withTransientDatabaseRetry(() => getBag(ctx, { sessionToken }));
		return json(bag, {
			headers: {
				'cache-control': 'no-store, max-age=0'
			}
		});
	} catch (error) {
		if (!isAppError(error) || error.statusCode >= 500) {
			console.error('[bag] Failed to load bag:', error);
		}
		return jsonFromRouteError(error);
	}
};

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };
	let sessionToken = cookies.get('bag_session_token');

	if (!actor && !sessionToken) {
		sessionToken = nanoid(32);
		cookies.set('bag_session_token', sessionToken, {
			path: '/',
			maxAge: 7 * 24 * 60 * 60, // 7 days
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev
		});
	}

	try {
		const body = (await request.json()) as Record<string, unknown>;
		const action = typeof body.action === 'string' ? body.action : '';

		let updatedBag;

		switch (action) {
			case 'add': {
				const variantId = String(body.variantId ?? '');
				const quantity = body.quantity;
				updatedBag = await addItemToBag(ctx, {
					sessionToken,
					variantId,
					quantity: quantity ? Number(quantity) : 1
				});
				break;
			}
			case 'update': {
				const bagItemId = String(body.bagItemId ?? '');
				const quantity = body.quantity;
				updatedBag = await updateBagItemQuantity(ctx, {
					sessionToken,
					bagItemId,
					quantity: Number(quantity)
				});
				break;
			}
			case 'remove': {
				const bagItemId = String(body.bagItemId ?? '');
				updatedBag = await removeBagItem(ctx, {
					sessionToken,
					bagItemId
				});
				break;
			}
			case 'applyPromo': {
				const code = String(body.code ?? '');
				updatedBag = await applyPromoCodeToBag(ctx, {
					sessionToken,
					code
				});
				break;
			}
			case 'removePromo': {
				updatedBag = await removePromoCodeFromBag(ctx, {
					sessionToken
				});
				break;
			}
			case 'cancelCheckout': {
				updatedBag = await cancelCheckout(ctx, {
					sessionToken
				});
				break;
			}
			case 'clear': {
				updatedBag = await clearBag(ctx, {
					sessionToken
				});
				break;
			}
			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}

		return json(updatedBag);
	} catch (error) {
		if (!isAppError(error) || error.statusCode >= 500) {
			console.error('[bag] Failed to update bag:', error);
		}
		return jsonFromRouteError(error);
	}
};
