import { fail, redirect } from '@sveltejs/kit';
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
	setDefaultAddressFormSchema
} from '$lib/server/modules/addresses';
import { formFailFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function requireAccountContext(locals: App.Locals, url: URL) {
	if (!locals.user || locals.user.isAnonymous) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	return { actor: locals.user };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = requireAccountContext(locals, url);
	const [addresses, form] = await Promise.all([
		listMyAddresses(ctx),
		superValidate(zod4(createAddressFormSchema), { id: 'createAddress' })
	]);

	return {
		addresses,
		districts: listSriLankaDistrictOptions(),
		form
	};
};

export const actions: Actions = {
	create: async ({ locals, request, url }) => {
		const ctx = requireAccountContext(locals, url);
		const form = await superValidate(request, zod4(createAddressFormSchema), {
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

	setDefault: async ({ locals, request, url }) => {
		const ctx = requireAccountContext(locals, url);
		const form = await superValidate(request, zod4(setDefaultAddressFormSchema), {
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

	delete: async ({ locals, request, url }) => {
		const ctx = requireAccountContext(locals, url);
		const form = await superValidate(request, zod4(deleteAddressFormSchema), {
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
