import { createAuthClient } from 'better-auth/svelte';
import {
	anonymousClient,
	oneTapClient,
	phoneNumberClient,
	adminClient
} from 'better-auth/client/plugins';
import {
	accessControl as ac,
	adminUser,
	customerUser
} from '$lib/client/modules/auth/access-control';
import { getClientEnv } from '$lib/client/modules/env';

const clientEnv = getClientEnv();

export const authClient = createAuthClient({
	plugins: [
		anonymousClient(),
		oneTapClient({
			clientId: clientEnv.PUBLIC_GOOGLE_CLIENT_ID,
			autoSelect: false,
			cancelOnTapOutside: false,
			uxMode: 'popup',
			context: 'signin',

			promptOptions: {
				baseDelay: 1000,
				maxAttempts: 5,
				fedCM: true
			}
		}),
		phoneNumberClient(),
		adminClient({
			ac,
			roles: { adminUser, customerUser },
			defaultRole: 'customerUser',
			adminRoles: ['adminUser']
		})
	]
});
