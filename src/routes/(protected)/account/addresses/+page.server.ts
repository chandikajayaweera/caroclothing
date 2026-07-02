import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import {
	createAddress,
	createAddressFormSchema,
	deleteAddress,
	deleteAddressFormSchema,
	listMyAddresses,
	listSriLankaDistrictOptions,
	setDefaultAddress,
	setDefaultAddressFormSchema,
	updateAddress,
	updateMyAddressFormSchema
} from '$lib/server/modules/addresses';
import { formFailFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from '../_account.server';

export const load: PageServerLoad = async (event) => {
	const ctx = requireAccountContext(event);
	const [addresses, form, updateForm] = await Promise.all([
		listMyAddresses(ctx),
		superValidate(zod4(createAddressFormSchema), { id: 'createAddress', errors: false }),
		superValidate(zod4(updateMyAddressFormSchema), { id: 'updateAddress', errors: false })
	]);

	return {
		addresses,
		districts: listSriLankaDistrictOptions(),
		form,
		updateForm
	};
};

export const actions: Actions = {
	create: async (event) => {
		const ctx = requireAccountContext(event);
		const form = await superValidate(event.request, zod4(createAddressFormSchema), {
			id: 'createAddress'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await createAddress(ctx, form.data);
			return message(form, 'Address saved.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	update: async (event) => {
		const ctx = requireAccountContext(event);
		const form = await superValidate(event.request, zod4(updateMyAddressFormSchema), {
			id: 'updateAddress'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateAddress(ctx, form.data);
			return message(form, 'Address updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	setDefault: async (event) => {
		const ctx = requireAccountContext(event);
		const form = await superValidate(event.request, zod4(setDefaultAddressFormSchema), {
			id: 'setDefaultAddress'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await setDefaultAddress(ctx, { addressId: form.data.addressId });
			return message(form, 'Default address updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	delete: async (event) => {
		const ctx = requireAccountContext(event);
		const form = await superValidate(event.request, zod4(deleteAddressFormSchema), {
			id: 'deleteAddress'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteAddress(ctx, { addressId: form.data.addressId });
			return message(form, 'Address deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
