import { and, asc, desc, eq, gt, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode, DropError } from '$lib/server/modules/errors';
import { buildMediaKey, deleteObjectSafe, uploadImage } from '$lib/server/modules/media/r2';
import {
	drop,
	dropProduct,
	insertDropBaseSchema,
	updateDropSchema,
	type Drop,
	type DropStatus
} from './drops.drizzle';
import {
	assertDropPermission,
	assertNonEmptyUpdate,
	conflict,
	dropNotFound,
	normalizeLimit,
	normalizeOffset,
	parseDropInput,
	requireMediaBucket,
	sanitizeMediaVariant,
	wrapDropPersistenceError,
	wrapMediaError,
	type DropServiceActor
} from './service-utils';

const createDropInputSchema = insertDropBaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateDropInputSchema = updateDropSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export type CreateDropInput = z.infer<typeof createDropInputSchema>;
export type UpdateDropInput = z.infer<typeof updateDropInputSchema>;

export type ListDropsOptions = {
	actor?: DropServiceActor | null;
	includeArchived?: boolean;
	status?: DropStatus | DropStatus[];
	search?: string;
	upcomingOnly?: boolean;
	sortBy?: 'sortOrder' | 'launchAt' | 'createdAt';
	sortDirection?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
};

export type DropMutationOptions = {
	actor: DropServiceActor;
};

export type DropMediaMutationOptions = DropMutationOptions & {
	bucket: R2Bucket;
	variant?: string;
};

export type CreateDropOptions = DropMutationOptions & {
	bucket?: R2Bucket | null;
	heroImageFile?: File | null;
	heroImageVariant?: string;
};

