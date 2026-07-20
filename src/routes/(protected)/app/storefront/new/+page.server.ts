import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate, withFiles } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import type { ServiceContext } from '$lib/server/foundation/context';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	createStorefrontSection,
	createStorefrontSectionFormSchema,
	getStorefrontEditorOptions
} from '$lib/server/modules/storefront';

function context(event: Pick<RequestEvent, 'locals' | 'platform'>): ServiceContext {
	return {
		actor: event.locals.user,
		event,
		notificationWakeups: createCloudflareNotificationWakeups(event.platform)
	};
}
const defaults = {
	pageKey: 'home' as const,
	type: 'hero' as const,
	adminName: '',
	layoutVariant: 'full_bleed' as const,
	sourceType: 'manual' as const,
	eyebrow: null,
	title: null,
	body: null,
	primaryCtaLabel: null,
	primaryCtaUrl: null,
	secondaryCtaLabel: null,
	secondaryCtaUrl: null,
	productId: null,
	categoryId: null,
	promotionId: null,
	shippingMethodId: null,
	itemLimit: 8,
	sortOrder: 0,
	enabled: false,
	startsAt: null,
	endsAt: null,
	categoryIds: [],
	desktopImage: null,
	mobileImage: null,
	desktopAltText: null,
	mobileAltText: null,
	desktopFocalX: 50,
	desktopFocalY: 50,
	mobileFocalX: 50,
	mobileFocalY: 50
};

export const load: PageServerLoad = async (event) => {
	try {
		return {
			options: await getStorefrontEditorOptions(context(event)),
			createForm: await superValidate(defaults, zod4(createStorefrontSectionFormSchema), {
				id: 'storefront-create',
				errors: false
			})
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	create: async (event) => {
		const form = await superValidate(event.request, zod4(createStorefrontSectionFormSchema), {
			id: 'storefront-create'
		});
		if (!form.valid) return fail(400, withFiles({ form }));
		try {
			const created = await createStorefrontSection(context(event), form.data);
			throw redirect(303, `/app/storefront/${created.id}/edit`);
		} catch (error) {
			return withFiles(formFailFromAppError(form, error));
		}
	}
};
