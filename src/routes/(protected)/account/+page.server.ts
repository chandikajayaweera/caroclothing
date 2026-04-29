import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { repairTempUserEmailFromLinkedGoogleAccount } from '$lib/server/modules/auth/database-hook';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.id) {
		await repairTempUserEmailFromLinkedGoogleAccount(locals.user.id);
	}

	const [user] = await getDb()
		.select({
			name: userTable.name,
			email: userTable.email,
			phoneNumber: userTable.phoneNumber,
			createdAt: userTable.createdAt
		})
		.from(userTable)
		.where(eq(userTable.id, locals.user!.id))
		.limit(1);

	return {
		user
	};
};
