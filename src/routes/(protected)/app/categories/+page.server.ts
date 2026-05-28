import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	deleteCategory,
	deleteCategoryFormSchema,
	listCategories,
	listCategoriesFormSchema,
	updateCategory,
	updateCategoryFlagsFormSchema,
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
	const query = url.searchParams.get('query')?.trim() || '';

	try {
		// Load all categories for filters and hierarchy parent lookup
		const allCategories = await listCategories(ctx, { includeInactive: true, limit: 250 });

		// Retrieve filtered categories
		let categories = await listCategories(ctx, {
			includeInactive: categoryOptions.includeInactive,
			parentId: categoryOptions.parentId,
			limit: 250 // Retrieve a generous page to filter in-memory if a query exists
		});

		if (query) {
			const lowerQuery = query.toLowerCase();
			categories = categories.filter(
				(c) =>
					c.name.toLowerCase().includes(lowerQuery) || c.slug.toLowerCase().includes(lowerQuery)
			);
		}

		const total = categories.length;
		const limit = categoryOptions.limit ?? 20;
		const offset = categoryOptions.offset ?? 0;

		const paginatedCategories = categories.slice(offset, offset + limit);

		const [updateCategoryFlagsForm, deleteCategoryForm] = await Promise.all([
			superValidate(zod4(updateCategoryFlagsFormSchema), {
				id: 'updateCategoryFlags'
			}),
			superValidate(zod4(deleteCategoryFormSchema), {
				id: 'deleteCategory'
			})
		]);

		return {
			categories: paginatedCategories,
			allCategories,
			total,
			limit,
			offset,
			filters: {
				includeInactive: categoryOptions.includeInactive ?? true,
				parentId: categoryOptions.parentId === null ? 'root' : (categoryOptions.parentId ?? ''),
				limit,
				offset,
				query
			},
			updateCategoryFlagsForm,
			deleteCategoryForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	updateCategoryFlags: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateCategoryFlagsFormSchema), {
			id: 'updateCategoryFlags'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const { categoryId, isActive } = form.data;
			await updateCategory(ctx, { id: categoryId }, { isActive });
			return message(form, 'Category visibility updated.');
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
