import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, anonymous, phoneNumber, oneTap } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { getEnv } from '$lib/server/infrastructure/env';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { databaseHooks } from './database-hook';
import { sendOtpSms } from '$lib/server/infrastructure/sms';
import { reserveOtpCooldown } from './otp-cooldown';
import { migrateAnonymousUserData } from './anonymous-migration';
import { AuthError, ErrorCode, isAppError, toBetterAuthApiError } from '$lib/server/infrastructure/errors';

import { accessControl as ac, adminUser, customerUser } from '$lib/shared/modules/access-control';

export * from './auth.types';

export {
	banUser,
	getAccountProfile,
	getCheckoutCustomer,
	getMyAccountProfile,
	getSafeAuthRedirectTo,
	getUserAdminProfile,
	listMyAuthMethods,
	listMySessions,
	listUserSessions,
	listUsers,
	repairMyTempEmailFromLinkedGoogle,
	repairUserTempEmailFromLinkedGoogle,
	revokeMySession,
	revokeUserSessions,
	setUserRole,
	unbanUser,
	updateMyDisplayName
} from './auth.service';

function getPhoneTempEmail(phoneNumber: string) {
	const digits = phoneNumber.replace(/\D/g, '');
	return `phone-${digits}@phone.caroclothing.lk`;
}

function maskPhoneNumber(phoneNumber: string) {
	const digits = phoneNumber.replace(/\D/g, '');
	return digits.length > 4 ? `***${digits.slice(-4)}` : '***';
}

function throwForBetterAuth(error: unknown): never {
	if (isAppError(error)) throw toBetterAuthApiError(error);
	throw error;
}

function createAuth() {
	const env = getEnv();
	const db = getDb();

	return betterAuth({
		baseURL: env.PUBLIC_APP_URL,
		secret: env.BETTER_AUTH_SECRET,

		database: drizzleAdapter(db, { provider: 'sqlite' }),

		emailAndPassword: {
			enabled: false
		},

		socialProviders: {
			google: {
				clientId: env.PUBLIC_GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET
			}
		},

		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ['google'],
				allowDifferentEmails: true,
				allowUnlinkingAll: true,
				updateUserInfoOnLink: true
			}
		},

		advanced: {
			cookiePrefix: 'caro',
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: 'lax',
				secure: env.PUBLIC_APP_URL.startsWith('https')
			}
		},

		databaseHooks,

		plugins: [
			anonymous({
				emailDomainName: 'anon.caroclothing.lk',
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					try {
						await migrateAnonymousUserData(anonymousUser.user.id, newUser.user.id);
					} catch (error) {
						throwForBetterAuth(error);
					}
				}
			}),

			oneTap({
				clientId: env.PUBLIC_GOOGLE_CLIENT_ID
			}),

			phoneNumber({
				signUpOnVerification: {
					getTempEmail(phoneNumber) {
						// Required because BetterAuth internally expects an email field
						return getPhoneTempEmail(phoneNumber);
					}
				},

				async sendOTP({ phoneNumber, code }) {
					const maskedPhoneNumber = maskPhoneNumber(phoneNumber);
					let cooldown: Awaited<ReturnType<typeof reserveOtpCooldown>>;

					try {
						cooldown = await reserveOtpCooldown(phoneNumber);
					} catch (error) {
						throwForBetterAuth(error);
					}

					try {
						const result = await sendOtpSms(phoneNumber, code);

						if (!result.ok) {
							console.error(
								`[auth] Failed to send OTP SMS to ${maskedPhoneNumber}: ${result.error}`
							);
							throw new AuthError(
								'Unable to send OTP code. Please try again.',
								ErrorCode.OTP_SEND_FAILED
							);
						}
					} catch (error) {
						// rollback cooldown on failure
						try {
							await cooldown.kv.delete(cooldown.key);
						} catch (rollbackError) {
							console.error(
								`[auth] Failed to rollback OTP cooldown for ${maskedPhoneNumber}:`,
								rollbackError
							);
						}

						if (error instanceof APIError) {
							throw error;
						}

						if (isAppError(error)) {
							throw toBetterAuthApiError(error);
						}

						console.error(`[auth] Unexpected OTP send error for ${maskedPhoneNumber}:`, error);

						throw toBetterAuthApiError(
							new AuthError('Unable to send OTP code. Please try again.', ErrorCode.OTP_SEND_FAILED)
						);
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
}

type Auth = ReturnType<typeof createAuth>;

let authInstance: Auth | undefined;

export function getAuth(): Auth {
	if (!authInstance) {
		authInstance = createAuth();
	}

	return authInstance;
}
