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
	getPromotion,
	grantPromotionToCustomer,
	grantPromotionToCustomerFormSchema,
	listPromoCodeUsages,
	listPromotionCustomerGrants,
	revokePromotionCustomerGrant,
	setPromotionActive,
	setPromotionActiveFormSchema,
	updatePromotion,
	updatePromotionCode,
	updatePromotionCodeFormSchema,
	updatePromotionFormSchema
} from '$lib/server/modules/promotions';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

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

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = getAdminContext(locals);

	try {
		const promotion = await getPromotion(ctx, { promotionId: params.promotionId });
		const grants = await listPromotionCustomerGrants(ctx, { promotionId: promotion.id });
		const usages = await listPromoCodeUsages(ctx, {
			promotionId: promotion.id,
			limit: 25,
			offset: 0
		});
		const [updateForm, activeForm, addCodeForm, updateCodeForm, grantForm, revokeForm] =
			await Promise.all([
				superValidate(
					{
						promotionId: promotion.id,
						name: promotion.name,
						publicTitle: promotion.publicTitle,
						internalDescription: promotion.internalDescription,
						publicDescription: promotion.publicDescription,
						discountType: promotion.discountType,
						discountValue: promotion.discountValue,
						minOrderAmount: promotion.minOrderAmount,
						maxDiscountAmount: promotion.maxDiscountAmount,
						usageLimit: promotion.usageLimit,
						perUserLimit: promotion.perUserLimit,
						applicationMode: promotion.applicationMode,
						eligibilityScope: promotion.eligibilityScope,
						visibility: promotion.visibility,
						priority: promotion.priority,
						startsAt: promotion.startsAt?.getTime() ?? null,
						expiresAt: promotion.expiresAt?.getTime() ?? null
					},
					zod4(updatePromotionFormSchema),
					{ id: 'updatePromotion', errors: false }
				),
				superValidate(
					{ promotionId: promotion.id, isActive: promotion.isActive },
					zod4(setPromotionActiveFormSchema),
					{ id: 'setPromotionActive', errors: false }
				),
				superValidate(
					{
						promotionId: promotion.id,
						code: '',
						distribution: 'private' as const,
						isDiscoverable: false,
						redemptionChannel: 'storefront' as const,
						partnerReference: null,
						codeUsageLimit: null
					},
					zod4(addPromotionCodeFormSchema),
					{ id: 'addPromotionCode', errors: false }
				),
				superValidate(zod4(updatePromotionCodeFormSchema), {
					id: 'updatePromotionCode',
					errors: false
				}),
				superValidate(
					{
						promotionId: promotion.id,
						userId: '',
						startsAt: null,
						expiresAt: null
					},
					zod4(grantPromotionToCustomerFormSchema),
					{ id: 'grantPromotionToCustomer', errors: false }
				),
				superValidate(zod4(grantPromotionToCustomerFormSchema), {
					id: 'revokePromotionCustomerGrant',
					errors: false
				})
			]);

		return {
			promotion,
			grants,
			usages,
			updateForm,
			activeForm,
			addCodeForm,
			updateCodeForm,
			grantForm,
			revokeForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	update: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(updatePromotionFormSchema), {
			id: 'updatePromotion'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updatePromotion(getAdminContext(locals), {
				promotionId: params.promotionId,
				data: promotionData(form.data)
			});
			return message(form, 'Promotion updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	setActive: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(setPromotionActiveFormSchema), {
			id: 'setPromotionActive'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await setPromotionActive(getAdminContext(locals), {
				promotionId: params.promotionId,
				isActive: form.data.isActive
			});
			return message(form, form.data.isActive ? 'Promotion activated.' : 'Promotion paused.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	addCode: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(addPromotionCodeFormSchema), {
			id: 'addPromotionCode'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await addPromotionCode(getAdminContext(locals), {
				promotionId: params.promotionId,
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
			id: 'updatePromotionCode'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await updatePromotionCode(getAdminContext(locals), {
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
	grant: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(grantPromotionToCustomerFormSchema), {
			id: 'grantPromotionToCustomer'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await grantPromotionToCustomer(getAdminContext(locals), {
				...form.data,
				promotionId: params.promotionId
			});
			return message(form, 'Customer grant added.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	revokeGrant: async ({ locals, params, request }) => {
		const form = await superValidate(request, zod4(grantPromotionToCustomerFormSchema), {
			id: 'revokePromotionCustomerGrant'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await revokePromotionCustomerGrant(getAdminContext(locals), {
				promotionId: params.promotionId,
				userId: form.data.userId
			});
			return message(form, 'Customer grant revoked.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
