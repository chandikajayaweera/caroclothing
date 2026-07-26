import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
	notInArray,
	type SQL
} from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { guardPreviousBatchChanges, isD1BatchGuardError } from '$lib/server/db/batch';
import { rethrowTransientD1Error, withTransientD1WriteReconciliation } from '$lib/server/db/retry';
import { requireActor, requireAdmin } from '$lib/server/foundation/guards';
import {
	BagError,
	ErrorCode,
	ProductError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import { mediaPresetUrl } from '$lib/server/infrastructure/media';
import type { ServiceActor, ServiceContext, SystemActor } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	resolveNow
} from '$lib/server/foundation/utils';
import { shippingMethod } from '../shipping/shipping.drizzle';
import {
	resolveStoredPromotionBagStatesTx,
	validatePromoCodeForBagTx
} from '../promotions/promotions.service';
import {
	getInventoryAvailabilityByVariantIds,
	getInventoryAvailabilityByVariantIdsTx
} from '../inventory/inventory.service';
import type { InventoryAvailabilityDTO } from '../inventory/inventory.types';
import {
	product as productTable,
	productImage as productImageTable,
	productVariant as productVariantTable,
	productVariantColor as productVariantColorTable,
	type Product,
	type ProductImage,
	type ProductVariant
} from '../products/products.drizzle';
import {
	bag as bagTable,
	bagItem as bagItemTable,
	insertBagItemSchema,
	updateBagItemSchema,
	type Bag,
	type BagItem,
	type NewBag,
	type NewBagItem
} from './bag.drizzle';
import type {
	AddBagItemInput,
	AdminBagDTO,
	BagAccessInput,
	BagDTO,
	BagItemAvailabilityStatus,
	BagItemDTO,
	BagListResult,
	BagSummaryDTO,
	CheckoutBagDTO,
	CheckoutOrderBagDTO,
	CheckoutOrderBagItemDTO,
	ExpiredBagCheckoutCleanupResult,
	ExpiredGuestBagCleanupResult,
	ListBagsOptions,
	MergeGuestBagIntoUserInput,
	MergeUserBagIntoUserInput,
	RemoveBagItemInput,
	StorefrontVariantAvailabilityDTO,
	StorefrontVariantAvailabilityInput,
	UpdateBagItemQuantityInput
} from './bag.types';

type Db = ReturnType<typeof getDb>;
export type BagTx = Db;
type Tx = BagTx;
type QueryExecutor = Db;
type BagBatchItem = Parameters<Db['batch']>[0][number];

type BagOwner =
	| {
			type: 'user';
			userId: string;
			sessionToken: null;
	  }
	| {
			type: 'guest';
			userId: null;
			sessionToken: string;
	  };

type BagWithItemRow = {
	bag: Bag;
	item: BagItem;
};

type ActiveCheckoutHold = {
	bagId: string;
	itemId: string;
	variantId: string;
	quantity: number;
	checkoutExpiresAt: Date;
};

type PurchasableVariant = {
	product: Product;
	variant: ProductVariant;
	unitPrice: number;
};

type BagDeleteResult = {
	itemCount: number;
	releasedQuantity: number;
};

const GUEST_BAG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHECKOUT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CLEANUP_DEFAULT_LIMIT = 100;
const CLEANUP_MAX_LIMIT = 500;
const MAX_BAG_ITEM_QUANTITY = 10;

export async function getBag(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<BagDTO | null> {
	const owner = resolveBagOwner(ctx, input, { required: false });
	if (!owner) return null;

	const now = resolveNow(ctx, input.now);
	const db = getDb();
	const row = await findActiveBagByOwnerTx(db, owner, now);
	if (!row) return null;

	const current = await releaseExpiredCheckoutIfNeededTx(db, row, now);
	return hydrateBagTx(db, current, now);
}

export async function getOrCreateBag(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	const db = getDb();
	const row = await getOrCreateBagTx(db, owner, now);
	return hydrateBagTx(db, row, now);
}

export async function addItemToBag(ctx: ServiceContext, input: AddBagItemInput): Promise<BagDTO> {
	return addItemToBagWithRetry(ctx, input, true);
}

export async function updateBagItemQuantity(
	ctx: ServiceContext,
	input: UpdateBagItemQuantityInput
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const bagItemId = normalizeId(input.bagItemId, 'bagItemId');
	const quantity = normalizeBagItemQuantity(input.quantity, 'quantity');
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const row = await findOwnedBagItemTx(db, owner, bagItemId, now);
		await loadPurchasableVariantTx(db, row.item.variantId);
		const delta = quantity - row.item.quantity;
		if (delta > 0) await assertBagQuantityAvailableTx(db, row.item.variantId, quantity);

		const statements: [BagBatchItem, ...BagBatchItem[]] = [
			db
				.update(bagTable)
				.set({ checkoutStartedAt: null, checkoutExpiresAt: null, updatedAt: now })
				.where(and(eq(bagTable.id, row.bag.id), eq(bagTable.updatedAt, row.bag.updatedAt)))
		];
		statements.push(...guardPreviousBatchChanges(db));
		if (delta !== 0) {
			statements.push(
				db
					.update(bagItemTable)
					.set(parseUpdateBagItemQuantity(quantity, now))
					.where(
						and(eq(bagItemTable.id, row.item.id), eq(bagItemTable.quantity, row.item.quantity))
					),
				...guardPreviousBatchChanges(db)
			);
		}
		const committedBag = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				await db.batch(statements);
				return reloadBagByIdTx(db, row.bag.id);
			},
			async () => {
				const bag = await findBagByIdTx(db, row.bag.id);
				const item = await findBagItemByIdTx(db, row.item.id);
				return bag && item?.quantity === quantity && bag.updatedAt.getTime() === now.getTime()
					? { committed: true, value: bag }
					: { committed: false };
			}
		);
		return hydrateBagTx(db, committedBag, now);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new BagError('Bag changed while it was being updated.', ErrorCode.CONFLICT);
		}
		throw mapBagPersistenceError(error);
	}
}

export async function removeBagItem(
	ctx: ServiceContext,
	input: RemoveBagItemInput
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const bagItemId = normalizeId(input.bagItemId, 'bagItemId');
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const row = await findOwnedBagItemTx(db, owner, bagItemId, now);
		const committedBag = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				await db.batch([
					db
						.delete(bagItemTable)
						.where(and(eq(bagItemTable.id, row.item.id), eq(bagItemTable.bagId, row.bag.id))),
					...guardPreviousBatchChanges(db),
					db
						.update(bagTable)
						.set({ checkoutStartedAt: null, checkoutExpiresAt: null, updatedAt: now })
						.where(and(eq(bagTable.id, row.bag.id), eq(bagTable.updatedAt, row.bag.updatedAt))),
					...guardPreviousBatchChanges(db)
				]);
				return reloadBagByIdTx(db, row.bag.id);
			},
			async () => {
				const bag = await findBagByIdTx(db, row.bag.id);
				const item = await findBagItemByIdTx(db, row.item.id);
				return bag && !item && bag.updatedAt.getTime() === now.getTime()
					? { committed: true, value: bag }
					: { committed: false };
			}
		);
		return hydrateBagTx(db, committedBag, now);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new BagError('Bag item changed before it could be removed.', ErrorCode.CONFLICT);
		}
		throw mapBagPersistenceError(error);
	}
}

export async function clearBag(ctx: ServiceContext, input: BagAccessInput = {}): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const row = await getOrCreateBagTx(db, owner, now);
		const committedBag = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				await db.batch([
					db.delete(bagItemTable).where(eq(bagItemTable.bagId, row.id)),
					db
						.update(bagTable)
						.set({
							promotionId: null,
							promoCodeId: null,
							checkoutStartedAt: null,
							checkoutExpiresAt: null,
							updatedAt: now
						})
						.where(and(eq(bagTable.id, row.id), eq(bagTable.updatedAt, row.updatedAt))),
					...guardPreviousBatchChanges(db)
				]);
				return reloadBagByIdTx(db, row.id);
			},
			async () => {
				const bag = await findBagByIdTx(db, row.id);
				if (!bag || bag.updatedAt.getTime() !== now.getTime()) return { committed: false };
				const [item] = await db
					.select({ id: bagItemTable.id })
					.from(bagItemTable)
					.where(eq(bagItemTable.bagId, row.id))
					.limit(1);
				return !item &&
					bag.promotionId === null &&
					bag.promoCodeId === null &&
					bag.checkoutStartedAt === null &&
					bag.checkoutExpiresAt === null
					? { committed: true, value: bag }
					: { committed: false };
			}
		);
		return hydrateBagTx(db, committedBag, now);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new BagError('Bag changed before it could be cleared.', ErrorCode.CONFLICT);
		}
		throw mapBagPersistenceError(error);
	}
}

