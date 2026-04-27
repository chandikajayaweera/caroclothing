import { logger } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { getDb } from '$lib/server/db';
import { eq, and, ne } from 'drizzle-orm';
import { account, user as userTable } from '$lib/server/db/schema';
import { sendWelcomeEmail, sendGoogleLinkedEmail } from '$lib/server/modules/notifications/email';
import { AuthError, ErrorCode, isAppError, toBetterAuthApiError } from '$lib/server/modules/errors';

const GOOGLE_PROVIDER_ID = 'google';
const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
const LAST_AUTH_METHOD_MESSAGE = 'At least one sign-in method must remain linked.';

function throwForBetterAuth(error: unknown): never {
	if (isAppError(error)) throw toBetterAuthApiError(error);
	throw error;
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

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
	user: {
		create: {
			after: async (user) => {
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

				const user = await getDb().query.user.findFirst({
					where: (u, { eq }) => eq(u.id, acct.userId)
				});

				if (!user?.email) return;

				if (user.email.includes(PHONE_EMAIL_DOMAIN)) return;

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
