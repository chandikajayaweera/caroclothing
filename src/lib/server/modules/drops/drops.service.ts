import { and, asc, count, desc, eq, inArray, isNull, lte, ne, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import { getEnv } from '$lib/server/infrastructure/env';
import {
	DropError,
	ErrorCode,
	getErrorMessage,
	isAppError,
	MediaError,
	ProductError
} from '$lib/server/infrastructure/errors';
import {
	buildMediaKey,
	deleteObjectSafe,
	getImagesBindingOptional,
	getMediaBucket,
	uploadImage
} from '$lib/server/infrastructure/media/r2';
import { mediaUrl } from '$lib/server/infrastructure/media';
import { getProduct } from '$lib/server/modules/products';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	uniqueStrings
} from '$lib/server/foundation/utils';
import {
	enqueueDropLaunchEmailTx,
	enqueueDropLaunchSmsTx,
	publishNotificationQueueMessages,
	type NotificationOutboxTx
} from '../notifications/outbox/outbox.service';
import type { NotificationOutboxDTO } from '../notifications/outbox/outbox.types';
import { product, type Product } from '../products/products.drizzle';
import type { ProductDTO } from '../products/products.types';
import {
	drop,
	dropProduct,
	dropWaitlist,
	insertDropSchema,
	insertDropWaitlistSchema,
	updateDropSchema,
	type Drop,
	type DropProduct,
	type DropStatus,
	type DropWaitlist,
	type InsertDropWaitlist,
	type InsertDrop,
	type NewDropProduct,
	type NewDrop,
	type UpdateDrop
} from './drops.drizzle';
import type {
	CreateDropInput,
	DropLaunchBatchItem,
	DropLaunchBatchResult,
	DropDTO,
	DropListResult,
	DropLookup,
	DropProductAssignmentDTO,
	DropWaitlistContactType,
	DropWaitlistEntryDTO,
	DropWaitlistEntryListResult,
	DropWaitlistLinkResult,
	DropWaitlistMarkResult,
	GetDropOptions,
	JoinDropWaitlistInput,
	LinkDropWaitlistEntriesFromUserToUserInput,
	LinkDropWaitlistEntriesToUserInput,
	ListDropWaitlistEntriesInput,
	ListDropsOptions,
	ListUnnotifiedDropWaitlistEntriesInput,
	MarkDropWaitlistEntriesNotifiedInput,
	MarkDropWaitlistEntryNotifiedInput,
	SetDropHeroProductInput,
	SetDropProductsInput,
	TransitionDueDropsToLiveInput,
	TransitionDropStatusInput,
	UpdateDropInput
} from './drops.types';

type Db = ReturnType<typeof getDb>;
export type DropsTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Tx = DropsTx;

type UploadedImage = {
	bucket: R2Bucket;
	key: string;
};

const ALLOWED_DROP_STATUS_TRANSITIONS: Record<DropStatus, readonly DropStatus[]> = {
	teaser: ['live', 'archived'],
	live: ['sold_out', 'archived'],
	sold_out: ['archived'],
	archived: []
};

export async function createDrop(ctx: ServiceContext, input: CreateDropInput): Promise<DropDTO> {
	requireAdmin(ctx.actor);

	const { heroImage, ...rawData } = input;
	assertNoDisallowedDropWriteFields(rawData);

	const data = parseInsertDrop(rawData);
	const id = nanoid();
	const uploadedHero = heroImage ? await uploadDropHeroImage(ctx, id, heroImage) : null;

	try {
		const values = toNewDropValues(id, data, uploadedHero?.key ?? null);
		const [created] = await getDb().insert(drop).values(values).returning();

		if (!created) {
			throw new DropError('Drop was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return hydrateDrop(created);
	} catch (error) {
		if (uploadedHero) {
			await deleteObjectSafe(uploadedHero.bucket, uploadedHero.key);
		}

		throw mapDropPersistenceError(error);
	}
}

export async function getDrop(
	ctx: ServiceContext | null,
	lookup: DropLookup,
	options: GetDropOptions = {}
): Promise<DropDTO> {
	const includeArchived = resolveIncludeArchived(ctx, options.includeArchived);
	const row = await findDropByLookup(lookup, { includeArchived });

	if (!row) {
		throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { lookup });
	}

	return hydrateDrop(row);
}

export async function listDrops(
	ctx: ServiceContext | null = null,
	options: ListDropsOptions = {}
): Promise<DropListResult> {
	const includeArchived = resolveIncludeArchived(ctx, options.includeArchived);
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const conditions = dropListConditions(options, includeArchived);
	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const db = getDb();

	const listQuery = db
		.select()
		.from(drop)
		.orderBy(asc(drop.sortOrder), desc(drop.createdAt))
		.limit(limit)
		.offset(offset);
	const countQuery = db.select({ total: count() }).from(drop);

	const [rows, totalRows] = await Promise.all([
		where ? listQuery.where(where) : listQuery,
		where ? countQuery.where(where) : countQuery
	]);

	return {
		items: await hydrateDrops(rows),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function updateDrop(
	ctx: ServiceContext,
	lookup: DropLookup,
	input: UpdateDropInput
): Promise<DropDTO> {
	requireAdmin(ctx.actor);

	const existing = await findDropByLookup(lookup, { includeArchived: true });

	if (!existing) {
		throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { lookup });
	}

	const { heroImage, removeHeroImage, ...rawData } = input;
	assertNoDisallowedDropWriteFields(rawData);

	if (heroImage && removeHeroImage) {
		throw new DropError(
			'Choose either a replacement hero image or removeHeroImage.',
			ErrorCode.VALIDATION_ERROR
		);
	}

	const data = parseUpdateDrop(rawData);
	validateResolvedDropWindow(existing, data);

	const updateValues = toDropUpdateValues(data);
	const uploadedHero = heroImage ? await uploadDropHeroImage(ctx, existing.id, heroImage) : null;
	const shouldRemoveHero = removeHeroImage === true;
	let cleanupBucket: R2Bucket | null = null;

	if (uploadedHero) {
		updateValues.heroImageR2Key = uploadedHero.key;
	} else if (shouldRemoveHero) {
		updateValues.heroImageR2Key = null;

		if (existing.heroImageR2Key) {
			cleanupBucket = requireMediaBucket(ctx);
		}
	}

	if (Object.keys(updateValues).length === 0) {
		return hydrateDrop(existing);
	}

	try {
		const [updated] = await getDb()
			.update(drop)
			.set(updateValues)
			.where(eq(drop.id, existing.id))
			.returning();

		if (!updated) {
			throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { lookup });
		}

		if (
			existing.heroImageR2Key &&
			existing.heroImageR2Key !== updated.heroImageR2Key &&
			(uploadedHero || cleanupBucket)
		) {
			await deleteObjectSafe(uploadedHero?.bucket ?? cleanupBucket!, existing.heroImageR2Key);
		}

		return hydrateDrop(updated);
	} catch (error) {
		if (uploadedHero) {
			await deleteObjectSafe(uploadedHero.bucket, uploadedHero.key);
		}

		throw mapDropPersistenceError(error);
	}
}

export async function deleteDrop(ctx: ServiceContext, lookup: DropLookup): Promise<void> {
	requireAdmin(ctx.actor);

	const existing = await findDropByLookup(lookup, { includeArchived: true });

	if (!existing) {
		throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { lookup });
	}

	const bucket = existing.heroImageR2Key ? requireMediaBucket(ctx) : null;

	try {
		const [deleted] = await getDb()
			.delete(drop)
			.where(eq(drop.id, existing.id))
			.returning({ id: drop.id });

		if (!deleted) {
			throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { lookup });
		}
	} catch (error) {
		throw mapDropPersistenceError(error);
	}

	if (bucket && existing.heroImageR2Key) {
		await deleteObjectSafe(bucket, existing.heroImageR2Key);
	}
}

