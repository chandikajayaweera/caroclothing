import { and, asc, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
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
	insertInventoryMovementSchema,
	inventory,
	inventoryMovement,
	type InsertInventory,
	type InsertInventoryMovement,
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
	InventoryReleaseResult,
	InventoryReservationResult,
	InventorySummaryDTO,
	OutstandingReservationInput,
	ReleaseInventoryInput,
	RecordInventorySaleInput,
	RestockInventoryInput,
	ReserveInventoryInput,
	RestoreInventorySaleInput,
	UpdateInventorySettingsInput
} from './inventory.types';

type Db = ReturnType<typeof getDb>;
export type InventoryTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | InventoryTx;
type InventoryListRow = {
	variant: ProductVariant;
	color: ProductVariantColor;
	product: Product;
	inventory: Inventory | null;
};

const UNTRACKED_AVAILABLE_QUANTITY = 1_000_000;
const RESERVATION_LOOKUP_BATCH_SIZE = 400;

export async function getInventorySummary(ctx: ServiceContext): Promise<InventorySummaryDTO> {
	requireAdmin(ctx.actor);

	const [variantTotalRow, inventoryRows] = await Promise.all([
		getDb().select({ total: count() }).from(productVariant),
		getDb().select().from(inventory)
	]);
	const totalVariants = Number(variantTotalRow[0]?.total ?? 0);
	const inventoryRowsCount = inventoryRows.length;

	return {
		totalVariants,
		inventoryRows: inventoryRowsCount,
		missingInventoryCount: Math.max(0, totalVariants - inventoryRowsCount),
		trackedCount: inventoryRows.filter((row) => row.trackInventory).length,
		untrackedCount: inventoryRows.filter((row) => !row.trackInventory).length,
		lowStockCount: inventoryRows.filter((row) => row.trackInventory && isLowStock(row)).length,
		outOfStockCount: inventoryRows.filter(
			(row) => row.trackInventory && availableQuantity(row) <= 0
		).length,
		backorderEnabledCount: inventoryRows.filter((row) => row.allowBackorder).length,
		totalQuantity: inventoryRows.reduce((sum, row) => sum + row.quantity, 0),
		totalReservedQuantity: inventoryRows.reduce((sum, row) => sum + row.reservedQuantity, 0),
		totalAvailableQuantity: inventoryRows.reduce((sum, row) => {
			if (!row.trackInventory) return sum;
			return sum + availableQuantity(row);
		}, 0)
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
	const baseQuery = getDb()
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
	const countQuery = getDb()
		.select({ total: count() })
		.from(productVariant)
		.innerJoin(product, eq(productVariant.productId, product.id))
		.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id));
	const [rows, totalRows] = await Promise.all([
		where ? baseQuery.where(where) : baseQuery,
		where ? countQuery.where(where) : countQuery
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
	const [row] = await getDb()
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
		.limit(1);

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
	const baseQuery = getDb()
		.select()
		.from(inventoryMovement)
		.orderBy(desc(inventoryMovement.createdAt))
		.limit(limit)
		.offset(offset);
	const countQuery = getDb().select({ total: count() }).from(inventoryMovement);
	const [rows, totalRows] = await Promise.all([
		where ? baseQuery.where(where) : baseQuery,
		where ? countQuery.where(where) : countQuery
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
		return await getDb().transaction(async (tx) => {
			await assertVariantExistsTx(tx, data.variantId);
			const existing = await loadInventoryByVariantId(tx, data.variantId);

			if (existing) {
				throw new InventoryError('Inventory already exists for this variant.', ErrorCode.CONFLICT, {
					variantId: data.variantId
				});
			}

			const [created] = await tx
				.insert(inventory)
				.values({
					...data,
					updatedAt: now
				})
				.returning();

			if (!created) {
				throw new InventoryError('Inventory was not initialized.', ErrorCode.INTERNAL_ERROR);
			}

			if (created.quantity > 0) {
				await insertInventoryMovementTx(tx, {
					variantId: created.variantId,
					type: 'restock',
					quantityDelta: created.quantity,
					quantityAfter: created.quantity,
					reservedQuantityDelta: 0,
					reservedQuantityAfter: 0,
					referenceId: null,
					note: note ?? 'Initial inventory'
				});
			}

			return toInventoryDTO(created);
		});
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
		return await getDb().transaction(async (tx) => {
			const existing = await loadInventoryByVariantId(tx, variantId);
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

			const [updated] = await tx
				.update(inventory)
				.set({
					...data,
					updatedAt: now
				})
				.where(eq(inventory.id, existing.id))
				.returning();

			if (!updated) {
				throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
					variantId
				});
			}

			return toInventoryDTO(updated);
		});
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
		return await getDb().transaction(async (tx) => {
			const row = await loadInventoryByVariantId(tx, variantId);
			if (!row) {
				throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
					variantId
				});
			}

			const updated = await updateInventoryQuantitiesTx(
				tx,
				row,
				{
					quantity: row.quantity + quantity,
					reservedQuantity: row.reservedQuantity
				},
				now
			);

			await insertInventoryMovementTx(tx, {
				variantId,
				type: 'restock',
				quantityDelta: quantity,
				quantityAfter: updated.quantity,
				reservedQuantityDelta: 0,
				reservedQuantityAfter: updated.reservedQuantity,
				referenceId: null,
				note: input.note ?? null
			});

			return toInventoryDTO(updated);
		});
	} catch (error) {
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
		return await getDb().transaction(async (tx) => {
			const row = await loadInventoryByVariantId(tx, variantId);
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
					{
						variantId,
						quantityDelta,
						quantityAfter,
						reservedQuantity: row.reservedQuantity
					}
				);
			}

			const updated = await updateInventoryQuantitiesTx(
				tx,
				row,
				{
					quantity: quantityAfter,
					reservedQuantity: row.reservedQuantity
				},
				now
			);

			await insertInventoryMovementTx(tx, {
				variantId,
				type: 'adjustment',
				quantityDelta,
				quantityAfter: updated.quantity,
				reservedQuantityDelta: 0,
				reservedQuantityAfter: updated.reservedQuantity,
				referenceId: null,
				note: input.note ?? null
			});

			return toInventoryDTO(updated);
		});
	} catch (error) {
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

export async function reserveInventoryTx(
	tx: InventoryTx,
	input: ReserveInventoryInput
): Promise<InventoryReservationResult> {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const row = await loadInventoryByVariantId(tx, variantId);

	if (!row) {
		throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
			variantId
		});
	}

	const availableBefore = availableQuantity(row);

	if (!row.trackInventory) {
		return {
			variantId,
			requestedQuantity: quantity,
			reservedQuantity: 0,
			backorderedQuantity: 0,
			availableBefore,
			availableAfter: availableBefore,
			trackInventory: false,
			allowBackorder: row.allowBackorder
		};
	}

	if (availableBefore < quantity && !row.allowBackorder) {
		throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, {
			variantId,
			requestedQuantity: quantity,
			availableQuantity: availableBefore
		});
	}

	const reservedQuantity = Math.min(quantity, availableBefore);
	const backorderedQuantity = quantity - reservedQuantity;

	if (reservedQuantity === 0) {
		return {
			variantId,
			requestedQuantity: quantity,
			reservedQuantity,
			backorderedQuantity,
			availableBefore,
			availableAfter: availableBefore,
			trackInventory: true,
			allowBackorder: row.allowBackorder
		};
	}

	const reservedAfter = row.reservedQuantity + reservedQuantity;
	const updated = await updateReservedQuantityTx(tx, row, reservedAfter, now);

	await insertInventoryMovementTx(tx, {
		variantId,
		type: 'reserved',
		quantityDelta: 0,
		quantityAfter: updated.quantity,
		reservedQuantityDelta: reservedQuantity,
		reservedQuantityAfter: updated.reservedQuantity,
		referenceId,
		note: null
	});

	return {
		variantId,
		requestedQuantity: quantity,
		reservedQuantity,
		backorderedQuantity,
		availableBefore,
		availableAfter: availableQuantity(updated),
		trackInventory: true,
		allowBackorder: row.allowBackorder
	};
}

