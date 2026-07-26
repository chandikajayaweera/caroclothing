import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
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
	getStorefrontEditorOptions,
	getStorefrontSection,
	updateStorefrontSection,
	updateStorefrontSectionFormSchema
} from '$lib/server/modules/storefront';

function context(event: Pick<RequestEvent, 'locals' | 'platform'>): ServiceContext {
	return {
		actor: event.locals.user,
		event,
		notificationWakeups: createCloudflareNotificationWakeups(event.platform)
	};
}
function formData(section: Awaited<ReturnType<typeof getStorefrontSection>>) {
	const desktop = section.media.find((item) => item.role === 'desktop');
	const mobile = section.media.find((item) => item.role === 'mobile');
	return {
		sectionId: section.id,
		pageKey: section.pageKey,
		type: section.type,
		adminName: section.adminName,
		layoutVariant: section.layoutVariant,
		sourceType: section.sourceType,
		eyebrow: section.eyebrow,
		title: section.title,
		body: section.body,
		primaryCtaLabel: section.primaryCtaLabel,
		primaryCtaUrl: section.primaryCtaUrl,
		secondaryCtaLabel: section.secondaryCtaLabel,
		secondaryCtaUrl: section.secondaryCtaUrl,
		productId: section.productId,
		categoryId: section.categoryId,
		promotionId: section.promotionId,
		shippingMethodId: section.shippingMethodId,
		itemLimit: section.itemLimit,
		sortOrder: section.sortOrder,
		enabled: section.enabled,
		startsAt: section.startsAt?.getTime() ?? null,
		endsAt: section.endsAt?.getTime() ?? null,
		categoryIds: section.categoryIds,
		desktopImage: null,
		mobileImage: null,
		removeDesktopImage: false,
		removeMobileImage: false,
		desktopAltText: desktop?.altText ?? null,
		mobileAltText: mobile?.altText ?? null,
		desktopFocalX: desktop?.focalX ?? 50,
		desktopFocalY: desktop?.focalY ?? 50,
		mobileFocalX: mobile?.focalX ?? 50,
		mobileFocalY: mobile?.focalY ?? 50
	};
}

export const load: PageServerLoad = async (event) => {
	try {
		const section = await getStorefrontSection(context(event), {
			sectionId: event.params.sectionId
		});
		const options = await getStorefrontEditorOptions(context(event));
		return {
			section,
			options,
			updateForm: await superValidate(formData(section), zod4(updateStorefrontSectionFormSchema), {
				id: 'storefront-update',
				errors: false
			}),
			deleteForm: await superValidate(
				{ sectionId: section.id },
				zod4(deleteStorefrontSectionFormSchema),
				{ id: 'storefront-delete' }
			)
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	update: async (event) => {
		const form = await superValidate(event.request, zod4(updateStorefrontSectionFormSchema), {
			id: 'storefront-update'
		});
		if (!form.valid) return fail(400, withFiles({ form }));
		try {
			const { sectionId, ...data } = form.data;
			await updateStorefrontSection(context(event), { sectionId, data });
			return withFiles(message(form, 'Storefront section saved.'));
		} catch (error) {
			return withFiles(formFailFromAppError(form, error));
		}
	},
	delete: async (event) => {
		const form = await superValidate(event.request, zod4(deleteStorefrontSectionFormSchema), {
			id: 'storefront-delete'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await deleteStorefrontSection(context(event), form.data);
			throw redirect(303, '/app/storefront');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
