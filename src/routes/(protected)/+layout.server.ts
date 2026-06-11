import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isPhoneDerivedDisplayName } from '$lib/shared/modules/auth-profile';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = locals.user;

	const { pathname, search } = url;
	if (!user) {
		const redirectTo = `${pathname}${search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	if (
		!user.isAnonymous &&
		pathname !== '/account' &&
		isPhoneDerivedDisplayName(user.name, user.phoneNumber)
	) {
		throw redirect(303, '/account?completeName=1');
	}
};
