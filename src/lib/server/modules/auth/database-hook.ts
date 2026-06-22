import { logger } from 'better-auth';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db';
import { eq, and, ne } from 'drizzle-orm';
import { account, user as userTable } from '$lib/server/db/schema';
import {
	AuthError,
	ErrorCode,
	isAppError,
	toBetterAuthApiError
} from '$lib/server/infrastructure/errors';
import { createCloudflareNotificationWakeupPublisher } from '$lib/server/infrastructure/cloudflare';
import { linkDropWaitlistEntriesToUser } from '$lib/server/modules/drops/drops.service';
import {
	enqueueAuthGoogleLinkedEmailTx,
	enqueueAuthWelcomeEmailTx,
	publishNotificationWakeups,
	type NotificationOutboxTx
} from '$lib/server/modules/notifications/outbox/outbox.service';
import type { ServiceContext } from '$lib/server/foundation/context';
import { isValidDisplayName } from '$lib/shared/modules/auth-profile';

const GOOGLE_PROVIDER_ID = 'google';
const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
const ANONYMOUS_EMAIL_DOMAIN = '@anon.caroclothing.lk';
const LAST_AUTH_METHOD_MESSAGE = 'At least one sign-in method must remain linked.';

function throwForBetterAuth(error: unknown): never {
	if (isAppError(error)) throw toBetterAuthApiError(error);
	throw error;
}

function isInternalTempEmail(email: string) {
	const normalizedEmail = email.toLowerCase();
	return (
		normalizedEmail.endsWith(PHONE_EMAIL_DOMAIN) || normalizedEmail.endsWith(ANONYMOUS_EMAIL_DOMAIN)
	);
}

function getUserPhoneNumber(user: unknown): string | null {
	const phoneNumber = (user as { phoneNumber?: unknown } | null)?.phoneNumber;
	return typeof phoneNumber === 'string' && phoneNumber.trim() ? phoneNumber.trim() : null;
}

function getUserPublicEmail(user: unknown): string | null {
	const email = (user as { email?: unknown } | null)?.email;
	if (typeof email !== 'string') return null;

	const normalizedEmail = email.trim().toLowerCase();
	if (!normalizedEmail || isInternalTempEmail(normalizedEmail)) return null;
	return normalizedEmail;
}

function getWaitlistContactsForUser(user: unknown): string[] {
	return [
		...new Set([getUserPublicEmail(user), getUserPhoneNumber(user)].filter(Boolean) as string[])
	];
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
		const notification = await getDb().transaction((tx) =>
			enqueueAuthWelcomeEmailTx(tx as NotificationOutboxTx, {
				userId: user.id,
				payload: {
					email,
					name: getUserDisplayName(user)
				},
				now
			})
		);

		await publishNotificationWakeups({ notificationWakeups: getNotificationWakeups(), now }, [
			notification
		]);
		logger.info(`[auth] Welcome email queued for ${email}`);
	} catch (error) {
		logger.error(`[auth] Failed to queue welcome email for ${email}`, error);
	}
}

async function enqueueAuthGoogleLinkedEmailForAccount(input: {
	userId: string;
	accountId: string;
	email: string;
}): Promise<void> {
	try {
		const now = new Date();
		const notification = await getDb().transaction((tx) =>
			enqueueAuthGoogleLinkedEmailTx(tx as NotificationOutboxTx, {
				userId: input.userId,
				accountId: input.accountId,
				payload: { email: input.email },
				now
			})
		);

		await publishNotificationWakeups({ notificationWakeups: getNotificationWakeups(), now }, [
			notification
		]);
		logger.info(`[auth] Google-linked email queued for ${input.email}`);
	} catch (error) {
		logger.error(`[auth] Failed to queue Google-linked email for ${input.email}`, error);
	}
}

async function linkDropWaitlistContactsForUser(
	userId: string,
	contacts: string[],
	source: string
): Promise<void> {
	const uniqueContacts = [...new Set(contacts.filter(Boolean))];
	if (uniqueContacts.length === 0) return;

	try {
		const ctx = {
			actor: { id: userId, role: 'customerUser' }
		} satisfies ServiceContext;
		const result = await linkDropWaitlistEntriesToUser(ctx, { userId, contacts: uniqueContacts });

		if (result.linkedCount > 0) {
			logger.info(
				`[auth] Linked ${result.linkedCount} drop waitlist entries for ${userId} from ${source}`
			);
		}
	} catch (error) {
		logger.warn(`[auth] Failed to link drop waitlist entries for ${userId} from ${source}`, error);
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
		logger.warn('[auth] Failed to decode Google ID token email', error);
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
	const [googleAccount] = await getDb()
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
		.limit(1);

	return Boolean(googleAccount);
}

async function assertPhoneNumberAvailable(phoneNumber: string, userId: string) {
	const [existingUser] = await getDb()
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(eq(userTable.phoneNumber, phoneNumber), ne(userTable.id, userId)))
		.limit(1);

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
	const [user] = await getDb()
		.select({ phoneNumber: userTable.phoneNumber })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (user?.phoneNumber) return;

	throw new AuthError(LAST_AUTH_METHOD_MESSAGE, ErrorCode.LAST_AUTH_METHOD_REQUIRED);
}