export async function setDropProducts(
	ctx: ServiceContext,
	input: SetDropProductsInput
): Promise<DropDTO> {
	requireAdmin(ctx.actor);

	const productIds = normalizeProductIds(input.productIds);

	try {
		const row = await getDb().transaction(async (tx) => {
			const dropRow = await findDropByIdTx(tx, input.dropId);

			if (!dropRow) {
				throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, {
					dropId: input.dropId
				});
			}

			assertDropCanChangeProducts(dropRow);

			const productRows = await findProductsByIdsTx(tx, productIds);
			assertAllProductsFound(productIds, productRows);
			assertProductsAssignableToDrop(productRows);
			await assertProductsNotAssignedToOtherNonArchivedDropsTx(tx, dropRow.id, productIds);

			const existingAssignments = await tx
				.select()
				.from(dropProduct)
				.where(eq(dropProduct.dropId, dropRow.id));
			const existingHeroProductId =
				existingAssignments.find((assignment) => assignment.isHero)?.productId ?? null;

			await tx.delete(dropProduct).where(eq(dropProduct.dropId, dropRow.id));
			await tx.insert(dropProduct).values(
				productIds.map(
					(productId, index): NewDropProduct => ({
						dropId: dropRow.id,
						productId,
						isHero: productId === existingHeroProductId,
						sortOrder: index
					})
				)
			);

			return dropRow;
		});

		return hydrateDrop(row);
	} catch (error) {
		throw mapDropProductPersistenceError(error);
	}
}

export async function setDropHeroProduct(
	ctx: ServiceContext,
	input: SetDropHeroProductInput
): Promise<DropDTO> {
	requireAdmin(ctx.actor);

	const productId = normalizeProductId(input.productId);

	try {
		const row = await getDb().transaction(async (tx) => {
			const dropRow = await findDropByIdTx(tx, input.dropId);

			if (!dropRow) {
				throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, {
					dropId: input.dropId
				});
			}

			assertDropCanChangeProducts(dropRow);

			const [assignment] = await tx
				.select()
				.from(dropProduct)
				.where(and(eq(dropProduct.dropId, dropRow.id), eq(dropProduct.productId, productId)))
				.limit(1);

			if (!assignment) {
				throw new DropError(
					'Drop product assignment not found.',
					ErrorCode.DROP_PRODUCT_NOT_FOUND,
					{
						dropId: dropRow.id,
						productId
					}
				);
			}

			await tx.update(dropProduct).set({ isHero: false }).where(eq(dropProduct.dropId, dropRow.id));
			await tx
				.update(dropProduct)
				.set({ isHero: true })
				.where(and(eq(dropProduct.dropId, dropRow.id), eq(dropProduct.productId, productId)));

			return dropRow;
		});

		return hydrateDrop(row);
	} catch (error) {
		throw mapDropProductPersistenceError(error);
	}
}

