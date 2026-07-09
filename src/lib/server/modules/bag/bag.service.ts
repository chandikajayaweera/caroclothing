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
	sum,
	notInArray,
	type SQL
} from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
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
	resolveNow,
	isString
} from '$lib/server/foundation/utils';
import { promoCode as promoCodeTable } from '../promotions/promotions.drizzle';
import { shippingMethod } from '../shipping/shipping.drizzle';
import { validatePromoCodeForBagTx, type PromotionsTx } from '../promotions/promotions.service';
import {
	getInventoryAvailabilityByVariantIdsTx,
	getOutstandingReservedQuantityTx,
	releaseInventoryReservationTx,
	reserveInventoryTx,
	type InventoryTx
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
	CheckoutBagDTO,
	CheckoutOrderBagDTO,
	CheckoutOrderBagItemDTO,
	ExpiredBagCheckoutCleanupResult,
	ExpiredGuestBagCleanupResult,
	ListBagsOptions,
	MergeGuestBagIntoUserInput,
	MergeUserBagIntoUserInput,
	OrderBagDeleteResult,
	RemoveBagItemInput,
	StorefrontVariantAvailabilityDTO,
	StorefrontVariantAvailabilityInput,
	UpdateBagItemQuantityInput
} from './bag.types';

type Db = ReturnType<typeof getDb>;
export type BagTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Tx = BagTx;
type QueryExecutor = Db | Tx;

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
const CHECKOUT_HOLD_MS = 10 * 60 * 1000;
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
	return getDb().transaction(async (tx) => {
		const row = await findActiveBagByOwnerTx(tx, owner, now);
		if (!row) return null;

		const current = await releaseExpiredCheckoutIfNeededTx(tx, row, now);
		return hydrateBagTx(tx, current, now);
	});
}

