import { logger } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { getDb } from '$lib/server/db';
import { eq, and, ne } from 'drizzle-orm';
import { account, user as userTable } from '$lib/server/db/schema';
import { sendWelcomeEmail, sendGoogleLinkedEmail } from '$lib/server/modules/notifications/email';
import { AuthError, ErrorCode, isAppError, toBetterAuthApiError } from '$lib/server/modules/errors';
import { linkDropWaitlistEntriesToUser } from '$lib/server/modules/drops/drops.service';
import type { ServiceContext } from '$lib/server/modules/service-context';

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

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
	user: {
		create: {
			after: async (user) => {
				await linkDropWaitlistContactsForUser(
					user.id,
					getWaitlistContactsForUser(user),
					'user create'
				);

				// Sends welcome email to new users
				if (user.email && !user.email.includes(PHONE_EMAIL_DOMAIN)) {
					const result = await sendWelcomeEmail(user.email, user.name);
					if (!result.ok) {
						logger.error(`[auth] Failed to send welcome email to ${user.email}: ${result.error}`);
					} else {
						logger.info(`[auth] Welcome email sent to ${user.email}`);
					}
				}
			}
		},
		update: {
			before: async (user, context) => {
				try {
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

				const result = await sendGoogleLinkedEmail(user.email);
				if (!result.ok) {
					logger.error(
						`[auth] Failed to send Google-linked email to ${user.email}: ${result.error}`
					);
				} else {
					logger.info(`[auth] Google-linked email sent to ${user.email}`);
				}
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
