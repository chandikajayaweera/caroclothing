import { createAuthClient } from 'better-auth/svelte';
import { anonymousClient, phoneNumberClient, adminClient } from 'better-auth/client/plugins';
import {
	accessControl as ac,
	adminUser,
	customerUser
} from '$lib/server/modules/auth/access-control';

export const authClient = createAuthClient({
	plugins: [
		anonymousClient(),
		phoneNumberClient(),
		adminClient({
			ac,
			roles: { adminUser, customerUser },
			defaultRole: 'customerUser',
			adminRoles: ['adminUser']
		})
	]
});
