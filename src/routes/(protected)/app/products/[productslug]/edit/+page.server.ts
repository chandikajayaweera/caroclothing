import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	FIT_TIERS,
	GENDER_TIERS,
	PRODUCT_TIERS,
	SIZE_TIERS,
	getProduct,
	listCategories,
	listTags,
	updateProductFull,
	updateProductFormSchema,
	type ProductDTO
} from '$lib/server/modules/products';
import { listDrops } from '$lib/server/modules/drops';
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
		tier: product.tier,
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
		dropId: product.dropAssignment?.id ?? null,
		serializedVariants: '[]',
		serializedImages: '[]',
		newImageFiles: []
	};
}

export const load: PageServerLoad = async ({ locals, params, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const [product, categories, tags, drops] = await Promise.all([
			getProduct(ctx, { slug: params.productslug }, { includeInactive: true }),
			listCategories(ctx, { includeInactive: true, limit: 100 }),
			listTags({ limit: 100 }),
			listDrops(ctx, { limit: 100 })
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
			drops: drops.items,
			tierOptions: PRODUCT_TIERS.map(toOption),
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
	}
};
