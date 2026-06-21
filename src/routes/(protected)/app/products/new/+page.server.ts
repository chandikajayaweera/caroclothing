import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	FIT_TIERS,
	GENDER_TIERS,
	PRODUCT_TIERS,
	SIZE_TIERS,
	type SizeTier,
	createProduct,
	createProductFormSchema,
	listCategories,
	listTags,
	listColors,
	createColor,
	deleteColor
} from '$lib/server/modules/products';
import { listDrops } from '$lib/server/modules/drops';
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

const createProductDefaults = {
	name: '',
	slug: '',
	description: null,
	shortDescription: null,
	categoryId: null,
	tier: 'core' as const,
	gender: 'unisex' as const,
	fit: 'oversized' as const,
	material: null,
	careInstructions: null,
	isActive: true,
	isFeatured: false,
	isNewArrival: true,
	metaTitle: null,
	metaDescription: null,
	tagIds: [] as string[],
	newTagNames: [] as string[],
	dropId: null,
	primaryImageIndex: 0,
	images: [] as File[],
	variants: [
		{
			clientId: 'default-color-card',
			colorId: null as string | null,
			color: 'Black',
			colorHex: '#000000',
			basePrice: 2500,
			compareAtPrice: null,
			sortOrder: 1,
			sizes: ['M'] as SizeTier[]
		}
	],
	imageMetadata: [] as {
		variantClientId: string | null;
		altText: string | null;
		position: number;
		isPrimary: boolean;
	}[],
	redirectTo: 'view' as const,
	syncPrices: false
};

export const load: PageServerLoad = async ({ locals, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const [categories, tags, drops, colors, createProductForm] = await Promise.all([
			listCategories(ctx, { includeInactive: true, limit: 100 }),
			listTags({ limit: 100 }),
			listDrops(ctx, { limit: 100 }),
			listColors(ctx),
			superValidate(createProductDefaults, zod4(createProductFormSchema), {
				id: 'createProduct',
				errors: false
			})
		]);

		return {
			categories,
			tags,
			drops: drops.items,
			colors,
			tierOptions: PRODUCT_TIERS.map(toOption),
			genderOptions: GENDER_TIERS.map(toOption),
			fitOptions: FIT_TIERS.map(toOption),
			sizeOptions: SIZE_TIERS.map(toOption),
			createProductForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	createProduct: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(createProductFormSchema), {
			id: 'createProduct'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		const { redirectTo, ...data } = form.data;

		let product;

		try {
			product = await createProduct(ctx, data);
		} catch (error) {
			return withFiles(formFailFromAppError(form, error));
		}

		if (redirectTo === 'categories') {
			throw redirect(303, '/app/categories');
		}

		if (redirectTo === 'drops') {
			throw redirect(303, '/app/drops');
		}

		if (redirectTo === 'products') {
			throw redirect(303, '/app/products');
		}

		throw redirect(303, `/app/products/${product.slug}`);
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