export async function transitionDropStatus(
	ctx: ServiceContext,
	input: TransitionDropStatusInput
): Promise<DropDTO> {
	requireAdmin(ctx.actor);

	const dropId = normalizeDropId(input.dropId);
	const toStatus = input.toStatus;
	const now = resolveTransitionNow(ctx, input.now);
	let notificationsToPublish: NotificationOutboxDTO[] = [];

	try {
		const row = await getDb().transaction(async (tx) => {
			const dropRow = await findDropByIdTx(tx, dropId);

			if (!dropRow) {
				throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { dropId });
			}

			assertValidDropStatusTransition(dropRow.status, toStatus, dropRow.id);

			if (toStatus === 'live') {
				await assertDropReadyToGoLiveTx(tx, dropRow, now);
			}

			const [updated] = await tx
				.update(drop)
				.set({ status: toStatus })
				.where(and(eq(drop.id, dropRow.id), eq(drop.status, dropRow.status)))
				.returning();

			if (!updated) {
				throw new DropError(
					'Drop status changed before transition completed.',
					ErrorCode.CONFLICT,
					{
						dropId,
						fromStatus: dropRow.status,
						toStatus
					}
				);
			}

			if (toStatus === 'live') {
				notificationsToPublish = await enqueueDropLaunchNotificationsTx(tx, updated, now);
			}

			return updated;
		});

		await publishNotificationQueueMessages(ctx, notificationsToPublish);

		return hydrateDrop(row);
	} catch (error) {
		throw mapDropPersistenceError(error);
	}
}

export async function transitionDueDropsToLive(
	ctx: ServiceContext,
	input: TransitionDueDropsToLiveInput
): Promise<DropLaunchBatchResult> {
	requireAdmin(ctx.actor);

	const now = resolveRequiredNow(input.now);
	const limit = normalizeLimit(input.limit);
	const dueDrops = await findDueTeaserDrops(now, limit);
	const launched: DropLaunchBatchItem[] = [];
	const skipped: DropLaunchBatchItem[] = [];
	const failed: DropLaunchBatchItem[] = [];

	for (const dueDrop of dueDrops) {
		try {
			const launchedDrop = await transitionDropStatus(ctx, {
				dropId: dueDrop.id,
				toStatus: 'live',
				now
			});
			launched.push(toDropLaunchBatchItem(dueDrop, 'launched', { drop: launchedDrop }));
		} catch (error) {
			const item = toDropLaunchErrorBatchItem(dueDrop, error);

			if (item.outcome === 'skipped') {
				skipped.push(item);
			} else {
				failed.push(item);
			}
		}
	}

	return {
		now,
		limit,
		launched,
		skipped,
		failed,
		launchedCount: launched.length,
		skippedCount: skipped.length,
		failedCount: failed.length
	};
}

async function enqueueDropLaunchNotificationsTx(
	tx: DropsTx,
	dropRow: Drop,
	now: Date
): Promise<NotificationOutboxDTO[]> {
	const entries = await tx
		.select()
		.from(dropWaitlist)
		.where(and(eq(dropWaitlist.dropId, dropRow.id), isNull(dropWaitlist.notifiedAt)))
		.orderBy(asc(dropWaitlist.createdAt), asc(dropWaitlist.contact));

	if (entries.length === 0) return [];

	const appUrl = getEnv().PUBLIC_APP_URL.replace(/\/$/, '');
	const dropUrl = `${appUrl}/drops/${dropRow.slug}`;
	const emailPayloadBase = {
		dropName: dropRow.name,
		dropSlug: dropRow.slug,
		dropUrl,
		tagline: dropRow.tagline,
		heroImageUrl: dropRow.heroImageR2Key
			? `${appUrl}${mediaUrl(dropRow.heroImageR2Key)}`
			: undefined
	};
	const notifications: NotificationOutboxDTO[] = [];

	for (const entry of entries) {
		if (entry.contactType === 'phone') {
			notifications.push(
				await enqueueDropLaunchSmsTx(tx as NotificationOutboxTx, {
					dropId: dropRow.id,
					waitlistEntryId: entry.id,
					recipientUserId: entry.userId,
					payload: {
						to: entry.contact,
						dropName: dropRow.name,
						dropUrl
					},
					now
				})
			);
			continue;
		}

		notifications.push(
			await enqueueDropLaunchEmailTx(tx as NotificationOutboxTx, {
				dropId: dropRow.id,
				waitlistEntryId: entry.id,
				recipientUserId: entry.userId,
				payload: {
					...emailPayloadBase,
					to: entry.contact
				},
				now
			})
		);
	}

	return notifications;
}

export async function joinDropWaitlist(
	ctx: ServiceContext | null,
	input: JoinDropWaitlistInput
): Promise<DropWaitlistEntryDTO> {
	const normalizedInput = normalizeJoinDropWaitlistInput(input);
	const userId = resolveWaitlistUserId(ctx);

	try {
		const row = await upsertDropWaitlistEntry(normalizedInput, userId);
		return toDropWaitlistEntryDTO(row);
	} catch (error) {
		if (isUniqueConstraintError(getErrorMessage(error))) {
			const row = await findOrUpdateExistingDropWaitlistEntry(normalizedInput, userId);
			return toDropWaitlistEntryDTO(row);
		}

		throw mapDropWaitlistPersistenceError(error);
	}
}

export async function linkDropWaitlistEntriesToUser(
	ctx: ServiceContext,
	input: LinkDropWaitlistEntriesToUserInput
): Promise<DropWaitlistLinkResult> {
	const userId = normalizeUserId(input.userId, 'userId');
	requireOwnerOrAdmin(ctx.actor, userId);

	const contacts = normalizeDropWaitlistContacts(input.contacts);
	if (contacts.length === 0) {
		return {
			targetUserId: userId,
			matchedCount: 0,
			linkedCount: 0,
			skippedCount: 0
		};
	}

	try {
		return await getDb().transaction(async (tx) => {
			const rows = await tx
				.select()
				.from(dropWaitlist)
				.where(inArray(dropWaitlist.contact, contacts));
			const linkableIds = rows
				.filter((row) => row.userId === null || row.userId === userId)
				.map((row) => row.id);

			if (linkableIds.length > 0) {
				await tx.update(dropWaitlist).set({ userId }).where(inArray(dropWaitlist.id, linkableIds));
			}

			return {
				targetUserId: userId,
				matchedCount: rows.length,
				linkedCount: rows.filter((row) => row.userId === null).length,
				skippedCount: rows.filter((row) => row.userId !== null && row.userId !== userId).length
			};
		});
	} catch (error) {
		throw mapDropWaitlistPersistenceError(error);
	}
}