export async function getCheckoutBag(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<CheckoutBagDTO> {
	const bag = await getOrCreateBag(ctx, input);
	const blockingReasons = checkoutBlockingReasons(bag, { requireActiveCheckout: true });

	return {
		...bag,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

export async function getStorefrontVariantAvailability(
	ctx: ServiceContext,
	input: StorefrontVariantAvailabilityInput
): Promise<StorefrontVariantAvailabilityDTO[]> {
	const variantIds = uniqueStrings(input.variantIds);
	const now = resolveNow(ctx, input.now);
	if (variantIds.length === 0) return [];

	const db = getDb();
	const inventoryRows = await getInventoryAvailabilityByVariantIds(ctx, { variantIds });
	const activeCheckoutHoldsByVariantId = await loadActiveCheckoutHoldsByVariantId(
		db,
		variantIds,
		now
	);

	return inventoryRows.map((inventoryRow) => {
		const holds = activeCheckoutHoldsByVariantId.get(inventoryRow.variantId) ?? [];
		const checkoutHeldQuantity = holds.reduce((total, hold) => total + hold.quantity, 0);
		const checkoutHoldExpiresAt = holds[0]?.checkoutExpiresAt ?? null;
		const availabilityStatus: BagItemAvailabilityStatus = !inventoryRow.trackInventory
			? 'untracked'
			: inventoryRow.availableQuantity > 0
				? 'available'
				: inventoryRow.allowBackorder
					? 'backorder'
					: checkoutHeldQuantity > 0
						? 'reserved'
						: 'unavailable';

		return {
			...inventoryRow,
			availabilityStatus,
			checkoutHeldQuantity,
			checkoutHoldExpiresAt,
			checkoutHoldSecondsRemaining:
				checkoutHoldExpiresAt === null
					? null
					: Math.max(0, Math.ceil((checkoutHoldExpiresAt.getTime() - now.getTime()) / 1000))
		};
	});
}

export async function startCheckout(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<CheckoutBagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const existing = await findActiveBagByOwnerTx(db, owner, now);
		if (existing) await releaseExpiredCheckoutIfNeededTx(db, existing, now);

		const row = await getOrCreateBagTx(db, owner, now);
		if (isCheckoutActive(row, now)) {
			return toCheckoutBagDTO(await hydrateBagTx(db, row, now), true);
		}

		const bagDto = await hydrateBagTx(db, row, now);
		const blockingReasons = checkoutBlockingReasons(bagDto);
		if (blockingReasons.length > 0) {
			throw new BagError('Bag cannot be checked out.', ErrorCode.CANNOT_MODIFY_ORDER, {
				blockingReasons
			});
		}

		const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_WINDOW_MS);
		const claimed = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				const [updated] = await db
					.update(bagTable)
					.set({
						checkoutStartedAt: now,
						checkoutExpiresAt,
						updatedAt: now
					})
					.where(
						and(
							eq(bagTable.id, row.id),
							eq(bagTable.updatedAt, row.updatedAt),
							or(isNull(bagTable.checkoutExpiresAt), lte(bagTable.checkoutExpiresAt, now))
						)
					)
					.returning();
				if (updated) return updated;

				const raced = await reloadBagByIdTx(db, row.id);
				if (
					raced.checkoutStartedAt?.getTime() === now.getTime() &&
					raced.checkoutExpiresAt?.getTime() === checkoutExpiresAt.getTime()
				) {
					return raced;
				}
				throw new BagError('Checkout could not be started.', ErrorCode.CONFLICT);
			},
			async () => {
				const current = await findBagByIdTx(db, row.id);
				return current?.checkoutStartedAt?.getTime() === now.getTime() &&
					current.checkoutExpiresAt?.getTime() === checkoutExpiresAt.getTime()
					? { committed: true, value: current }
					: { committed: false };
			}
		);

		return toCheckoutBagDTO(await hydrateBagTx(db, claimed, now), true);
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

export async function cancelCheckout(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<BagDTO | null> {
	const owner = resolveBagOwner(ctx, input, { required: false });
	if (!owner) return null;

	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const row = await findActiveBagByOwnerTx(db, owner, now);
		if (!row) return null;

		const updatedBag = await cancelCheckoutTx(db, row, now);
		return hydrateBagTx(db, updatedBag, now);
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

export async function getCheckoutBagForOrderTx(
	tx: BagTx,
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<CheckoutOrderBagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);
	const row = await findBagByOwnerTx(tx, owner);

	if (!row) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND);
	}

	if (isBagExpired(row, now)) {
		throw new BagError('Bag has expired.', ErrorCode.CHECKOUT_SESSION_EXPIRED, {
			bagId: row.id
		});
	}

	if (!isCheckoutActive(row, now)) {
		throw new BagError('Checkout session has expired.', ErrorCode.CHECKOUT_SESSION_EXPIRED, {
			bagId: row.id,
			checkoutExpiresAt: row.checkoutExpiresAt
		});
	}

	return hydrateCheckoutOrderBagTx(tx, row, now);
}

export async function mergeGuestBagIntoUserBag(
	ctx: ServiceContext,
	input: MergeGuestBagIntoUserInput
): Promise<BagDTO> {
	const actor = requireAccountActor(ctx);
	const sessionToken = normalizeSessionToken(input.sessionToken);
	const now = resolveNow(ctx, input.now);
	const sourceOwner: BagOwner = { type: 'guest', userId: null, sessionToken };
	const targetOwner: BagOwner = { type: 'user', userId: actor.id, sessionToken: null };

	try {
		const db = getDb();
		const sourceBag = await findBagByOwnerTx(db, sourceOwner);
		if (sourceBag && isBagExpired(sourceBag, now)) {
			await deleteBagByIdTx(db, sourceBag.id, now);
		}

		const activeSourceBag = sourceBag && !isBagExpired(sourceBag, now) ? sourceBag : null;
		const targetBag = await findActiveBagByOwnerTx(db, targetOwner, now);

		if (!activeSourceBag) {
			const row = targetBag ?? (await getOrCreateBagTx(db, targetOwner, now));
			return hydrateBagTx(db, row, now);
		}

		if (!targetBag) {
			const converted = await convertBagOwnerTx(db, activeSourceBag.id, targetOwner, now);
			return hydrateBagTx(db, converted, now);
		}

		await mergeBagRowsTx(db, activeSourceBag, targetBag, now);
		const updatedTarget = await reloadBagByIdTx(db, targetBag.id);
		return hydrateBagTx(db, updatedTarget, now);
	} catch (error) {
		throw mapBagMergeError(error);
	}
}

export async function mergeUserBagIntoUserBag(
	ctx: ServiceContext,
	input: MergeUserBagIntoUserInput
): Promise<BagDTO> {
	try {
		return await mergeUserBagIntoUserBagTx(getDb(), ctx, input);
	} catch (error) {
		throw mapBagMergeError(error);
	}
}

/**
 * Prepare the bag portion of anonymous-account promotion for a native D1
 * batch. The caller composes these statements with other module-owned merge
 * statements so the whole promotion is atomic.
 */
export function prepareAnonymousBagMergeStatements(
	d1: D1Database,
	input: { sourceUserId: string; targetUserId: string; now?: Date }
): D1PreparedStatement[] {
	const sourceUserId = normalizeId(input.sourceUserId, 'sourceUserId');
	const targetUserId = normalizeId(input.targetUserId, 'targetUserId');
	const nowMs = (input.now ?? new Date()).getTime();

	return [
		d1
			.prepare(
				`INSERT INTO bag (
					id, user_id, session_token, promo_code_id, expires_at,
					checkout_started_at, checkout_expires_at, created_at, updated_at
				)
				SELECT lower(hex(randomblob(16))), ?, NULL, NULL, NULL, NULL, NULL, ?, ?
				WHERE NOT EXISTS (
					SELECT 1 FROM bag WHERE user_id = ? AND session_token IS NULL
				)`
			)
			.bind(targetUserId, nowMs, nowMs, targetUserId),
		d1
			.prepare(
				`INSERT INTO bag_item (
					id, bag_id, variant_id, product_id, quantity, unit_price, added_at, updated_at
				)
				SELECT
					lower(hex(randomblob(16))),
					(
						SELECT id FROM bag
						WHERE user_id = ? AND session_token IS NULL
						ORDER BY updated_at DESC, created_at DESC LIMIT 1
					),
					source_item.variant_id,
					min(source_item.product_id),
					min(10, sum(source_item.quantity)),
					min(source_item.unit_price),
					min(source_item.added_at),
					?
				FROM bag_item AS source_item
				INNER JOIN bag AS source_bag ON source_bag.id = source_item.bag_id
				WHERE source_bag.user_id = ? AND source_bag.session_token IS NULL
				GROUP BY source_item.variant_id
				ON CONFLICT(bag_id, variant_id) DO UPDATE SET
					quantity = min(10, bag_item.quantity + excluded.quantity),
					updated_at = excluded.updated_at`
			)
			.bind(targetUserId, nowMs, sourceUserId),
		d1.prepare('DELETE FROM bag WHERE user_id = ? AND session_token IS NULL').bind(sourceUserId),
		d1
			.prepare(
				`UPDATE bag SET
					checkout_started_at = NULL,
					checkout_expires_at = NULL,
					updated_at = ?
				WHERE user_id = ? AND session_token IS NULL`
			)
			.bind(nowMs, targetUserId)
	];
}

