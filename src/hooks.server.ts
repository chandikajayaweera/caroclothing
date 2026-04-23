import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import {
	AuthHook as Auth,
	GuardedRoutesHook as GuardedRoutes
} from '$lib/server/modules/auth/handleHooks';

export const handle: Handle = sequence(Auth);