export async function getOrCreateBag(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	return getDb().transaction(async (tx) => {
		const row = await getOrCreateBagTx(tx, owner, now);
		return hydrateBagTx(tx, row, now);
	});
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
		return await getDb().transaction(async (tx) => {
			const row = await findOwnedBagItemTx(tx, owner, bagItemId, now);
			await loadPurchasableVariantTx(tx, row.item.variantId);
			await cancelCheckoutTx(tx, row.bag, now);

			const delta = quantity - row.item.quantity;

			if (delta !== 0) {
				const [updated] = await tx
					.update(bagItemTable)
					.set(parseUpdateBagItemQuantity(quantity, now))
					.where(eq(bagItemTable.id, row.item.id))
					.returning();

				if (!updated) {
					throw new BagError('Bag item not found.', ErrorCode.BAG_ITEM_NOT_FOUND, {
						bagItemId
					});
				}
			}

			const updatedBag = await touchAndReloadBagTx(tx, row.bag.id, now);
			return hydrateBagTx(tx, updatedBag, now);
		});
	} catch (error) {
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
		return await getDb().transaction(async (tx) => {
			const row = await findOwnedBagItemTx(tx, owner, bagItemId, now);
			await cancelCheckoutTx(tx, row.bag, now);
			await tx.delete(bagItemTable).where(eq(bagItemTable.id, row.item.id));

			const updatedBag = await touchAndReloadBagTx(tx, row.bag.id, now);
			return hydrateBagTx(tx, updatedBag, now);
		});
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

export async function clearBag(ctx: ServiceContext, input: BagAccessInput = {}): Promise<BagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction(async (tx) => {
			const row = await getOrCreateBagTx(tx, owner, now);
			await cancelCheckoutTx(tx, row, now);
			await clearBagItemsTx(tx, row.id, now);
			const updatedBag = await touchAndReloadBagTx(tx, row.id, now, {
				promoCodeId: null,
				checkoutStartedAt: null,
				checkoutExpiresAt: null
			});
			return hydrateBagTx(tx, updatedBag, now);
		});
	} catch (error) {
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

	return getDb().transaction(async (tx) => {
		await releaseExpiredCheckoutReservationsForVariantsTx(tx, variantIds, now);

		const inventoryRows = await getInventoryAvailabilityByVariantIdsTx(tx, { variantIds });
		const activeCheckoutHoldsByVariantId = await loadActiveCheckoutHoldsByVariantId(
			tx,
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
	});
}

export async function startCheckout(
	ctx: ServiceContext,
	input: BagAccessInput = {}
): Promise<CheckoutBagDTO> {
	const owner = resolveBagOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	try {
		await getDb().transaction(async (tx) => {
			const row = await findActiveBagByOwnerTx(tx, owner, now);
			if (row) await releaseExpiredCheckoutIfNeededTx(tx, row, now);
		});

		return await getDb().transaction(async (tx) => {
			const row = await getOrCreateBagTx(tx, owner, now);
			if (isCheckoutActive(row, now)) {
				return toCheckoutBagDTO(await hydrateBagTx(tx, row, now), true);
			}

			const bagDto = await hydrateBagTx(tx, row, now);
			const blockingReasons = checkoutBlockingReasons(bagDto);
			if (blockingReasons.length > 0) {
				throw new BagError('Bag cannot be checked out.', ErrorCode.CANNOT_MODIFY_ORDER, {
					blockingReasons
				});
			}

			const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_HOLD_MS);
			const [claimed] = await tx
				.update(bagTable)
				.set({
					checkoutStartedAt: now,
					checkoutExpiresAt,
					updatedAt: now
				})
				.where(and(eq(bagTable.id, row.id), isNull(bagTable.checkoutExpiresAt)))
				.returning();

			if (!claimed) {
				const raced = await reloadBagByIdTx(tx, row.id);
				if (isCheckoutActive(raced, now)) {
					return toCheckoutBagDTO(await hydrateBagTx(tx, raced, now), true);
				}
				throw new BagError('Checkout could not be started.', ErrorCode.CONFLICT);
			}

			const items = await tx
				.select()
				.from(bagItemTable)
				.where(eq(bagItemTable.bagId, claimed.id))
				.orderBy(asc(bagItemTable.addedAt));

			for (const item of items) {
				await reserveInventoryTx(tx as InventoryTx, {
					variantId: item.variantId,
					quantity: item.quantity,
					referenceId: item.id,
					now
				});
			}

			return toCheckoutBagDTO(await hydrateBagTx(tx, claimed, now), true);
		});
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
		return await getDb().transaction(async (tx) => {
			const row = await findActiveBagByOwnerTx(tx, owner, now);
			if (!row) return null;

			const updatedBag = await cancelCheckoutTx(tx, row, now);
			return hydrateBagTx(tx, updatedBag, now);
		});
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

export async function deleteBagAfterOrderPlacementTx(
	tx: BagTx,
	input: { bagId: string }
): Promise<OrderBagDeleteResult> {
	const bagId = normalizeId(input.bagId, 'bagId');
	const items = await tx.select().from(bagItemTable).where(eq(bagItemTable.bagId, bagId));
	await tx.delete(bagItemTable).where(eq(bagItemTable.bagId, bagId));
	await tx.delete(bagTable).where(eq(bagTable.id, bagId));

	return {
		bagId,
		itemCount: items.length
	};
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
		return await getDb().transaction(async (tx) => {
			const sourceBag = await findBagByOwnerTx(tx, sourceOwner);
			if (sourceBag && isBagExpired(sourceBag, now)) {
				await deleteBagByIdTx(tx, sourceBag.id, now);
			}

			const activeSourceBag = sourceBag && !isBagExpired(sourceBag, now) ? sourceBag : null;
			const targetBag = await findActiveBagByOwnerTx(tx, targetOwner, now);

			if (!activeSourceBag) {
				const row = targetBag ?? (await getOrCreateBagTx(tx, targetOwner, now));
				return hydrateBagTx(tx, row, now);
			}

			if (!targetBag) {
				const converted = await convertBagOwnerTx(tx, activeSourceBag.id, targetOwner, now);
				return hydrateBagTx(tx, converted, now);
			}

			await mergeBagRowsTx(tx, activeSourceBag, targetBag, now);
			const updatedTarget = await reloadBagByIdTx(tx, targetBag.id);
			return hydrateBagTx(tx, updatedTarget, now);
		});
	} catch (error) {
		throw mapBagMergeError(error);
	}
}

export async function mergeUserBagIntoUserBag(
	ctx: ServiceContext,
	input: MergeUserBagIntoUserInput
): Promise<BagDTO> {
	try {
		return await getDb().transaction(async (tx) => mergeUserBagIntoUserBagTx(tx, ctx, input));
	} catch (error) {
		throw mapBagMergeError(error);
	}
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

	return getDb().transaction(async (tx) => {
		const rowsQuery = tx
			.select()
			.from(bagTable)
			.orderBy(desc(bagTable.updatedAt), desc(bagTable.createdAt))
			.limit(limit)
			.offset(offset);
		const totalQuery = tx.select({ total: count() }).from(bagTable);
		const rows = await (where ? rowsQuery.where(where) : rowsQuery);
		const totalRows = await (where ? totalQuery.where(where) : totalQuery);

		return {
			items: await hydrateAdminBagsTx(tx, rows, now),
			total: Number(totalRows[0]?.total ?? 0),
			limit,
			offset
		};
	});
}

export async function getBagById(
	ctx: ServiceContext,
	input: { bagId: string; now?: Date }
): Promise<AdminBagDTO> {
	requireAdmin(ctx.actor);

	const bagId = normalizeId(input.bagId, 'bagId');
	const now = resolveNow(ctx, input.now);
	return getDb().transaction(async (tx) => {
		const row = await reloadBagByIdTx(tx, bagId);
		return hydrateAdminBagTx(tx, row, now);
	});
}

export async function getBagForUser(
	ctx: ServiceContext,
	input: { userId: string; now?: Date }
): Promise<AdminBagDTO | null> {
	requireAdmin(ctx.actor);

	const userId = normalizeId(input.userId, 'userId');
	const now = resolveNow(ctx, input.now);
	return getDb().transaction(async (tx) => {
		const row = await findActiveBagByOwnerTx(tx, { type: 'user', userId, sessionToken: null }, now);

		return row ? hydrateAdminBagTx(tx, row, now) : null;
	});
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
				const result = await db.transaction(async (tx) => {
					return deleteExpiredGuestBagByIdTx(tx, row.id, now);
				});
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
				console.error(`[bag] Failed to delete expired guest bag ${row.id}:`, err);
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
				const result = await db.transaction(async (tx) => {
					return expireDueBagCheckoutByIdTx(tx, row.id, now);
				});
				if (result.skipped) {
					skippedCount += 1;
					continue;
				}
				releasedQuantity += result.releasedQuantity;
				bagIds.push(row.id);
			} catch (err) {
				failedCount += 1;
				failedBagIds.push(row.id);
				console.error(`[bag] Failed to expire checkout for bag ${row.id}:`, err);
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
		return await getDb().transaction(async (tx) => {
			const bagRow = await getOrCreateBagTx(tx, owner, now);
			const target = await loadPurchasableVariantTx(tx, variantId);
			const existing = await findBagItemByVariantTx(tx, bagRow.id, variantId);
			await cancelCheckoutTx(tx, bagRow, now);

			if (existing) {
				const nextQuantity = existing.quantity + quantity;
				validateBagItemQuantity(nextQuantity, 'quantity');

				await tx
					.update(bagItemTable)
					.set(parseUpdateBagItemQuantity(nextQuantity, now))
					.where(eq(bagItemTable.id, existing.id));
			} else {
				const bagItemId = nanoid();
				const values = parseNewBagItem({
					id: bagItemId,
					bagId: bagRow.id,
					variantId,
					productId: target.product.id,
					quantity,
					unitPrice: target.unitPrice
				});

				await tx.insert(bagItemTable).values(values);
			}

			const updatedBag = await touchAndReloadBagTx(tx, bagRow.id, now);
			return hydrateBagTx(tx, updatedBag, now);
		});
	} catch (error) {
		if (retryOnConflict && isUniqueConstraintError(getErrorMessage(error))) {
			return addItemToBagWithRetry(ctx, input, false);
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
		userId: owner.type === 'user' ? owner.userId : null,
		sessionToken: owner.type === 'guest' ? owner.sessionToken : null,
		expiresAt: owner.type === 'guest' ? new Date(now.getTime() + GUEST_BAG_TTL_MS) : null
	};

	try {
		const [created] = await tx.insert(bagTable).values(values).returning();

		if (!created) {
			throw new BagError('Bag was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return created;
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

async function reloadBagByIdTx(tx: QueryExecutor, bagId: string): Promise<Bag> {
	const [row] = await tx.select().from(bagTable).where(eq(bagTable.id, bagId)).limit(1);

	if (!row) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId });
	}

	return row;
}

async function touchAndReloadBagTx(
	tx: Tx,
	bagId: string,
	now: Date,
	extraValues: Partial<NewBag> = {}
): Promise<Bag> {
	const [row] = await tx
		.update(bagTable)
		.set({ ...extraValues, updatedAt: now })
		.where(eq(bagTable.id, bagId))
		.returning();

	if (!row) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId });
	}

	return row;
}