export async function hasUserBagDataForMigrationTx(db: BagTx, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: bagTable.id })
		.from(bagTable)
		.where(eq(bagTable.userId, normalizeId(userId, 'userId')))
		.limit(1);
	return Boolean(row);
}

export async function mergeUserBagIntoUserBagTx(
	tx: BagTx,
	ctx: ServiceContext,
	input: MergeUserBagIntoUserInput
): Promise<BagDTO> {
	const actor = requireAccountActor(ctx);
	const sourceUserId = normalizeId(input.sourceUserId, 'sourceUserId');
	const now = resolveNow(ctx, input.now);

	if (sourceUserId === actor.id) {
		throw new BagError('Source and target users must be different.', ErrorCode.VALIDATION_ERROR, {
			sourceUserId,
			targetUserId: actor.id
		});
	}

	const targetOwner: BagOwner = { type: 'user', userId: actor.id, sessionToken: null };

	const sourceBags = await findUserBagsTx(tx, sourceUserId);
	let targetBag = await findActiveBagByOwnerTx(tx, targetOwner, now);

	if (sourceBags.length === 0) {
		const row = targetBag ?? (await getOrCreateBagTx(tx, targetOwner, now));
		return hydrateBagTx(tx, row, now);
	}

	const [firstSourceBag, ...remainingSourceBags] = sourceBags;

	if (!targetBag) {
		targetBag = await convertBagOwnerTx(tx, firstSourceBag.id, targetOwner, now);
	} else {
		await mergeBagRowsTx(tx, firstSourceBag, targetBag, now);
	}

	for (const sourceBag of remainingSourceBags) {
		targetBag = await reloadBagByIdTx(tx, targetBag.id);
		await mergeBagRowsTx(tx, sourceBag, targetBag, now);
	}

	const updatedTarget = await reloadBagByIdTx(tx, targetBag.id);
	return hydrateBagTx(tx, updatedTarget, now);
}

export async function listBags(
	ctx: ServiceContext,
	options: ListBagsOptions = {}
): Promise<BagListResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const conditions = bagListConditions(options, now);
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const db = getDb();
	const rowsQuery = db
		.select()
		.from(bagTable)
		.orderBy(desc(bagTable.updatedAt), desc(bagTable.createdAt))
		.limit(limit)
		.offset(offset);
	const totalQuery = db.select({ total: count() }).from(bagTable);
	const rows = await (where ? rowsQuery.where(where) : rowsQuery);
	const totalRows = await (where ? totalQuery.where(where) : totalQuery);

	return {
		items: await hydrateAdminBagsTx(db, rows, now),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function getBagById(
	ctx: ServiceContext,
	input: { bagId: string; now?: Date }
): Promise<AdminBagDTO> {
	requireAdmin(ctx.actor);

	const bagId = normalizeId(input.bagId, 'bagId');
	const now = resolveNow(ctx, input.now);
	const db = getDb();
	const row = await reloadBagByIdTx(db, bagId);
	return hydrateAdminBagTx(db, row, now);
}

export async function getBagForUser(
	ctx: ServiceContext,
	input: { userId: string; now?: Date }
): Promise<AdminBagDTO | null> {
	requireAdmin(ctx.actor);

	const userId = normalizeId(input.userId, 'userId');
	const now = resolveNow(ctx, input.now);
	const db = getDb();
	const row = await findActiveBagByOwnerTx(db, { type: 'user', userId, sessionToken: null }, now);

	return row ? hydrateAdminBagTx(db, row, now) : null;
}

export async function deleteExpiredGuestBags(
	ctx: ServiceContext,
	input: { now?: Date; limit?: number } = {}
): Promise<ExpiredGuestBagCleanupResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const limit = normalizeLimit(input.limit, CLEANUP_DEFAULT_LIMIT, CLEANUP_MAX_LIMIT);

	try {
		const db = getDb();
		const rows = await db
			.select()
			.from(bagTable)
			.where(
				and(
					isNotNull(bagTable.sessionToken),
					isNotNull(bagTable.expiresAt),
					lte(bagTable.expiresAt, now)
				)
			)
			.orderBy(asc(bagTable.expiresAt), asc(bagTable.createdAt))
			.limit(limit);

		let itemCount = 0;
		let releasedQuantity = 0;
		let skippedCount = 0;
		let failedCount = 0;
		const bagIds: string[] = [];
		const failedBagIds: string[] = [];

		for (const row of rows) {
			try {
				const result = await deleteExpiredGuestBagByIdTx(db, row.id, now);
				if (result.skipped) {
					skippedCount += 1;
					continue;
				}
				itemCount += result.itemCount;
				releasedQuantity += result.releasedQuantity;
				bagIds.push(row.id);
			} catch (err) {
				failedCount += 1;
				failedBagIds.push(row.id);
				console.error(`[bag] Failed to delete expired guest bag ${row.id}:`, {
					error: getErrorMessage(err)
				});
			}
		}

		return {
			deletedCount: bagIds.length,
			bagIds,
			itemCount,
			releasedQuantity,
			skippedCount,
			failedCount,
			failedBagIds
		};
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

export async function expireDueBagCheckouts(
	ctx: ServiceContext,
	input: { now?: Date; limit?: number } = {}
): Promise<ExpiredBagCheckoutCleanupResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const limit = normalizeLimit(input.limit, CLEANUP_DEFAULT_LIMIT, CLEANUP_MAX_LIMIT);

	try {
		const db = getDb();
		const rows = await db
			.select()
			.from(bagTable)
			.where(
				and(
					isNotNull(bagTable.checkoutStartedAt),
					isNotNull(bagTable.checkoutExpiresAt),
					lte(bagTable.checkoutExpiresAt, now)
				)
			)
			.orderBy(asc(bagTable.checkoutExpiresAt), asc(bagTable.createdAt))
			.limit(limit);

		let releasedQuantity = 0;
		let skippedCount = 0;
		let failedCount = 0;
		const bagIds: string[] = [];
		const failedBagIds: string[] = [];

		for (const row of rows) {
			try {
				const result = await expireDueBagCheckoutByIdTx(db, row.id, now);
				if (result.skipped) {
					skippedCount += 1;
					continue;
				}
				releasedQuantity += result.releasedQuantity;
				bagIds.push(row.id);
			} catch (err) {
				failedCount += 1;
				failedBagIds.push(row.id);
				console.error(`[bag] Failed to expire checkout for bag ${row.id}:`, {
					error: getErrorMessage(err)
				});
			}
		}

		return {
			expiredCount: bagIds.length,
			bagIds,
			releasedQuantity,
			skippedCount,
			failedCount,
			failedBagIds
		};
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

async function addItemToBagWithRetry(
	ctx: ServiceContext,
	input: AddBagItemInput,
	retryOnConflict: boolean
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const variantId = normalizeId(input.variantId, 'variantId');
	const quantity = normalizeBagItemQuantity(input.quantity ?? 1, 'quantity');
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const bagRow = await getOrCreateBagTx(db, owner, now);
		const target = await loadPurchasableVariantTx(db, variantId);
		const existing = await findBagItemByVariantTx(db, bagRow.id, variantId);
		const bagItemId = existing?.id ?? nanoid();
		const expectedQuantity = (existing?.quantity ?? 0) + quantity;
		const statements: [BagBatchItem, ...BagBatchItem[]] = [
			db
				.update(bagTable)
				.set({ checkoutStartedAt: null, checkoutExpiresAt: null, updatedAt: now })
				.where(and(eq(bagTable.id, bagRow.id), eq(bagTable.updatedAt, bagRow.updatedAt)))
		];
		statements.push(...guardPreviousBatchChanges(db));

		if (existing) {
			const nextQuantity = expectedQuantity;
			validateBagItemQuantity(nextQuantity, 'quantity');
			await assertBagQuantityAvailableTx(db, variantId, nextQuantity);

			statements.push(
				db
					.update(bagItemTable)
					.set(parseUpdateBagItemQuantity(nextQuantity, now))
					.where(
						and(eq(bagItemTable.id, existing.id), eq(bagItemTable.quantity, existing.quantity))
					),
				...guardPreviousBatchChanges(db)
			);
		} else {
			await assertBagQuantityAvailableTx(db, variantId, quantity);
			const values = parseNewBagItem({
				id: bagItemId,
				bagId: bagRow.id,
				variantId,
				productId: target.product.id,
				quantity,
				unitPrice: target.unitPrice
			});

			statements.push(db.insert(bagItemTable).values(values));
		}

		const committedBag = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				await db.batch(statements);
				return reloadBagByIdTx(db, bagRow.id);
			},
			async () => {
				const bag = await findBagByIdTx(db, bagRow.id);
				const item = await findBagItemByIdTx(db, bagItemId);
				return bag &&
					item?.bagId === bagRow.id &&
					item.variantId === variantId &&
					item.quantity === expectedQuantity &&
					bag.updatedAt.getTime() === now.getTime()
					? { committed: true, value: bag }
					: { committed: false };
			}
		);
		return hydrateBagTx(db, committedBag, now);
	} catch (error) {
		if (
			retryOnConflict &&
			(isUniqueConstraintError(getErrorMessage(error)) || isD1BatchGuardError(error))
		) {
			return addItemToBagWithRetry(ctx, input, false);
		}
		if (isD1BatchGuardError(error)) {
			throw new BagError('Bag changed while the item was being added.', ErrorCode.CONFLICT);
		}

		throw mapBagPersistenceError(error);
	}
}

