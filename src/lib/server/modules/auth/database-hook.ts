import { logger } from 'better-auth';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { withTransientD1ReadRetry, withTransientD1WriteReconciliation } from '$lib/server/db/retry';
import { eq, and, ne } from 'drizzle-orm';
import { account, user as userTable } from '$lib/server/db/schema';
import {
	AuthError,
	ErrorCode,
	getErrorMessage,
	isAppError,
	normalizeServerError,
	toBetterAuthApiError
} from '$lib/server/infrastructure/errors';
import { createCloudflareNotificationWakeupPublisher } from '$lib/server/infrastructure/cloudflare';
import { maskEmailRecipient } from '$lib/server/infrastructure/email';
import {
	enqueueAuthGoogleLinkedEmailTx,
	enqueueAuthWelcomeEmailTx,
	publishNotificationWakeups
} from '$lib/server/modules/notifications/outbox/outbox.service';
import type { ServiceContext } from '$lib/server/foundation/context';
import { isValidDisplayName } from '$lib/shared/auth/profile';

const GOOGLE_PROVIDER_ID = 'google';
const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
const ANONYMOUS_EMAIL_DOMAIN = '@anon.caroclothing.lk';
const LAST_AUTH_METHOD_MESSAGE = 'At least one sign-in method must remain linked.';

function throwForBetterAuth(error: unknown): never {
	const normalizedError = normalizeServerError(error);
	if (isAppError(normalizedError)) throw toBetterAuthApiError(normalizedError);
	throw normalizedError;
}

function isInternalTempEmail(email: string) {
	const normalizedEmail = email.toLowerCase();
	return (
		normalizedEmail.endsWith(PHONE_EMAIL_DOMAIN) || normalizedEmail.endsWith(ANONYMOUS_EMAIL_DOMAIN)
	);
}

function getUserPublicEmail(user: unknown): string | null {
	const email = (user as { email?: unknown } | null)?.email;
	if (typeof email !== 'string') return null;

	const normalizedEmail = email.trim().toLowerCase();
	if (!normalizedEmail || isInternalTempEmail(normalizedEmail)) return null;
	return normalizedEmail;
}

function getUserDisplayName(user: unknown): string {
	const name = (user as { name?: unknown } | null)?.name;
	return typeof name === 'string' && name.trim() ? name.trim() : 'Caro Customer';
}

function getNotificationWakeups(): ServiceContext['notificationWakeups'] {
	try {
		return createCloudflareNotificationWakeupPublisher(
			getRequestEvent().platform?.env?.NOTIFICATION_QUEUE
		);
	} catch {
		return null;
	}
}

async function enqueueAuthWelcomeEmailForUser(user: {
	id: string;
	email?: string | null;
	name?: string | null;
}): Promise<void> {
	const email = getUserPublicEmail(user);
	if (!email) return;

	try {
		const now = new Date();
		const notification = await enqueueAuthWelcomeEmailTx(getDb(), {
			userId: user.id,
			payload: {
				email,
				name: getUserDisplayName(user)
			},
			now
		});

		await publishNotificationWakeups({ notificationWakeups: getNotificationWakeups(), now }, [
			notification
		]);
		logger.info(`[auth] Welcome email queued for ${maskEmailRecipient(email)}`);
	} catch (error) {
		logger.error(
			`[auth] Failed to queue welcome email for ${maskEmailRecipient(email)}`,
			getErrorMessage(error)
		);
	}
}

async function enqueueAuthGoogleLinkedEmailForAccount(input: {
	userId: string;
	accountId: string;
	email: string;
}): Promise<void> {
	try {
		const now = new Date();
		const notification = await enqueueAuthGoogleLinkedEmailTx(getDb(), {
			userId: input.userId,
			accountId: input.accountId,
			payload: { email: input.email },
			now
		});

		await publishNotificationWakeups({ notificationWakeups: getNotificationWakeups(), now }, [
			notification
		]);
		logger.info(`[auth] Google-linked email queued for ${maskEmailRecipient(input.email)}`);
	} catch (error) {
		logger.error(
			`[auth] Failed to queue Google-linked email for ${maskEmailRecipient(input.email)}`,
			getErrorMessage(error)
		);
	}
}

function decodeBase64UrlJson(value: string): unknown {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
	return JSON.parse(atob(paddedBase64));
}