export async function linkDropWaitlistEntriesFromUserToUser(
	ctx: ServiceContext,
	input: LinkDropWaitlistEntriesFromUserToUserInput
): Promise<DropWaitlistLinkResult> {
	try {
		return await getDb().transaction(async (tx) =>
			linkDropWaitlistEntriesFromUserToUserTx(tx, ctx, input)
		);
	} catch (error) {
		throw mapDropWaitlistPersistenceError(error);
	}
}

export async function linkDropWaitlistEntriesFromUserToUserTx(
	tx: DropsTx,
	ctx: ServiceContext,
	input: LinkDropWaitlistEntriesFromUserToUserInput
): Promise<DropWaitlistLinkResult> {
	const sourceUserId = normalizeUserId(input.sourceUserId, 'sourceUserId');
	const targetUserId = normalizeUserId(input.targetUserId, 'targetUserId');
	requireOwnerOrAdmin(ctx.actor, targetUserId);

	if (sourceUserId === targetUserId) {
		return {
			targetUserId,
			matchedCount: 0,
			linkedCount: 0,
			skippedCount: 0
		};
	}

	const updated = await tx
		.update(dropWaitlist)
		.set({ userId: targetUserId })
		.where(eq(dropWaitlist.userId, sourceUserId))
		.returning({ id: dropWaitlist.id });

	return {
		targetUserId,
		matchedCount: updated.length,
		linkedCount: updated.length,
		skippedCount: 0
	};
}

export async function deleteDropWaitlistEntriesForAccountDeletionTx(
	tx: DropsTx,
	userId: string
): Promise<number> {
	const deleted = await tx
		.delete(dropWaitlist)
		.where(eq(dropWaitlist.userId, normalizeUserId(userId, 'userId')))
		.returning({ id: dropWaitlist.id });

	return deleted.length;
}

export async function listDropWaitlistEntries(
	ctx: ServiceContext,
	input: ListDropWaitlistEntriesInput
): Promise<DropWaitlistEntryListResult> {
	requireAdmin(ctx.actor);

	const dropId = normalizeDropId(input.dropId);
	const limit = normalizeLimit(input.limit);
	const offset = normalizeOffset(input.offset);
	const db = getDb();
	const dropRow = await findDropByIdTx(db, dropId);

	if (!dropRow) {
		throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { dropId });
	}

	const listQuery = db
		.select()
		.from(dropWaitlist)
		.where(eq(dropWaitlist.dropId, dropId))
		.orderBy(desc(dropWaitlist.createdAt), asc(dropWaitlist.contact))
		.limit(limit)
		.offset(offset);
	const countQuery = db
		.select({ total: count() })
		.from(dropWaitlist)
		.where(eq(dropWaitlist.dropId, dropId));
	const [rows, totalRows] = await Promise.all([listQuery, countQuery]);

	return {
		items: rows.map(toDropWaitlistEntryDTO),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function listUnnotifiedDropWaitlistEntries(
	ctx: ServiceContext,
	input: ListUnnotifiedDropWaitlistEntriesInput
): Promise<DropWaitlistEntryDTO[]> {
	requireAdmin(ctx.actor);

	const dropId = normalizeDropId(input.dropId);
	const limit = normalizeLimit(input.limit);
	const db = getDb();
	const dropRow = await findDropByIdTx(db, dropId);

	if (!dropRow) {
		throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { dropId });
	}

	const rows = await db
		.select()
		.from(dropWaitlist)
		.where(and(eq(dropWaitlist.dropId, dropId), isNull(dropWaitlist.notifiedAt)))
		.orderBy(asc(dropWaitlist.createdAt), asc(dropWaitlist.contact))
		.limit(limit);

	return rows.map(toDropWaitlistEntryDTO);
}

export async function markDropWaitlistEntriesNotified(
	ctx: ServiceContext,
	input: MarkDropWaitlistEntriesNotifiedInput
): Promise<DropWaitlistMarkResult> {
	requireAdmin(ctx.actor);

	const requestedCount = input.entryIds.length;
	const entryIds = normalizeDropWaitlistEntryIds(input.entryIds);
	const notifiedAt = resolveNotificationMarkedAt(ctx, input.notifiedAt);

	if (entryIds.length === 0) {
		return {
			requestedCount,
			markedCount: 0,
			notifiedAt
		};
	}

	try {
		const markedCount = await getDb().transaction(async (tx) => {
			const rows = await tx
				.update(dropWaitlist)
				.set({ notifiedAt })
				.where(and(inArray(dropWaitlist.id, entryIds), isNull(dropWaitlist.notifiedAt)))
				.returning({ id: dropWaitlist.id });

			return rows.length;
		});

		return {
			requestedCount,
			markedCount,
			notifiedAt
		};
	} catch (error) {
		throw mapDropWaitlistPersistenceError(error);
	}
}

export async function markDropWaitlistEntryNotified(
	ctx: ServiceContext,
	input: MarkDropWaitlistEntryNotifiedInput
): Promise<DropWaitlistMarkResult> {
	return markDropWaitlistEntriesNotified(ctx, {
		entryIds: [input.entryId],
		notifiedAt: input.notifiedAt
	});
}

function toDropDTO(row: Drop, products: DropProductAssignmentDTO[] = []): DropDTO {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		tagline: row.tagline,
		description: row.description,
		status: row.status,
		launchAt: row.launchAt,
		endAt: row.endAt,
		heroImageR2Key: row.heroImageR2Key,
		heroImageUrl: row.heroImageR2Key ? mediaUrl(row.heroImageR2Key) : null,
		sortOrder: row.sortOrder,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		products
	};
}

