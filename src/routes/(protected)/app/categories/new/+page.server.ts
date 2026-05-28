import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	createCategory,
	createCategoryFormSchema,
	listCategories,
	getCategory,
	updateCategory
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

const createCategoryDefaults = {
	parentId: null,
	name: '',
	slug: '',
	description: null,
	sortOrder: 0,
	isActive: true,
	children: [],
	images: []
};

export const load: PageServerLoad = async ({ locals, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		// Filter loaded categories to strictly show root level categories (parentId is null)
		const allCategories = await listCategories(ctx, { includeInactive: true, limit: 150 });
		const rootCategories = allCategories.filter((c) => c.parentId === null);

		const createCategoryForm = await superValidate(
			createCategoryDefaults,
			zod4(createCategoryFormSchema),
			{
				id: 'createCategory',
				errors: false
			}
		);

		return {
			categories: rootCategories,
			allCategories,
			createCategoryForm
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

		if (!form.valid) return fail(400, withFiles({ form }));

		const { parentId, children, ...singleData } = form.data;
		const files = (form.data.images || []) as File[];

		try {
			if (parentId) {
				// Verify parent is a root category (no more than 2 nested layers)
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

				if (children.length === 0) {
					return fail(
						400,
						withFiles({
							form,
							message: 'Add at least one child category.'
						})
					);
				}

				// Create all child categories in the list
				for (const child of children) {
					const childImage =
						child.imageIndex !== null && child.imageIndex !== undefined && files[child.imageIndex]
							? files[child.imageIndex]
							: null;

					await createCategory(ctx, {
						parentId,
						name: child.name,
						slug: child.slug,
						description: child.description,
						sortOrder: child.sortOrder,
						isActive: child.isActive,
						image: childImage
					});
				}
			} else {
				// Create single root category
				if (!singleData.name || !singleData.slug) {
					return fail(
						400,
						withFiles({
							form,
							message: 'Name and Slug are required for root categories.'
						})
					);
				}

				const singleImage = files && files[0] ? files[0] : null;

				await createCategory(ctx, {
					parentId: null,
					name: singleData.name,
					slug: singleData.slug,
					description: singleData.description,
					sortOrder: singleData.sortOrder || 0,
					isActive: singleData.isActive,
					image: singleImage
				});
			}
		} catch (error) {
			const appError = isAppError(error)
				? error
				: new ProductError(
						error instanceof Error ? error.message : 'An unexpected error occurred.',
						ErrorCode.INTERNAL_ERROR
					);
			return withFiles(formFailFromAppError(form, appError));
		}

		throw redirect(303, '/app/categories');
	},
	updateCategoryFromPopup: async (event: RequestEvent) => {
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
