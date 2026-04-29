import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { DropError, ErrorCode } from '$lib/server/modules/errors';
import { drop, dropWaitlist, insertDropWaitlistSchema, type DropWaitlist } from './drops.drizzle';
import { getDropBySlug } from './drop.service';
import {
	assertDropPermission,
	dropNotFound,
	dropWaitlistNotFound,
	normalizeContact,
	normalizeLimit,
	normalizeOffset,
	parseDropInput,
	wrapDropWaitlistPersistenceError,
	type DropServiceActor
} from './service-utils';

const contactTypeSchema = z.enum(['phone', 'email']);
const waitlistContactSchema = z.preprocess(
	(value) => (typeof value === 'string' ? normalizeContact(value) : value),
	z.union([
		z.e164({ error: 'Invalid phone number format' }),
		z.email({ error: 'Invalid email address' })
	])
);

const createDropWaitlistInputSchema = insertDropWaitlistSchema
	.omit({
		id: true,
		createdAt: true,
		notifiedAt: true
	})
	.extend({
		contact: waitlistContactSchema,
		contactType: contactTypeSchema.optional(),
		userId: z.string().min(1).optional().nullable()
	})
	.refine((input) => !input.contactType || input.contactType === inferContactType(input.contact), {
		message: 'Contact type does not match the contact value.',
		path: ['contactType']
	})
	.transform((input) => ({
		...input,
		contactType: input.contactType ?? inferContactType(input.contact)
	}));

export type CreateDropWaitlistInput = z.infer<typeof createDropWaitlistInputSchema>;
export type DropWaitlistContactType = z.infer<typeof contactTypeSchema>;

export type JoinDropWaitlistOptions = {
	actor?: DropServiceActor | null;
};

export type DropWaitlistMutationOptions = {
	actor: DropServiceActor;
};

export type ListDropWaitlistEntriesOptions = DropWaitlistMutationOptions & {
	dropId?: string;
	contact?: string;
	contactType?: DropWaitlistContactType;
	userId?: string | null;
	unnotifiedOnly?: boolean;
	limit?: number;
	offset?: number;
};

export type MarkDropWaitlistEntriesNotifiedOptions = DropWaitlistMutationOptions & {
	entryIds?: string[];
	notifiedAt?: Date;
	unnotifiedOnly?: boolean;
};

export type LinkDropWaitlistEntriesToUserInput = {
	userId: string;
	contacts: string[];
	dropId?: string;
};

