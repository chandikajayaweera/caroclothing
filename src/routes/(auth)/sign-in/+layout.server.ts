import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = locals.user;

	if (!user) return;

	const redirectTo = url.searchParams.get('redirectTo');

	throw redirect(302, redirectTo?.startsWith('/') ? redirectTo : '/account');
};
