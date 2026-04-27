import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getAuth } from '$lib/server/modules/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const AuthHook: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}

	const auth = getAuth();
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
