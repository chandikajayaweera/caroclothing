import { APIError } from 'better-auth/api';
import { logger } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { db } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { account } from '$lib/server/db/schema';
import { sendWelcomeEmail, sendGoogleLinkedEmail } from '$lib/server/modules/email';

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
	user: {
		create: {
			after: async (user) => {
				// Sends welcome email to new users.
				// Phone-registered users get a synthetic @phone.caroclothing.lk address —
				// skip those, they have no real inbox.
				if (user.email && !user.email.includes('@phone.caroclothing.lk')) {
					const result = await sendWelcomeEmail(user.email, user.name);
					if (!result.ok) {
						// Log the failure but don't throw — a failed welcome email must
						// never prevent account creation.
						logger.error(`[auth] Failed to send welcome email to ${user.email}: ${result.error}`);
					} else {
						logger.info(`[auth] Welcome email sent to ${user.email}`);
					}
				}
			}
		},
		update: {
			before: async (user) => {
				// Re-gate phone verification whenever the phone number changes.
				if ('phoneNumber' in user && user.phoneNumber !== undefined) {
					return { data: { ...user, phoneNumberVerified: false } };
				}
			}
		}
	},

	account: {
		create: {
			before: async (newAccount) => {
				// Enforce one-to-one Google account per user.
				if (newAccount.providerId === 'google' && newAccount.userId) {
					const [existingGoogleAccount] = await db
						.select({ id: account.id })
						.from(account)
						.where(and(eq(account.userId, newAccount.userId), eq(account.providerId, 'google')))
						.limit(1);

					if (existingGoogleAccount) {
						throw new APIError('CONFLICT', {
							message: 'Only one Google account can be linked per user.'
						});
					}
				}
				return { data: newAccount };
			},

			after: async (acct) => {
				// Notify user when a Google account is linked to their existing account.
				if (acct.providerId !== 'google') return;

				const user = await db.query.user.findFirst({
					where: (u, { eq }) => eq(u.id, acct.userId)
				});

				if (!user?.email) return;

				// Skip synthetic phone emails — they have no real inbox.
				if (user.email.includes('@phone.caroclothing.lk')) return;

				const userAccounts = await db.query.account.findMany({
					where: (a, { eq }) => eq(a.userId, acct.userId)
				});

				// Only 1 account → this is the initial signup, not a link — skip.
				if (userAccounts.length <= 1) return;

				const result = await sendGoogleLinkedEmail(user.email);
				if (!result.ok) {
					logger.error(`[auth] Failed to send Google-linked email to ${user.email}: ${result.error}`);
				} else {
					logger.info(`[auth] Google-linked email sent to ${user.email}`);
				}
			}
		}
	}
};
