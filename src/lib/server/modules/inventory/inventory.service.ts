import { and, asc, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import {
	guardBatchCondition,
	guardPreviousBatchChanges,
	isD1BatchGuardError
} from '$lib/server/db/batch';
import {
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation
} from '$lib/server/db/retry';
import { requireAdmin } from '$lib/server/foundation/guards';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues
} from '$lib/server/foundation/utils';
import {
	ErrorCode,
	InventoryError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import {
	product,
	productVariant,
	productVariantColor,
	type Product,
	type ProductVariant,
	type ProductVariantColor
} from '../products/products.drizzle';
import {
	insertInventorySchema,
	inventory,
	inventoryMovement,
	type InsertInventory,
	type Inventory,
	type InventoryMovement
} from './inventory.drizzle';
import type {
	AdjustInventoryInput,
	InitializeInventoryInput,
	InventoryAvailabilityDTO,
	InventoryAvailabilityLookupInput,
	InventoryDetailDTO,
	InventoryDTO,
	InventoryListItemDTO,
	InventoryListOptions,
	InventoryListResult,
	InventoryMovementDTO,
	InventoryMovementListOptions,
	InventoryMovementListResult,
	InventorySummaryDTO,
	RecordInventorySaleInput,
	RestockInventoryInput,
	RestoreInventorySaleInput,
	UpdateInventorySettingsInput
} from './inventory.types';

type Db = ReturnType<typeof getDb>;
export type InventoryTx = Db;
type QueryExecutor = Db;
export type InventoryBatchItem = Parameters<Db['batch']>[0][number];
type InventoryListRow = {
	variant: ProductVariant;
	color: ProductVariantColor;
	product: Product;
	inventory: Inventory | null;
};

const UNTRACKED_AVAILABLE_QUANTITY = 1_000_000;

/**
 * Build the stock statements used by the checkout commit batch.
 *
 * The guard is authoritative: a tracked, non-backorder variant must still have
 * enough uncommitted physical stock when D1 executes the batch. Untracked
 * variants and zero-stock backorders intentionally produce no movement row.
 */
export function prepareInventorySaleBatch(
	db: Db,
	input: RecordInventorySaleInput
): InventoryBatchItem[] {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const nowMs = now.getTime();
	const sellable = sql`EXISTS (
		SELECT 1 FROM ${inventory}
		WHERE ${inventory.variantId} = ${variantId}
			AND (
				${inventory.trackInventory} = 0
				OR ${inventory.allowBackorder} = 1
				OR (${inventory.quantity} - ${inventory.reservedQuantity}) >= ${quantity}
			)
	)`;
	const physicalSaleQuantity = sql<number>`min(${quantity}, ${inventory.quantity})`;
	const quantityAfter = sql<number>`max(0, ${inventory.quantity} - ${quantity})`;

	return [
		...guardBatchCondition(db, sellable),
		db.insert(inventoryMovement).select(
			db
				.select({
					id: sql<string>`${nanoid()}`.as('id'),
					variantId: inventory.variantId,
					type: sql<'sale'>`'sale'`.as('type'),
					quantityDelta: sql<number>`-${physicalSaleQuantity}`.as('quantity_delta'),
					quantityAfter: quantityAfter.as('quantity_after'),
					reservedQuantityDelta: sql<number>`0`.as('reserved_quantity_delta'),
					reservedQuantityAfter: inventory.reservedQuantity,
					referenceId: sql<string>`${referenceId}`.as('reference_id'),
					note: sql<string | null>`${input.note ?? null}`.as('note'),
					createdAt: sql<Date>`${nowMs}`.as('created_at')
				})
				.from(inventory)
				.where(
					and(
						eq(inventory.variantId, variantId),
						eq(inventory.trackInventory, true),
						sql`${inventory.quantity} > 0`
					)
				)
		),
		db
			.update(inventory)
			.set({ quantity: quantityAfter, updatedAt: now })
			.where(
				and(
					eq(inventory.variantId, variantId),
					eq(inventory.trackInventory, true),
					sql`${inventory.quantity} > 0`
				)
			)
	] as InventoryBatchItem[];
}

/** Build idempotent physical-stock restoration statements for a status batch. */
export function prepareInventorySaleRestoreBatch(
	db: Db,
	input: RestoreInventorySaleInput
): InventoryBatchItem[] {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const nowMs = now.getTime();
	const outstandingSold = sql<number>`max(0, -coalesce((
		SELECT sum(${inventoryMovement.quantityDelta})
		FROM ${inventoryMovement}
		WHERE ${inventoryMovement.variantId} = ${variantId}
			AND ${inventoryMovement.referenceId} = ${referenceId}
	), 0))`;
	const restoreQuantity = sql<number>`min(${quantity}, ${outstandingSold})`;

	return [
		db
			.update(inventory)
			.set({ quantity: sql`${inventory.quantity} + ${restoreQuantity}`, updatedAt: now })
			.where(
				and(
					eq(inventory.variantId, variantId),
					eq(inventory.trackInventory, true),
					sql`${outstandingSold} > 0`
				)
			),
		db.insert(inventoryMovement).select(
			db
				.select({
					id: sql<string>`${nanoid()}`.as('id'),
					variantId: inventory.variantId,
					type: sql<'return' | 'cancelled'>`${input.type ?? 'cancelled'}`.as('type'),
					quantityDelta: restoreQuantity.as('quantity_delta'),
					quantityAfter: inventory.quantity,
					reservedQuantityDelta: sql<number>`0`.as('reserved_quantity_delta'),
					reservedQuantityAfter: inventory.reservedQuantity,
					referenceId: sql<string>`${referenceId}`.as('reference_id'),
					note: sql<string | null>`${input.note ?? null}`.as('note'),
					createdAt: sql<Date>`${nowMs}`.as('created_at')
				})
				.from(inventory)
				.where(
					and(
						eq(inventory.variantId, variantId),
						eq(inventory.trackInventory, true),
						sql`${restoreQuantity} > 0`
					)
				)
		)
	] as InventoryBatchItem[];
}

export async function getInventorySummary(ctx: ServiceContext): Promise<InventorySummaryDTO> {
	requireAdmin(ctx.actor);

	const db = getDb();
	const [summary] = await withTransientD1ReadRetry(() =>
		db
			.select({
				totalVariants: sql<number>`(select count(*) from ${productVariant})`,
				inventoryRows: count(),
				trackedCount: sql<number>`coalesce(sum(case when ${inventory.trackInventory} = 1 then 1 else 0 end), 0)`,
				untrackedCount: sql<number>`coalesce(sum(case when ${inventory.trackInventory} = 0 then 1 else 0 end), 0)`,
				lowStockCount: sql<number>`coalesce(sum(case when ${inventory.trackInventory} = 1 and max(0, ${inventory.quantity} - ${inventory.reservedQuantity}) <= ${inventory.lowStockThreshold} then 1 else 0 end), 0)`,
				outOfStockCount: sql<number>`coalesce(sum(case when ${inventory.trackInventory} = 1 and ${inventory.quantity} - ${inventory.reservedQuantity} <= 0 then 1 else 0 end), 0)`,
				backorderEnabledCount: sql<number>`coalesce(sum(case when ${inventory.allowBackorder} = 1 then 1 else 0 end), 0)`,
				totalQuantity: sql<number>`coalesce(sum(${inventory.quantity}), 0)`,
				totalReservedQuantity: sql<number>`coalesce(sum(${inventory.reservedQuantity}), 0)`,
				totalAvailableQuantity: sql<number>`coalesce(sum(case when ${inventory.trackInventory} = 1 then max(0, ${inventory.quantity} - ${inventory.reservedQuantity}) else 0 end), 0)`
			})
			.from(inventory)
	);
	const totalVariants = Number(summary?.totalVariants ?? 0);
	const inventoryRowsCount = Number(summary?.inventoryRows ?? 0);

	return {
		totalVariants,
		inventoryRows: inventoryRowsCount,
		missingInventoryCount: Math.max(0, totalVariants - inventoryRowsCount),
		trackedCount: Number(summary?.trackedCount ?? 0),
		untrackedCount: Number(summary?.untrackedCount ?? 0),
		lowStockCount: Number(summary?.lowStockCount ?? 0),
		outOfStockCount: Number(summary?.outOfStockCount ?? 0),
		backorderEnabledCount: Number(summary?.backorderEnabledCount ?? 0),
		totalQuantity: Number(summary?.totalQuantity ?? 0),
		totalReservedQuantity: Number(summary?.totalReservedQuantity ?? 0),
		totalAvailableQuantity: Number(summary?.totalAvailableQuantity ?? 0)
	};
}

export async function listInventory(
	ctx: ServiceContext,
	options: InventoryListOptions = {}
): Promise<InventoryListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, 50, 100);
	const offset = normalizeOffset(options.offset);
	const where = buildInventoryListWhere(options);
	const db = getDb();
	const baseQuery = db
		.select({
			variant: productVariant,
			color: productVariantColor,
			product,
			inventory
		})
		.from(productVariant)
		.innerJoin(product, eq(productVariant.productId, product.id))
		.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
		.orderBy(asc(product.name), asc(productVariant.sortOrder), asc(productVariant.size))
		.limit(limit)
		.offset(offset);
	const countQuery = db
		.select({ total: count() })
		.from(productVariant)
		.innerJoin(product, eq(productVariant.productId, product.id))
		.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id));
	const [rows, totalRows] = await Promise.all([
		withTransientD1ReadRetry(() => (where ? baseQuery.where(where) : baseQuery)),
		withTransientD1ReadRetry(() => (where ? countQuery.where(where) : countQuery))
	]);

	return {
		items: rows.map(toInventoryListItemDTO),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function getInventory(
	ctx: ServiceContext,
	input: { variantId: string }
): Promise<InventoryDetailDTO> {
	requireAdmin(ctx.actor);

	const variantId = normalizeId(input.variantId, 'variantId');
	const [row] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({
				variant: productVariant,
				color: productVariantColor,
				product,
				inventory
			})
			.from(productVariant)
			.innerJoin(product, eq(productVariant.productId, product.id))
			.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
			.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
			.where(eq(productVariant.id, variantId))
			.limit(1)
	);

	if (!row) {
		throw new InventoryError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			variantId
		});
	}

	const movements = await listInventoryMovements(ctx, { variantId, limit: 25 });
	return {
		...toInventoryListItemDTO(row),
		movements: movements.items
	};
}