function toDropProductAssignmentDTO(
	row: DropProduct,
	productDto: ProductDTO | null
): DropProductAssignmentDTO {
	return {
		dropId: row.dropId,
		productId: row.productId,
		isHero: row.isHero,
		sortOrder: row.sortOrder,
		product: productDto
	};
}

function toDropWaitlistEntryDTO(row: DropWaitlist): DropWaitlistEntryDTO {
	return {
		id: row.id,
		dropId: row.dropId,
		contact: row.contact,
		contactType: row.contactType,
		userId: row.userId,
		notifiedAt: row.notifiedAt,
		createdAt: row.createdAt
	};
}

async function hydrateDrop(row: Drop): Promise<DropDTO> {
	const [dto] = await hydrateDrops([row]);

	if (!dto) {
		throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, { dropId: row.id });
	}

	return dto;
}

async function hydrateDrops(rows: Drop[]): Promise<DropDTO[]> {
	if (rows.length === 0) return [];

	const dropIds = rows.map((row) => row.id);
	const assignments = await getDb()
		.select()
		.from(dropProduct)
		.where(inArray(dropProduct.dropId, dropIds))
		.orderBy(asc(dropProduct.sortOrder));
	const productsById = await hydrateAssignedProducts(assignments);
	const assignmentsByDropId = new Map<string, DropProductAssignmentDTO[]>();

	for (const assignment of assignments) {
		const current = assignmentsByDropId.get(assignment.dropId) ?? [];
		current.push(
			toDropProductAssignmentDTO(assignment, productsById.get(assignment.productId) ?? null)
		);
		assignmentsByDropId.set(assignment.dropId, current);
	}

	return rows.map((row) =>
		toDropDTO(row, sortDropProductAssignments(assignmentsByDropId.get(row.id) ?? []))
	);
}

async function hydrateAssignedProducts(
	assignments: DropProduct[]
): Promise<Map<string, ProductDTO | null>> {
	const productIds = uniqueStrings(assignments.map((assignment) => assignment.productId));
	const entries = await Promise.all(
		productIds.map(async (productId): Promise<[string, ProductDTO | null]> => {
			try {
				return [productId, await getProduct(null, { id: productId })];
			} catch (error) {
				if (isAppError(error) && error.code === ErrorCode.PRODUCT_NOT_FOUND) {
					return [productId, null];
				}

				throw error;
			}
		})
	);

	return new Map(entries);
}

function sortDropProductAssignments(
	assignments: DropProductAssignmentDTO[]
): DropProductAssignmentDTO[] {
	return assignments.toSorted(
		(left, right) =>
			left.sortOrder - right.sortOrder ||
			(left.product?.name ?? '').localeCompare(right.product?.name ?? '')
	);
}

