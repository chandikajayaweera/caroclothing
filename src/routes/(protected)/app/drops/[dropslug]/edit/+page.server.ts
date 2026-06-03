import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	getDrop,
	updateDrop,
	updateDropBaseSchema,
	optionalDropHeroImageFileSchema,
	setDropProducts,
	setDropProductsFormSchema,
	setDropHeroProduct,
	setDropHeroProductFormSchema,
	transitionDropStatus,
	transitionDropStatusFormSchema
} from '$lib/server/modules/drops';
import { listProducts } from '$lib/server/modules/products';
import { z } from 'zod';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

function validateDropWindow(
	data: { launchAt?: number | null; endAt?: number | null },
	ctx: z.RefinementCtx
) {
	if (data.launchAt && data.endAt && data.endAt <= data.launchAt) {
		ctx.addIssue({
			code: 'custom',
			message: 'endAt must be after launchAt',
			path: ['endAt']
		});
	}
}

const updateDropSchemaWithCoercion = updateDropBaseSchema
	.omit({ heroImageR2Key: true, status: true })
	.extend({
		heroImage: optionalDropHeroImageFileSchema,
		removeHeroImage: z.boolean().optional(),
		launchAt: z.preprocess((val) => {
			if (val === '' || val === undefined || val === null) return null;
			if (typeof val === 'number') return val;
			if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val);
			const d = new Date(val as string);
			return isNaN(d.getTime()) ? null : d.getTime();
		}, z.number().int().positive().optional().nullable()),
		endAt: z.preprocess((val) => {
			if (val === '' || val === undefined || val === null) return null;
			if (typeof val === 'number') return val;
			if (typeof val === 'string' && /^\d+$/.test(val)) return Number(val);
			const d = new Date(val as string);
			return isNaN(d.getTime()) ? null : d.getTime();
		}, z.number().int().positive().optional().nullable())
	})
	.superRefine(validateDropWindow);

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
		const drop = await getDrop(ctx, { slug: params.dropslug }, { includeArchived: true });

		// Fetch all drop-tier products to manage lineup selection
		const productsResponse = await listProducts(ctx, {
			tier: 'drop',
			includeInactive: true,
			limit: 150
		});
		const dropTierProducts = productsResponse.items;

		// Populate forms
		const updateDropForm = await superValidate(
			{
				name: drop.name,
				slug: drop.slug,
				tagline: drop.tagline,
				description: drop.description,
				launchAt: drop.launchAt ? new Date(drop.launchAt).getTime() : null,
				endAt: drop.endAt ? new Date(drop.endAt).getTime() : null,
				sortOrder: drop.sortOrder,
				removeHeroImage: false
			},
			zod4(updateDropSchemaWithCoercion),
			{
				id: 'updateDrop'
			}
		);

		const assignedProductIds = drop.products.map((p) => p.productId);

		const setDropProductsForm = await superValidate(
			{
				dropId: drop.id,
				productIds: assignedProductIds
			},
			zod4(setDropProductsFormSchema),
			{
				id: 'setDropProducts'
			}
		);

		const heroProductId = drop.products.find((p) => p.isHero)?.productId || '';

		const setDropHeroProductForm = await superValidate(
			{
				dropId: drop.id,
				productId: heroProductId
			},
			zod4(setDropHeroProductFormSchema),
			{
				id: 'setDropHeroProduct'
			}
		);

		const transitionDropStatusForm = await superValidate(
			{
				dropId: drop.id,
				toStatus: drop.status
			},
			zod4(transitionDropStatusFormSchema),
			{
				id: 'transitionDropStatus'
			}
		);

		return {
			drop,
			dropTierProducts,
			updateDropForm,
			setDropProductsForm,
			setDropHeroProductForm,
			transitionDropStatusForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	updateDrop: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateDropSchemaWithCoercion), {
			id: 'updateDrop'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		try {
			const updated = await updateDrop(ctx, { slug: event.params.dropslug }, form.data);
			throw redirect(303, `/app/drops/${updated.slug}`);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error && error.status === 303) {
				throw error; // Let SvelteKit handle redirect redirects
			}
			return withFiles(formFailFromAppError(form, error));
		}
	},

	setDropProducts: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(setDropProductsFormSchema), {
			id: 'setDropProducts'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await setDropProducts(ctx, form.data);
			return { success: true, message: 'Drop product lineup updated.' };
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	setDropHeroProduct: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(setDropHeroProductFormSchema), {
			id: 'setDropHeroProduct'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await setDropHeroProduct(ctx, form.data);
			return { success: true, message: 'Drop hero product selected.' };
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	transitionDropStatus: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(transitionDropStatusFormSchema), {
			id: 'transitionDropStatus'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const { dropId, toStatus } = form.data;
			const updated = await transitionDropStatus(ctx, { dropId, toStatus });
			throw redirect(303, `/app/drops/${updated.slug}/edit`);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error && error.status === 303) {
				throw error;
			}
			return formFailFromAppError(form, error);
		}
	}
};