export async function releaseInventoryReservationTx(
	tx: InventoryTx,
	input: ReleaseInventoryInput
): Promise<InventoryReleaseResult> {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const outstandingReservedQuantity = await getOutstandingReservedQuantityTx(tx, {
		variantId,
		referenceId
	});
	const releasedQuantity = Math.min(quantity, outstandingReservedQuantity);

	if (releasedQuantity === 0) {
		return {
			variantId,
			requestedQuantity: quantity,
			releasedQuantity: 0,
			outstandingReservedQuantity
		};
	}

	const row = await loadInventoryByVariantId(tx, variantId);
	if (!row) {
		throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
			variantId
		});
	}

	const reservedAfter = Math.max(0, row.reservedQuantity - releasedQuantity);
	const updated = await updateReservedQuantityTx(tx, row, reservedAfter, now);

	await insertInventoryMovementTx(tx, {
		variantId,
		type: 'released',
		quantityDelta: 0,
		quantityAfter: updated.quantity,
		reservedQuantityDelta: -releasedQuantity,
		reservedQuantityAfter: updated.reservedQuantity,
		referenceId,
		note: null
	});

	return {
		variantId,
		requestedQuantity: quantity,
		releasedQuantity,
		outstandingReservedQuantity
	};
}

export async function recordInventorySaleTx(
	tx: InventoryTx,
	input: RecordInventorySaleInput
): Promise<InventoryDTO> {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const row = await loadInventoryByVariantId(tx, variantId);

	if (!row) {
		throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
			variantId
		});
	}

	if (!row.trackInventory) {
		return toInventoryDTO(row);
	}

	const outstandingReservedQuantity = await getOutstandingReservedQuantityTx(tx, {
		variantId,
		referenceId
	});
	const saleQuantity = Math.min(quantity, outstandingReservedQuantity);

	if (saleQuantity === 0) {
		if (row.allowBackorder) return toInventoryDTO(row);

		throw new InventoryError(
			'No inventory reservation found for sale.',
			ErrorCode.INSUFFICIENT_STOCK,
			{
				variantId,
				referenceId,
				requestedQuantity: quantity
			}
		);
	}

	if (saleQuantity < quantity && !row.allowBackorder) {
		throw new InventoryError(
			'Inventory reservation does not cover the sale.',
			ErrorCode.INSUFFICIENT_STOCK,
			{
				variantId,
				referenceId,
				requestedQuantity: quantity,
				reservedQuantity: outstandingReservedQuantity
			}
		);
	}

	if (row.quantity < saleQuantity) {
		throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, {
			variantId,
			requestedQuantity: saleQuantity,
			availableQuantity: row.quantity
		});
	}

	const updated = await updateInventoryQuantitiesTx(
		tx,
		row,
		{
			quantity: row.quantity - saleQuantity,
			reservedQuantity: Math.max(0, row.reservedQuantity - saleQuantity)
		},
		now
	);

	await insertInventoryMovementTx(tx, {
		variantId,
		type: 'sale',
		quantityDelta: -saleQuantity,
		quantityAfter: updated.quantity,
		reservedQuantityDelta: -saleQuantity,
		reservedQuantityAfter: updated.reservedQuantity,
		referenceId,
		note: input.note ?? null
	});

	return toInventoryDTO(updated);
}

