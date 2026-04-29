import { redirect } from '@sveltejs/kit';
import { getClientEnv } from '$lib/client/modules/env';
import type { LayoutServerLoad } from './$types';

const DEFAULT_AUTH_REDIRECT = '/account';
const ALLOWED_REDIRECT_PATHS = new Set([
	'/',
	'/account',
	'/account/addresses',
	'/account/orders',
	'/app',
	'/bag',
	'/checkout',
	'/drops',
	'/shop',
	'/wishlist'
]);

function getSafeRedirectTo(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return DEFAULT_AUTH_REDIRECT;

	let redirectUrl: URL;
	try {
		redirectUrl = new URL(value, getClientEnv().PUBLIC_APP_URL);
	} catch {
		return DEFAULT_AUTH_REDIRECT;
	}

	if (!ALLOWED_REDIRECT_PATHS.has(redirectUrl.pathname)) return DEFAULT_AUTH_REDIRECT;

	return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
}

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = locals.user;

	if (!user) return;

	throw redirect(302, getSafeRedirectTo(url.searchParams.get('redirectTo')));
};