export async function listInventoryMovements(
	ctx: ServiceContext,
	options: InventoryMovementListOptions = {}
): Promise<InventoryMovementListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, 50, 100);
	const offset = normalizeOffset(options.offset);
	const where = buildInventoryMovementWhere(options);
	const db = getDb();
	const baseQuery = db
		.select()
		.from(inventoryMovement)
		.orderBy(desc(inventoryMovement.createdAt))
		.limit(limit)
		.offset(offset);
	const countQuery = db.select({ total: count() }).from(inventoryMovement);
	const [rows, totalRows] = await Promise.all([
		withTransientD1ReadRetry(() => (where ? baseQuery.where(where) : baseQuery)),
		withTransientD1ReadRetry(() => (where ? countQuery.where(where) : countQuery))
	]);

	return {
		items: rows.map(toInventoryMovementDTO),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function initializeInventory(
	ctx: ServiceContext,
	input: InitializeInventoryInput
): Promise<InventoryDTO> {
	requireAdmin(ctx.actor);

	const { note, ...rawData } = input;
	const data = parseInsertInventory({
		...rawData,
		reservedQuantity: 0
	});
	const now = ctx.now ?? new Date();

	try {
		const db = getDb();
		await assertVariantExistsTx(db, data.variantId);
		const existing = await loadInventoryByVariantId(db, data.variantId);
		if (existing) {
			throw new InventoryError('Inventory already exists for this variant.', ErrorCode.CONFLICT, {
				variantId: data.variantId
			});
		}
		const inventoryId = nanoid();
		const movementId = data.quantity > 0 ? nanoid() : null;
		const insertInventory = db
			.insert(inventory)
			.values({ id: inventoryId, ...data, updatedAt: now })
			.returning();
		const movementInsert = movementId
			? db.insert(inventoryMovement).values({
					id: movementId,
					variantId: data.variantId,
					type: 'restock',
					quantityDelta: data.quantity,
					quantityAfter: data.quantity,
					reservedQuantityDelta: 0,
					reservedQuantityAfter: 0,
					referenceId: null,
					note: note ?? 'Initial inventory',
					createdAt: now
				})
			: null;
		const created = await withTransientD1WriteReconciliation<Inventory>(
			async () => {
				const createdRows = movementInsert
					? (await db.batch([insertInventory, movementInsert]))[0]
					: await insertInventory;
				const [row] = createdRows;
				if (!row) {
					throw new InventoryError('Inventory was not initialized.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const row = await loadInventoryByVariantId(db, data.variantId);
				if (!row || row.id !== inventoryId) return { committed: false };
				if (movementId) {
					const [movement] = await db
						.select({ id: inventoryMovement.id })
						.from(inventoryMovement)
						.where(eq(inventoryMovement.id, movementId))
						.limit(1);
					if (!movement) return { committed: false };
				}
				return { committed: true, value: row };
			}
		);
		return toInventoryDTO(created);
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

export async function updateInventorySettings(
	ctx: ServiceContext,
	input: UpdateInventorySettingsInput
): Promise<InventoryDTO> {
	requireAdmin(ctx.actor);

	const variantId = normalizeId(input.variantId, 'variantId');
	const data = removeUndefinedValues({
		lowStockThreshold: input.lowStockThreshold,
		trackInventory: input.trackInventory,
		allowBackorder: input.allowBackorder
	});
	const now = ctx.now ?? new Date();

	if (Object.keys(data).length === 0) {
		const existing = await loadInventoryByVariantId(getDb(), variantId);
		if (!existing) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId
			});
		}
		return toInventoryDTO(existing);
	}

	try {
		const db = getDb();
		const existing = await loadInventoryByVariantId(db, variantId);
		if (!existing) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId
			});
		}
		if (data.trackInventory === false && existing.reservedQuantity > 0) {
			throw new InventoryError(
				'Release reserved stock before disabling inventory tracking.',
				ErrorCode.INVENTORY_TRACKING_DISABLED,
				{ variantId, reservedQuantity: existing.reservedQuantity }
			);
		}
		const conditions = [eq(inventory.id, existing.id)];
		conditions.push(eq(inventory.updatedAt, existing.updatedAt));
		if (data.trackInventory === false) conditions.push(eq(inventory.reservedQuantity, 0));
		const updateValues = { ...data, updatedAt: now };
		const updated = await withTransientD1WriteReconciliation<Inventory>(
			async () => {
				const [row] = await db
					.update(inventory)
					.set(updateValues)
					.where(and(...conditions))
					.returning();
				if (!row) {
					throw new InventoryError(
						'Inventory changed while settings were being saved.',
						ErrorCode.CONFLICT,
						{ variantId }
					);
				}
				return row;
			},
			async () => {
				const row = await loadInventoryByVariantId(db, variantId);
				return row?.updatedAt.getTime() === now.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);
		return toInventoryDTO(updated);
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

export async function restockInventory(
	ctx: ServiceContext,
	input: RestockInventoryInput
): Promise<InventoryDTO> {
	requireAdmin(ctx.actor);

	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? ctx.now ?? new Date();

	try {
		const db = getDb();
		const movementId = nanoid();
		const updateQuery = db
			.update(inventory)
			.set({ quantity: sql`${inventory.quantity} + ${quantity}`, updatedAt: now })
			.where(eq(inventory.variantId, variantId))
			.returning();
		const statements: [InventoryBatchItem, ...InventoryBatchItem[]] = [
			updateQuery,
			...guardPreviousBatchChanges(db),
			db.insert(inventoryMovement).values({
				id: movementId,
				variantId,
				type: 'restock',
				quantityDelta: quantity,
				quantityAfter: sql`(SELECT ${inventory.quantity} FROM ${inventory} WHERE ${inventory.variantId} = ${variantId})`,
				reservedQuantityDelta: 0,
				reservedQuantityAfter: sql`(SELECT ${inventory.reservedQuantity} FROM ${inventory} WHERE ${inventory.variantId} = ${variantId})`,
				referenceId: null,
				note: input.note ?? null,
				createdAt: now
			})
		];
		const updated = await withTransientD1WriteReconciliation<Inventory>(
			async () => {
				const [updatedRows] = await db.batch(statements);
				const [row] = updatedRows;
				if (!row) {
					throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
						variantId
					});
				}
				return row;
			},
			async () => reconcileInventoryMovementCommit(db, variantId, movementId)
		);
		return toInventoryDTO(updated);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId
			});
		}
		throw mapInventoryPersistenceError(error);
	}
}

