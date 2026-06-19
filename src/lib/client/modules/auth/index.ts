import { createAuthClient } from 'better-auth/svelte';
import {
	anonymousClient,
	oneTapClient,
	phoneNumberClient,
	adminClient
} from 'better-auth/client/plugins';
import { accessControl as ac, adminUser, customerUser } from '$lib/shared/modules/access-control';
import { getClientEnv } from '$lib/client/modules/env';
import { isCredentialApiUnsupportedError } from './utils';

const clientEnv = getClientEnv();
const fedCmEnabled = isFedCmSignOutSupported();

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
				fedCM: fedCmEnabled
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

type SignOutSessionResult = { ok: true } | { ok: false; error: unknown };

export async function signOutSession(): Promise<SignOutSessionResult> {
	try {
		const result = await authClient.signOut();
		const error = getAuthClientError(result);

		if (error) return { ok: false, error };
		return { ok: true };
	} catch (error) {
		if (isCredentialApiUnsupportedError(error)) return { ok: true };
		return { ok: false, error };
	}
}

function getAuthClientError(result: unknown) {
	if (typeof result !== 'object' || result === null || !('error' in result)) return null;

	return (result as { error?: unknown }).error ?? null;
}

function isFedCmSignOutSupported() {
	if (typeof window === 'undefined') return false;
	if (/electron/i.test(window.navigator.userAgent)) return false;
	if (!('IdentityCredential' in window)) return false;

	return typeof window.navigator.credentials?.preventSilentAccess === 'function';
}
