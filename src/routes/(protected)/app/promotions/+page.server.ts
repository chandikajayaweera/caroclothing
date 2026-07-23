import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	listPromotions,
	setPromotionActive,
	setPromotionActiveFormSchema,
	type ListPromotionsOptions
} from '$lib/server/modules/promotions';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

function getNonNegativeInteger(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function getApplicationMode(value: string | null): ListPromotionsOptions['applicationMode'] {
	return value === 'automatic' || value === 'code' ? value : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const options: ListPromotionsOptions = {
		query: url.searchParams.get('query')?.trim() || undefined,
		applicationMode: getApplicationMode(url.searchParams.get('mode')),
		limit: getNonNegativeInteger(url.searchParams.get('limit')) || 25,
		offset: getNonNegativeInteger(url.searchParams.get('offset'))
	};

	try {
		const [promotions, activeForm] = await Promise.all([
			listPromotions(getAdminContext(locals), options),
			superValidate(zod4(setPromotionActiveFormSchema), {
				id: 'setPromotionActive'
			})
		]);

		return {
			promotions,
			filters: {
				query: options.query ?? '',
				mode: options.applicationMode ?? '',
				limit: promotions.limit,
				offset: promotions.offset
			},
			activeForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	setActive: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(setPromotionActiveFormSchema), {
			id: 'setPromotionActive'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await setPromotionActive(getAdminContext(locals), form.data);
			return message(form, form.data.isActive ? 'Promotion activated.' : 'Promotion paused.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