async function convertBagOwnerTx(tx: Tx, bagId: string, owner: BagOwner, now: Date): Promise<Bag> {
	const existing = await reloadBagByIdTx(tx, bagId);
	await cancelCheckoutTx(tx, existing, now);

	const [row] = await tx
		.update(bagTable)
		.set({
			userId: owner.type === 'user' ? owner.userId : null,
			sessionToken: owner.type === 'guest' ? owner.sessionToken : null,
			expiresAt: owner.type === 'guest' ? new Date(now.getTime() + GUEST_BAG_TTL_MS) : null,
			updatedAt: now
		})
		.where(eq(bagTable.id, bagId))
		.returning();

	if (!row) {
		throw new BagError('Bag not found.', ErrorCode.BAG_NOT_FOUND, { bagId });
	}

	return row;
}

async function releaseExpiredCheckoutIfNeededTx(tx: Tx, row: Bag, now: Date): Promise<Bag> {
	if (!isCheckoutExpired(row, now)) return row;
	return (await releaseCheckoutReservationsTx(tx, row, now)).bag;
}

async function cancelCheckoutTx(tx: Tx, row: Bag, now: Date): Promise<Bag> {
	if (row.checkoutStartedAt === null && row.checkoutExpiresAt === null) return row;
	return (await releaseCheckoutReservationsTx(tx, row, now)).bag;
}