function getVerifiedGoogleEmail(idToken: string | null | undefined) {
	if (!idToken) return null;

	try {
		const payload = decodeBase64UrlJson(idToken.split('.')[1] ?? '') as {
			email?: unknown;
			email_verified?: unknown;
		};

		if (payload.email_verified !== true || typeof payload.email !== 'string') return null;

		const email = payload.email.trim().toLowerCase();
		return email.includes('@') ? email : null;
	} catch (error) {
		logger.warn('[auth] Failed to decode Google ID token email', getErrorMessage(error));
		return null;
	}
}

function getSessionUserId(context: unknown): string | undefined {
	const session = (
		context as {
			context?: {
				session?: {
					user?: { id?: unknown };
					session?: { userId?: unknown };
				} | null;
			};
		} | null
	)?.context?.session;

	const userId = session?.user?.id ?? session?.session?.userId;
	return typeof userId === 'string' ? userId : undefined;
}

async function userHasGoogleAccount(userId: string) {
	const [googleAccount] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
			.limit(1)
	);

	return Boolean(googleAccount);
}

async function assertPhoneNumberAvailable(phoneNumber: string, userId: string) {
	const [existingUser] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ id: userTable.id })
			.from(userTable)
			.where(and(eq(userTable.phoneNumber, phoneNumber), ne(userTable.id, userId)))
			.limit(1)
	);

	if (existingUser) {
		throw new AuthError(
			'Phone number is already linked to another user.',
			ErrorCode.PHONE_NUMBER_ALREADY_LINKED
		);
	}
}

async function assertCanRemovePhoneNumber(userId: string) {
	if (await userHasGoogleAccount(userId)) return;

	throw new AuthError(LAST_AUTH_METHOD_MESSAGE, ErrorCode.LAST_AUTH_METHOD_REQUIRED);
}

async function assertCanRemoveGoogleAccount(userId: string) {
	const [user] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ phoneNumber: userTable.phoneNumber })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1)
	);

	if (user?.phoneNumber) return;

	throw new AuthError(LAST_AUTH_METHOD_MESSAGE, ErrorCode.LAST_AUTH_METHOD_REQUIRED);
}

async function assertGoogleAccountAvailable(userId: string, googleAccountId: string) {
	const [existingGoogleAccountForUser] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
			.limit(1)
	);

	if (existingGoogleAccountForUser) {
		throw new AuthError(
			'Only one Google account can be linked per user.',
			ErrorCode.GOOGLE_ACCOUNT_ALREADY_LINKED_TO_USER
		);
	}

	const [existingGoogleAccount] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ id: account.id })
			.from(account)
			.where(
				and(eq(account.providerId, GOOGLE_PROVIDER_ID), eq(account.accountId, googleAccountId))
			)
			.limit(1)
	);

	if (existingGoogleAccount) {
		throw new AuthError(
			'Google account is already linked to another user.',
			ErrorCode.GOOGLE_ACCOUNT_ALREADY_LINKED
		);
	}
}