async function getOrCreateBagTx(tx: Tx, owner: BagOwner, now: Date): Promise<Bag> {
	const existing = await findBagByOwnerTx(tx, owner);

	if (existing) {
		if (isBagExpired(existing, now)) {
			await deleteBagByIdTx(tx, existing.id, now);
		} else {
			return releaseExpiredCheckoutIfNeededTx(tx, existing, now);
		}
	}

	const values: NewBag = {
		id: nanoid(),
		userId: owner.type === 'user' ? owner.userId : null,
		sessionToken: owner.type === 'guest' ? owner.sessionToken : null,
		expiresAt: owner.type === 'guest' ? new Date(now.getTime() + GUEST_BAG_TTL_MS) : null,
		createdAt: now,
		updatedAt: now
	};

	try {
		return await withTransientD1WriteReconciliation<Bag>(
			async () => {
				const [created] = await tx.insert(bagTable).values(values).returning();
				if (!created) {
					throw new BagError('Bag was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return created;
			},
			async () => {
				const [row] = await tx.select().from(bagTable).where(eq(bagTable.id, values.id!)).limit(1);
				if (row) return { committed: true, value: row };
				const racedBag = await findActiveBagByOwnerTx(tx, owner, now);
				return racedBag ? { committed: true, value: racedBag } : { committed: false };
			}
		);
	} catch (error) {
		if (isUniqueConstraintError(getErrorMessage(error))) {
			const racedBag = await findActiveBagByOwnerTx(tx, owner, now);
			if (racedBag) return racedBag;
		}

		throw error;
	}
}

async function findBagByOwnerTx(tx: QueryExecutor, owner: BagOwner): Promise<Bag | null> {
	const [row] = await tx
		.select()
		.from(bagTable)
		.where(bagOwnerPredicate(owner))
		.orderBy(desc(bagTable.updatedAt), desc(bagTable.createdAt))
		.limit(1);

	return row ?? null;
}

async function findActiveBagByOwnerTx(
	tx: QueryExecutor,
	owner: BagOwner,
	now: Date
): Promise<Bag | null> {
	const row = await findBagByOwnerTx(tx, owner);
	if (!row || isBagExpired(row, now)) return null;
	return row;
}

async function findUserBagsTx(tx: QueryExecutor, userId: string): Promise<Bag[]> {
	return tx
		.select()
		.from(bagTable)
		.where(and(eq(bagTable.userId, userId), isNull(bagTable.sessionToken)))
		.orderBy(desc(bagTable.updatedAt), desc(bagTable.createdAt));
}

async function findOwnedBagItemTx(
	tx: QueryExecutor,
	owner: BagOwner,
	bagItemId: string,
	now: Date
): Promise<BagWithItemRow> {
	const [row] = await tx
		.select({
			bag: bagTable,
			item: bagItemTable
		})
		.from(bagItemTable)
		.innerJoin(bagTable, eq(bagItemTable.bagId, bagTable.id))
		.where(and(eq(bagItemTable.id, bagItemId), bagOwnerPredicate(owner)))
		.limit(1);

	if (!row) {
		throw new BagError('Bag item not found.', ErrorCode.BAG_ITEM_NOT_FOUND, { bagItemId });
	}

	if (isBagExpired(row.bag, now)) {
		throw new BagError('Bag has expired.', ErrorCode.CHECKOUT_SESSION_EXPIRED, {
			bagId: row.bag.id
		});
	}

	return row;
}

async function findBagItemByVariantTx(
	tx: QueryExecutor,
	bagId: string,
	variantId: string
): Promise<BagItem | null> {
	const [row] = await tx
		.select()
		.from(bagItemTable)
		.where(and(eq(bagItemTable.bagId, bagId), eq(bagItemTable.variantId, variantId)))
		.limit(1);

	return row ?? null;
}

async function findBagItemByIdTx(tx: QueryExecutor, bagItemId: string): Promise<BagItem | null> {
	const [row] = await tx.select().from(bagItemTable).where(eq(bagItemTable.id, bagItemId)).limit(1);
	return row ?? null;
}

async function findBagByIdTx(tx: QueryExecutor, bagId: string): Promise<Bag | null> {
	const [row] = await tx.select().from(bagTable).where(eq(bagTable.id, bagId)).limit(1);
	return row ?? null;
}

async function reloadBagByIdTx(tx: QueryExecutor, bagId: string): Promise<Bag> {
	const row = await findBagByIdTx(tx, bagId);

	if (!row) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId });
	}

	return row;
}

function sameOptionalDate(left: Date | null, right: Date | null): boolean {
	return left === null || right === null ? left === right : left.getTime() === right.getTime();
}

async function convertBagOwnerTx(tx: Tx, bagId: string, owner: BagOwner, now: Date): Promise<Bag> {
	const existing = await reloadBagByIdTx(tx, bagId);

	const expected = {
		userId: owner.type === 'user' ? owner.userId : null,
		sessionToken: owner.type === 'guest' ? owner.sessionToken : null,
		expiresAt: owner.type === 'guest' ? new Date(now.getTime() + GUEST_BAG_TTL_MS) : null
	};
	return withTransientD1WriteReconciliation<Bag>(
		async () => {
			const [row] = await tx
				.update(bagTable)
				.set({
					...expected,
					checkoutStartedAt: null,
					checkoutExpiresAt: null,
					updatedAt: now
				})
				.where(and(eq(bagTable.id, bagId), eq(bagTable.updatedAt, existing.updatedAt)))
				.returning();
			if (!row) {
				throw new BagError('Bag changed before its owner could be updated.', ErrorCode.CONFLICT, {
					bagId
				});
			}
			return row;
		},
		async () => {
			const row = await findBagByIdTx(tx, bagId);
			return row &&
				row.userId === expected.userId &&
				row.sessionToken === expected.sessionToken &&
				sameOptionalDate(row.expiresAt, expected.expiresAt) &&
				row.updatedAt.getTime() === now.getTime()
				? { committed: true, value: row }
				: { committed: false };
		}
	);
}

async function releaseExpiredCheckoutIfNeededTx(tx: Tx, row: Bag, now: Date): Promise<Bag> {
	if (!isCheckoutExpired(row, now)) return row;
	return (await cancelCheckoutWindowTx(tx, row, now)).bag;
}

async function cancelCheckoutTx(tx: Tx, row: Bag, now: Date): Promise<Bag> {
	if (row.checkoutStartedAt === null && row.checkoutExpiresAt === null) return row;
	return (await cancelCheckoutWindowTx(tx, row, now)).bag;
}

async function cancelCheckoutWindowTx(
	tx: Tx,
	row: Bag,
	now: Date
): Promise<{ bag: Bag; releasedQuantity: number }> {
	const bag = await withTransientD1WriteReconciliation<Bag>(
		async () => {
			const [updated] = await tx
				.update(bagTable)
				.set({ checkoutStartedAt: null, checkoutExpiresAt: null, updatedAt: now })
				.where(and(eq(bagTable.id, row.id), eq(bagTable.updatedAt, row.updatedAt)))
				.returning();
			if (updated) return updated;
			const current = await reloadBagByIdTx(tx, row.id);
			if (
				current.checkoutStartedAt === null &&
				current.checkoutExpiresAt === null &&
				current.updatedAt.getTime() === now.getTime()
			) {
				return current;
			}
			throw new BagError('Bag changed while checkout was being cancelled.', ErrorCode.CONFLICT);
		},
		async () => {
			const current = await findBagByIdTx(tx, row.id);
			return current &&
				current.checkoutStartedAt === null &&
				current.checkoutExpiresAt === null &&
				current.updatedAt.getTime() === now.getTime()
				? { committed: true, value: current }
				: { committed: false };
		}
	);
	return { bag, releasedQuantity: 0 };
}

async function expireDueBagCheckoutByIdTx(
	tx: Tx,
	bagId: string,
	now: Date
): Promise<{ skipped: boolean; releasedQuantity: number }> {
	const [row] = await tx
		.select()
		.from(bagTable)
		.where(
			and(
				eq(bagTable.id, bagId),
				isNotNull(bagTable.checkoutStartedAt),
				isNotNull(bagTable.checkoutExpiresAt),
				lte(bagTable.checkoutExpiresAt, now)
			)
		)
		.limit(1);

	if (!row) {
		return { skipped: true, releasedQuantity: 0 };
	}

	const result = await cancelCheckoutWindowTx(tx, row, now);
	return { skipped: false, releasedQuantity: result.releasedQuantity };
}