export async function adjustInventory(
	ctx: ServiceContext,
	input: AdjustInventoryInput
): Promise<InventoryDTO> {
	requireAdmin(ctx.actor);

	const quantityDelta = normalizeQuantityDelta(input.quantityDelta, 'quantityDelta');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? ctx.now ?? new Date();

	try {
		const db = getDb();
		const movementId = nanoid();
		const row = await loadInventoryByVariantId(db, variantId);
		if (!row) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId
			});
		}
		const quantityAfter = row.quantity + quantityDelta;
		if (quantityAfter < 0) {
			throw new InventoryError(
				'Inventory quantity cannot be negative.',
				ErrorCode.VALIDATION_ERROR,
				{
					variantId,
					quantityDelta,
					quantityAfter
				}
			);
		}
		if (quantityAfter < row.reservedQuantity) {
			throw new InventoryError(
				'Inventory quantity cannot be lower than reserved stock.',
				ErrorCode.INVALID_INVENTORY_MOVEMENT,
				{ variantId, quantityDelta, quantityAfter, reservedQuantity: row.reservedQuantity }
			);
		}
		const updateQuery = db
			.update(inventory)
			.set({ quantity: sql`${inventory.quantity} + ${quantityDelta}`, updatedAt: now })
			.where(
				and(
					eq(inventory.variantId, variantId),
					sql`${inventory.quantity} + ${quantityDelta} >= ${inventory.reservedQuantity}`,
					sql`${inventory.quantity} + ${quantityDelta} >= 0`
				)
			)
			.returning();
		const statements: [InventoryBatchItem, ...InventoryBatchItem[]] = [
			updateQuery,
			...guardPreviousBatchChanges(db),
			db.insert(inventoryMovement).values({
				id: movementId,
				variantId,
				type: 'adjustment',
				quantityDelta,
				quantityAfter: sql`(SELECT ${inventory.quantity} FROM ${inventory} WHERE ${inventory.variantId} = ${variantId})`,
				reservedQuantityDelta: 0,
				reservedQuantityAfter: sql`(SELECT ${inventory.reservedQuantity} FROM ${inventory} WHERE ${inventory.variantId} = ${variantId})`,
				referenceId: null,
				note: input.note ?? null,
				createdAt: now
			})
		];
		const updated = await withTransientD1WriteReconciliation<Inventory>(
			async () => {
				const [updatedRows] = await db.batch(statements);
				const [row] = updatedRows;
				if (!row) throw new InventoryError('Inventory update failed.', ErrorCode.CONFLICT);
				return row;
			},
			async () => reconcileInventoryMovementCommit(db, variantId, movementId)
		);
		return toInventoryDTO(updated);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new InventoryError(
				'Inventory changed while it was being adjusted. Refresh and try again.',
				ErrorCode.CONFLICT,
				{ variantId }
			);
		}
		throw mapInventoryPersistenceError(error);
	}
}

