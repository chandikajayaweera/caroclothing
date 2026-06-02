import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	getCategory,
	listCategories,
	listProducts,
	deleteCategory,
	deleteCategoryFormSchema
} from '$lib/server/modules/products';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(
	locals: App.Locals,
	platform?: App.Platform,
	event?: Pick<RequestEvent, 'platform'>
): ServiceContext {
	return {
		actor: locals.user,
		event,
		notificationQueue: platform?.env?.NOTIFICATION_QUEUE ?? null
	};
}

export const load: PageServerLoad = async ({ locals, params, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const category = await getCategory(
			ctx,
			{ slug: params.categoryslug },
			{ includeInactive: true }
		);

		const parentPromise = category.parentId
			? getCategory(ctx, { id: category.parentId }, { includeInactive: true })
					.then((p) => p.name)
					.catch(() => null)
			: Promise.resolve(null);

		const deleteCategoryForm = await superValidate(zod4(deleteCategoryFormSchema), {
			id: 'deleteCategory'
		});

		return {
			category,
			deleteCategoryForm,
			streamed: {
				parentCategoryName: parentPromise,
				subcategories: listCategories(ctx, {
					parentId: category.id,
					includeInactive: true,
					limit: 100
				}),
				products: listProducts(ctx, {
					categoryId: category.id,
					includeInactive: true,
					limit: 100
				}).then((r) => r.items)
			}
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	deleteCategory: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(deleteCategoryFormSchema), {
			id: 'deleteCategory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteCategory(ctx, { id: form.data.categoryId });
		} catch (error) {
			return formFailFromAppError(form, error);
		}

		throw redirect(303, '/app/categories');
	}
};