async function deleteBagByIdTx(tx: Tx, bagId: string, now: Date): Promise<BagDeleteResult> {
	void now;
	const existing = await findBagByIdTx(tx, bagId);
	if (!existing) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId });
	}
	const [itemCountRow] = await tx
		.select({ total: count() })
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, bagId));
	const result = {
		itemCount: Number(itemCountRow?.total ?? 0),
		releasedQuantity: 0
	};
	return withTransientD1WriteReconciliation<BagDeleteResult>(
		async () => {
			const [deleted] = await tx
				.delete(bagTable)
				.where(and(eq(bagTable.id, bagId), eq(bagTable.updatedAt, existing.updatedAt)))
				.returning({ id: bagTable.id });
			if (!deleted) {
				throw new BagError('Bag changed before it could be deleted.', ErrorCode.CONFLICT, {
					bagId
				});
			}
			return result;
		},
		async () => {
			const row = await findBagByIdTx(tx, bagId);
			return row ? { committed: false } : { committed: true, value: result };
		}
	);
}

async function deleteExpiredGuestBagByIdTx(
	tx: Tx,
	bagId: string,
	now: Date
): Promise<BagDeleteResult & { skipped: boolean }> {
	const [row] = await tx
		.select({ id: bagTable.id })
		.from(bagTable)
		.where(
			and(
				eq(bagTable.id, bagId),
				isNotNull(bagTable.sessionToken),
				isNotNull(bagTable.expiresAt),
				lte(bagTable.expiresAt, now)
			)
		)
		.limit(1);

	if (!row) {
		return { skipped: true, itemCount: 0, releasedQuantity: 0 };
	}

	const [itemCountRow] = await tx
		.select({ total: count() })
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, row.id));
	const result: BagDeleteResult & { skipped: boolean } = {
		skipped: false,
		itemCount: Number(itemCountRow?.total ?? 0),
		releasedQuantity: 0
	};
	return withTransientD1WriteReconciliation<BagDeleteResult & { skipped: boolean }>(
		async () => {
			const [deleted] = await tx
				.delete(bagTable)
				.where(
					and(
						eq(bagTable.id, row.id),
						isNotNull(bagTable.sessionToken),
						isNotNull(bagTable.expiresAt),
						lte(bagTable.expiresAt, now)
					)
				)
				.returning({ id: bagTable.id });
			return deleted ? result : { skipped: true, itemCount: 0, releasedQuantity: 0 };
		},
		async () => {
			const current = await findBagByIdTx(tx, row.id);
			return current ? { committed: false } : { committed: true, value: result };
		}
	);
}

export function prepareUserBagDeletion(db: BagTx, userId: string): BagBatchItem {
	return db.delete(bagTable).where(eq(bagTable.userId, normalizeId(userId, 'userId')));
}

async function mergeBagRowsTx(tx: Tx, sourceBag: Bag, targetBag: Bag, now: Date): Promise<void> {
	if (sourceBag.id === targetBag.id) return;

	const sourceItems = await tx
		.select()
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, sourceBag.id))
		.orderBy(asc(bagItemTable.addedAt));
	const targetItems = await tx
		.select()
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, targetBag.id));
	const targetByVariantId = new Map(targetItems.map((item) => [item.variantId, item]));
	const statements: [BagBatchItem, ...BagBatchItem[]] = [
		tx
			.update(bagTable)
			.set({ checkoutStartedAt: null, checkoutExpiresAt: null, updatedAt: now })
			.where(and(eq(bagTable.id, targetBag.id), eq(bagTable.updatedAt, targetBag.updatedAt)))
	];
	statements.push(...guardPreviousBatchChanges(tx));

	for (const sourceItem of sourceItems) {
		const targetItem = targetByVariantId.get(sourceItem.variantId);

		if (!targetItem) {
			statements.push(
				tx
					.update(bagItemTable)
					.set({ bagId: targetBag.id, updatedAt: now })
					.where(
						and(
							eq(bagItemTable.id, sourceItem.id),
							eq(bagItemTable.bagId, sourceBag.id),
							eq(bagItemTable.quantity, sourceItem.quantity)
						)
					),
				...guardPreviousBatchChanges(tx)
			);
			continue;
		}

		const acceptedQuantity = Math.min(
			sourceItem.quantity,
			MAX_BAG_ITEM_QUANTITY - targetItem.quantity
		);

		if (acceptedQuantity > 0) {
			statements.push(
				tx
					.update(bagItemTable)
					.set({
						quantity: targetItem.quantity + acceptedQuantity,
						updatedAt: now
					})
					.where(
						and(eq(bagItemTable.id, targetItem.id), eq(bagItemTable.quantity, targetItem.quantity))
					),
				...guardPreviousBatchChanges(tx)
			);
		}

		statements.push(
			tx
				.delete(bagItemTable)
				.where(and(eq(bagItemTable.id, sourceItem.id), eq(bagItemTable.bagId, sourceBag.id))),
			...guardPreviousBatchChanges(tx)
		);
	}

	statements.push(
		tx
			.delete(bagTable)
			.where(and(eq(bagTable.id, sourceBag.id), eq(bagTable.updatedAt, sourceBag.updatedAt))),
		...guardPreviousBatchChanges(tx)
	);
	await withTransientD1WriteReconciliation(
		async () => {
			await tx.batch(statements);
		},
		async () => {
			const source = await findBagByIdTx(tx, sourceBag.id);
			const target = await findBagByIdTx(tx, targetBag.id);
			return !source && target ? { committed: true, value: undefined } : { committed: false };
		}
	);
}

async function loadPurchasableVariantTx(
	tx: QueryExecutor,
	variantId: string
): Promise<PurchasableVariant> {
	const [row] = await tx
		.select({
			product: productTable,
			variant: productVariantTable,
			color: productVariantColorTable
		})
		.from(productVariantTable)
		.innerJoin(productTable, eq(productVariantTable.productId, productTable.id))
		.innerJoin(
			productVariantColorTable,
			eq(productVariantTable.variantColorId, productVariantColorTable.id)
		)
		.where(eq(productVariantTable.id, variantId))
		.limit(1);

	if (!row) {
		throw new ProductError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			variantId
		});
	}

	if (!row.product.isActive) {
		throw new ProductError('Product is unavailable.', ErrorCode.PRODUCT_UNAVAILABLE, {
			productId: row.product.id
		});
	}

	if (!row.variant.isActive) {
		throw new ProductError('Product variant is unavailable.', ErrorCode.VARIANT_UNAVAILABLE, {
			productId: row.product.id,
			variantId
		});
	}

	return {
		product: row.product,
		variant: row.variant,
		unitPrice: row.color.basePrice
	};
}

async function hydrateBagTx(tx: Tx, row: Bag, now: Date): Promise<BagDTO> {
	const [dto] = await hydrateBagsTx(tx, [row], now);

	if (!dto) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId: row.id });
	}

	return dto;
}

async function hydrateCheckoutOrderBagTx(
	tx: Tx,
	row: Bag,
	now: Date
): Promise<CheckoutOrderBagDTO> {
	const bag = await hydrateBagTx(tx, row, now);
	const itemRows = await tx
		.select()
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, row.id))
		.orderBy(asc(bagItemTable.addedAt));
	const productIds = uniqueStrings(itemRows.map((item) => item.productId));
	const variantIds = uniqueStrings(itemRows.map((item) => item.variantId));
	const imageRows =
		productIds.length > 0
			? await tx
					.select()
					.from(productImageTable)
					.where(inArray(productImageTable.productId, productIds))
					.orderBy(asc(productImageTable.position), asc(productImageTable.createdAt))
			: [];
	const variantRows =
		variantIds.length > 0
			? await tx
					.select()
					.from(productVariantTable)
					.where(inArray(productVariantTable.id, variantIds))
			: [];
	const imagesByProductId = groupByProductId(imageRows);
	const variantsById = new Map(variantRows.map((v) => [v.id, v]));
	const imageKeyByItemId = new Map(
		itemRows.map((item) => {
			const variant = variantsById.get(item.variantId);
			const variantColorId = variant?.variantColorId ?? null;
			return [
				item.id,
				resolveBagImageR2Key(imagesByProductId.get(item.productId) ?? [], variantColorId)
			];
		})
	);
	const items: CheckoutOrderBagItemDTO[] = bag.items.map((item) => ({
		...item,
		productImageR2Key: imageKeyByItemId.get(item.id) ?? null
	}));
	const bagWithItems = {
		...bag,
		items
	};
	const blockingReasons = checkoutBlockingReasons(bagWithItems, { requireActiveCheckout: true });

	return {
		...bagWithItems,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

async function hydrateAdminBagTx(tx: Tx, row: Bag, now: Date): Promise<AdminBagDTO> {
	const [dto] = await hydrateAdminBagsTx(tx, [row], now);

	if (!dto) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId: row.id });
	}

	return dto;
}

