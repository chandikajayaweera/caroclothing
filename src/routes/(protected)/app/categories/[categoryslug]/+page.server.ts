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
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
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
		notificationWakeups: createCloudflareNotificationWakeups(platform)
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

		const parentCategoryName = category.parentId
			? getCategory(ctx, { id: category.parentId }, { includeInactive: true }).then(
					(parent) => parent.name
				)
			: Promise.resolve(null);
		const subcategories = listCategories(ctx, {
			parentId: category.id,
			includeInactive: true,
			limit: 100
		});
		const products = listProducts(ctx, {
			categoryId: category.id,
			includeInactive: true,
			limit: 100
		}).then((result) => result.items);
		void parentCategoryName.catch(() => {});
		void subcategories.catch(() => {});
		void products.catch(() => {});

		const deleteCategoryForm = await superValidate(zod4(deleteCategoryFormSchema), {
			id: 'deleteCategory'
		});

		return {
			category,
			deleteCategoryForm,
			streamed: {
				parentCategoryName,
				subcategories,
				products
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
