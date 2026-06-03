import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	createPromoCode,
	createPromoCodeFormSchema,
	listPromoCodeUsages,
	listPromoCodes,
	reconcilePromoCodeUsageCount,
	reconcilePromoCodeUsageCountFormSchema,
	reconcilePromoCodeUsageCounts,
	reconcilePromoCodeUsageCountsFormSchema,
	setPromoCodeActive,
	setPromoCodeActiveFormSchema,
	updatePromoCode,
	updatePromoCodeFormSchema,
	type ListPromoCodeUsagesOptions,
	type ListPromoCodesOptions
} from '$lib/server/modules/promotions';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

function getPromoCodeOptions(url: URL): ListPromoCodesOptions {
	const tab = url.searchParams.get('tab') || 'codes';
	return {
		isActive: getStatusFilter(url.searchParams.get('status')),
		query: url.searchParams.get('query')?.trim() || undefined,
		limit: tab === 'codes' ? getIntegerParam(url.searchParams.get('limit')) : undefined,
		offset: tab === 'codes' ? getIntegerParam(url.searchParams.get('offset')) : undefined
	};
}

function getPromoUsageOptions(url: URL): ListPromoCodeUsagesOptions {
	const tab = url.searchParams.get('tab') || 'codes';
	return {
		promoCodeId: url.searchParams.get('promoCodeId')?.trim() || undefined,
		userId: url.searchParams.get('userId')?.trim() || undefined,
		orderId: url.searchParams.get('orderId')?.trim() || undefined,
		limit: tab === 'usages' ? (getIntegerParam(url.searchParams.get('limit')) ?? 25) : 25,
		offset: tab === 'usages' ? getIntegerParam(url.searchParams.get('offset')) : undefined
	};
}

function getStatusFilter(value: string | null): boolean | undefined {
	if (value === 'active') return true;
	if (value === 'inactive') return false;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);
	const promoCodeOptions = getPromoCodeOptions(url);
	const promoUsageOptions = getPromoUsageOptions(url);

	try {
		const [
			promoCodes,
			promoUsages,
			createPromoCodeForm,
			updatePromoCodeForm,
			setPromoCodeActiveForm,
			reconcilePromoCodeUsageCountForm,
			reconcilePromoCodeUsageCountsForm
		] = await Promise.all([
			listPromoCodes(ctx, promoCodeOptions),
			listPromoCodeUsages(ctx, promoUsageOptions),
			superValidate(zod4(createPromoCodeFormSchema), {
				id: 'createPromoCode'
			}),
			superValidate(zod4(updatePromoCodeFormSchema), {
				id: 'updatePromoCode'
			}),
			superValidate(zod4(setPromoCodeActiveFormSchema), {
				id: 'setPromoCodeActive'
			}),
			superValidate(zod4(reconcilePromoCodeUsageCountFormSchema), {
				id: 'reconcilePromoCodeUsageCount'
			}),
			superValidate(zod4(reconcilePromoCodeUsageCountsFormSchema), {
				id: 'reconcilePromoCodeUsageCounts'
			})
		]);

		return {
			promoCodes,
			promoUsages,
			filters: {
				status: url.searchParams.get('status') ?? '',
				query: url.searchParams.get('query')?.trim() ?? '',
				promoCodeId: promoUsageOptions.promoCodeId ?? '',
				userId: promoUsageOptions.userId ?? '',
				orderId: promoUsageOptions.orderId ?? '',
				limit: getIntegerParam(url.searchParams.get('limit')) ?? promoCodes.limit,
				offset: getIntegerParam(url.searchParams.get('offset')) ?? promoCodes.offset,
				usageLimit: promoUsageOptions.limit ?? promoUsages.limit,
				usageOffset: promoUsageOptions.offset ?? promoUsages.offset
			},
			createPromoCodeForm,
			updatePromoCodeForm,
			setPromoCodeActiveForm,
			reconcilePromoCodeUsageCountForm,
			reconcilePromoCodeUsageCountsForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	createCode: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(createPromoCodeFormSchema), {
			id: 'createPromoCode'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await createPromoCode(ctx, form.data);
			return message(form, 'Promo code created inactive.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateCode: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(updatePromoCodeFormSchema), {
			id: 'updatePromoCode'
		});

		if (!form.valid) return fail(400, { form });

		const { promoCodeId, ...data } = form.data;

		try {
			await updatePromoCode(ctx, { lookup: { id: promoCodeId }, data });
			return message(form, 'Promo code updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	setActive: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(setPromoCodeActiveFormSchema), {
			id: 'setPromoCodeActive'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await setPromoCodeActive(ctx, {
				lookup: { id: form.data.promoCodeId },
				isActive: form.data.isActive
			});
			return message(form, form.data.isActive ? 'Promo code activated.' : 'Promo code paused.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	reconcileCode: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(reconcilePromoCodeUsageCountFormSchema), {
			id: 'reconcilePromoCodeUsageCount'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await reconcilePromoCodeUsageCount(ctx, { lookup: { id: form.data.promoCodeId } });
			return message(form, 'Promo usage count reconciled.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	reconcileCodes: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(reconcilePromoCodeUsageCountsFormSchema), {
			id: 'reconcilePromoCodeUsageCounts'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const result = await reconcilePromoCodeUsageCounts(ctx, {
				limit: form.data.limit,
				offset: form.data.offset
			});
			return message(
				form,
				`Reconciled ${result.checkedCount} promo codes; ${result.changedCount} changed.`
			);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
