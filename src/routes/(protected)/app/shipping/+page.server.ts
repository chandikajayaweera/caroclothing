import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	createShippingMethod,
	createShippingMethodFormSchema,
	listShippingDistrictOptions,
	listShippingMethods,
	listShippingZones,
	removeShippingZone,
	removeShippingZoneFormSchema,
	setShippingZone,
	setShippingZoneFormSchema,
	updateShippingMethod,
	updateShippingMethodFormSchema,
	listCarriers,
	createCarrier,
	updateCarrier,
	deleteCarrier,
	createCarrierFormSchema,
	updateCarrierFormSchema,
	deleteCarrierFormSchema,
	type ListShippingMethodsOptions,
	type ListShippingZonesOptions,
	type SriLankaDistrict
} from '$lib/server/modules/shipping';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

function getMethodOptions(url: URL): ListShippingMethodsOptions {
	return {
		isActive: getStatusFilter(url.searchParams.get('status')),
		query: url.searchParams.get('query')?.trim() || undefined,
		includeZones: true,
		limit: getIntegerParam(url.searchParams.get('limit')),
		offset: getIntegerParam(url.searchParams.get('offset'))
	};
}

function getZoneOptions(url: URL): ListShippingZonesOptions {
	return {
		shippingMethodId: url.searchParams.get('shippingMethodId')?.trim() || undefined,
		district: getDistrict(url.searchParams.get('district')),
		limit: 100
	};
}

function getStatusFilter(value: string | null): boolean | undefined {
	if (value === 'active') return true;
	if (value === 'inactive') return false;
	return undefined;
}

function getDistrict(value: string | null): SriLankaDistrict | undefined {
	const districts = listShippingDistrictOptions().map((district) => district.value);
	return districts.includes(value as SriLankaDistrict) ? (value as SriLankaDistrict) : undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);
	const methodOptions = getMethodOptions(url);
	const zoneOptions = getZoneOptions(url);

	try {
		const [
			methods,
			zones,
			carriers,
			createMethodForm,
			updateMethodForm,
			setZoneForm,
			removeZoneForm,
			createCarrierForm,
			updateCarrierForm,
			deleteCarrierForm
		] = await Promise.all([
			listShippingMethods(ctx, methodOptions),
			listShippingZones(ctx, zoneOptions),
			listCarriers(ctx),
			superValidate(zod4(createShippingMethodFormSchema), {
				id: 'createShippingMethod'
			}),
			superValidate(zod4(updateShippingMethodFormSchema), {
				id: 'updateShippingMethod'
			}),
			superValidate(zod4(setShippingZoneFormSchema), {
				id: 'setShippingZone'
			}),
			superValidate(zod4(removeShippingZoneFormSchema), {
				id: 'removeShippingZone'
			}),
			superValidate(zod4(createCarrierFormSchema), {
				id: 'createCarrier'
			}),
			superValidate(zod4(updateCarrierFormSchema), {
				id: 'updateCarrier'
			}),
			superValidate(zod4(deleteCarrierFormSchema), {
				id: 'deleteCarrier'
			})
		]);

		return {
			methods,
			zones,
			carriers,
			districts: listShippingDistrictOptions(),
			filters: {
				status: url.searchParams.get('status') ?? '',
				query: url.searchParams.get('query')?.trim() ?? '',
				shippingMethodId: zoneOptions.shippingMethodId ?? '',
				district: zoneOptions.district ?? ''
			},
			createMethodForm,
			updateMethodForm,
			setZoneForm,
			removeZoneForm,
			createCarrierForm,
			updateCarrierForm,
			deleteCarrierForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	createMethod: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(createShippingMethodFormSchema), {
			id: 'createShippingMethod'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await createShippingMethod(ctx, form.data);
			return message(form, 'Shipping method created.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateMethod: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(updateShippingMethodFormSchema), {
			id: 'updateShippingMethod'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateShippingMethod(ctx, form.data);
			return message(form, 'Shipping method updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	setZone: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(setShippingZoneFormSchema), {
			id: 'setShippingZone'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await setShippingZone(ctx, form.data);
			return message(form, 'Shipping zone saved.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	removeZone: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(removeShippingZoneFormSchema), {
			id: 'removeShippingZone'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await removeShippingZone(ctx, form.data);
			return message(form, 'Shipping zone removed.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	// Carrier CRUD Actions
	createCarrier: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(createCarrierFormSchema), {
			id: 'createCarrier'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await createCarrier(ctx, form.data);
			return message(form, 'Carrier created.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateCarrier: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(updateCarrierFormSchema), {
			id: 'updateCarrier'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateCarrier(ctx, form.data);
			return message(form, 'Carrier updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteCarrier: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(deleteCarrierFormSchema), {
			id: 'deleteCarrier'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteCarrier(ctx, { carrierId: form.data.carrierId });
			return message(form, 'Carrier deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
