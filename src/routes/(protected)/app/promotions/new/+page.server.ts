import { fail, redirect } from '@sveltejs/kit';
import type { z } from 'zod';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	createPromotion,
	createPromotionFormSchema,
	updatePromotionFormSchema
} from '$lib/server/modules/promotions';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

const defaults = {
	name: '',
	publicTitle: null,
	internalDescription: null,
	publicDescription: null,
	discountType: 'fixed' as const,
	discountValue: 1,
	minOrderAmount: null,
	maxDiscountAmount: null,
	usageLimit: null,
	perUserLimit: 1,
	applicationMode: 'code' as const,
	eligibilityScope: 'all' as const,
	visibility: 'internal' as const,
	priority: 0,
	startsAt: null,
	expiresAt: null,
	code: null,
	distribution: 'private' as const,
	isDiscoverable: false,
	redemptionChannel: 'storefront' as const,
	partnerReference: null,
	codeUsageLimit: null
};

type PromotionRuleData = Omit<z.infer<typeof updatePromotionFormSchema>, 'promotionId'>;

function promotionData(data: PromotionRuleData) {
	return {
		name: data.name,
		publicTitle: data.publicTitle,
		internalDescription: data.internalDescription,
		publicDescription: data.publicDescription,
		discountType: data.discountType,
		discountValue: data.discountValue,
		minOrderAmount: data.minOrderAmount,
		maxDiscountAmount: data.maxDiscountAmount,
		usageLimit: data.usageLimit,
		perUserLimit: data.perUserLimit,
		applicationMode: data.applicationMode,
		eligibilityScope: data.eligibilityScope,
		visibility: data.visibility,
		priority: data.priority,
		startsAt: data.startsAt,
		expiresAt: data.expiresAt
	};
}

export const load: PageServerLoad = async () => {
	try {
		return {
			createForm: await superValidate(defaults, zod4(createPromotionFormSchema), {
				id: 'createPromotion',
				errors: false
			})
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(createPromotionFormSchema), {
			id: 'createPromotion'
		});
		if (!form.valid) return fail(400, { form });

		try {
			const created = await createPromotion(getAdminContext(locals), {
				...promotionData(form.data),
				code:
					form.data.applicationMode === 'code' && form.data.code
						? {
								code: form.data.code,
								distribution: form.data.distribution,
								isDiscoverable: form.data.isDiscoverable,
								redemptionChannel: form.data.redemptionChannel,
								partnerReference: form.data.partnerReference,
								usageLimit: form.data.codeUsageLimit
							}
						: null
			});
			throw redirect(303, `/app/promotions/${created.id}`);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