function parseInsertDrop(input: Omit<CreateDropInput, 'heroImage'>): InsertDrop {
	const result = insertDropSchema.safeParse(input);

	if (!result.success) {
		throw new DropError('Invalid drop data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseUpdateDrop(
	input: Omit<UpdateDropInput, 'heroImage' | 'removeHeroImage'>
): UpdateDrop {
	const result = updateDropSchema.safeParse(input);

	if (!result.success) {
		throw new DropError('Invalid drop data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

async function findDropByLookup(
	lookup: DropLookup,
	options: { includeArchived: boolean }
): Promise<Drop | null> {
	const predicate = dropLookupPredicate(lookup);
	const where = options.includeArchived ? predicate : and(predicate, ne(drop.status, 'archived'));
	const [row] = await getDb()
		.select()
		.from(drop)
		.where(where ?? predicate)
		.limit(1);

	return row ?? null;
}

async function findDropByIdTx(tx: Db | Tx, dropId: string): Promise<Drop | null> {
	const [row] = await tx.select().from(drop).where(eq(drop.id, dropId)).limit(1);

	return row ?? null;
}

async function findDueTeaserDrops(now: Date, limit: number): Promise<Drop[]> {
	return getDb()
		.select()
		.from(drop)
		.where(and(eq(drop.status, 'teaser'), lte(drop.launchAt, now)))
		.orderBy(asc(drop.launchAt), asc(drop.sortOrder), asc(drop.createdAt))
		.limit(limit);
}

async function findDropWaitlistEntryByContactTx(
	tx: Db | Tx,
	dropId: string,
	contact: string
): Promise<DropWaitlist | null> {
	const [row] = await tx
		.select()
		.from(dropWaitlist)
		.where(and(eq(dropWaitlist.dropId, dropId), eq(dropWaitlist.contact, contact)))
		.limit(1);

	return row ?? null;
}

async function findProductsByIdsTx(tx: Db | Tx, productIds: string[]): Promise<Product[]> {
	if (productIds.length === 0) return [];

	return tx.select().from(product).where(inArray(product.id, productIds));
}

function assertAllProductsFound(productIds: string[], rows: Product[]): void {
	const foundProductIds = new Set(rows.map((row) => row.id));
	const missingProductIds = productIds.filter((productId) => !foundProductIds.has(productId));

	if (missingProductIds.length > 0) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, {
			productIds: missingProductIds
		});
	}
}

function assertProductsAssignableToDrop(rows: Product[]): void {
	const inactiveProductIds = rows.filter((row) => !row.isActive).map((row) => row.id);
	const nonDropProductIds = rows.filter((row) => row.tier !== 'drop').map((row) => row.id);

	if (inactiveProductIds.length > 0 || nonDropProductIds.length > 0) {
		throw new ProductError(
			'Only active drop-tier products can be assigned to a drop.',
			ErrorCode.PRODUCT_UNAVAILABLE,
			{
				inactiveProductIds,
				nonDropProductIds
			}
		);
	}
}

async function assertProductsNotAssignedToOtherNonArchivedDropsTx(
	tx: Db | Tx,
	currentDropId: string,
	productIds: string[]
): Promise<void> {
	if (productIds.length === 0) return;

	const conflicts = await tx
		.select({
			productId: dropProduct.productId,
			conflictingDropId: dropProduct.dropId,
			conflictingDropSlug: drop.slug,
			conflictingDropStatus: drop.status
		})
		.from(dropProduct)
		.innerJoin(drop, eq(dropProduct.dropId, drop.id))
		.where(
			and(
				inArray(dropProduct.productId, productIds),
				ne(dropProduct.dropId, currentDropId),
				ne(drop.status, 'archived')
			)
		);

	if (conflicts.length > 0) {
		throw new DropError(
			'Product is already assigned to another non-archived drop.',
			ErrorCode.CONFLICT,
			{ conflicts }
		);
	}
}

function dropLookupPredicate(lookup: DropLookup): SQL {
	const entries = [
		'id' in lookup && lookup.id ? ['id', lookup.id] : null,
		'slug' in lookup && lookup.slug ? ['slug', lookup.slug] : null
	].filter((entry): entry is ['id' | 'slug', string] => entry !== null);

	if (entries.length !== 1) {
		throw new DropError('Provide exactly one drop lookup field.', ErrorCode.VALIDATION_ERROR, {
			lookup
		});
	}

	const [field, value] = entries[0];

	if (field === 'id') return eq(drop.id, value);
	return eq(drop.slug, value);
}

function dropListConditions(options: ListDropsOptions, includeArchived: boolean): SQL[] {
	const conditions: SQL[] = [];

	if (!includeArchived) {
		conditions.push(ne(drop.status, 'archived'));
	}

	if (options.status) {
		conditions.push(eq(drop.status, options.status));
	}

	return conditions;
}

function resolveIncludeArchived(
	ctx: ServiceContext | null | undefined,
	includeArchived = false
): boolean {
	if (!includeArchived) return false;
	requireAdmin(ctx?.actor);
	return true;
}

function assertDropCanChangeProducts(row: Drop): void {
	if (row.status === 'archived') {
		throw new DropError('Archived drops cannot be changed.', ErrorCode.CONFLICT, {
			dropId: row.id
		});
	}
}

function assertDropAcceptsWaitlistSignup(row: Drop): void {
	if (row.status !== 'teaser') {
		throw new DropError('Drop waitlist is only open during teaser status.', ErrorCode.CONFLICT, {
			dropId: row.id,
			status: row.status
		});
	}
}

function assertValidDropStatusTransition(
	fromStatus: DropStatus,
	toStatus: DropStatus,
	dropId: string
): void {
	const allowedStatuses = ALLOWED_DROP_STATUS_TRANSITIONS[fromStatus];

	if (!allowedStatuses.includes(toStatus)) {
		throw new DropError('Invalid drop status transition.', ErrorCode.CONFLICT, {
			dropId,
			fromStatus,
			toStatus,
			allowedStatuses
		});
	}
}

async function assertDropReadyToGoLiveTx(tx: Db | Tx, row: Drop, now: Date): Promise<void> {
	assertDropWindowReadyForLive(row, now);

	const assignments = await tx.select().from(dropProduct).where(eq(dropProduct.dropId, row.id));

	if (assignments.length === 0) {
		throw new DropError(
			'At least one product is required before launching a drop.',
			ErrorCode.CONFLICT,
			{
				dropId: row.id
			}
		);
	}

	assertDropHeroAssignmentState(assignments, row.id);

	const productIds = uniqueStrings(assignments.map((assignment) => assignment.productId));
	const productRows = await findProductsByIdsTx(tx, productIds);

	assertAllProductsFound(productIds, productRows);
	assertProductsAssignableToDrop(productRows);
	await assertProductsNotAssignedToOtherNonArchivedDropsTx(tx, row.id, productIds);
}

function assertDropWindowReadyForLive(row: Drop, now: Date): void {
	if (row.status === 'archived') {
		throw new DropError('Archived drops cannot go live.', ErrorCode.CONFLICT, { dropId: row.id });
	}

	if (!row.launchAt) {
		throw new DropError('Drop launch time is required before launch.', ErrorCode.VALIDATION_ERROR, {
			dropId: row.id
		});
	}

	if (row.endAt && row.endAt <= row.launchAt) {
		throw new DropError('Drop end time must be after launch time.', ErrorCode.VALIDATION_ERROR, {
			dropId: row.id,
			launchAt: row.launchAt,
			endAt: row.endAt
		});
	}

	if (row.launchAt > now) {
		throw new DropError('Drop launch time has not arrived.', ErrorCode.CONFLICT, {
			dropId: row.id,
			launchAt: row.launchAt,
			now
		});
	}

	if (row.endAt && row.endAt <= now) {
		throw new DropError('Drop end time has passed.', ErrorCode.CONFLICT, {
			dropId: row.id,
			endAt: row.endAt,
			now
		});
	}
}

function assertDropHeroAssignmentState(assignments: DropProduct[], dropId: string): void {
	const heroAssignments = assignments.filter((assignment) => assignment.isHero);

	if (heroAssignments.length > 1) {
		throw new DropError('A drop can only have one hero product.', ErrorCode.CONFLICT, {
			dropId,
			heroProductIds: heroAssignments.map((assignment) => assignment.productId)
		});
	}
}

async function upsertDropWaitlistEntry(
	input: JoinDropWaitlistInput,
	userId: string | null
): Promise<DropWaitlist> {
	return getDb().transaction(async (tx) => {
		const dropRow = await findDropByIdTx(tx, input.dropId);

		if (!dropRow) {
			throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, {
				dropId: input.dropId
			});
		}

		const existing = await findDropWaitlistEntryByContactTx(tx, input.dropId, input.contact);

		if (existing) {
			return updateMissingDropWaitlistUserIdTx(tx, existing, userId);
		}

		assertDropAcceptsWaitlistSignup(dropRow);

		const data = parseInsertDropWaitlist({ ...input, userId });
		const [created] = await tx.insert(dropWaitlist).values(data).returning();

		if (!created) {
			throw new DropError('Drop waitlist entry was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return created;
	});
}

async function findOrUpdateExistingDropWaitlistEntry(
	input: JoinDropWaitlistInput,
	userId: string | null
): Promise<DropWaitlist> {
	return getDb().transaction(async (tx) => {
		const existing = await findDropWaitlistEntryByContactTx(tx, input.dropId, input.contact);

		if (!existing) {
			throw new DropError(
				'Drop waitlist entry not found.',
				ErrorCode.DROP_WAITLIST_ENTRY_NOT_FOUND,
				{
					dropId: input.dropId,
					contact: input.contact
				}
			);
		}

		return updateMissingDropWaitlistUserIdTx(tx, existing, userId);
	});
}

async function updateMissingDropWaitlistUserIdTx(
	tx: Db | Tx,
	row: DropWaitlist,
	userId: string | null
): Promise<DropWaitlist> {
	if (!userId || row.userId) return row;

	const [updated] = await tx
		.update(dropWaitlist)
		.set({ userId })
		.where(eq(dropWaitlist.id, row.id))
		.returning();

	return updated ?? row;
}

function toNewDropValues(id: string, data: InsertDrop, heroImageR2Key: string | null): NewDrop {
	return removeUndefinedValues({
		id,
		slug: data.slug,
		name: data.name,
		tagline: data.tagline,
		description: data.description,
		launchAt: timestampMsToDate(data.launchAt),
		endAt: timestampMsToDate(data.endAt),
		heroImageR2Key,
		sortOrder: data.sortOrder
	}) as NewDrop;
}

function toDropUpdateValues(data: UpdateDrop): Partial<NewDrop> {
	return removeUndefinedValues({
		slug: data.slug,
		name: data.name,
		tagline: data.tagline,
		description: data.description,
		launchAt: timestampMsToDate(data.launchAt),
		endAt: timestampMsToDate(data.endAt),
		sortOrder: data.sortOrder
	}) as Partial<NewDrop>;
}

function timestampMsToDate(value: number | null | undefined): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return new Date(value);
}

function validateResolvedDropWindow(existing: Drop, data: UpdateDrop): void {
	const launchAt =
		data.launchAt === undefined ? existing.launchAt : (timestampMsToDate(data.launchAt) ?? null);
	const endAt = data.endAt === undefined ? existing.endAt : (timestampMsToDate(data.endAt) ?? null);

	if (launchAt && endAt && endAt <= launchAt) {
		throw new DropError('endAt must be after launchAt.', ErrorCode.VALIDATION_ERROR, {
			launchAt,
			endAt
		});
	}
}

async function uploadDropHeroImage(
	ctx: ServiceContext,
	dropId: string,
	image: File
): Promise<UploadedImage> {
	const bucket = requireMediaBucket(ctx);
	let key: string;

	try {
		key = buildMediaKey({
			scope: 'banners',
			entityId: dropId,
			variant: 'hero',
			contentType: image.type
		});
		await uploadImage(bucket, key, image, {
			images: getImagesBindingOptional(ctx.event),
			profile: 'dropHero'
		});
	} catch (error) {
		if (isAppError(error)) throw error;

		const message = getErrorMessage(error);
		throw new MediaError('Drop hero image upload failed.', resolveMediaUploadCode(message), {
			cause: message
		});
	}

	return { bucket, key };
}

function resolveMediaUploadCode(message: string): ErrorCode {
	return message.includes('Unsupported') || message.includes('empty') || message.includes('large')
		? ErrorCode.INVALID_MEDIA_TYPE
		: ErrorCode.MEDIA_UPLOAD_FAILED;
}

function requireMediaBucket(ctx: ServiceContext): R2Bucket {
	if (!ctx.event) {
		throw new MediaError(
			'Request event is required for media changes.',
			ErrorCode.MEDIA_UPLOAD_FAILED
		);
	}

	try {
		return getMediaBucket(ctx.event);
	} catch (error) {
		if (isAppError(error)) throw error;

		throw new MediaError('R2 media bucket is not configured.', ErrorCode.MEDIA_UPLOAD_FAILED, {
			cause: getErrorMessage(error)
		});
	}
}

function mapDropPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new DropError('Drop slug already exists.', ErrorCode.CONFLICT);
	}

	if (isCheckConstraintError(message)) {
		throw new DropError('Invalid drop data.', ErrorCode.VALIDATION_ERROR);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new DropError('Related drop record not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}

function mapDropProductPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new DropError('Drop product assignment already exists.', ErrorCode.CONFLICT);
	}

	if (isCheckConstraintError(message)) {
		throw new DropError('Invalid drop product assignment.', ErrorCode.VALIDATION_ERROR);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new DropError('Related drop or product not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}

function mapDropWaitlistPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new DropError(
			'Drop waitlist entry already exists.',
			ErrorCode.DROP_WAITLIST_ENTRY_ALREADY_EXISTS
		);
	}

	if (isCheckConstraintError(message)) {
		throw new DropError('Invalid drop waitlist entry.', ErrorCode.VALIDATION_ERROR);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new DropError('Related drop or user not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}

function assertNoDisallowedDropWriteFields(input: Record<string, unknown>): void {
	const disallowedFields = ['status', 'heroImageR2Key'].filter((field) => field in input);

	if (disallowedFields.length > 0) {
		throw new DropError(
			'Drop field cannot be changed through this workflow.',
			ErrorCode.VALIDATION_ERROR,
			{
				fields: disallowedFields
			}
		);
	}
}

function normalizeProductIds(productIds: string[]): string[] {
	if (productIds.length === 0) {
		throw new DropError('At least one product is required.', ErrorCode.VALIDATION_ERROR);
	}

	const normalizedProductIds = productIds.map((productId) => productId.trim());

	if (normalizedProductIds.some((productId) => productId.length === 0 || productId.length > 64)) {
		throw new DropError('Invalid product IDs.', ErrorCode.VALIDATION_ERROR, { productIds });
	}

	if (uniqueStrings(normalizedProductIds).length !== normalizedProductIds.length) {
		throw new DropError('Product IDs must not contain duplicates.', ErrorCode.VALIDATION_ERROR, {
			productIds
		});
	}

	return normalizedProductIds;
}

function normalizeProductId(productId: string): string {
	const [normalizedProductId] = normalizeProductIds([productId]);

	if (!normalizedProductId) {
		throw new DropError('Invalid product ID.', ErrorCode.VALIDATION_ERROR, { productId });
	}

	return normalizedProductId;
}

function normalizeDropId(dropId: string): string {
	const normalizedDropId = dropId.trim();

	if (normalizedDropId.length === 0 || normalizedDropId.length > 64) {
		throw new DropError('Invalid drop ID.', ErrorCode.VALIDATION_ERROR, { dropId });
	}

	return normalizedDropId;
}

function normalizeUserId(userId: string, field: string): string {
	const normalizedUserId = userId.trim();

	if (normalizedUserId.length === 0 || normalizedUserId.length > 255) {
		throw new DropError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: userId });
	}

	return normalizedUserId;
}

function normalizeJoinDropWaitlistInput(input: JoinDropWaitlistInput): JoinDropWaitlistInput {
	return {
		dropId: normalizeDropId(input.dropId),
		contact: normalizeDropWaitlistContact(input.contact, input.contactType),
		contactType: input.contactType
	};
}

function normalizeDropWaitlistContact(
	contact: string,
	contactType: DropWaitlistContactType
): string {
	const normalizedContact = contact.trim();
	return contactType === 'email' ? normalizedContact.toLowerCase() : normalizedContact;
}

function normalizeDropWaitlistContacts(contacts: string[]): string[] {
	const normalizedContacts = contacts.map((contact) => {
		const normalizedContact = contact.trim();
		return normalizedContact.includes('@') ? normalizedContact.toLowerCase() : normalizedContact;
	});

	return uniqueStrings(normalizedContacts.filter(Boolean));
}

function normalizeDropWaitlistEntryIds(entryIds: string[]): string[] {
	const normalizedEntryIds = entryIds.map((entryId) => entryId.trim());

	if (normalizedEntryIds.some((entryId) => entryId.length === 0 || entryId.length > 64)) {
		throw new DropError('Invalid drop waitlist entry IDs.', ErrorCode.VALIDATION_ERROR, {
			entryIds
		});
	}

	return uniqueStrings(normalizedEntryIds);
}

function resolveTransitionNow(ctx: ServiceContext, now: Date | undefined): Date {
	const resolvedNow = now ?? ctx.now ?? new Date();

	if (Number.isNaN(resolvedNow.getTime())) {
		throw new DropError('Invalid transition timestamp.', ErrorCode.VALIDATION_ERROR, {
			now: resolvedNow
		});
	}

	return resolvedNow;
}

function resolveNotificationMarkedAt(ctx: ServiceContext, notifiedAt: Date | undefined): Date {
	const resolvedNotifiedAt = notifiedAt ?? ctx.now ?? new Date();

	if (Number.isNaN(resolvedNotifiedAt.getTime())) {
		throw new DropError('Invalid notification timestamp.', ErrorCode.VALIDATION_ERROR, {
			notifiedAt: resolvedNotifiedAt
		});
	}

	return resolvedNotifiedAt;
}

function resolveWaitlistUserId(ctx: ServiceContext | null): string | null {
	const actor = ctx?.actor;

	if (!actor || actor.id.startsWith('system:')) return null;
	if ('isAnonymous' in actor && actor.isAnonymous) return null;

	return actor.id;
}

function parseInsertDropWaitlist(input: InsertDropWaitlist): InsertDropWaitlist {
	const result = insertDropWaitlistSchema.safeParse(input);

	if (!result.success) {
		throw new DropError('Invalid drop waitlist data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function resolveRequiredNow(now: Date): Date {
	if (Number.isNaN(now.getTime())) {
		throw new DropError('Invalid launch batch timestamp.', ErrorCode.VALIDATION_ERROR, { now });
	}

	return now;
}

function toDropLaunchBatchItem(
	row: Drop,
	outcome: DropLaunchBatchItem['outcome'],
	values: Omit<DropLaunchBatchItem, 'dropId' | 'slug' | 'name' | 'outcome'> = {}
): DropLaunchBatchItem {
	return {
		dropId: row.id,
		slug: row.slug,
		name: row.name,
		outcome,
		...values
	};
}

function toDropLaunchErrorBatchItem(row: Drop, error: unknown): DropLaunchBatchItem {
	const message = getErrorMessage(error);

	if (isAppError(error)) {
		const outcome = error.code === ErrorCode.INTERNAL_ERROR ? 'failed' : 'skipped';
		return toDropLaunchBatchItem(row, outcome, {
			errorCode: error.code,
			message
		});
	}

	return toDropLaunchBatchItem(row, 'failed', {
		errorCode: 'UNKNOWN_ERROR',
		message
	});
}
