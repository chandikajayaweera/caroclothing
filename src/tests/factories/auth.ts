import { nanoid } from 'nanoid';
import { user } from '$lib/server/modules/auth/auth.drizzle';
import type { TestDatabase } from '../db';

type User = typeof user.$inferSelect;

export async function seedUser(
	db: TestDatabase,
	overrides: Partial<typeof user.$inferInsert> = {}
): Promise<User> {
	const id = overrides.id ?? nanoid();

	const [created] = await db
		.insert(user)
		.values({
			id,
			name: overrides.name ?? `User ${id}`,
			email: overrides.email ?? `${id}@example.test`,
			emailVerified: overrides.emailVerified ?? true,
			image: overrides.image ?? null,
			isAnonymous: overrides.isAnonymous ?? false,
			phoneNumber: overrides.phoneNumber ?? null,
			phoneNumberVerified: overrides.phoneNumberVerified ?? null,
			role: overrides.role ?? 'customerUser',
			banned: overrides.banned ?? false,
			banReason: overrides.banReason ?? null,
			banExpires: overrides.banExpires ?? null
		})
		.returning();

	return created;
}