async function releaseCheckoutReservationsTx(
	tx: Tx,
	row: Bag,
	now: Date
): Promise<{ bag: Bag; releasedQuantity: number }> {
	const items = await tx
		.select()
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, row.id))
		.orderBy(asc(bagItemTable.addedAt));
	let releasedQuantity = 0;

	for (const item of items) {
		const result = await releaseInventoryReservationTx(tx as InventoryTx, {
			variantId: item.variantId,
			quantity: item.quantity,
			referenceId: item.id,
			now
		});
		releasedQuantity += result.releasedQuantity;
	}

	const bag = await touchAndReloadBagTx(tx, row.id, now, {
		checkoutStartedAt: null,
		checkoutExpiresAt: null
	});

	return { bag, releasedQuantity };
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

	const result = await releaseCheckoutReservationsTx(tx, row, now);
	return { skipped: false, releasedQuantity: result.releasedQuantity };
}

async function clearBagItemsTx(tx: Tx, bagId: string, now: Date): Promise<BagDeleteResult> {
	const items = await tx.select().from(bagItemTable).where(eq(bagItemTable.bagId, bagId));
	let releasedQuantity = 0;

	for (const item of items) {
		const result = await releaseInventoryReservationTx(tx as InventoryTx, {
			variantId: item.variantId,
			quantity: item.quantity,
			referenceId: item.id,
			now
		});
		releasedQuantity += result.releasedQuantity;
	}

	await tx.delete(bagItemTable).where(eq(bagItemTable.bagId, bagId));

	return {
		itemCount: items.length,
		releasedQuantity
	};
}

