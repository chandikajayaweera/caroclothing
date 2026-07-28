import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { updateMyDisplayName, updateMyDisplayNameFormSchema } from '$lib/server/modules/auth';
import { getMyAccountSummary } from '$lib/server/modules/account';
import { formFailFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from './_account.server';

export const load: PageServerLoad = async (event) => {
	const ctx = requireAccountContext(event);
	const summaryPromise = getMyAccountSummary(ctx);
	const [{ account }, summary] = await Promise.all([event.parent(), summaryPromise]);
	const nameForm = await superValidate(
		{ name: account.needsNameCompletion ? '' : account.name },
		zod4(updateMyDisplayNameFormSchema),
		{ id: 'updateDisplayName', errors: false }
	);

	return {
		nameForm,
		summary
	};
};

export const actions: Actions = {
	updateName: async (event) => {
		const ctx = requireAccountContext(event);
		const form = await superValidate(event.request, zod4(updateMyDisplayNameFormSchema), {
			id: 'updateDisplayName'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateMyDisplayName(ctx, form.data);
			return message(form, 'Name updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