export async function listDropWaitlistEntries(
	options: ListDropWaitlistEntriesOptions
): Promise<DropWaitlist[]> {
	assertDropPermission(options.actor, 'read');

	const filters = buildWaitlistFilters(options);

	return getDb()
		.select()
		.from(dropWaitlist)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(dropWaitlist.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function listUnnotifiedDropWaitlistEntries(
	dropId: string,
	options: DropWaitlistMutationOptions & { limit?: number; offset?: number }
): Promise<DropWaitlist[]> {
	return listDropWaitlistEntries({
		...options,
		dropId,
		unnotifiedOnly: true
	});
}

export async function countDropWaitlistEntries(
	dropId: string,
	options: DropWaitlistMutationOptions
): Promise<number> {
	assertDropPermission(options.actor, 'read');

	const [row] = await getDb()
		.select({ value: sql<number>`count(*)` })
		.from(dropWaitlist)
		.where(eq(dropWaitlist.dropId, dropId));

	return Number(row?.value ?? 0);
}

export async function getDropWaitlistEntryById(
	id: string,
	options: DropWaitlistMutationOptions
): Promise<DropWaitlist> {
	assertDropPermission(options.actor, 'read');

	const [row] = await getDb().select().from(dropWaitlist).where(eq(dropWaitlist.id, id)).limit(1);

	if (!row) dropWaitlistNotFound({ id });
	return row;
}

export async function joinDropWaitlist(
	input: CreateDropWaitlistInput,
	options: JoinDropWaitlistOptions = {}
): Promise<DropWaitlist> {
	const parsed = parseDropInput(createDropWaitlistInputSchema, input, 'drop waitlist');
	await assertDropWaitlistOpen(parsed.dropId);

	const userId = resolveWaitlistUserId(parsed.userId, options.actor);
	const existing = await findWaitlistEntryByContact(parsed.dropId, parsed.contact);
	if (existing) {
		if (userId && existing.userId !== userId) {
			const [updated] = await getDb()
				.update(dropWaitlist)
				.set({ userId })
				.where(eq(dropWaitlist.id, existing.id))
				.returning();

			return updated ?? existing;
		}

		return existing;
	}

	try {
		const [created] = await getDb()
			.insert(dropWaitlist)
			.values({ ...parsed, userId })
			.returning();

		return created;
	} catch (error) {
		wrapDropWaitlistPersistenceError(error, 'Contact is already on this drop waitlist.');
	}
}

export async function joinDropWaitlistBySlug(
	slug: string,
	input: Omit<CreateDropWaitlistInput, 'dropId'>,
	options: JoinDropWaitlistOptions = {}
): Promise<DropWaitlist> {
	const targetDrop = await getDropBySlug(slug);
	return joinDropWaitlist({ ...input, dropId: targetDrop.id }, options);
}

export async function markDropWaitlistEntryNotified(
	id: string,
	options: DropWaitlistMutationOptions & { notifiedAt?: Date }
): Promise<DropWaitlist> {
	assertDropPermission(options.actor, 'update');

	const [updated] = await getDb()
		.update(dropWaitlist)
		.set({ notifiedAt: options.notifiedAt ?? new Date() })
		.where(eq(dropWaitlist.id, id))
		.returning();

	if (!updated) dropWaitlistNotFound({ id });
	return updated;
}

export async function markDropWaitlistEntriesNotified(
	dropId: string,
	options: MarkDropWaitlistEntriesNotifiedOptions
): Promise<DropWaitlist[]> {
	assertDropPermission(options.actor, 'update');

	const filters: SQL[] = [eq(dropWaitlist.dropId, dropId)];
	if (options.entryIds) {
		if (options.entryIds.length === 0) return [];
		filters.push(inArray(dropWaitlist.id, options.entryIds));
	}
	if (options.unnotifiedOnly) filters.push(isNull(dropWaitlist.notifiedAt));

	return getDb()
		.update(dropWaitlist)
		.set({ notifiedAt: options.notifiedAt ?? new Date() })
		.where(and(...filters))
		.returning();
}

export async function resetDropWaitlistNotifications(
	dropId: string,
	options: DropWaitlistMutationOptions & { entryIds?: string[] }
): Promise<DropWaitlist[]> {
	assertDropPermission(options.actor, 'update');

	const filters: SQL[] = [eq(dropWaitlist.dropId, dropId)];
	if (options.entryIds) {
		if (options.entryIds.length === 0) return [];
		filters.push(inArray(dropWaitlist.id, options.entryIds));
	}

	return getDb()
		.update(dropWaitlist)
		.set({ notifiedAt: null })
		.where(and(...filters))
		.returning();
}

export async function linkDropWaitlistEntriesToUser(
	input: LinkDropWaitlistEntriesToUserInput,
	options: { actor?: DropServiceActor | null } = {}
): Promise<DropWaitlist[]> {
	const userId = resolveWaitlistUserId(input.userId, options.actor);
	if (!userId) {
		throw new DropError('User id is required.', ErrorCode.VALIDATION_ERROR);
	}

	const contacts = [...new Set(input.contacts.map(normalizeContact).filter(Boolean))];
	if (contacts.length === 0) return [];

	const filters: SQL[] = [
		inArray(dropWaitlist.contact, contacts),
		or(isNull(dropWaitlist.userId), eq(dropWaitlist.userId, userId))!
	];
	if (input.dropId) filters.push(eq(dropWaitlist.dropId, input.dropId));

	return getDb()
		.update(dropWaitlist)
		.set({ userId })
		.where(and(...filters))
		.returning();
}

export async function linkDropWaitlistEntriesFromUserToUser(
	sourceUserId: string,
	input: { userId: string },
	options: { actor?: DropServiceActor | null } = {}
): Promise<DropWaitlist[]> {
	const userId = resolveWaitlistUserId(input.userId, options.actor);
	if (!userId) {
		throw new DropError('User id is required.', ErrorCode.VALIDATION_ERROR);
	}

	if (sourceUserId === userId) {
		return getDb().select().from(dropWaitlist).where(eq(dropWaitlist.userId, userId));
	}

	return getDb()
		.update(dropWaitlist)
		.set({ userId })
		.where(eq(dropWaitlist.userId, sourceUserId))
		.returning();
}

export async function deleteDropWaitlistEntry(
	id: string,
	options: DropWaitlistMutationOptions
): Promise<DropWaitlist> {
	assertDropPermission(options.actor, 'delete');

	const existing = await getDropWaitlistEntryById(id, options);
	const [deleted] = await getDb().delete(dropWaitlist).where(eq(dropWaitlist.id, id)).returning();

	return deleted ?? existing;
}

async function assertDropWaitlistOpen(dropId: string): Promise<void> {
	const [targetDrop] = await getDb()
		.select({ id: drop.id, status: drop.status })
		.from(drop)
		.where(eq(drop.id, dropId))
		.limit(1);

	if (!targetDrop) dropNotFound({ id: dropId });
	if (targetDrop.status === 'teaser') return;

	throw new DropError('Drop waitlist is closed.', ErrorCode.CONFLICT, {
		dropId,
		status: targetDrop.status
	});
}

async function findWaitlistEntryByContact(
	dropId: string,
	contact: string
): Promise<DropWaitlist | null> {
	const [row] = await getDb()
		.select()
		.from(dropWaitlist)
		.where(and(eq(dropWaitlist.dropId, dropId), eq(dropWaitlist.contact, contact)))
		.limit(1);

	return row ?? null;
}

function resolveWaitlistUserId(
	inputUserId: string | null | undefined,
	actor: DropServiceActor | null | undefined
): string | null {
	if (!inputUserId) return actor?.id ?? null;
	if (actor?.id === inputUserId) return inputUserId;

	assertDropPermission(actor, 'update');
	return inputUserId;
}

function inferContactType(contact: string): DropWaitlistContactType {
	return contact.includes('@') ? 'email' : 'phone';
}

function buildWaitlistFilters(options: ListDropWaitlistEntriesOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.dropId) filters.push(eq(dropWaitlist.dropId, options.dropId));
	if (options.contact) filters.push(eq(dropWaitlist.contact, normalizeContact(options.contact)));
	if (options.contactType) filters.push(eq(dropWaitlist.contactType, options.contactType));
	if (options.userId === null) filters.push(isNull(dropWaitlist.userId));
	else if (options.userId) filters.push(eq(dropWaitlist.userId, options.userId));
	if (options.unnotifiedOnly) filters.push(isNull(dropWaitlist.notifiedAt));

	return filters;
}
