import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, anonymous, emailOTP } from 'better-auth/plugins';

import { env } from '$lib/server/modules/env';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendEmailVerificationOTP } from '$lib/server/modules/email';

// Access Control
import { accessControl, adminUser, customerUser } from '$lib/server/modules/auth/access-control';

export const auth = betterAuth({
	baseURL: env.APP_URL,
	secret: env.BETTER_AUTH_SECRET,

	database: drizzleAdapter(db, { provider: 'sqlite' }),

	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET
		}
	},

	plugins: [
		admin({
			ac: accessControl,
			roles: { adminUser, customerUser },
			defaultRole: 'customerUser',
			adminRoles: ['adminUser']
		}),
		anonymous({
			emailDomainName: 'anon.caroclothing.lk',
			onLinkAccount: async ({ anonymousUser, newUser }) => {
				// FIXME
				// Cart/order transfer is handled by the orders module.
				// Log the mapping so the calling server action can act on it.
				console.info(`[auth] Anonymous ${anonymousUser.user.id} → account ${newUser.user.id}`);
			}
		}),
		emailOTP({ sendVerificationOTP: sendEmailVerificationOTP }),
		sveltekitCookies(getRequestEvent)
	]
});
