import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	deleteExpiredGuestCarts,
	deleteExpiredGuestCartsFormSchema,
	listCarts,
	type CartOwnerType,
	type ListCartsOptions
} from '$lib/server/modules/cart';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/modules/errors/route-adapter';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

function getListOptions(url: URL): ListCartsOptions {
	const ownerType = getOwnerType(url.searchParams.get('ownerType'));
	const userId = url.searchParams.get('userId')?.trim() || undefined;
	const limit = getIntegerParam(url.searchParams.get('limit'));
	const offset = getIntegerParam(url.searchParams.get('offset'));

	return {
		ownerType,
		userId,
		limit,
		offset,
		includeExpired: url.searchParams.get('includeExpired') === 'true'
	};
}

function getOwnerType(value: string | null): CartOwnerType | undefined {
	if (value === 'user' || value === 'guest') return value;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);

	try {
		const [carts, cleanupForm] = await Promise.all([
			listCarts(ctx, getListOptions(url)),
			superValidate(zod4(deleteExpiredGuestCartsFormSchema), {
				id: 'deleteExpiredGuestCarts'
			})
		]);

		return {
			carts,
			filters: {
				ownerType: getOwnerType(url.searchParams.get('ownerType')) ?? '',
				userId: url.searchParams.get('userId')?.trim() ?? '',
				includeExpired: url.searchParams.get('includeExpired') === 'true',
				limit: getIntegerParam(url.searchParams.get('limit')) ?? carts.limit,
				offset: getIntegerParam(url.searchParams.get('offset')) ?? carts.offset
			},
			cleanupForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	deleteExpired: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(deleteExpiredGuestCartsFormSchema), {
			id: 'deleteExpiredGuestCarts'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const result = await deleteExpiredGuestCarts(ctx, { limit: form.data.limit });
			return message(
				form,
				`Deleted ${result.deletedCount} expired carts and released ${result.releasedQuantity} reserved items.`
			);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
