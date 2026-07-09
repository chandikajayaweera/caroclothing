import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad, Actions } from './$types';
import { nanoid } from 'nanoid';
import {
	getOrCreateBag,
	addItemToBag,
	updateBagItemQuantity,
	removeBagItem,
	applyPromoCodeToBag,
	removePromoCodeFromBag,
	clearBag,
	startCheckout
} from '$lib/server/modules/bag';
import { ErrorCode, isAppError } from '$lib/server/infrastructure/errors';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { withTransientDatabaseRetry } from '$lib/server/infrastructure/errors/transient-database';

export const load: PageServerLoad = async ({ locals, cookies }) => {
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
		const bag = await withTransientDatabaseRetry(() => getOrCreateBag(ctx, { sessionToken }));
		return { bag };
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	startCheckout: async ({ locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		if (!actor) {
			const redirectTo = encodeURIComponent('/bag?checkout=start');
			throw redirect(303, `/sign-in?redirectTo=${redirectTo}`);
		}
		const ctx = { actor };
		const sessionToken = cookies.get('bag_session_token');

		try {
			await startCheckout(ctx, { sessionToken });
			throw redirect(303, '/checkout');
		} catch (error) {
			if (isAppError(error)) {
				const message =
					error.code === ErrorCode.INSUFFICIENT_STOCK
						? 'An item in your bag was just reserved by another customer. Review your bag and try again.'
						: error.code === ErrorCode.CANNOT_MODIFY_ORDER
							? 'Some items cannot be checked out yet. Review their availability and try again.'
							: error.code === ErrorCode.EMPTY_BAG
								? 'Your bag is empty.'
								: null;

				if (message) {
					throw redirect(303, `/bag?error=${encodeURIComponent(message)}`);
				}
			}

			throwHttpFromAppError(error);
		}
	},
	addToBag: async ({ request, locals, cookies }) => {
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

		const formData = await request.formData();
		const variantId = formData.get('variantId') as string;
		const quantity = formData.get('quantity') ? Number(formData.get('quantity')) : 1;

		try {
			const bag = await addItemToBag(ctx, { sessionToken, variantId, quantity });
			return { success: true, bag };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	updateQuantity: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('bag_session_token');
		const formData = await request.formData();
		const bagItemId = formData.get('bagItemId') as string;
		const quantity = Number(formData.get('quantity'));

		try {
			const bag = await updateBagItemQuantity(ctx, { sessionToken, bagItemId, quantity });
			return { success: true, bag };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	removeItem: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('bag_session_token');
		const formData = await request.formData();
		const bagItemId = formData.get('bagItemId') as string;

		try {
			const bag = await removeBagItem(ctx, { sessionToken, bagItemId });
			return { success: true, bag };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	applyPromo: async ({ request, locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('bag_session_token');
		const formData = await request.formData();
		const code = formData.get('code') as string;

		try {
			const bag = await applyPromoCodeToBag(ctx, { sessionToken, code });
			return { success: true, bag };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	removePromo: async ({ locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('bag_session_token');

		try {
			const bag = await removePromoCodeFromBag(ctx, { sessionToken });
			return { success: true, bag };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	},
	clearBag: async ({ locals, cookies }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };
		const sessionToken = cookies.get('bag_session_token');

		try {
			const bag = await clearBag(ctx, { sessionToken });
			return { success: true, bag };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