async function promoteTempUserEmailFromGoogleAccount(
	userId: string,
	idToken: string | null | undefined
) {
	const googleEmail = getVerifiedGoogleEmail(idToken);
	if (!googleEmail) return null;

	const db = getDb();
	const [user] = await withTransientD1ReadRetry(() =>
		db
			.select({
				id: userTable.id,
				email: userTable.email,
				emailVerified: userTable.emailVerified,
				updatedAt: userTable.updatedAt
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1)
	);

	if (!user?.email || !isInternalTempEmail(user.email)) return null;

	const [existingUser] = await withTransientD1ReadRetry(() =>
		db
			.select({ id: userTable.id })
			.from(userTable)
			.where(and(eq(userTable.email, googleEmail), ne(userTable.id, userId)))
			.limit(1)
	);

	if (existingUser) {
		logger.warn(
			`[auth] Skipped Google email promotion for ${userId}; email already belongs to another user`
		);
		return null;
	}

	const now = new Date();
	await withTransientD1WriteReconciliation(
		async () => {
			const [updated] = await db
				.update(userTable)
				.set({ email: googleEmail, emailVerified: true, updatedAt: now })
				.where(
					and(
						eq(userTable.id, userId),
						eq(userTable.email, user.email),
						eq(userTable.updatedAt, user.updatedAt)
					)
				)
				.returning({ id: userTable.id });
			if (!updated) {
				const [current] = await withTransientD1ReadRetry(() =>
					db
						.select({ email: userTable.email, emailVerified: userTable.emailVerified })
						.from(userTable)
						.where(eq(userTable.id, userId))
						.limit(1)
				);
				if (current?.email === googleEmail && current.emailVerified) return;
				throw new AuthError(
					'Account changed before the Google email could be linked.',
					ErrorCode.CONFLICT
				);
			}
		},
		async () => {
			const [current] = await db
				.select({
					email: userTable.email,
					emailVerified: userTable.emailVerified,
					updatedAt: userTable.updatedAt
				})
				.from(userTable)
				.where(eq(userTable.id, userId))
				.limit(1);
			return current?.email === googleEmail &&
				current.emailVerified &&
				current.updatedAt.getTime() === now.getTime()
				? { committed: true, value: undefined }
				: { committed: false };
		}
	);

	logger.info(`[auth] Promoted temp email to linked Google email for ${userId}`);
	return googleEmail;
}

export async function repairTempUserEmailFromLinkedGoogleAccount(userId: string) {
	const [googleAccount] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({ idToken: account.idToken })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
			.limit(1)
	);

	if (!googleAccount) return null;

	return promoteTempUserEmailFromGoogleAccount(userId, googleAccount.idToken);
}

function getUserIdFromHookContext(context: unknown): string | undefined {
	const where = (context as { where?: { id?: unknown } } | null)?.where;
	if (where && typeof where.id === 'string') {
		return where.id;
	}
	return getSessionUserId(context);
}