export async function getInventoryAvailabilityByVariantIdsTx(
	tx: QueryExecutor,
	input: InventoryAvailabilityLookupInput
): Promise<InventoryAvailabilityDTO[]> {
	const variantIds = uniqueStrings(input.variantIds);
	if (variantIds.length === 0) return [];

	const rows = await tx.select().from(inventory).where(inArray(inventory.variantId, variantIds));
	return rows.map(toInventoryAvailabilityDTO);
}

export async function hasInventoryHistoryForVariantIdsTx(
	tx: QueryExecutor,
	variantIds: string[]
): Promise<boolean> {
	const ids = uniqueStrings(variantIds.map((id) => normalizeId(id, 'variantId')));
	if (ids.length === 0) return false;

	const [row] = await tx
		.select({ id: inventoryMovement.id })
		.from(inventoryMovement)
		.where(inArray(inventoryMovement.variantId, ids))
		.limit(1);

	return Boolean(row);
}

function buildInventoryListWhere(options: InventoryListOptions): SQL | undefined {
	const conditions: SQL[] = [];
	const query = options.query?.trim();

	if (query) {
		const pattern = `%${query}%`;
		conditions.push(
			or(
				like(product.name, pattern),
				like(product.slug, pattern),
				like(productVariant.size, pattern),
				like(productVariantColor.color, pattern)
			) as SQL
		);
	}

	if (options.productId) {
		conditions.push(eq(productVariant.productId, normalizeId(options.productId, 'productId')));
	}

	if (options.variantId) {
		conditions.push(eq(productVariant.id, normalizeId(options.variantId, 'variantId')));
	}

	if (options.trackInventory !== undefined) {
		conditions.push(eq(inventory.trackInventory, options.trackInventory));
	}

	if (options.allowBackorder !== undefined) {
		conditions.push(eq(inventory.allowBackorder, options.allowBackorder));
	}

	if (options.stockStatus === 'missing') {
		conditions.push(isNull(inventory.id));
	}

	if (options.stockStatus === 'low') {
		conditions.push(
			and(
				eq(inventory.trackInventory, true),
				sql`${inventory.quantity} - ${inventory.reservedQuantity} <= ${inventory.lowStockThreshold}`
			) as SQL
		);
	}

	if (options.stockStatus === 'out') {
		conditions.push(
			and(
				eq(inventory.trackInventory, true),
				sql`${inventory.quantity} - ${inventory.reservedQuantity} <= 0`
			) as SQL
		);
	}

	if (options.stockStatus === 'available') {
		conditions.push(
			or(
				eq(inventory.trackInventory, false),
				sql`${inventory.quantity} - ${inventory.reservedQuantity} > 0`
			) as SQL
		);
	}

	if (options.stockStatus === 'untracked') {
		conditions.push(eq(inventory.trackInventory, false));
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildInventoryMovementWhere(options: InventoryMovementListOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.variantId) {
		conditions.push(eq(inventoryMovement.variantId, normalizeId(options.variantId, 'variantId')));
	}

	if (options.type) {
		conditions.push(eq(inventoryMovement.type, options.type));
	}

	if (options.referenceId !== undefined) {
		if (options.referenceId === null) {
			conditions.push(isNull(inventoryMovement.referenceId));
		} else {
			conditions.push(
				eq(inventoryMovement.referenceId, normalizeId(options.referenceId, 'referenceId'))
			);
		}
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}

async function assertVariantExistsTx(tx: QueryExecutor, variantId: string): Promise<void> {
	const [row] = await tx
		.select({ id: productVariant.id })
		.from(productVariant)
		.where(eq(productVariant.id, variantId))
		.limit(1);

	if (!row) {
		throw new InventoryError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			variantId
		});
	}
}