export async function restoreInventorySaleTx(
	tx: InventoryTx,
	input: RestoreInventorySaleInput
): Promise<InventoryDTO> {
	const quantity = normalizeQuantity(input.quantity, 'quantity');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const variantId = normalizeId(input.variantId, 'variantId');
	const now = input.now ?? new Date();
	const row = await loadInventoryByVariantId(tx, variantId);

	if (!row) {
		throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
			variantId
		});
	}

	if (!row.trackInventory) {
		return toInventoryDTO(row);
	}

	const soldQuantity = await getSoldQuantityTx(tx, { variantId, referenceId });
	const restoreQuantity = Math.min(quantity, soldQuantity);

	if (restoreQuantity === 0) {
		return toInventoryDTO(row);
	}

	const updated = await updateInventoryQuantitiesTx(
		tx,
		row,
		{
			quantity: row.quantity + restoreQuantity,
			reservedQuantity: row.reservedQuantity
		},
		now
	);

	await insertInventoryMovementTx(tx, {
		variantId,
		type: input.type ?? 'cancelled',
		quantityDelta: restoreQuantity,
		quantityAfter: updated.quantity,
		reservedQuantityDelta: 0,
		reservedQuantityAfter: updated.reservedQuantity,
		referenceId,
		note: input.note ?? null
	});

	return toInventoryDTO(updated);
}

export async function getOutstandingReservedQuantityTx(
	tx: QueryExecutor,
	input: OutstandingReservationInput
): Promise<number> {
	const variantId = normalizeId(input.variantId, 'variantId');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const [row] = await tx
		.select({
			total: sql<number>`coalesce(sum(${inventoryMovement.reservedQuantityDelta}), 0)`
		})
		.from(inventoryMovement)
		.where(
			sql`${inventoryMovement.variantId} = ${variantId} and ${inventoryMovement.referenceId} = ${referenceId}`
		);

	return Math.max(0, Number(row?.total ?? 0));
}

export async function getOutstandingReservedQuantitiesByReferenceIds(
	inputs: OutstandingReservationInput[]
): Promise<Map<string, number>> {
	return loadOutstandingReservedQuantitiesByReferenceIds(getDb(), inputs);
}

export async function getOutstandingReservedQuantitiesByReferenceIdsTx(
	tx: InventoryTx,
	inputs: OutstandingReservationInput[]
): Promise<Map<string, number>> {
	return loadOutstandingReservedQuantitiesByReferenceIds(tx, inputs);
}