async function assertGoogleAccountAvailable(userId: string, googleAccountId: string) {
	const [existingGoogleAccountForUser] = await getDb()
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
		.limit(1);

	if (existingGoogleAccountForUser) {
		throw new AuthError(
			'Only one Google account can be linked per user.',
			ErrorCode.GOOGLE_ACCOUNT_ALREADY_LINKED_TO_USER
		);
	}

	const [existingGoogleAccount] = await getDb()
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.providerId, GOOGLE_PROVIDER_ID), eq(account.accountId, googleAccountId)))
		.limit(1);

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

	const [user] = await getDb()
		.select({ id: userTable.id, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (!user?.email || !isInternalTempEmail(user.email)) return null;

	const [existingUser] = await getDb()
		.select({ id: userTable.id })
		.from(userTable)
		.where(and(eq(userTable.email, googleEmail), ne(userTable.id, userId)))
		.limit(1);

	if (existingUser) {
		logger.warn(
			`[auth] Skipped Google email promotion for ${userId}; email already belongs to another user`
		);
		return null;
	}

	await getDb()
		.update(userTable)
		.set({ email: googleEmail, emailVerified: true })
		.where(eq(userTable.id, userId));

	await linkDropWaitlistContactsForUser(userId, [googleEmail], 'google email promotion');

	logger.info(`[auth] Promoted temp email to linked Google email for ${userId}`);
	return googleEmail;
}

export async function repairTempUserEmailFromLinkedGoogleAccount(userId: string) {
	const [googleAccount] = await getDb()
		.select({ idToken: account.idToken })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
		.limit(1);

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
	const [user] = await getDb()
		.select({ banned: userTable.banned, banExpires: userTable.banExpires })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (user && user.banned === true && user.banExpires && user.banExpires <= new Date()) {
		await getDb()
			.update(userTable)
			.set({ banned: false, banExpires: null, banReason: null })
			.where(eq(userTable.id, userId));
		logger.info(`[auth] Dynamic unban executed for expired ban on user ${userId}`);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setBanCookieIfActive(userId: string, ctx?: any) {
	const [user] = await getDb()
		.select({
			banned: userTable.banned,
			banExpires: userTable.banExpires,
			banReason: userTable.banReason
		})
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (user && user.banned === true && (!user.banExpires || user.banExpires > new Date())) {
		const cookieData = JSON.stringify({
			banExpires: user.banExpires ? user.banExpires.getTime() : null,
			banReason: user.banReason
		});

		if (ctx && typeof ctx.setCookie === 'function') {
			try {
				ctx.setCookie(
					'caro_temp_ban_info',
					cookieData,
					{ path: '/', maxAge: 10, httpOnly: true }
				);
				logger.info(`[auth] Set temp ban cookie via Better Auth context for user ${userId}`);
				return;
			} catch (error) {
				logger.warn(`[auth] Failed to set temp ban cookie via Better Auth context:`, error);
			}
		}

		try {
			const event = getRequestEvent();
			if (event) {
				event.cookies.set(
					'caro_temp_ban_info',
					cookieData,
					{ path: '/', maxAge: 10, httpOnly: true }
				);
				logger.info(`[auth] Set temp ban cookie via SvelteKit cookies for user ${userId}`);
			}
		} catch (error) {
			logger.warn(`[auth] Failed to set temp ban cookie via SvelteKit cookies:`, error);
		}
	}
}

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
	user: {
		create: {
			after: async (user) => {
				await linkDropWaitlistContactsForUser(
					user.id,
					getWaitlistContactsForUser(user),
					'user create'
				);
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

				await linkDropWaitlistContactsForUser(
					userId,
					getWaitlistContactsForUser(user),
					'user update'
				);
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

				const user = await getDb().query.user.findFirst({
					where: (u, { eq }) => eq(u.id, acct.userId)
				});

				if (!user?.email) return;

				if (isInternalTempEmail(user.email)) return;

				const userAccounts = await getDb().query.account.findMany({
					where: (a, { eq }) => eq(a.userId, acct.userId)
				});

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