async function clearExpiredBan(userId: string) {
	const db = getDb();
	const [user] = await withTransientD1ReadRetry(() =>
		db
			.select({
				banned: userTable.banned,
				banExpires: userTable.banExpires,
				updatedAt: userTable.updatedAt
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1)
	);

	if (user && user.banned === true && user.banExpires && user.banExpires <= new Date()) {
		const now = new Date();
		await withTransientD1WriteReconciliation(
			async () => {
				const [updated] = await db
					.update(userTable)
					.set({
						banned: false,
						banExpires: null,
						banReason: null,
						updatedAt: now
					})
					.where(and(eq(userTable.id, userId), eq(userTable.updatedAt, user.updatedAt)))
					.returning({ id: userTable.id });
				if (!updated) {
					const [current] = await withTransientD1ReadRetry(() =>
						db
							.select({
								banned: userTable.banned,
								banExpires: userTable.banExpires,
								banReason: userTable.banReason
							})
							.from(userTable)
							.where(eq(userTable.id, userId))
							.limit(1)
					);
					if (
						current &&
						!current.banned &&
						current.banExpires === null &&
						current.banReason === null
					) {
						return;
					}
					throw new AuthError(
						'Account changed while an expired ban was being cleared.',
						ErrorCode.CONFLICT
					);
				}
			},
			async () => {
				const [current] = await db
					.select({
						banned: userTable.banned,
						banExpires: userTable.banExpires,
						banReason: userTable.banReason,
						updatedAt: userTable.updatedAt
					})
					.from(userTable)
					.where(eq(userTable.id, userId))
					.limit(1);
				return current &&
					!current.banned &&
					current.banExpires === null &&
					current.banReason === null &&
					current.updatedAt.getTime() === now.getTime()
					? { committed: true, value: undefined }
					: { committed: false };
			}
		);
		logger.info(`[auth] Dynamic unban executed for expired ban on user ${userId}`);
	}
}

async function setBanCookieIfActive(userId: string, ctx?: unknown) {
	const [user] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({
				banned: userTable.banned,
				banExpires: userTable.banExpires,
				banReason: userTable.banReason
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1)
	);

	if (user && user.banned === true && (!user.banExpires || user.banExpires > new Date())) {
		const cookieData = JSON.stringify({
			banExpires: user.banExpires ? user.banExpires.getTime() : null,
			banReason: user.banReason
		});

		const setCookie = (
			ctx as {
				setCookie?: (
					name: string,
					value: string,
					options: { path: string; maxAge: number; httpOnly: boolean }
				) => void;
			} | null
		)?.setCookie;
		if (setCookie) {
			try {
				setCookie.call(ctx, 'caro_temp_ban_info', cookieData, {
					path: '/',
					maxAge: 10,
					httpOnly: true
				});
				logger.info(`[auth] Set temp ban cookie via Better Auth context for user ${userId}`);
				return;
			} catch (error) {
				logger.warn(
					'[auth] Failed to set temp ban cookie via Better Auth context:',
					getErrorMessage(error)
				);
			}
		}

		try {
			const event = getRequestEvent();
			if (event) {
				event.cookies.set('caro_temp_ban_info', cookieData, {
					path: '/',
					maxAge: 10,
					httpOnly: true
				});
				logger.info(`[auth] Set temp ban cookie via SvelteKit cookies for user ${userId}`);
			}
		} catch (error) {
			logger.warn(
				'[auth] Failed to set temp ban cookie via SvelteKit cookies:',
				getErrorMessage(error)
			);
		}
	}
}

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
	user: {
		create: {
			after: async (user) => {
				await enqueueAuthWelcomeEmailForUser(user);
			}
		},
		update: {
			before: async (user, context) => {
				const targetUserId = getUserIdFromHookContext(context);
				if (targetUserId) {
					await clearExpiredBan(targetUserId);
					await setBanCookieIfActive(targetUserId, context);
				}

				try {
					if ('name' in user && user.name !== undefined) {
						if (typeof user.name !== 'string' || !isValidDisplayName(user.name)) {
							throw new AuthError(
								'Enter your name, not a phone number.',
								ErrorCode.VALIDATION_ERROR
							);
						}
					}

					if (!('phoneNumber' in user) || user.phoneNumber === undefined) return;

					const userId = getSessionUserId(context);
					if (!userId) {
						throw new AuthError(
							'Authentication is required to update phone number.',
							ErrorCode.AUTHENTICATION_REQUIRED
						);
					}

					if (user.phoneNumber === null) {
						await assertCanRemovePhoneNumber(userId);
						return { data: { ...user, phoneNumberVerified: false } };
					}

					if (typeof user.phoneNumber === 'string') {
						await assertPhoneNumberAvailable(user.phoneNumber, userId);
						if (!('phoneNumberVerified' in user)) {
							return { data: { ...user, phoneNumberVerified: false } };
						}
					}
				} catch (error) {
					throwForBetterAuth(error);
				}
			},
			after: async (user, context) => {
				const userId = getSessionUserId(context);
				if (!userId) return;
			}
		}
	},

	account: {
		create: {
			before: async (newAccount) => {
				try {
					if (newAccount.providerId === GOOGLE_PROVIDER_ID && newAccount.userId) {
						await assertGoogleAccountAvailable(newAccount.userId, newAccount.accountId);
					}
					return { data: newAccount };
				} catch (error) {
					throwForBetterAuth(error);
				}
			},

			after: async (acct) => {
				// Notify user that their google account has been linked
				if (acct.providerId !== GOOGLE_PROVIDER_ID) return;

				await promoteTempUserEmailFromGoogleAccount(acct.userId, acct.idToken);

				const user = await withTransientD1ReadRetry(() =>
					getDb().query.user.findFirst({
						where: (u, { eq }) => eq(u.id, acct.userId)
					})
				);

				if (!user?.email) return;

				if (isInternalTempEmail(user.email)) return;

				const userAccounts = await withTransientD1ReadRetry(() =>
					getDb().query.account.findMany({
						where: (a, { eq }) => eq(a.userId, acct.userId)
					})
				);

				if (userAccounts.length <= 1) return;

				await enqueueAuthGoogleLinkedEmailForAccount({
					userId: acct.userId,
					accountId: acct.id,
					email: user.email
				});
			}
		},
		delete: {
			before: async (acct) => {
				try {
					if (acct.providerId !== GOOGLE_PROVIDER_ID) return;
					await assertCanRemoveGoogleAccount(acct.userId);
				} catch (error) {
					throwForBetterAuth(error);
				}
			}
		}
	}
};

export const tempBanPlugin: BetterAuthPlugin = {
	id: 'caro-temp-ban',
	init: () => ({
		options: {
			databaseHooks: {
				session: {
					create: {
						before: async (session, ctx) => {
							if (session.userId) {
								await clearExpiredBan(session.userId);
								await setBanCookieIfActive(session.userId, ctx);
							}
							return { data: session };
						}
					}
				}
			}
		}
	})
};
