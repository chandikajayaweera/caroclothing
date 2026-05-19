import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	createCategory,
	createCategoryFormSchema,
	deleteCategory,
	deleteCategoryFormSchema,
	listCategories,
	listCategoriesFormSchema,
	updateCategory,
	updateCategoryActionFormSchema,
	type ListCategoriesOptions
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

function getListOptions(url: URL): ListCategoriesOptions {
	const result = listCategoriesFormSchema.safeParse({
		includeInactive: getBooleanParam(url.searchParams.get('includeInactive')) ?? true,
		parentId: getParentIdParam(url.searchParams.get('parentId')),
		limit: getIntegerParam(url.searchParams.get('limit')),
		offset: getIntegerParam(url.searchParams.get('offset'))
	});

	return result.success ? result.data : { includeInactive: true };
}

function getParentIdParam(value: string | null): string | null | undefined {
	if (value === 'root') return null;
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getBooleanParam(value: string | null): boolean | undefined {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const categoryOptions = getListOptions(url);

	try {
		const [categories, createCategoryForm, updateCategoryForm, deleteCategoryForm] =
			await Promise.all([
				listCategories(ctx, categoryOptions),
				superValidate(zod4(createCategoryFormSchema), {
					id: 'createCategory'
				}),
				superValidate(zod4(updateCategoryActionFormSchema), {
					id: 'updateCategory'
				}),
				superValidate(zod4(deleteCategoryFormSchema), {
					id: 'deleteCategory'
				})
			]);

		return {
			categories,
			filters: {
				includeInactive: categoryOptions.includeInactive ?? true,
				parentId: categoryOptions.parentId === null ? 'root' : (categoryOptions.parentId ?? ''),
				limit: categoryOptions.limit ?? '',
				offset: categoryOptions.offset ?? ''
			},
			createCategoryForm,
			updateCategoryForm,
			deleteCategoryForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	createCategory: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(createCategoryFormSchema), {
			id: 'createCategory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await createCategory(ctx, form.data);
			return message(form, 'Category created.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateCategory: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateCategoryActionFormSchema), {
			id: 'updateCategory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const { categoryId, ...data } = form.data;
			await updateCategory(ctx, { id: categoryId }, data);
			return message(form, 'Category updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteCategory: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(deleteCategoryFormSchema), {
			id: 'deleteCategory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteCategory(ctx, { id: form.data.categoryId });
			return message(form, 'Category deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
