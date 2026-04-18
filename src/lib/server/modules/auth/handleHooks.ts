import { redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getAuth } from '$lib/server/modules/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const AuthHook: Handle = async ({ event, resolve }) => {
	const auth = getAuth();
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

const exactPublicRoutes = new Set(['/', '/sign-in']);

const publicPathPrefixes = ['/api/auth'];

export const GuardedRoutesHook: Handle = async ({ event, resolve }) => {
	const user = event.locals.user;
	const { pathname, search } = event.url;

	const isPublic =
		exactPublicRoutes.has(pathname) ||
		publicPathPrefixes.some((prefix) => pathname.startsWith(prefix));

	if (!user && !isPublic) {
		const redirectTo = `${pathname}${search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	if (user && pathname === '/sign-in') {
		throw redirect(302, '/app');
	}

	return resolve(event);
};