async function loadOutstandingReservedQuantitiesByReferenceIds(
	tx: QueryExecutor,
	inputs: OutstandingReservationInput[]
): Promise<Map<string, number>> {
	if (inputs.length === 0) return new Map();

	const normalizedInputs = inputs.map((input) => ({
		variantId: normalizeId(input.variantId, 'variantId'),
		referenceId: normalizeId(input.referenceId, 'referenceId')
	}));
	const uniqueInputs = [
		...new Map(
			normalizedInputs.map((input) => [`${input.variantId}\u0000${input.referenceId}`, input])
		).values()
	];
	const quantitiesByReferenceId = new Map<string, number>();

	for (let offset = 0; offset < uniqueInputs.length; offset += RESERVATION_LOOKUP_BATCH_SIZE) {
		const batch = uniqueInputs.slice(offset, offset + RESERVATION_LOOKUP_BATCH_SIZE);
		const variantIds = uniqueStrings(batch.map((input) => input.variantId));
		const referenceIds = uniqueStrings(batch.map((input) => input.referenceId));
		const requestedPairs = new Set(
			batch.map((input) => `${input.variantId}\u0000${input.referenceId}`)
		);
		const rows = await tx
			.select({
				variantId: inventoryMovement.variantId,
				referenceId: inventoryMovement.referenceId,
				total: sql<number>`coalesce(sum(${inventoryMovement.reservedQuantityDelta}), 0)`
			})
			.from(inventoryMovement)
			.where(
				and(
					inArray(inventoryMovement.variantId, variantIds),
					inArray(inventoryMovement.referenceId, referenceIds)
				)
			)
			.groupBy(inventoryMovement.variantId, inventoryMovement.referenceId);

		for (const row of rows) {
			if (!row.referenceId || !requestedPairs.has(`${row.variantId}\u0000${row.referenceId}`)) {
				continue;
			}

			quantitiesByReferenceId.set(
				row.referenceId,
				(quantitiesByReferenceId.get(row.referenceId) ?? 0) + Math.max(0, Number(row.total ?? 0))
			);
		}
	}

	return quantitiesByReferenceId;
}

async function getSoldQuantityTx(
	tx: QueryExecutor,
	input: OutstandingReservationInput
): Promise<number> {
	const variantId = normalizeId(input.variantId, 'variantId');
	const referenceId = normalizeId(input.referenceId, 'referenceId');
	const [row] = await tx
		.select({
			total: sql<number>`coalesce(sum(${inventoryMovement.quantityDelta}), 0)`
		})
		.from(inventoryMovement)
		.where(
			and(
				eq(inventoryMovement.variantId, variantId),
				eq(inventoryMovement.referenceId, referenceId),
				eq(inventoryMovement.type, 'sale')
			)
		);

	return Math.max(0, -Number(row?.total ?? 0));
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

async function updateReservedQuantityTx(
	tx: InventoryTx,
	row: Inventory,
	reservedQuantity: number,
	now: Date
): Promise<Inventory> {
	try {
		const [updated] = await tx
			.update(inventory)
			.set({ reservedQuantity, updatedAt: now })
			.where(eq(inventory.id, row.id))
			.returning();

		if (!updated) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId: row.variantId
			});
		}

		return updated;
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

async function updateInventoryQuantitiesTx(
	tx: InventoryTx,
	row: Inventory,
	values: { quantity: number; reservedQuantity: number },
	now: Date
): Promise<Inventory> {
	try {
		const [updated] = await tx
			.update(inventory)
			.set({
				quantity: values.quantity,
				reservedQuantity: values.reservedQuantity,
				updatedAt: now
			})
			.where(eq(inventory.id, row.id))
			.returning();

		if (!updated) {
			throw new InventoryError('Inventory not found.', ErrorCode.INVENTORY_NOT_FOUND, {
				variantId: row.variantId
			});
		}

		return updated;
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

async function insertInventoryMovementTx(
	tx: InventoryTx,
	input: InsertInventoryMovement
): Promise<InventoryMovement> {
	const data = parseInventoryMovement(input);

	try {
		const [created] = await tx.insert(inventoryMovement).values(data).returning();

		if (!created) {
			throw new InventoryError('Inventory movement was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return created;
	} catch (error) {
		throw mapInventoryPersistenceError(error);
	}
}

function parseInventoryMovement(input: InsertInventoryMovement): InsertInventoryMovement {
	const result = insertInventoryMovementSchema.safeParse(input);

	if (!result.success) {
		throw new InventoryError('Invalid inventory movement.', ErrorCode.INVALID_INVENTORY_MOVEMENT, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function availableQuantity(row: Inventory): number {
	if (!row.trackInventory) return UNTRACKED_AVAILABLE_QUANTITY;
	return Math.max(0, row.quantity - row.reservedQuantity);
}

function isLowStock(row: Inventory): boolean {
	return row.trackInventory && availableQuantity(row) <= row.lowStockThreshold;
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
	return getInventoryAvailabilityByVariantIdsTx(getDb(), input);
}