async function hydrateAdminBagsTx(tx: Tx, rows: Bag[], now: Date): Promise<AdminBagDTO[]> {
	const bags = await hydrateBagsTx(tx, rows, now);
	const rowById = new Map(rows.map((row) => [row.id, row]));

	return bags.map((bag) => {
		const row = rowById.get(bag.id);

		return {
			...bag,
			sessionToken: row?.sessionToken ?? null,
			promotionId: row?.promotionId ?? null,
			promoCodeId: row?.promoCodeId ?? null
		};
	});
}

async function hydrateBagsTx(tx: Tx, rows: Bag[], now: Date): Promise<BagDTO[]> {
	if (rows.length === 0) return [];

	const bagIds = rows.map((row) => row.id);
	const itemRows = await tx
		.select()
		.from(bagItemTable)
		.where(inArray(bagItemTable.bagId, bagIds))
		.orderBy(asc(bagItemTable.addedAt));
	const productIds = uniqueStrings(itemRows.map((item) => item.productId));
	const variantIds = uniqueStrings(itemRows.map((item) => item.variantId));
	const [productRows, variantRows, imageRows, inventoryRows] = await loadBagHydrationRelationsTx(
		tx,
		productIds,
		variantIds
	);
	const productsById = new Map(productRows.map((productRow) => [productRow.id, productRow]));
	const variantsById = new Map(variantRows.map((variantRow) => [variantRow.id, variantRow]));
	const imagesByProductId = groupByProductId(imageRows);
	const inventoryByVariantId = new Map(
		inventoryRows.map((inventoryRow) => [inventoryRow.variantId, inventoryRow])
	);
	const reservedByItemId = await loadReservedQuantitiesByItemId(tx, itemRows);
	const activeCheckoutHoldsByVariantId = await loadActiveCheckoutHoldsByVariantId(
		tx,
		variantIds,
		now
	);
	const itemsByBagId = groupByBagId(itemRows);

	const activeMethods = await tx
		.select({
			freeShippingThreshold: shippingMethod.freeShippingThreshold
		})
		.from(shippingMethod)
		.where(eq(shippingMethod.isActive, true))
		.orderBy(asc(shippingMethod.sortOrder), asc(shippingMethod.name));

	let freeShippingThreshold: number | null = null;
	for (const m of activeMethods) {
		if (m.freeShippingThreshold !== null && m.freeShippingThreshold !== 0) {
			freeShippingThreshold = m.freeShippingThreshold;
			break;
		}
	}

	const hydratedRows = rows.map((row) => {
		const items = (itemsByBagId.get(row.id) ?? []).map((item) =>
			toBagItemDTO({
				item,
				product: productsById.get(item.productId) ?? null,
				variant: variantsById.get(item.variantId) ?? null,
				images: imagesByProductId.get(item.productId) ?? [],
				inventory: inventoryByVariantId.get(item.variantId) ?? null,
				reservedForItem: reservedByItemId.get(item.id) ?? 0,
				activeCheckoutHolds: activeCheckoutHoldsByVariantId.get(item.variantId) ?? [],
				now
			})
		);
		const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
		return { row, items, subtotal };
	});
	const promotionStates = await resolveStoredPromotionBagStatesTx(tx, {
		items: hydratedRows.map(({ row, subtotal }) => ({
			key: row.id,
			promotionId: row.promotionId,
			promoCodeId: row.promoCodeId,
			userId: row.userId,
			subtotal
		})),
		now
	});

	const bags: BagDTO[] = [];
	for (const { row, items, subtotal } of hydratedRows) {
		const { presentation: storedPromotion, result: promotionResult } = promotionStates.get(
			row.id
		) ?? { presentation: null, result: null };
		const discountAmount = promotionResult?.discountAmount ?? 0;

		bags.push({
			id: row.id,
			ownerType: row.userId ? 'user' : 'guest',
			userId: row.userId,
			expiresAt: row.expiresAt,
			checkoutStartedAt: row.checkoutStartedAt,
			checkoutExpiresAt: row.checkoutExpiresAt,
			checkoutStatus: checkoutStatus(row, now),
			items,
			itemCount: items.reduce((total, item) => total + item.quantity, 0),
			subtotal,
			discountAmount,
			totalBeforeShipping: Math.max(0, subtotal - discountAmount),
			hasUnavailableItems: items.some((item) => item.availabilityStatus === 'unavailable'),
			hasInsufficientItems: items.some((item) => item.availabilityStatus === 'insufficient'),
			hasReservedItems: items.some((item) => item.availabilityStatus === 'reserved'),
			promotionId: promotionResult?.promotionId ?? null,
			promotionName: promotionResult?.promotionName ?? storedPromotion?.promotionName ?? null,
			promotionApplicationMode:
				promotionResult?.applicationMode ?? storedPromotion?.applicationMode ?? null,
			promoCodeId: promotionResult?.promoCodeId ?? null,
			promoCode: promotionResult?.code ?? storedPromotion?.code ?? null,
			promoMinOrderAmount: storedPromotion?.minOrderAmount ?? null,
			freeShippingThreshold,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt
		});
	}

	return bags;
}

type HydratedBagVariant = ProductVariant & {
	color: string;
	colorHex: string | null;
	priceOverride: number | null;
	basePrice: number;
	compareAtPrice: number | null;
};

async function loadActiveCheckoutHoldsByVariantId(
	tx: QueryExecutor,
	variantIds: string[],
	now: Date
): Promise<Map<string, ActiveCheckoutHold[]>> {
	const holdsByVariantId = new Map<string, ActiveCheckoutHold[]>();
	if (variantIds.length === 0) return holdsByVariantId;

	const rows = await tx
		.select({
			bagId: bagTable.id,
			itemId: bagItemTable.id,
			variantId: bagItemTable.variantId,
			quantity: bagItemTable.quantity,
			checkoutExpiresAt: bagTable.checkoutExpiresAt
		})
		.from(bagItemTable)
		.innerJoin(bagTable, eq(bagItemTable.bagId, bagTable.id))
		.where(
			and(
				inArray(bagItemTable.variantId, variantIds),
				isNotNull(bagTable.checkoutStartedAt),
				isNotNull(bagTable.checkoutExpiresAt),
				gt(bagTable.checkoutExpiresAt, now)
			)
		)
		.orderBy(asc(bagTable.checkoutExpiresAt), asc(bagItemTable.addedAt));

	for (const row of rows) {
		if (!row.checkoutExpiresAt) continue;
		const holds = holdsByVariantId.get(row.variantId) ?? [];
		holds.push({
			...row,
			checkoutExpiresAt: row.checkoutExpiresAt
		});
		holdsByVariantId.set(row.variantId, holds);
	}

	return holdsByVariantId;
}

async function loadBagHydrationRelationsTx(
	tx: Tx,
	productIds: string[],
	variantIds: string[]
): Promise<[Product[], HydratedBagVariant[], ProductImage[], InventoryAvailabilityDTO[]]> {
	const productRows =
		productIds.length > 0
			? await tx.select().from(productTable).where(inArray(productTable.id, productIds))
			: [];
	const variantRows =
		variantIds.length > 0
			? await tx
					.select({
						variant: productVariantTable,
						color: productVariantColorTable
					})
					.from(productVariantTable)
					.innerJoin(
						productVariantColorTable,
						eq(productVariantTable.variantColorId, productVariantColorTable.id)
					)
					.where(inArray(productVariantTable.id, variantIds))
			: [];
	const imageRows =
		productIds.length > 0
			? await tx
					.select()
					.from(productImageTable)
					.where(inArray(productImageTable.productId, productIds))
					.orderBy(asc(productImageTable.position), asc(productImageTable.createdAt))
			: [];
	const inventoryRows =
		variantIds.length > 0 ? await getInventoryAvailabilityByVariantIdsTx(tx, { variantIds }) : [];

	return [
		productRows,
		variantRows.map((v) => ({
			...v.variant,
			color: v.color.color,
			colorHex: v.color.colorHex,
			priceOverride: null,
			basePrice: v.color.basePrice,
			compareAtPrice: v.color.compareAtPrice,
			variantColorId: v.color.id
		})),
		imageRows,
		inventoryRows
	];
}

async function loadReservedQuantitiesByItemId(
	tx: Tx,
	items: BagItem[]
): Promise<Map<string, number>> {
	void tx;
	return new Map(items.map((item) => [item.id, 0]));
}

