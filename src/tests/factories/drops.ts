import { nanoid } from 'nanoid';
import {
	drop,
	dropWaitlist,
	type Drop,
	type DropWaitlist
} from '$lib/server/modules/drops/drops.drizzle';
import type { CreateDropInput } from '$lib/server/modules/drops/drops.types';
import type { TestDatabase } from '../db';

export function dropInput(overrides: Partial<CreateDropInput> = {}): CreateDropInput {
	const id = nanoid(6).toLowerCase();

	return {
		slug: `drop-${id}`,
		name: `DROP ${id.toUpperCase()}`,
		tagline: 'Test drop',
		description: 'Integration test drop',
		launchAt: null,
		endAt: null,
		sortOrder: 0,
		...overrides
	};
}

export async function seedDrop(
	db: TestDatabase,
	overrides: Partial<typeof drop.$inferInsert> = {}
): Promise<Drop> {
	const id = overrides.id ?? nanoid();

	const [created] = await db
		.insert(drop)
		.values({
			id,
			slug: overrides.slug ?? `drop-${nanoid(8).toLowerCase()}`,
			name: overrides.name ?? `Drop ${id}`,
			tagline: overrides.tagline ?? null,
			description: overrides.description ?? null,
			status: overrides.status ?? 'teaser',
			launchAt: overrides.launchAt ?? null,
			endAt: overrides.endAt ?? null,
			heroImageR2Key: overrides.heroImageR2Key ?? null,
			sortOrder: overrides.sortOrder ?? 0
		})
		.returning();

	return created;
}

export async function seedDropWaitlistEntry(
	db: TestDatabase,
	dropId: string,
	overrides: Partial<Omit<typeof dropWaitlist.$inferInsert, 'dropId'>> = {}
): Promise<DropWaitlist> {
	const [created] = await db
		.insert(dropWaitlist)
		.values({
			id: overrides.id ?? nanoid(),
			dropId,
			contact: overrides.contact ?? `${nanoid(8)}@example.test`,
			contactType: overrides.contactType ?? 'email',
			userId: overrides.userId ?? null,
			notifiedAt: overrides.notifiedAt ?? null
		})
		.returning();

	return created;
}