function toInventoryListItemDTO(row: InventoryListRow): InventoryListItemDTO {
	return {
		variantId: row.variant.id,
		product: {
			id: row.product.id,
			name: row.product.name,
			slug: row.product.slug,
			isActive: row.product.isActive
		},
		variant: {
			id: row.variant.id,
			productId: row.variant.productId,
			size: row.variant.size,
			color: row.color.color,
			colorHex: row.color.colorHex,
			isActive: row.variant.isActive
		},
		inventory: row.inventory ? toInventoryDTO(row.inventory) : null,
		hasInventory: Boolean(row.inventory)
	};
}

function toInventoryDTO(row: Inventory): InventoryDTO {
	const available = availableQuantity(row);

	return {
		id: row.id,
		variantId: row.variantId,
		quantity: row.quantity,
		reservedQuantity: row.reservedQuantity,
		availableQuantity: available,
		lowStockThreshold: row.lowStockThreshold,
		trackInventory: row.trackInventory,
		allowBackorder: row.allowBackorder,
		isLowStock: row.trackInventory && available <= row.lowStockThreshold,
		updatedAt: row.updatedAt
	};
}

function toInventoryMovementDTO(row: InventoryMovement): InventoryMovementDTO {
	return {
		id: row.id,
		variantId: row.variantId,
		type: row.type,
		quantityDelta: row.quantityDelta,
		quantityAfter: row.quantityAfter,
		reservedQuantityDelta: row.reservedQuantityDelta,
		reservedQuantityAfter: row.reservedQuantityAfter,
		referenceId: row.referenceId,
		note: row.note,
		createdAt: row.createdAt
	};
}

