import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { updateMyDisplayName, updateMyDisplayNameFormSchema } from '$lib/server/modules/auth';
import { listMyAddresses } from '$lib/server/modules/addresses';
import { listMyOrders } from '$lib/server/modules/orders';
import { listMyReviews } from '$lib/server/modules/reviews';
import { listWishlist } from '$lib/server/modules/wishlist';
import { formFailFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from './_account.server';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const ctx = requireAccountContext(locals, url);
	const { account } = await parent();
	const [orders, addresses, wishlist, reviews, nameForm] = await Promise.all([
		listMyOrders(ctx, { limit: 1 }),
		listMyAddresses(ctx, { limit: 1 }),
		listWishlist(ctx, { limit: 1, includeUnavailable: true }),
		listMyReviews(ctx, { limit: 1 }),
		superValidate(
			{ name: account.needsNameCompletion ? '' : account.name },
			zod4(updateMyDisplayNameFormSchema),
			{ id: 'updateDisplayName', errors: false }
		)
	]);

	return {
		nameForm,
		summary: {
			orders: orders.total,
			addresses: addresses.total,
			wishlist: wishlist.total,
			reviews: reviews.total
		}
	};
};

export const actions: Actions = {
	updateName: async ({ locals, request, url }) => {
		const ctx = requireAccountContext(locals, url);
		const form = await superValidate(request, zod4(updateMyDisplayNameFormSchema), {
			id: 'updateDisplayName'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateMyDisplayName(ctx, form.data);
			return message(form, 'Name updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
