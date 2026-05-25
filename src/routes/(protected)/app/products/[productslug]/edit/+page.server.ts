import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	FIT_TIERS,
	GENDER_TIERS,
	PRODUCT_TIERS,
	SIZE_TIERS,
	addProductImage,
	addProductImageFormSchema,
	createProductVariant,
	createProductVariantFormSchema,
	createProductVariantColor,
	createProductVariantColorActionFormSchema,
	deleteProductImage,
	deleteProductImageFormSchema,
	deleteProductVariant,
	deleteProductVariantFormSchema,
	deleteProductVariantColor,
	deleteProductVariantColorActionFormSchema,
	getProduct,
	listCategories,
	listTags,
	reorderProductImages,
	reorderProductImagesFormSchema,
	setPrimaryProductImage,
	setPrimaryProductImageFormSchema,
	updateProduct,
	updateProductFormSchema,
	updateProductVariant,
	updateProductVariantActionFormSchema,
	updateProductVariantColor,
	updateProductVariantColorActionFormSchema,
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
		dropId: product.dropAssignment?.id ?? null
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

		const [
			updateProductForm,
			createVariantForm,
			updateVariantForm,
			deleteVariantForm,
			addImageForm,
			setPrimaryImageForm,
			deleteImageForm,
			reorderImagesForm,
			createVariantColorForm,
			updateVariantColorForm,
			deleteVariantColorForm
		] = await Promise.all([
			superValidate(toUpdateProductFormData(product), zod4(updateProductFormSchema), {
				id: 'updateProduct'
			}),
			superValidate(
				{
					size: SIZE_TIERS[1] ?? SIZE_TIERS[0],
					variantColorId: product.variants[0]?.variantColorId ?? '',
					isActive: true,
					sortOrder: product.variants.length + 1
				},
				zod4(createProductVariantFormSchema),
				{
					id: 'createProductVariant',
					errors: false
				}
			),
			superValidate(zod4(updateProductVariantActionFormSchema), {
				id: 'updateProductVariant'
			}),
			superValidate(zod4(deleteProductVariantFormSchema), {
				id: 'deleteProductVariant'
			}),
			superValidate(zod4(addProductImageFormSchema), {
				id: 'addProductImage'
			}),
			superValidate(zod4(setPrimaryProductImageFormSchema), {
				id: 'setPrimaryProductImage'
			}),
			superValidate(zod4(deleteProductImageFormSchema), {
				id: 'deleteProductImage'
			}),
			superValidate(
				{
					productId: product.id,
					imageIdsInOrder: product.images.map((image) => image.id)
				},
				zod4(reorderProductImagesFormSchema),
				{
					id: 'reorderProductImages'
				}
			),
			superValidate(zod4(createProductVariantColorActionFormSchema), {
				id: 'createProductVariantColor'
			}),
			superValidate(zod4(updateProductVariantColorActionFormSchema), {
				id: 'updateProductVariantColor'
			}),
			superValidate(zod4(deleteProductVariantColorActionFormSchema), {
				id: 'deleteProductVariantColor'
			})
		]);

		return {
			product,
			categories,
			tags,
			drops: drops.items,
			tierOptions: PRODUCT_TIERS.map(toOption),
			genderOptions: GENDER_TIERS.map(toOption),
			fitOptions: FIT_TIERS.map(toOption),
			sizeOptions: SIZE_TIERS.map(toOption),
			updateProductForm,
			createVariantForm,
			updateVariantForm,
			deleteVariantForm,
			addImageForm,
			setPrimaryImageForm,
			deleteImageForm,
			reorderImagesForm,
			createVariantColorForm,
			updateVariantColorForm,
			deleteVariantColorForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	updateProduct: async ({ locals, params, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(updateProductFormSchema), {
			id: 'updateProduct'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const updated = await updateProduct(ctx, { slug: params.productslug }, form.data);

			if (updated.slug !== params.productslug) {
				throw redirect(303, `/app/products/${updated.slug}/edit`);
			}

			return message(form, 'Product updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	createProductVariant: async ({ locals, params, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(createProductVariantFormSchema), {
			id: 'createProductVariant'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const product = await getProduct(
				ctx,
				{ slug: params.productslug },
				{ includeInactive: true }
			);
			await createProductVariant(ctx, product.id, form.data);
			return message(form, 'Variant created.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateProductVariant: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(updateProductVariantActionFormSchema), {
			id: 'updateProductVariant'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const { variantId, ...data } = form.data;
			await updateProductVariant(ctx, variantId, data);
			return message(form, 'Variant updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteProductVariant: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(deleteProductVariantFormSchema), {
			id: 'deleteProductVariant'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteProductVariant(ctx, form.data.variantId);
			return message(form, 'Variant deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	createProductVariantColor: async ({ locals, params, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(createProductVariantColorActionFormSchema), {
			id: 'createProductVariantColor'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const product = await getProduct(
				ctx,
				{ slug: params.productslug },
				{ includeInactive: true }
			);
			await createProductVariantColor(ctx, product.id, form.data);
			return message(form, 'Variant color created.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateProductVariantColor: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(updateProductVariantColorActionFormSchema), {
			id: 'updateProductVariantColor'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const { variantColorId, ...data } = form.data;
			await updateProductVariantColor(ctx, variantColorId, data);
			return message(form, 'Variant color updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteProductVariantColor: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(deleteProductVariantColorActionFormSchema), {
			id: 'deleteProductVariantColor'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteProductVariantColor(ctx, form.data.variantColorId);
			return message(form, 'Variant color deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	addProductImage: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(addProductImageFormSchema), {
			id: 'addProductImage'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		try {
			await addProductImage(ctx, form.data);
			return message(form, 'Image added.');
		} catch (error) {
			return withFiles(formFailFromAppError(form, error));
		}
	},

	setPrimaryProductImage: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(setPrimaryProductImageFormSchema), {
			id: 'setPrimaryProductImage'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await setPrimaryProductImage(ctx, form.data.imageId);
			return message(form, 'Primary image updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteProductImage: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(deleteProductImageFormSchema), {
			id: 'deleteProductImage'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteProductImage(ctx, form.data.imageId);
			return message(form, 'Image deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	reorderProductImages: async ({ locals, platform, request }) => {
		const ctx = getAdminContext(locals, platform);
		const form = await superValidate(request, zod4(reorderProductImagesFormSchema), {
			id: 'reorderProductImages'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await reorderProductImages(ctx, form.data.productId, form.data.imageIdsInOrder);
			return message(form, 'Image order saved.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