function toInventoryAvailabilityDTO(row: Inventory): InventoryAvailabilityDTO {
	const dto = toInventoryDTO(row);
	return {
		variantId: dto.variantId,
		quantity: dto.quantity,
		reservedQuantity: dto.reservedQuantity,
		availableQuantity: dto.availableQuantity,
		lowStockThreshold: dto.lowStockThreshold,
		trackInventory: dto.trackInventory,
		allowBackorder: dto.allowBackorder,
		isLowStock: dto.isLowStock
	};
}

async function loadInventoryByVariantId(
	tx: QueryExecutor,
	variantId: string
): Promise<Inventory | null> {
	const [row] = await tx
		.select()
		.from(inventory)
		.where(eq(inventory.variantId, variantId))
		.limit(1);
	return row ?? null;
}

async function reconcileInventoryMovementCommit(
	db: QueryExecutor,
	variantId: string,
	movementId: string
) {
	const [movement] = await db
		.select({ id: inventoryMovement.id })
		.from(inventoryMovement)
		.where(eq(inventoryMovement.id, movementId))
		.limit(1);
	if (!movement) return { committed: false } as const;
	const row = await loadInventoryByVariantId(db, variantId);
	return row ? ({ committed: true, value: row } as const) : ({ committed: false } as const);
}

