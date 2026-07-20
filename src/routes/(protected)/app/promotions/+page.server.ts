import { fail } from '@sveltejs/kit';
import type { z } from 'zod';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import {
	addPromotionCode,
	addPromotionCodeFormSchema,
	createPromotion,
	createPromotionFormSchema,
	grantPromotionToCustomer,
	grantPromotionToCustomerFormSchema,
	listPromoCodeUsages,
	listPromotionCustomerGrants,
	listPromotions,
	revokePromotionCustomerGrant,
	setPromotionActive,
	setPromotionActiveFormSchema,
	updatePromotion,
	updatePromotionCode,
	updatePromotionCodeFormSchema,
	updatePromotionFormSchema
} from '$lib/server/modules/promotions';

function ctx(locals: App.Locals) {
	return { actor: locals.user };
}
function int(value: string | null, fallback: number) {
	const number = Number(value);
	return Number.isInteger(number) && number >= 0 ? number : fallback;
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

export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		const limit = int(url.searchParams.get('limit'), 50);
		const offset = int(url.searchParams.get('offset'), 0);
		const [promotions, usages, grants] = await Promise.all([
			listPromotions(ctx(locals), {
				query: url.searchParams.get('query')?.trim() || undefined,
				applicationMode:
					url.searchParams.get('mode') === 'automatic'
						? 'automatic'
						: url.searchParams.get('mode') === 'code'
							? 'code'
							: undefined,
				limit,
				offset
			}),
			listPromoCodeUsages(ctx(locals), { limit: 25, offset: 0 }),
			listPromotionCustomerGrants(ctx(locals))
		]);
		return {
			promotions,
			usages,
			grants,
			filters: {
				query: url.searchParams.get('query') ?? '',
				mode: url.searchParams.get('mode') ?? ''
			},
			createForm: await superValidate(defaults, zod4(createPromotionFormSchema), {
				id: 'promotion-create',
				errors: false
			}),
			updateForm: await superValidate(
				{ promotionId: '', ...defaults },
				zod4(updatePromotionFormSchema),
				{ id: 'promotion-update', errors: false }
			),
			activeForm: await superValidate(zod4(setPromotionActiveFormSchema), {
				id: 'promotion-active'
			})
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
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

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(createPromotionFormSchema), {
			id: 'promotion-create'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await createPromotion(ctx(locals), {
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
			return message(form, 'Promotion created inactive.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	update: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(updatePromotionFormSchema), {
			id: 'promotion-update'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await updatePromotion(ctx(locals), {
				promotionId: form.data.promotionId,
				data: promotionData(form.data)
			});
			return message(form, 'Promotion updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	addCode: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(addPromotionCodeFormSchema), {
			id: 'promotion-add-code'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await addPromotionCode(ctx(locals), {
				promotionId: form.data.promotionId,
				code: form.data.code,
				distribution: form.data.distribution,
				isDiscoverable: form.data.isDiscoverable,
				redemptionChannel: form.data.redemptionChannel,
				partnerReference: form.data.partnerReference,
				usageLimit: form.data.codeUsageLimit
			});
			return message(form, 'Redemption code added.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	updateCode: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(updatePromotionCodeFormSchema), {
			id: 'promotion-update-code'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await updatePromotionCode(ctx(locals), {
				promoCodeId: form.data.promoCodeId,
				data: {
					code: form.data.code,
					distribution: form.data.distribution,
					isDiscoverable: form.data.isDiscoverable,
					redemptionChannel: form.data.redemptionChannel,
					partnerReference: form.data.partnerReference,
					usageLimit: form.data.codeUsageLimit,
					isActive: form.data.isActive
				}
			});
			return message(form, 'Redemption code updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	setActive: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(setPromotionActiveFormSchema), {
			id: 'promotion-active'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await setPromotionActive(ctx(locals), form.data);
			return message(form, form.data.isActive ? 'Promotion activated.' : 'Promotion paused.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	grant: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(grantPromotionToCustomerFormSchema), {
			id: 'promotion-grant'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await grantPromotionToCustomer(ctx(locals), form.data);
			return message(form, 'Customer grant added.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	revokeGrant: async ({ locals, request }) => {
		const form = await superValidate(request, zod4(grantPromotionToCustomerFormSchema), {
			id: 'promotion-revoke-grant'
		});
		if (!form.valid) return fail(400, { form });
		try {
			await revokePromotionCustomerGrant(ctx(locals), {
				promotionId: form.data.promotionId,
				userId: form.data.userId
			});
			return message(form, 'Customer grant revoked.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
