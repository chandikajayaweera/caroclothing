import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, anonymous, phoneNumber, oneTap } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';

import { getEnv } from '$lib/server/modules/env';
import { getClientEnv } from '$lib/client/modules/env';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { databaseHooks } from './database-hook';
import { sendOtpSms } from '$lib/server/modules/notifications/sms';
import { reserveOtpCooldown } from './otp-cooldown';

import {
	accessControl as ac,
	adminUser,
	customerUser
} from '$lib/client/modules/auth/access-control';

type Auth = ReturnType<typeof betterAuth>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any;

export function getAuth(): Auth {
	if (_auth) return _auth as Auth;

	const env = getEnv();
	const clientEnv = getClientEnv();
	const db = getDb();

	_auth = betterAuth({
		baseURL: clientEnv.PUBLIC_APP_URL,
		secret: env.BETTER_AUTH_SECRET,

		database: drizzleAdapter(db, { provider: 'sqlite' }),

		emailAndPassword: {
			enabled: false
		},

		socialProviders: {
			google: {
				clientId: clientEnv.PUBLIC_GOOGLE_CLIENT_ID,
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

		advanced: {
			cookiePrefix: 'caro',
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: 'lax',
				secure: clientEnv.PUBLIC_APP_URL.startsWith('https')
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

			oneTap({
				clientId: clientEnv.PUBLIC_GOOGLE_CLIENT_ID
			}),

			phoneNumber({
				signUpOnVerification: {
					getTempEmail(phoneNumber) {
						// Required because BetterAuth internally expects an email field
						return `phone-${phoneNumber}@phone.caroclothing.lk`;
					}
				},

				async sendOTP({ phoneNumber, code }) {
					let cooldown;
					try {
						cooldown = await reserveOtpCooldown(phoneNumber);
					} catch (error) {
						if (error instanceof Error && error.name === 'OtpRateLimitError') {
							throw new APIError('TOO_MANY_REQUESTS', {
								message: error.message
							});
						}
						throw error;
					}

					try {
						const result = await sendOtpSms(phoneNumber, code);

						if (!result.ok) {
							throw new APIError('INTERNAL_SERVER_ERROR', {
								message: `[auth] Failed to send OTP to ${phoneNumber}: ${result.error}`
							});
						}
					} catch (error) {
						// rollback cooldown on failure
						try {
							await cooldown.kv.delete(cooldown.key);
						} catch (rollbackError) {
							console.error(`[auth] Failed to rollback OTP cooldown for ${phoneNumber}:`, rollbackError);
						}

						if (error instanceof APIError) {
							throw error;
						}

						throw new APIError('INTERNAL_SERVER_ERROR', {
							message: error instanceof Error ? error.message : 'Unknown error during OTP send'
						});
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