function availableQuantity(row: Inventory): number {
	if (!row.trackInventory) return UNTRACKED_AVAILABLE_QUANTITY;
	return Math.max(0, row.quantity - row.reservedQuantity);
}

function parseInsertInventory(input: InsertInventory): InsertInventory {
	const result = insertInventorySchema.safeParse(input);

	if (!result.success) {
		throw new InventoryError('Invalid inventory data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function normalizeQuantity(value: number, field: string): number {
	if (!Number.isInteger(value) || value <= 0) {
		throw new InventoryError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return value;
}

function normalizeQuantityDelta(value: number, field: string): number {
	if (!Number.isInteger(value) || value === 0) {
		throw new InventoryError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return value;
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new InventoryError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mapInventoryPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	rethrowTransientD1Error(error);

	const message = getErrorMessage(error);

	if (isForeignKeyConstraintError(message)) {
		throw new InventoryError('Related inventory record not found.', ErrorCode.NOT_FOUND);
	}

	if (isUniqueConstraintError(message)) {
		throw new InventoryError('Inventory already exists for this variant.', ErrorCode.CONFLICT);
	}

	if (isCheckConstraintError(message)) {
		throw new InventoryError('Invalid inventory data.', ErrorCode.INVALID_INVENTORY_MOVEMENT);
	}

	throw error;
}

export async function getInventoryAvailabilityByVariantIds(
	ctx: ServiceContext,
	input: { variantIds: string[] }
): Promise<InventoryAvailabilityDTO[]> {
	return withTransientD1ReadRetry(() => getInventoryAvailabilityByVariantIdsTx(getDb(), input));
}