function toBagItemDTO(input: {
	item: BagItem;
	product: Product | null;
	variant: HydratedBagVariant | null;
	images: ProductImage[];
	inventory: InventoryAvailabilityDTO | null;
	reservedForItem: number;
	activeCheckoutHolds: ActiveCheckoutHold[];
	now: Date;
}): BagItemDTO {
	const currentUnitPrice = input.variant?.basePrice ?? null;
	const availability = resolveBagItemAvailability(input);
	const variantColorId = input.variant?.variantColorId ?? null;

	return {
		id: input.item.id,
		bagId: input.item.bagId,
		productId: input.item.productId,
		variantId: input.item.variantId,
		productName: input.product?.name ?? null,
		productSlug: input.product?.slug ?? null,
		size: input.variant?.size ?? null,
		color: input.variant?.color ?? null,
		colorHex: input.variant?.colorHex ?? null,
		imageUrl: input.product ? resolveBagImageUrl(input.images, variantColorId) : null,
		quantity: input.item.quantity,
		unitPrice: input.item.unitPrice,
		currentUnitPrice,
		priceChanged: currentUnitPrice !== null && currentUnitPrice !== input.item.unitPrice,
		lineTotal: input.item.unitPrice * input.item.quantity,
		availabilityStatus: availability.status,
		availableQuantity: availability.availableQuantity,
		reservedForItem: input.reservedForItem,
		reservationExpiresAt: availability.reservationExpiresAt,
		reservationSecondsRemaining:
			availability.reservationExpiresAt === null
				? null
				: Math.max(
						0,
						Math.ceil((availability.reservationExpiresAt.getTime() - input.now.getTime()) / 1000)
					),
		isBackorder: availability.status === 'backorder',
		addedAt: input.item.addedAt,
		updatedAt: input.item.updatedAt
	};
}

function resolveBagItemAvailability(input: {
	item: BagItem;
	product: Product | null;
	variant: HydratedBagVariant | null;
	inventory: InventoryAvailabilityDTO | null;
	reservedForItem: number;
	activeCheckoutHolds: ActiveCheckoutHold[];
}): {
	status: BagItemAvailabilityStatus;
	availableQuantity: number | null;
	reservationExpiresAt: Date | null;
} {
	if (!input.product || !input.variant || input.variant.productId !== input.product.id) {
		return { status: 'unavailable', availableQuantity: 0, reservationExpiresAt: null };
	}

	if (!input.product.isActive || !input.variant.isActive) {
		return { status: 'unavailable', availableQuantity: 0, reservationExpiresAt: null };
	}

	if (!input.inventory) {
		return { status: 'unavailable', availableQuantity: 0, reservationExpiresAt: null };
	}

	if (!input.inventory.trackInventory) {
		return { status: 'untracked', availableQuantity: null, reservationExpiresAt: null };
	}

	const availableQuantity = input.inventory.availableQuantity + input.reservedForItem;

	if (availableQuantity >= input.item.quantity) {
		return { status: 'available', availableQuantity, reservationExpiresAt: null };
	}

	if (input.inventory.allowBackorder) {
		return { status: 'backorder', availableQuantity, reservationExpiresAt: null };
	}

	const missingQuantity = input.item.quantity - availableQuantity;
	let heldQuantity = 0;

	for (const hold of input.activeCheckoutHolds) {
		if (hold.itemId === input.item.id) continue;
		heldQuantity += hold.quantity;

		if (heldQuantity >= missingQuantity) {
			return {
				status: 'reserved',
				availableQuantity,
				reservationExpiresAt: hold.checkoutExpiresAt
			};
		}
	}

	return {
		status: availableQuantity > 0 ? 'insufficient' : 'unavailable',
		availableQuantity,
		reservationExpiresAt: null
	};
}

async function assertBagQuantityAvailableTx(
	tx: Tx,
	variantId: string,
	desiredQuantity: number
): Promise<void> {
	const [availability] = await getInventoryAvailabilityByVariantIdsTx(tx, {
		variantIds: [variantId]
	});

	// Existing behavior permits products whose inventory row has not been initialized;
	// hydration still blocks checkout until an admin configures that inventory.
	if (!availability || !availability.trackInventory || availability.allowBackorder) return;
	if (desiredQuantity <= availability.availableQuantity) return;

	throw new BagError(
		`Only ${availability.availableQuantity} unit${availability.availableQuantity === 1 ? '' : 's'} available.`,
		ErrorCode.INSUFFICIENT_STOCK,
		{
			variantId,
			requestedQuantity: desiredQuantity,
			availableQuantity: availability.availableQuantity
		}
	);
}

