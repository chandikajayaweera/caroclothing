import { redirect } from '@sveltejs/kit';
import type { ServiceContext } from '$lib/server/foundation/context';

export function requireAccountContext(locals: App.Locals, url: URL): ServiceContext {
	if (!locals.user || locals.user.isAnonymous) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	return { actor: locals.user };
}
