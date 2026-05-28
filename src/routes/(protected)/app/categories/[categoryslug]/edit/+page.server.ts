import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	getCategory,
	listCategories,
	updateCategory,
	updateCategoryFormSchema
} from '$lib/server/modules/products';
import { generateSlug } from '$lib/shared/slug';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	isAppError,
	toErrorResponseBody,
	ProductError,
	ErrorCode
} from '$lib/server/infrastructure/errors';

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

		// List categories to select parent. Exclude the current category and ensure parent is a root category (parentId is null)
		const allCategories = await listCategories(ctx, { includeInactive: true, limit: 150 });
		const parentOptions = allCategories.filter((c) => c.id !== category.id && c.parentId === null);

		const updateCategoryForm = await superValidate(
			{
				name: category.name,
				slug: category.slug,
				description: category.description,
				parentId: category.parentId,
				sortOrder: category.sortOrder,
				isActive: category.isActive,
				removeImage: false
			},
			zod4(updateCategoryFormSchema),
			{
				id: 'updateCategory'
			}
		);

		return {
			category,
			categories: parentOptions,
			allCategories,
			updateCategoryForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	updateCategory: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateCategoryFormSchema), {
			id: 'updateCategory'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		const { parentId } = form.data;

		let updated;
		try {
			const category = await getCategory(
				ctx,
				{ slug: event.params.categoryslug },
				{ includeInactive: true }
			);

			if (parentId) {
				const parent = await getCategory(ctx, { id: parentId }, { includeInactive: true });
				if (parent.parentId !== null) {
					return fail(
						400,
						withFiles({
							form,
							message:
								'Cannot set parent to a subcategory. Max nesting depth is 2 layers (Root and Child only).'
						})
					);
				}

				// Check if the current category has subcategories
				const allCategories = await listCategories(ctx, { includeInactive: true, limit: 150 });
				const hasChildren = allCategories.some((c) => c.parentId === category.id);
				if (hasChildren) {
					return fail(
						400,
						withFiles({
							form,
							message:
								'Cannot assign a parent to this category because it contains subcategories. (Max nesting depth is 2 layers).'
						})
					);
				}
			}
			updated = await updateCategory(ctx, { id: category.id }, form.data);
		} catch (error) {
			const appError = isAppError(error)
				? error
				: new ProductError(
						error instanceof Error ? error.message : 'Failed to update category',
						ErrorCode.INTERNAL_ERROR
					);
			return withFiles(formFailFromAppError(form, appError));
		}

		throw redirect(303, `/app/categories/${updated.slug}`);
	},
	updateCategoryFromPopup: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		const name = formData.get('name')?.toString();
		const image = formData.get('image') as File | null;

		if (!id || !name) {
			return fail(400, { success: false, message: 'ID and Name are required.' });
		}

		try {
			await getCategory(ctx, { id }, { includeInactive: true });
			// Auto-generate new slug based on new name
			const newSlug = generateSlug(name);

			const updated = await updateCategory(
				ctx,
				{ id },
				{
					name,
					slug: newSlug,
					image: image && image.size > 0 ? image : undefined
				}
			);

			return { success: true, category: updated };
		} catch (error) {
			const appError = isAppError(error)
				? error
				: new ProductError(
						error instanceof Error ? error.message : 'Failed to update category',
						ErrorCode.INTERNAL_ERROR
					);
			const responseBody = toErrorResponseBody(appError, {
				includeDetails: appError.statusCode < 500
			});
			return fail(
				appError.statusCode >= 400 && appError.statusCode <= 599 ? appError.statusCode : 400,
				{
					success: false,
					message: responseBody.message
				}
			);
		}
	}
};