function parseNewBagItem(input: NewBagItem): NewBagItem {
	const result = insertBagItemSchema.safeParse({
		bagId: input.bagId,
		variantId: input.variantId,
		productId: input.productId,
		quantity: input.quantity,
		unitPrice: input.unitPrice
	});

	if (!result.success) {
		throw new BagError('Invalid bag item data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		id: input.id,
		...result.data
	};
}

function parseUpdateBagItemQuantity(quantity: number, now: Date): Partial<NewBagItem> {
	const result = updateBagItemSchema.safeParse({ quantity });

	if (!result.success) {
		throw new BagError('Invalid bag item quantity.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		quantity: result.data.quantity,
		updatedAt: now
	};
}

function bagListConditions(options: ListBagsOptions, now: Date): SQL[] {
	const conditions: SQL[] = [];

	if (options.ownerType === 'user') conditions.push(isNotNull(bagTable.userId));
	if (options.ownerType === 'guest') conditions.push(isNotNull(bagTable.sessionToken));
	if (options.userId) conditions.push(eq(bagTable.userId, normalizeId(options.userId, 'userId')));

	const status = options.status || 'all';
	if (status === 'active') {
		conditions.push(or(isNull(bagTable.expiresAt), gt(bagTable.expiresAt, now)) as SQL);
	} else if (status === 'expired') {
		conditions.push(and(isNotNull(bagTable.expiresAt), lte(bagTable.expiresAt, now)) as SQL);
	} else if (status === 'empty') {
		const db = getDb();
		const emptySubquery = db.select({ bagId: bagItemTable.bagId }).from(bagItemTable);
		conditions.push(notInArray(bagTable.id, emptySubquery));
	} else if (status === 'non-empty') {
		const db = getDb();
		const emptySubquery = db.select({ bagId: bagItemTable.bagId }).from(bagItemTable);
		conditions.push(inArray(bagTable.id, emptySubquery));
	} else if (!options.includeExpired) {
		conditions.push(or(isNull(bagTable.expiresAt), gt(bagTable.expiresAt, now)) as SQL);
	}

	return conditions;
}

function bagOwnerPredicate(owner: BagOwner): SQL {
	if (owner.type === 'user') {
		return and(eq(bagTable.userId, owner.userId), isNull(bagTable.sessionToken)) as SQL;
	}

	return and(eq(bagTable.sessionToken, owner.sessionToken), isNull(bagTable.userId)) as SQL;
}

function checkoutBlockingReasons(
	bag: BagDTO,
	options: { requireActiveCheckout?: boolean } = {}
): string[] {
	const reasons: string[] = [];

	if (bag.items.length === 0) reasons.push('Bag is empty.');
	if (bag.hasUnavailableItems) reasons.push('One or more bag items are unavailable.');
	if (bag.hasInsufficientItems) {
		reasons.push('Reduce one or more bag quantities to the available stock.');
	}
	if (bag.hasReservedItems) {
		reasons.push('One or more bag items are temporarily reserved by another checkout.');
	}
	if (options.requireActiveCheckout && bag.checkoutStatus !== 'active') {
		reasons.push('Checkout session has expired.');
	}

	return reasons;
}

function toCheckoutBagDTO(bag: BagDTO, requireActiveCheckout: boolean): CheckoutBagDTO {
	const blockingReasons = checkoutBlockingReasons(bag, { requireActiveCheckout });

	return {
		...bag,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

function resolveBagOwner(
	ctx: ServiceContext,
	input: BagAccessInput,
	options: { required: true }
): BagOwner;
function resolveBagOwner(
	ctx: ServiceContext,
	input: BagAccessInput,
	options: { required: false }
): BagOwner | null;
function resolveBagOwner(
	ctx: ServiceContext,
	input: BagAccessInput,
	options: { required: boolean }
): BagOwner | null {
	if (ctx.actor && !isSystemActor(ctx.actor)) {
		return {
			type: 'user',
			userId: normalizeId(ctx.actor.id, 'userId'),
			sessionToken: null
		};
	}

	const sessionToken = input.sessionToken ? normalizeSessionToken(input.sessionToken) : null;
	if (sessionToken) {
		return {
			type: 'guest',
			userId: null,
			sessionToken
		};
	}

	if (options.required) {
		throw new BagError('Bag owner is required.', ErrorCode.VALIDATION_ERROR);
	}

	return null;
}

function requireAccountActor(ctx: ServiceContext): ServiceActor {
	const actor = requireActor(ctx.actor);

	if (isSystemActor(actor)) {
		throw new BagError('A user account is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	return actor;
}

function isSystemActor(actor: ServiceActor | SystemActor | null | undefined): actor is SystemActor {
	return Boolean(actor?.id.startsWith('system:'));
}

function isBagExpired(row: Bag, now: Date): boolean {
	return row.expiresAt !== null && row.expiresAt <= now;
}

function isCheckoutActive(row: Bag, now: Date): boolean {
	return (
		row.checkoutStartedAt !== null && row.checkoutExpiresAt !== null && row.checkoutExpiresAt > now
	);
}

function isCheckoutExpired(row: Bag, now: Date): boolean {
	return (
		row.checkoutStartedAt !== null && row.checkoutExpiresAt !== null && row.checkoutExpiresAt <= now
	);
}

function checkoutStatus(row: Bag, now: Date): BagDTO['checkoutStatus'] {
	if (isCheckoutActive(row, now)) return 'active';
	if (isCheckoutExpired(row, now)) return 'expired';
	return 'inactive';
}

function normalizeBagItemQuantity(value: number, field: string): number {
	validateBagItemQuantity(value, field);
	return value;
}

function validateBagItemQuantity(value: number, field: string): void {
	if (!Number.isInteger(value) || value < 1 || value > MAX_BAG_ITEM_QUANTITY) {
		throw new BagError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new BagError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function normalizeSessionToken(value: string): string {
	return normalizeId(value, 'sessionToken');
}

function resolveBagImageUrl(images: ProductImage[], variantId: string | null): string | null {
	const variantPrimary = images.find((image) => image.variantId === variantId && image.isPrimary);
	if (variantPrimary) return mediaPresetUrl(variantPrimary.r2Key, 'thumb160');

	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return mediaPresetUrl(productPrimary.r2Key, 'thumb160');

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return mediaPresetUrl(anyPrimary.r2Key, 'thumb160');

	const variantImage = images.find((image) => image.variantId === variantId);
	if (variantImage) return mediaPresetUrl(variantImage.r2Key, 'thumb160');

	const firstImage = images[0];
	return firstImage ? mediaPresetUrl(firstImage.r2Key, 'thumb160') : null;
}

function resolveBagImageR2Key(images: ProductImage[], variantId: string | null): string | null {
	const variantPrimary = images.find((image) => image.variantId === variantId && image.isPrimary);
	if (variantPrimary) return variantPrimary.r2Key;

	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return productPrimary.r2Key;

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return anyPrimary.r2Key;

	const variantImage = images.find((image) => image.variantId === variantId);
	if (variantImage) return variantImage.r2Key;

	return images[0]?.r2Key ?? null;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function groupByProductId<T extends { productId: string }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const row of rows) {
		const current = groups.get(row.productId) ?? [];
		current.push(row);
		groups.set(row.productId, current);
	}

	return groups;
}

function groupByBagId<T extends { bagId: string }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const row of rows) {
		const current = groups.get(row.bagId) ?? [];
		current.push(row);
		groups.set(row.bagId, current);
	}

	return groups;
}

function mapBagMergeError(error: unknown): never {
	if (isAppError(error)) throw error;

	try {
		throw mapBagPersistenceError(error);
	} catch (mappedError) {
		if (isAppError(mappedError)) {
			if (mappedError.statusCode >= 500) throw mappedError;
			throw new BagError('Bag migration failed.', ErrorCode.BAG_MIGRATION_FAILED, {
				cause: mappedError.message
			});
		}

		throw mappedError;
	}
}

function mapBagPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	rethrowTransientD1Error(error);

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new BagError('Bag item already exists.', ErrorCode.BAG_ITEM_ALREADY_EXISTS);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new BagError('Related bag record not found.', ErrorCode.NOT_FOUND);
	}

	if (isCheckConstraintError(message)) {
		throw new BagError('Invalid bag data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}

export async function deleteBag(
	ctx: ServiceContext,
	input: { bagId: string; now?: Date }
): Promise<{ itemCount: number; releasedQuantity: number }> {
	requireAdmin(ctx.actor);

	const bagId = normalizeId(input.bagId, 'bagId');
	const now = resolveNow(ctx, input.now);

	try {
		return await deleteBagByIdTx(getDb(), bagId, now);
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

export async function getBagSummary(
	ctx: ServiceContext,
	input: { now?: Date } = {}
): Promise<BagSummaryDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx, input.now);
	const nowMs = now.getTime();
	const db = getDb();

	const [bagStats] = await db
		.select({
			total: count(),
			active:
				sql<number>`coalesce(sum(CASE WHEN ${bagTable.expiresAt} IS NULL OR ${bagTable.expiresAt} > ${nowMs} THEN 1 ELSE 0 END), 0)`.mapWith(
					Number
				),
			guest:
				sql<number>`coalesce(sum(CASE WHEN ${bagTable.sessionToken} IS NOT NULL THEN 1 ELSE 0 END), 0)`.mapWith(
					Number
				),
			user: sql<number>`coalesce(sum(CASE WHEN ${bagTable.userId} IS NOT NULL THEN 1 ELSE 0 END), 0)`.mapWith(
				Number
			),
			activeCheckouts:
				sql<number>`coalesce(sum(CASE WHEN ${bagTable.checkoutStartedAt} IS NOT NULL AND ${bagTable.checkoutExpiresAt} IS NOT NULL AND ${bagTable.checkoutExpiresAt} > ${nowMs} THEN 1 ELSE 0 END), 0)`.mapWith(
					Number
				)
		})
		.from(bagTable);
	const [itemStats] = await db
		.select({
			totalItems: sql<number>`coalesce(sum(${bagItemTable.quantity}), 0)`.mapWith(Number),
			totalValue:
				sql<number>`coalesce(sum(${bagItemTable.quantity} * ${bagItemTable.unitPrice}), 0)`.mapWith(
					Number
				),
			checkoutWindowItems:
				sql<number>`coalesce(sum(CASE WHEN ${bagTable.checkoutStartedAt} IS NOT NULL AND ${bagTable.checkoutExpiresAt} IS NOT NULL AND ${bagTable.checkoutExpiresAt} > ${nowMs} THEN ${bagItemTable.quantity} ELSE 0 END), 0)`.mapWith(
					Number
				)
		})
		.from(bagItemTable)
		.innerJoin(bagTable, eq(bagItemTable.bagId, bagTable.id));

	const total = Number(bagStats?.total ?? 0);
	const active = Number(bagStats?.active ?? 0);

	return {
		total,
		active,
		expired: Math.max(0, total - active),
		guest: Number(bagStats?.guest ?? 0),
		user: Number(bagStats?.user ?? 0),
		totalSubtotal: Number(itemStats?.totalValue ?? 0),
		totalItems: Number(itemStats?.totalItems ?? 0),
		activeCheckouts: Number(bagStats?.activeCheckouts ?? 0),
		checkoutWindowItems: Number(itemStats?.checkoutWindowItems ?? 0)
	};
}

export async function applyPromoCodeToBag(
	ctx: ServiceContext,
	input: BagAccessInput & { code: string }
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const code = input.code.trim().toUpperCase();
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const bagRow = await getOrCreateBagTx(db, owner, now);
		const bagDto = await hydrateBagTx(db, bagRow, now);

		const validation = await validatePromoCodeForBagTx(db, {
			code,
			userId: bagRow.userId,
			subtotal: bagDto.subtotal,
			now
		});

		const updatedBag = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				const [updatedRows] = await db.batch([
					db
						.update(bagTable)
						.set({
							promotionId: validation.promotionId,
							promoCodeId: validation.promoCodeId,
							checkoutStartedAt: null,
							checkoutExpiresAt: null,
							updatedAt: now
						})
						.where(and(eq(bagTable.id, bagRow.id), eq(bagTable.updatedAt, bagRow.updatedAt)))
						.returning(),
					...guardPreviousBatchChanges(db)
				]);
				const [row] = updatedRows;
				if (!row) throw new BagError('Bag changed.', ErrorCode.CONFLICT);
				return row;
			},
			async () => {
				const row = await findBagByIdTx(db, bagRow.id);
				return row &&
					row.promotionId === validation.promotionId &&
					row.promoCodeId === validation.promoCodeId &&
					row.updatedAt.getTime() === now.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);
		return hydrateBagTx(db, updatedBag, now);
	} catch (error) {
		if (isD1BatchGuardError(error)) throw new BagError('Bag changed.', ErrorCode.CONFLICT);
		throw mapBagPersistenceError(error);
	}
}

export async function removePromoCodeFromBag(
	ctx: ServiceContext,
	input: BagAccessInput
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	try {
		const db = getDb();
		const bagRow = await getOrCreateBagTx(db, owner, now);
		const updatedBag = await withTransientD1WriteReconciliation<Bag>(
			async () => {
				const [updatedRows] = await db.batch([
					db
						.update(bagTable)
						.set({
							promotionId: null,
							promoCodeId: null,
							checkoutStartedAt: null,
							checkoutExpiresAt: null,
							updatedAt: now
						})
						.where(and(eq(bagTable.id, bagRow.id), eq(bagTable.updatedAt, bagRow.updatedAt)))
						.returning(),
					...guardPreviousBatchChanges(db)
				]);
				const [row] = updatedRows;
				if (!row) throw new BagError('Bag changed.', ErrorCode.CONFLICT);
				return row;
			},
			async () => {
				const row = await findBagByIdTx(db, bagRow.id);
				return row &&
					row.promotionId === null &&
					row.promoCodeId === null &&
					row.updatedAt.getTime() === now.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);
		return hydrateBagTx(db, updatedBag, now);
	} catch (error) {
		if (isD1BatchGuardError(error)) throw new BagError('Bag changed.', ErrorCode.CONFLICT);
		throw mapBagPersistenceError(error);
	}
}
