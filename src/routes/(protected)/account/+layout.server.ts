import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { repairMyTempEmailFromLinkedGoogle } from '$lib/server/modules/auth';
import { requireAccountContext } from './_account.server';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const ctx = requireAccountContext(locals, url);
	const account = await repairMyTempEmailFromLinkedGoogle(ctx);

	if (account.needsNameCompletion && url.pathname !== '/account') {
		throw redirect(303, '/account?completeName=1');
	}

	return {
		account
	};
};
