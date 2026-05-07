import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { repairMyTempEmailFromLinkedGoogle } from '$lib/server/modules/auth';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || locals.user.isAnonymous) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	const ctx = { actor: locals.user };
	const user = await repairMyTempEmailFromLinkedGoogle(ctx);

	return {
		user
	};
};
