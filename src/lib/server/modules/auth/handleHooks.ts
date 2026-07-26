import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getAuth } from '$lib/server/modules/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { resolveAuthSession } from './session-lookup';

const SESSIONLESS_ROUTE_IDS = new Set(['/api/products/availability']);

export const AuthHook: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}

	const auth = getAuth();
	const session = SESSIONLESS_ROUTE_IDS.has(event.route.id ?? '')
		? null
		: await resolveAuthSession(() => auth.api.getSession({ headers: event.request.headers }));

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	const response = await svelteKitHandler({ event, resolve, auth, building });

	// Intercept redirects to error page to simplify URL query parameters
	if (response.status === 302) {
		const location = response.headers.get('location');
		if (location && location.includes('/auth/error?error=banned')) {
			try {
				const url = new URL(location, event.url.origin);
				url.searchParams.delete('error_description');
				response.headers.set('location', url.pathname + url.search);
			} catch {
				console.error('[auth] Failed to parse Better Auth redirect location.');
			}
		}
	}

	// Intercept phone OTP/verification errors to set temporary ban cookie
	if (response.status === 403 || response.status === 400) {
		try {
			const clone = response.clone();
			const json = (await clone.json()) as {
				error?: { code?: unknown; message?: unknown };
				code?: unknown;
				message?: unknown;
			};
			const errCode =
				typeof json.error?.code === 'string'
					? json.error.code
					: typeof json.code === 'string'
						? json.code
						: null;
			if (errCode === 'ACCOUNT_SUSPENDED') {
				const rawMsg =
					typeof json.error?.message === 'string'
						? json.error.message
						: typeof json.message === 'string'
							? json.message
							: '';
				const dateMatch = rawMsg.match(/suspended until (.*?)\./);
				const banExpires = dateMatch ? Date.parse(dateMatch[1]) : null;

				const cookieVal = JSON.stringify({
					banExpires: isNaN(banExpires as number) ? null : banExpires,
					banReason: null
				});

				response.headers.append(
					'set-cookie',
					`caro_temp_ban_info=${encodeURIComponent(cookieVal)}; Path=/; Max-Age=10; HttpOnly; SameSite=Lax`
				);
			}
		} catch {
			// Ignore json parsing issues for non-JSON responses
		}
	}

	return response;
};