async function deleteBagByIdTx(tx: Tx, bagId: string, now: Date): Promise<BagDeleteResult> {
	const result = await clearBagItemsTx(tx, bagId, now);
	await tx.delete(bagTable).where(eq(bagTable.id, bagId));
	return result;
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

	const result = await deleteBagByIdTx(tx, row.id, now);
	return { ...result, skipped: false };
}

export async function deleteUserBagForAccountDeletionTx(
	tx: BagTx,
	userId: string,
	now: Date
): Promise<BagDeleteResult> {
	const [row] = await tx
		.select()
		.from(bagTable)
		.where(eq(bagTable.userId, normalizeId(userId, 'userId')))
		.limit(1);

	if (!row) {
		return { itemCount: 0, releasedQuantity: 0 };
	}

	return deleteBagByIdTx(tx, row.id, now);
}

async function mergeBagRowsTx(tx: Tx, sourceBag: Bag, targetBag: Bag, now: Date): Promise<void> {
	if (sourceBag.id === targetBag.id) return;

	await cancelCheckoutTx(tx, sourceBag, now);
	await cancelCheckoutTx(tx, targetBag, now);

	const sourceItems = await tx
		.select()
		.from(bagItemTable)
		.where(eq(bagItemTable.bagId, sourceBag.id))
		.orderBy(asc(bagItemTable.addedAt));

	for (const sourceItem of sourceItems) {
		const targetItem = await findBagItemByVariantTx(tx, targetBag.id, sourceItem.variantId);

		if (!targetItem) {
			await tx
				.update(bagItemTable)
				.set({ bagId: targetBag.id, updatedAt: now })
				.where(eq(bagItemTable.id, sourceItem.id));
			continue;
		}

		const acceptedQuantity = Math.min(
			sourceItem.quantity,
			MAX_BAG_ITEM_QUANTITY - targetItem.quantity
		);

		if (acceptedQuantity > 0) {
			await tx
				.update(bagItemTable)
				.set({
					quantity: targetItem.quantity + acceptedQuantity,
					updatedAt: now
				})
				.where(eq(bagItemTable.id, targetItem.id));
		}

		await tx.delete(bagItemTable).where(eq(bagItemTable.id, sourceItem.id));
	}

	await tx.delete(bagTable).where(eq(bagTable.id, sourceBag.id));
	await touchAndReloadBagTx(tx, targetBag.id, now);
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
		variant: {
			...row.variant,
			color: row.color.color,
			colorHex: row.color.colorHex,
			priceOverride: null,
			basePrice: row.color.basePrice,
			compareAtPrice: row.color.compareAtPrice
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
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
	const [imageRows, variantRows] = await Promise.all([
		productIds.length > 0
			? tx
					.select()
					.from(productImageTable)
					.where(inArray(productImageTable.productId, productIds))
					.orderBy(asc(productImageTable.position), asc(productImageTable.createdAt))
			: Promise.resolve([]),
		variantIds.length > 0
			? tx.select().from(productVariantTable).where(inArray(productVariantTable.id, variantIds))
			: Promise.resolve([])
	]);
	const imagesByProductId = groupByProductId(imageRows);
	const variantsById = new Map(variantRows.map((v) => [v.id, v]));
	const imageKeyByItemId = new Map(
		itemRows.map((item) => {
			const variant = variantsById.get(item.variantId);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const variantColorId = variant ? (variant as any).variantColorId : null;
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
		promoCodeId: row.promoCodeId ?? null,
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
	const releasedBagIds = await releaseExpiredCheckoutReservationsForVariantsTx(tx, variantIds, now);
	const currentRows =
		releasedBagIds.size > 0 ? await reloadHydratedBagRowsTx(tx, rows, releasedBagIds) : rows;
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

	const promoCodeIds = uniqueStrings(currentRows.map((row) => row.promoCodeId).filter(isString));
	const promoCodes =
		promoCodeIds.length > 0
			? await tx.select().from(promoCodeTable).where(inArray(promoCodeTable.id, promoCodeIds))
			: [];
	const promoCodesById = new Map(promoCodes.map((p) => [p.id, p]));

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

	return currentRows.map((row) => {
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

		let discountAmount = 0;
		const promoCodeId = row.promoCodeId;
		let promoCodeCode: string | null = null;
		let effectivePromoCodeId: string | null = null;
		let promoMinOrderAmount: number | null = null;
		if (promoCodeId) {
			const promo = promoCodesById.get(promoCodeId);
			if (promo) {
				promoCodeCode = promo.code;
				promoMinOrderAmount = promo.minOrderAmount;
				if (
					promo.isActive &&
					(promo.startsAt === null || promo.startsAt <= now) &&
					(promo.expiresAt === null || promo.expiresAt > now) &&
					(promo.minOrderAmount === null || subtotal >= promo.minOrderAmount) &&
					(promo.usageLimit === null || promo.usedCount < promo.usageLimit)
				) {
					const rawDiscount =
						promo.discountType === 'percentage'
							? Math.floor((subtotal * promo.discountValue) / 100)
							: promo.discountValue;
					const cappedByMaxDiscount =
						promo.maxDiscountAmount === null
							? rawDiscount
							: Math.min(rawDiscount, promo.maxDiscountAmount);
					discountAmount = Math.min(cappedByMaxDiscount, subtotal);
					effectivePromoCodeId = promo.id;
				}
			}
		}

		return {
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
			hasReservedItems: items.some((item) => item.availabilityStatus === 'reserved'),
			promoCodeId: effectivePromoCodeId,
			promoCode: promoCodeCode,
			promoMinOrderAmount,
			freeShippingThreshold,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt
		};
	});
}

type HydratedBagVariant = ProductVariant & {
	color: string;
	colorHex: string | null;
	priceOverride: number | null;
	basePrice: number;
	compareAtPrice: number | null;
};

async function releaseExpiredCheckoutReservationsForVariantsTx(
	tx: Tx,
	variantIds: string[],
	now: Date
): Promise<Set<string>> {
	if (variantIds.length === 0) return new Set();

	const dueRows = await tx
		.select({ bag: bagTable })
		.from(bagItemTable)
		.innerJoin(bagTable, eq(bagItemTable.bagId, bagTable.id))
		.where(
			and(
				inArray(bagItemTable.variantId, variantIds),
				isNotNull(bagTable.checkoutStartedAt),
				isNotNull(bagTable.checkoutExpiresAt),
				lte(bagTable.checkoutExpiresAt, now)
			)
		)
		.orderBy(asc(bagTable.checkoutExpiresAt), asc(bagTable.createdAt));
	const uniqueRows = new Map(dueRows.map(({ bag }) => [bag.id, bag]));

	for (const row of uniqueRows.values()) {
		await releaseCheckoutReservationsTx(tx, row, now);
	}

	return new Set(uniqueRows.keys());
}

async function reloadHydratedBagRowsTx(
	tx: Tx,
	rows: Bag[],
	releasedBagIds: Set<string>
): Promise<Bag[]> {
	const idsToReload = rows.map((row) => row.id).filter((id) => releasedBagIds.has(id));
	if (idsToReload.length === 0) return rows;

	const refreshedRows = await tx.select().from(bagTable).where(inArray(bagTable.id, idsToReload));
	const refreshedById = new Map(refreshedRows.map((row) => [row.id, row]));
	return rows.map((row) => refreshedById.get(row.id) ?? row);
}

async function loadActiveCheckoutHoldsByVariantId(
	tx: Tx,
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
	const reservedByItemId = new Map<string, number>();

	for (const item of items) {
		const reserved = await getOutstandingReservedQuantityTx(tx, {
			variantId: item.variantId,
			referenceId: item.id
		});
		reservedByItemId.set(item.id, reserved);
	}

	return reservedByItemId;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const currentUnitPrice = input.variant ? (input.variant as any).basePrice : null;
	const availability = resolveBagItemAvailability(input);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const variantColorId = input.variant ? (input.variant as any).variantColorId : null;

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

	return { status: 'unavailable', availableQuantity, reservationExpiresAt: null };
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

function resolveBagImageUrl(images: ProductImage[], variantId: string): string | null {
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

function resolveBagImageR2Key(images: ProductImage[], variantId: string): string | null {
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
			throw new BagError('Bag migration failed.', ErrorCode.BAG_MIGRATION_FAILED, {
				cause: mappedError.message
			});
		}

		throw mappedError;
	}
}

function mapBagPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

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
		return await getDb().transaction(async (tx) => {
			return deleteBagByIdTx(tx, bagId, now);
		});
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}

export async function getBagSummary(
	ctx: ServiceContext,
	input: { now?: Date } = {}
): Promise<{
	total: number;
	active: number;
	expired: number;
	guest: number;
	user: number;
	totalSubtotal: number;
	totalItems: number;
	activeCheckouts: number;
	reservedItems: number;
}> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx, input.now);
	const db = getDb();

	const [[totalRow], [activeRow], [guestRow], [userRow], [itemStats], activeCheckoutRows] =
		await Promise.all([
			db.select({ count: count() }).from(bagTable),
			db
				.select({ count: count() })
				.from(bagTable)
				.where(or(isNull(bagTable.expiresAt), gt(bagTable.expiresAt, now))),
			db.select({ count: count() }).from(bagTable).where(isNotNull(bagTable.sessionToken)),
			db.select({ count: count() }).from(bagTable).where(isNotNull(bagTable.userId)),
			db
				.select({
					totalQuantity: sum(bagItemTable.quantity),
					totalValue: sum(sql`${bagItemTable.quantity} * ${bagItemTable.unitPrice}`)
				})
				.from(bagItemTable),
			db
				.select({ id: bagTable.id })
				.from(bagTable)
				.where(
					and(
						isNotNull(bagTable.checkoutStartedAt),
						isNotNull(bagTable.checkoutExpiresAt),
						gt(bagTable.checkoutExpiresAt, now)
					)
				)
		]);

	const activeCheckoutBagIds = activeCheckoutRows.map((row) => row.id);
	const checkoutItems =
		activeCheckoutBagIds.length > 0
			? await db
					.select()
					.from(bagItemTable)
					.where(inArray(bagItemTable.bagId, activeCheckoutBagIds))
			: [];
	let reservedItems = 0;
	for (const item of checkoutItems) {
		reservedItems += await getOutstandingReservedQuantityTx(db, {
			variantId: item.variantId,
			referenceId: item.id
		});
	}

	return {
		total: Number(totalRow?.count ?? 0),
		active: Number(activeRow?.count ?? 0),
		expired: Math.max(0, Number(totalRow?.count ?? 0) - Number(activeRow?.count ?? 0)),
		guest: Number(guestRow?.count ?? 0),
		user: Number(userRow?.count ?? 0),
		totalSubtotal: Number(itemStats?.totalValue ?? 0),
		totalItems: Number(itemStats?.totalQuantity ?? 0),
		activeCheckouts: activeCheckoutRows.length,
		reservedItems
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
		return await getDb().transaction(async (tx) => {
			const bagRow = await getOrCreateBagTx(tx, owner, now);
			await cancelCheckoutTx(tx, bagRow, now);
			const bagDto = await hydrateBagTx(tx, bagRow, now);

			const validation = await validatePromoCodeForBagTx(tx as PromotionsTx, {
				code,
				userId: bagRow.userId,
				subtotal: bagDto.subtotal,
				now
			});

			const updatedBag = await touchAndReloadBagTx(tx, bagRow.id, now, {
				promoCodeId: validation.promoCodeId
			});

			return hydrateBagTx(tx, updatedBag, now);
		});
	} catch (error) {
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
		return await getDb().transaction(async (tx) => {
			const bagRow = await getOrCreateBagTx(tx, owner, now);
			await cancelCheckoutTx(tx, bagRow, now);
			const updatedBag = await touchAndReloadBagTx(tx, bagRow.id, now, {
				promoCodeId: null,
				checkoutStartedAt: null,
				checkoutExpiresAt: null
			});

			return hydrateBagTx(tx, updatedBag, now);
		});
	} catch (error) {
		throw mapBagPersistenceError(error);
	}
}
