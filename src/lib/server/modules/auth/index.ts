import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, anonymous, phoneNumber, oneTap } from 'better-auth/plugins';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import * as databaseSchema from '$lib/server/db/schema';
import { getEnv } from '$lib/server/infrastructure/env';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { getRuntimeSingleton } from '$lib/server/infrastructure/cloudflare/runtime-context';
import { databaseHooks, tempBanPlugin } from './database-hook';
import { sendOtpSms } from '$lib/server/infrastructure/sms';
import { reserveOtpCooldown } from './otp-cooldown';
import { migrateAnonymousUserData } from './anonymous-migration';
import {
	AuthError,
	ErrorCode,
	isAppError,
	toBetterAuthApiError
} from '$lib/server/infrastructure/errors';

import { accessControl as ac, adminUser, customerUser } from '$lib/shared/auth/access-control';
import { TEMPORARY_ACCOUNT_NAME } from '$lib/shared/auth/profile';
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
	const googleClientId = env.PUBLIC_GOOGLE_CLIENT_ID;
	const googleClientSecret = env.GOOGLE_CLIENT_SECRET;
	const googleOAuthEnabled = Boolean(googleClientId && googleClientSecret);
	const userTable = databaseSchema.user;
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

				const phoneNumber = ctx.body?.phoneNumber;
				if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) return;

				const trimmedPhone = phoneNumber.trim();

				const [existing] = await db
					.select({
						id: userTable.id,
						banned: userTable.banned,
						banExpires: userTable.banExpires,
						banReason: userTable.banReason
					})
					.from(userTable)
					.where(eq(userTable.phoneNumber, trimmedPhone))
					.limit(1);

				const session = await getSessionFromCtx(ctx);
				const userId = session?.user?.id;

				if (userId) {
					if (existing && existing.id !== userId) {
						throw new APIError('CONFLICT', {
							message: 'Phone number is already linked to another account.',
							code: 'PHONE_NUMBER_ALREADY_LINKED'
						});
					}

					const [currentUser] = await db
						.select({
							id: userTable.id,
							banned: userTable.banned,
							banExpires: userTable.banExpires,
							banReason: userTable.banReason
						})
						.from(userTable)
						.where(eq(userTable.id, userId))
						.limit(1);

					if (currentUser) {
						const now = new Date();
						const isBanned =
							currentUser.banned === true &&
							(!currentUser.banExpires || currentUser.banExpires > now);

						if (isBanned) {
							throw new APIError('FORBIDDEN', {
								message: currentUser.banExpires
									? `Account is suspended until ${currentUser.banExpires.toLocaleString()}.`
									: 'Account is suspended.',
								code: 'ACCOUNT_SUSPENDED'
							});
						}
					}
				} else {
					if (existing) {
						const now = new Date();
						const isBanned =
							existing.banned === true && (!existing.banExpires || existing.banExpires > now);

						if (isBanned) {
							throw new APIError('FORBIDDEN', {
								message: existing.banExpires
									? `Account is suspended until ${existing.banExpires.toLocaleString()}.`
									: 'Account is suspended.',
								code: 'ACCOUNT_SUSPENDED'
							});
						}
					}
				}
			})
		},

		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: databaseSchema,
			transaction: false
		}),

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

		socialProviders: googleOAuthEnabled
			? {
					google: {
						clientId: googleClientId!,
						clientSecret: googleClientSecret!
					}
				}
			: undefined,

		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: googleOAuthEnabled ? ['google'] : [],
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

			...(googleOAuthEnabled ? [oneTap({ clientId: googleClientId! })] : []),

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

			tempBanPlugin,

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
const AUTH_KEY = Symbol('auth');

export function getAuth(): Auth {
	return getRuntimeSingleton(AUTH_KEY, createAuth);
}
