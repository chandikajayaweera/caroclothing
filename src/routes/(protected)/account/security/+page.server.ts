import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import {
	listMySessions,
	revokeMySession,
	revokeMySessionFormSchema
} from '$lib/server/modules/auth';
import { formFailFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from '../_account.server';
import { mapOAuthErrorToMessage } from '$lib/shared/auth/errors';

export const load: PageServerLoad = async (event) => {
	const ctx = requireAccountContext(event);
	const sessionsPromise = listMySessions(ctx, {
		currentSessionId: event.locals.session?.id,
		limit: 100
	});
	const [{ account }, sessions, revokeSessionForm] = await Promise.all([
		event.parent(),
		sessionsPromise,
		superValidate(zod4(revokeMySessionFormSchema), {
			id: 'revokeMySession'
		})
	]);

	const oauthError = event.url.searchParams.get('error');
	const oauthErrorMessage = oauthError ? mapOAuthErrorToMessage(oauthError) : null;

	return {
		account,
		sessions,
		revokeSessionForm,
		oauthError: oauthErrorMessage
	};
};

export const actions: Actions = {
	revokeSession: async (event) => {
		const ctx = requireAccountContext(event);
		const form = await superValidate(event.request, zod4(revokeMySessionFormSchema), {
			id: 'revokeMySession'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const result = await revokeMySession(ctx, form.data);
			if (result.revokedCount === 0) {
				return message(form, 'Session is already signed out.');
			}
			return message(form, 'Session signed out.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