export async function listDrops(options: ListDropsOptions = {}): Promise<Drop[]> {
	if (options.includeArchived) assertDropPermission(options.actor, 'read');

	const filters = buildDropFilters(options);

	return getDb()
		.select()
		.from(drop)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(...buildDropOrderBy(options))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getDropById(
	id: string,
	options: { actor?: DropServiceActor | null; includeArchived?: boolean } = {}
): Promise<Drop> {
	if (options.includeArchived) assertDropPermission(options.actor, 'read');

	const filters = [eq(drop.id, id)];
	if (!options.includeArchived) filters.push(sql`${drop.status} != 'archived'`);

	const [row] = await getDb()
		.select()
		.from(drop)
		.where(and(...filters))
		.limit(1);

	if (!row) dropNotFound({ id });
	return row;
}

export async function getDropBySlug(
	slug: string,
	options: { actor?: DropServiceActor | null; includeArchived?: boolean } = {}
): Promise<Drop> {
	if (options.includeArchived) assertDropPermission(options.actor, 'read');

	const filters = [eq(drop.slug, slug)];
	if (!options.includeArchived) filters.push(sql`${drop.status} != 'archived'`);

	const [row] = await getDb()
		.select()
		.from(drop)
		.where(and(...filters))
		.limit(1);

	if (!row) dropNotFound({ slug });
	return row;
}

export async function getDropDetailsById(
	id: string,
	options: {
		actor?: DropServiceActor | null;
		includeArchived?: boolean;
		includeWaitlist?: boolean;
	} = {}
) {
	const targetDrop = await getDropById(id, options);

	const row = await getDb().query.drop.findFirst({
		where: (drops, { eq }) => eq(drops.id, targetDrop.id),
		with: {
			products: {
				orderBy: (dropProducts, { asc }) => [asc(dropProducts.sortOrder)],
				with: {
					product: true
				}
			},
			waitlist: options.includeWaitlist
				? {
						orderBy: (waitlist, { desc }) => [desc(waitlist.createdAt)]
					}
				: undefined
		}
	});

	if (!row) dropNotFound({ id });
	return row;
}

export async function getDropDetailsBySlug(
	slug: string,
	options: {
		actor?: DropServiceActor | null;
		includeArchived?: boolean;
		includeWaitlist?: boolean;
	} = {}
) {
	const targetDrop = await getDropBySlug(slug, options);
	return getDropDetailsById(targetDrop.id, options);
}

export async function getCurrentLiveDrop(): Promise<Drop | null> {
	const now = new Date();
	const [row] = await getDb()
		.select()
		.from(drop)
		.where(and(eq(drop.status, 'live'), or(sql`${drop.endAt} IS NULL`, gt(drop.endAt, now))))
		.orderBy(asc(drop.launchAt), asc(drop.sortOrder))
		.limit(1);

	return row ?? null;
}

export async function getNextTeaserDrop(now = new Date()): Promise<Drop | null> {
	const [row] = await getDb()
		.select()
		.from(drop)
		.where(
			and(eq(drop.status, 'teaser'), or(sql`${drop.launchAt} IS NULL`, gt(drop.launchAt, now)))
		)
		.orderBy(asc(drop.launchAt), asc(drop.sortOrder))
		.limit(1);

	return row ?? null;
}

export async function createDrop(
	input: CreateDropInput,
	options: CreateDropOptions
): Promise<Drop> {
	assertDropPermission(options.actor, 'create');

	const parsed = parseDropInput(createDropInputSchema, input, 'drop');
	assertDropSchedule(parsed);

	if (parsed.heroImageR2Key && options.heroImageFile) {
		conflict('Provide either heroImageR2Key or heroImageFile, not both.', {
			field: 'heroImageR2Key'
		});
	}

	const id = nanoid();
	const bucket = options.heroImageFile ? requireMediaBucket(options.bucket) : null;
	const heroImageR2Key = options.heroImageFile
		? await uploadDropHeroImageFile(bucket!, id, options.heroImageFile, options.heroImageVariant)
		: parsed.heroImageR2Key;
	const dbInput = normalizeDropDateFields({ ...parsed, id, heroImageR2Key });

	try {
		const [created] = await getDb().insert(drop).values(dbInput).returning();
		return created;
	} catch (error) {
		if (bucket && heroImageR2Key) await deleteObjectSafe(bucket, heroImageR2Key);
		wrapDropPersistenceError(error, 'Drop slug already exists.');
	}
}

export async function updateDrop(
	id: string,
	input: UpdateDropInput,
	options: DropMutationOptions
): Promise<Drop> {
	assertDropPermission(options.actor, 'update');

	const current = await getDropById(id, { actor: options.actor, includeArchived: true });
	const parsed = parseDropInput(updateDropInputSchema, input, 'drop');
	assertNonEmptyUpdate(parsed, 'drop');
	assertDropSchedule({ ...current, ...parsed });
	const dbInput = normalizeDropDateFields(parsed);

	if (parsed.status === 'live') await assertDropCanGoLive(id);

	try {
		const [updated] = await getDb().update(drop).set(dbInput).where(eq(drop.id, id)).returning();

		if (!updated) dropNotFound({ id });
		return updated;
	} catch (error) {
		wrapDropPersistenceError(error, 'Drop slug already exists.');
	}
}

export async function setDropStatus(
	id: string,
	status: DropStatus,
	options: DropMutationOptions
): Promise<Drop> {
	return updateDrop(id, { status }, options);
}

export async function publishDrop(id: string, options: DropMutationOptions): Promise<Drop> {
	return setDropStatus(id, 'live', options);
}

export async function markDropSoldOut(id: string, options: DropMutationOptions): Promise<Drop> {
	return setDropStatus(id, 'sold_out', options);
}

export async function archiveDrop(id: string, options: DropMutationOptions): Promise<Drop> {
	return setDropStatus(id, 'archived', options);
}

export async function replaceDropHeroImage(
	id: string,
	file: File,
	options: DropMediaMutationOptions
): Promise<Drop> {
	assertDropPermission(options.actor, 'update');

	const current = await getDropById(id, { actor: options.actor, includeArchived: true });
	const bucket = requireMediaBucket(options.bucket);
	const newKey = await uploadDropHeroImageFile(bucket, id, file, options.variant);

	try {
		const [updated] = await getDb()
			.update(drop)
			.set({ heroImageR2Key: newKey })
			.where(eq(drop.id, id))
			.returning();

		if (current.heroImageR2Key) await deleteObjectSafe(bucket, current.heroImageR2Key);
		return updated;
	} catch (error) {
		await deleteObjectSafe(bucket, newKey);
		throw error;
	}
}

export async function deleteDropHeroImage(
	id: string,
	options: DropMediaMutationOptions
): Promise<Drop> {
	assertDropPermission(options.actor, 'update');

	const current = await getDropById(id, { actor: options.actor, includeArchived: true });
	const bucket = requireMediaBucket(options.bucket);

	const [updated] = await getDb()
		.update(drop)
		.set({ heroImageR2Key: null })
		.where(eq(drop.id, id))
		.returning();

	await deleteObjectSafe(bucket, current.heroImageR2Key);
	return updated ?? current;
}

export async function deleteDrop(
	id: string,
	options: DropMutationOptions & { bucket?: R2Bucket | null }
): Promise<Drop> {
	assertDropPermission(options.actor, 'delete');

	const current = await getDropById(id, { actor: options.actor, includeArchived: true });
	const [deleted] = await getDb().delete(drop).where(eq(drop.id, id)).returning();

	if (options.bucket) await deleteObjectSafe(options.bucket, current.heroImageR2Key);
	return deleted ?? current;
}

export async function transitionDueDropsToLive(
	options: DropMutationOptions & { now?: Date }
): Promise<Drop[]> {
	assertDropPermission(options.actor, 'update');

	const now = options.now ?? new Date();
	const dueDrops = await getDb()
		.select()
		.from(drop)
		.where(
			and(
				eq(drop.status, 'teaser'),
				sql`${drop.launchAt} IS NOT NULL`,
				sql`${drop.launchAt} <= ${now}`
			)
		);
	const transitioned: Drop[] = [];

	for (const dueDrop of dueDrops) {
		try {
			transitioned.push(await publishDrop(dueDrop.id, options));
		} catch {
			// Leave invalid drops in teaser for admin correction.
		}
	}

	return transitioned;
}

async function assertDropCanGoLive(dropId: string): Promise<void> {
	const products = await getDb().select().from(dropProduct).where(eq(dropProduct.dropId, dropId));

	if (products.length === 0) {
		throw new DropError('A live drop must have at least one product.', ErrorCode.DROP_NOT_LIVE, {
			dropId
		});
	}

	for (const row of products) {
		const conflicting = await getDb()
			.select({ dropId: dropProduct.dropId })
			.from(dropProduct)
			.innerJoin(drop, eq(dropProduct.dropId, drop.id))
			.where(
				and(
					eq(dropProduct.productId, row.productId),
					sql`${dropProduct.dropId} != ${dropId}`,
					inArray(drop.status, ['teaser', 'live', 'sold_out'])
				)
			)
			.limit(1);

		if (conflicting.length > 0) {
			throw new DropError(
				'Product is already assigned to another active drop.',
				ErrorCode.CONFLICT,
				{ productId: row.productId, dropId }
			);
		}
	}
}

async function uploadDropHeroImageFile(
	bucket: R2Bucket,
	dropId: string,
	file: File,
	variant = 'hero'
): Promise<string> {
	const mediaVariant = sanitizeMediaVariant(variant) || 'hero';
	const key = buildMediaKey({
		scope: 'banners',
		entityId: dropId,
		variant: mediaVariant,
		contentType: file.type
	});

	try {
		await uploadImage(bucket, key, file);
		return key;
	} catch (error) {
		wrapMediaError(error, 'Unable to upload drop hero image.');
	}
}

function assertDropSchedule(input: {
	launchAt?: Date | number | null;
	endAt?: Date | number | null;
}): void {
	const launchAt = input.launchAt instanceof Date ? input.launchAt.getTime() : input.launchAt;
	const endAt = input.endAt instanceof Date ? input.endAt.getTime() : input.endAt;

	if (launchAt && endAt && endAt <= launchAt) {
		throw new DropError('endAt must be after launchAt.', ErrorCode.VALIDATION_ERROR, {
			launchAt,
			endAt
		});
	}
}

function normalizeDropDateFields<
	T extends { launchAt?: number | Date | null; endAt?: number | Date | null }
>(input: T) {
	return {
		...input,
		launchAt: normalizeTimestampValue(input.launchAt),
		endAt: normalizeTimestampValue(input.endAt)
	};
}

function normalizeTimestampValue(value: number | Date | null | undefined) {
	if (typeof value === 'number') return new Date(value);
	return value;
}

function buildDropFilters(options: ListDropsOptions): SQL[] {
	const filters: SQL[] = [];

	if (!options.includeArchived) filters.push(sql`${drop.status} != 'archived'`);
	if (options.status) {
		const statuses = Array.isArray(options.status) ? options.status : [options.status];
		filters.push(inArray(drop.status, statuses));
	}
	if (options.search) filters.push(like(drop.name, `%${options.search}%`));
	if (options.upcomingOnly) {
		filters.push(or(sql`${drop.launchAt} IS NULL`, gt(drop.launchAt, new Date()))!);
	}

	return filters;
}

function buildDropOrderBy(options: ListDropsOptions): SQL[] {
	const direction = options.sortDirection === 'desc' ? desc : asc;

	switch (options.sortBy) {
		case 'launchAt':
			return [direction(drop.launchAt), asc(drop.sortOrder)];
		case 'createdAt':
			return [direction(drop.createdAt)];
		case 'sortOrder':
		default:
			return [direction(drop.sortOrder), desc(drop.createdAt)];
	}
}
