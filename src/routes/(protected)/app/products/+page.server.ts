import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	GENDER_TIERS,
	deleteProduct,
	deleteProductFormSchema,
	getProduct,
	getProductStats,
	listCategories,
	listProducts,
	listProductsFormSchema,
	updateProduct,
	updateProductFlagsFormSchema,
	type GenderTier,
	type ListProductsOptions
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

function getListOptions(url: URL): ListProductsOptions {
	const result = listProductsFormSchema.safeParse({
		categoryId: getTrimmedParam(url.searchParams.get('categoryId')),
		gender: getGenderParam(url.searchParams.get('gender')),
		isFeatured: getBooleanParam(url.searchParams.get('isFeatured')),
		isNewArrival: getBooleanParam(url.searchParams.get('isNewArrival')),
		includeInactive: getBooleanParam(url.searchParams.get('includeInactive')) ?? true,
		limit: getIntegerParam(url.searchParams.get('limit')),
		offset: getIntegerParam(url.searchParams.get('offset')),
		query: getTrimmedParam(url.searchParams.get('query'))
	});

	return result.success ? result.data : { includeInactive: true };
}

function getTrimmedParam(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getGenderParam(value: string | null): GenderTier | undefined {
	return GENDER_TIERS.includes(value as GenderTier) ? (value as GenderTier) : undefined;
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

function toOption(value: string) {
	return { value, label: value };
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const productOptions = getListOptions(url);

	try {
		const [deleteProductForm, updateProductFlagsForm] = await Promise.all([
			superValidate(zod4(deleteProductFormSchema), {
				id: 'deleteProduct'
			}),
			superValidate(zod4(updateProductFlagsFormSchema), {
				id: 'updateProductFlags'
			})
		]);
		const products = await listProducts(ctx, productOptions);
		const stats = await getProductStats(ctx);
		const categories = await listCategories(ctx, { includeInactive: true, limit: 100 });

		return {
			streamed: {
				products: Promise.resolve(products),
				stats: Promise.resolve(stats),
				categories: Promise.resolve(categories)
			},
			genderOptions: GENDER_TIERS.map(toOption),
			filters: {
				categoryId: productOptions.categoryId ?? '',
				gender: productOptions.gender ?? '',
				isFeatured:
					productOptions.isFeatured === undefined ? '' : String(productOptions.isFeatured),
				isNewArrival:
					productOptions.isNewArrival === undefined ? '' : String(productOptions.isNewArrival),
				includeInactive: productOptions.includeInactive ?? true,
				limit: productOptions.limit ?? 20,
				offset: productOptions.offset ?? 0,
				query: productOptions.query ?? ''
			},
			deleteProductForm,
			updateProductFlagsForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	deleteProduct: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(deleteProductFormSchema), {
			id: 'deleteProduct'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteProduct(ctx, { id: form.data.productId });
			return message(form, 'Product deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateProductFlags: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateProductFlagsFormSchema), {
			id: 'updateProductFlags'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const product = await getProduct(ctx, { id: form.data.productId }, { includeInactive: true });

			await updateProduct(
				ctx,
				{ id: product.id },
				{
					isActive: form.data.isActive,
					isFeatured: form.data.isFeatured,
					isNewArrival: form.data.isNewArrival
				}
			);
			return message(form, 'Product actions saved.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
