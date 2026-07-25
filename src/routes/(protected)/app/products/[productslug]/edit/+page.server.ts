import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	FIT_TIERS,
	GENDER_TIERS,
	SIZE_TIERS,
	getProduct,
	listCategories,
	listTags,
	listColors,
	createColor,
	deleteColor,
	updateProductFull,
	updateProductFormSchema,
	type ProductDTO
} from '$lib/server/modules/products';
import type { ServiceContext } from '$lib/server/foundation/context';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
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
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

function toOption(value: string) {
	return { value, label: value };
}

function toUpdateProductFormData(product: ProductDTO) {
	return {
		name: product.name,
		slug: product.slug,
		description: product.description,
		shortDescription: product.shortDescription,
		categoryId: product.categoryId,
		gender: product.gender,
		fit: product.fit,
		material: product.material,
		careInstructions: product.careInstructions,
		isActive: product.isActive,
		isFeatured: product.isFeatured,
		isNewArrival: product.isNewArrival,
		metaTitle: product.metaTitle,
		metaDescription: product.metaDescription,
		tagIds: product.tags.map((tag) => tag.id),
		newTagNames: [],
		serializedVariants: '[]',
		serializedImages: '[]',
		newImageFiles: []
	};
}

export const load: PageServerLoad = async ({ locals, params, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const [product, categories, tags, colors] = await Promise.all([
			getProduct(ctx, { slug: params.productslug }, { includeInactive: true }),
			listCategories(ctx, { includeInactive: true, limit: 100 }),
			listTags({ limit: 100 }),
			listColors(ctx)
		]);

		const updateProductForm = await superValidate(
			toUpdateProductFormData(product),
			zod4(updateProductFormSchema),
			{
				id: 'updateProduct'
			}
		);

		return {
			product,
			categories,
			tags,
			colors,
			genderOptions: GENDER_TIERS.map(toOption),
			fitOptions: FIT_TIERS.map(toOption),
			sizeOptions: SIZE_TIERS.map(toOption),
			updateProductForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	updateProduct: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateProductFormSchema), {
			id: 'updateProduct'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		try {
			const { serializedVariants, serializedImages, newImageFiles, ...rest } = form.data;

			let variants = [];
			try {
				variants = JSON.parse(serializedVariants || '[]');
			} catch {
				return fail(400, withFiles({ form, message: 'Invalid variants format' }));
			}

			let images = [];
			try {
				images = JSON.parse(serializedImages || '[]');
			} catch {
				return fail(400, withFiles({ form, message: 'Invalid images format' }));
			}

			const updated = await updateProductFull(
				ctx,
				{ slug: event.params.productslug },
				{
					...rest,
					variants,
					images,
					newImageFiles: newImageFiles || []
				}
			);

			throw redirect(303, `/app/products/${updated.slug}`);
		} catch (error) {
			return withFiles(formFailFromAppError(form, error));
		}
	},
	createColor: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() || '';
		const hex = formData.get('hex')?.toString() || '';
		try {
			const newColor = await createColor(ctx, { name, hex });
			return { success: true, color: newColor };
		} catch (error) {
			const appError = isAppError(error)
				? error
				: new ProductError(
						error instanceof Error ? error.message : 'Failed to create color',
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
	},
	deleteColor: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const formData = await event.request.formData();
		const colorId = formData.get('colorId')?.toString() || '';
		try {
			await deleteColor(ctx, colorId);
			return { success: true };
		} catch (error) {
			const appError = isAppError(error)
				? error
				: new ProductError(
						error instanceof Error ? error.message : 'Failed to delete color',
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
