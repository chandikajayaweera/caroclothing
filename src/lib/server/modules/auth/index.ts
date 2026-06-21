import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, anonymous, phoneNumber, oneTap } from 'better-auth/plugins';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';
import { user as userTable } from '$lib/server/db/schema';
import { getEnv } from '$lib/server/infrastructure/env';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { databaseHooks } from './database-hook';
import { sendOtpSms } from '$lib/server/infrastructure/sms';
import { reserveOtpCooldown } from './otp-cooldown';
import { migrateAnonymousUserData } from './anonymous-migration';
import {
	AuthError,
	ErrorCode,
	isAppError,
	toBetterAuthApiError
} from '$lib/server/infrastructure/errors';

import { accessControl as ac, adminUser, customerUser } from '$lib/shared/modules/access-control';
import { TEMPORARY_ACCOUNT_NAME } from '$lib/shared/modules/auth-profile';
import { prepareAccountDeletion } from './auth.service';
import { deleteReviewMediaObjectsForAccountDeletion } from '../reviews/reviews.service';

export * from './auth.types';
export * from './auth.forms';

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
	const pendingReviewMediaCleanup = new WeakMap<Request, string[]>();
	const pendingReviewMediaCleanupFallback = new Map<string, string[]>();

	return betterAuth({
		baseURL: env.PUBLIC_APP_URL,
		secret: env.BETTER_AUTH_SECRET,
		onAPIError: {
			throw: true,
			onError: (error) => {
				if (isAppError(error)) {
					console.error(`[auth] API error [${error.code}]: ${error.message}`);
				} else {
					console.error('[auth] Unexpected Better Auth API error:', error);
				}
			},
			errorURL: '/auth/error'
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/phone-number/send-otp') return;

				const session = await getSessionFromCtx(ctx);
				const userId = session?.user?.id;
				if (!userId) return;

				const phoneNumber = ctx.body?.phoneNumber;
				if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) return;

				const [existing] = await db
					.select({ id: userTable.id })
					.from(userTable)
					.where(and(eq(userTable.phoneNumber, phoneNumber.trim()), ne(userTable.id, userId)))
					.limit(1);

				if (existing) {
					throw new APIError('CONFLICT', {
						message: 'Phone number is already linked to another account.',
						code: 'PHONE_NUMBER_ALREADY_LINKED'
					});
				}
			})
		},

		database: drizzleAdapter(db, { provider: 'sqlite' }),

		emailAndPassword: {
			enabled: false
		},

		session: {
			freshAge: 60 * 5
		},

		user: {
			deleteUser: {
				enabled: true,
				beforeDelete: async (user, request) => {
					const preparation = await prepareAccountDeletion({ userId: user.id });
					if (request) {
						pendingReviewMediaCleanup.set(request, preparation.reviewMediaKeys);
					} else {
						pendingReviewMediaCleanupFallback.set(user.id, preparation.reviewMediaKeys);
					}
				},
				afterDelete: async (user, request) => {
					const keys = request
						? (pendingReviewMediaCleanup.get(request) ?? [])
						: (pendingReviewMediaCleanupFallback.get(user.id) ?? []);
					if (request) pendingReviewMediaCleanup.delete(request);
					pendingReviewMediaCleanupFallback.delete(user.id);

					try {
						const event = getRequestEvent();
						await deleteReviewMediaObjectsForAccountDeletion({ event }, keys);
					} catch (error) {
						console.error('[auth] Failed to clean review media for deleted account:', {
							userId: user.id,
							error
						});
					}
				}
			}
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
					},
					getTempName() {
						return TEMPORARY_ACCOUNT_NAME;
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
