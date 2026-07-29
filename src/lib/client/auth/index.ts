import { createAuthClient } from 'better-auth/svelte';
import { anonymousClient, phoneNumberClient, adminClient } from 'better-auth/client/plugins';
import { accessControl as ac, adminUser, customerUser } from '$lib/shared/auth/access-control';
import { getClientEnv } from '$lib/client/env';
import { isCredentialApiUnsupportedError } from './utils';

const clientEnv = getClientEnv();
const googleClientId = clientEnv.PUBLIC_GOOGLE_CLIENT_ID;

export const googleOAuthEnabled = Boolean(googleClientId);

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
