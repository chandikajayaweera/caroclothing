import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	createDrop,
	insertDropBaseSchema,
	optionalDropHeroImageFileSchema
} from '$lib/server/modules/drops';
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

// Extend schema to coerce datetime-local strings from HTML form to unix milliseconds timestamp numbers.
const createDropSchemaWithCoercion = insertDropBaseSchema
	.omit({ heroImageR2Key: true, status: true })
	.extend({
		heroImage: optionalDropHeroImageFileSchema,
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

export const load: PageServerLoad = async ({ locals, platform }) => {
	getAdminContext(locals, platform);

	try {
		const createDropForm = await superValidate(
			{
				name: '',
				slug: '',
				tagline: null,
				description: null,
				launchAt: null,
				endAt: null,
				sortOrder: 0
			},
			zod4(createDropSchemaWithCoercion),
			{
				id: 'createDrop',
				errors: false
			}
		);

		return {
			createDropForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	createDrop: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(createDropSchemaWithCoercion), {
			id: 'createDrop'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		try {
			const created = await createDrop(ctx, form.data);
			throw redirect(303, `/app/drops/${created.slug}`);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error && error.status === 303) {
				throw error; // Let SvelteKit handle redirect redirects
			}
			return withFiles(formFailFromAppError(form, error));
		}
	}
};
