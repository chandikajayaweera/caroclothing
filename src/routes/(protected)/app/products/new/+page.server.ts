import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	FIT_TIERS,
	GENDER_TIERS,
	PRODUCT_TIERS,
	SIZE_TIERS,
	createProduct,
	createProductFormSchema,
	listCategories,
	listTags
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

const createProductDefaults = {
	name: '',
	slug: '',
	description: null,
	shortDescription: null,
	categoryId: null,
	tier: 'core' as const,
	basePrice: 2500,
	compareAtPrice: null,
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
	variants: [],
	imageMetadata: [],
	redirectTo: 'view' as const
};

export const load: PageServerLoad = async ({ locals, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const [categories, tags, drops, createProductForm] = await Promise.all([
			listCategories(ctx, { includeInactive: true, limit: 100 }),
			listTags({ limit: 100 }),
			listDrops(ctx, { limit: 100 }),
			superValidate(createProductDefaults, zod4(createProductFormSchema), {
				id: 'createProduct',
				errors: false
			})
		]);

		return {
			categories,
			tags,
			drops: drops.items,
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
	}
};
