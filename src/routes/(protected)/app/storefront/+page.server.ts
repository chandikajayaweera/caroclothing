import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import type { ServiceContext } from '$lib/server/foundation/context';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	deleteStorefrontSection,
	deleteStorefrontSectionFormSchema,
	listStorefrontSections,
	reorderStorefrontSections,
	reorderStorefrontSectionsFormSchema,
	setStorefrontSectionEnabled,
	setStorefrontSectionEnabledFormSchema
} from '$lib/server/modules/storefront';

function context(event: Pick<RequestEvent, 'locals' | 'platform'>): ServiceContext {
	return {
		actor: event.locals.user,
		event,
		notificationWakeups: createCloudflareNotificationWakeups(event.platform)
	};
}

export const load: PageServerLoad = async (event) => {
	try {
		const sections = await listStorefrontSections(context(event));
		return {
			sections,
			toggleForm: await superValidate(zod4(setStorefrontSectionEnabledFormSchema), {
				id: 'storefront-toggle'
			}),
			reorderForm: await superValidate(
				{ pageKey: 'home' as const, sectionIds: sections.map((item) => item.id) },
				zod4(reorderStorefrontSectionsFormSchema),
				{ id: 'storefront-reorder' }
			),
			deleteForm: await superValidate(zod4(deleteStorefrontSectionFormSchema), {
				id: 'storefront-delete'
			})
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	toggle: async (event) => {
		const form = await superValidate(event.request, zod4(setStorefrontSectionEnabledFormSchema), {
			id: 'storefront-toggle'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await setStorefrontSectionEnabled(context(event), form.data);
			return { form, success: true };
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	reorder: async (event) => {
		const form = await superValidate(event.request, zod4(reorderStorefrontSectionsFormSchema), {
			id: 'storefront-reorder'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await reorderStorefrontSections(context(event), form.data);
			return { form, success: true };
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	delete: async (event) => {
		const form = await superValidate(event.request, zod4(deleteStorefrontSectionFormSchema), {
			id: 'storefront-delete'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await deleteStorefrontSection(context(event), form.data);
			return { form, success: true };
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
