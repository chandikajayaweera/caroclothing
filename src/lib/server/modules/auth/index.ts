import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, anonymous, phoneNumber } from 'better-auth/plugins';

import { getEnv } from '$lib/server/modules/env';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { databaseHooks } from './database-hook';
import { sendOtpSms } from '$lib/server/modules/sms';

import { accessControl, adminUser, customerUser } from '$lib/server/modules/auth/access-control';

type Auth = ReturnType<typeof betterAuth>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any;

export function getAuth(): Auth {
	if (_auth) return _auth as Auth;

	const env = getEnv();
	const db = getDb();

	_auth = betterAuth({
		baseURL: env.APP_URL,
		secret: env.BETTER_AUTH_SECRET,

		database: drizzleAdapter(db, { provider: 'sqlite' }),

		emailAndPassword: {
			enabled: false
		},

		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET
			}
		},

		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ['google'],
				allowDifferentEmails: true,
				updateUserInfoOnLink: true
			}
		},

<<<<<<< Updated upstream
		admin({
			ac: accessControl,
			roles: { adminUser, customerUser },
			defaultRole: 'customerUser',
			adminRoles: ['adminUser']
		}),
		sveltekitCookies(getRequestEvent)
	]
});
=======
		advanced: {
			cookiePrefix: 'caro',
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: 'lax',
				secure: env.APP_URL !== 'http://localhost:5173'
			}
		},

		databaseHooks: databaseHooks,

		plugins: [
			anonymous({
				emailDomainName: 'anon.caroclothing.lk',
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					// FIXME
					// Cart / wishlist migration is owned by the orders module.
					// Log the ID mapping so the calling server action can act on it.
					console.info(`[auth] Anonymous ${anonymousUser.user.id} → account ${newUser.user.id}`);
				}
			}),

			phoneNumber({
				signUpOnVerification: {
					getTempEmail(phoneNumber) {
						// Required because BetterAuth internally expects an email field
						return `phone-${phoneNumber}@phone.caroclothing.lk`;
					}
				},

				async sendOTP({ phoneNumber, code }) {
					const result = await sendOtpSms(phoneNumber, code);
					if (!result.ok) {
						throw new Error(`[auth] Failed to send OTP to ${phoneNumber}: ${result.error}`);
					}
				}
			}),

			admin({
				ac,
				roles: { adminUser, customerUser },
				defaultRole: 'customerUser',
				adminRoles: ['adminUser']
			}),
			sveltekitCookies(getRequestEvent)
		]
	});

	return _auth;
}
>>>>>>> Stashed changes
