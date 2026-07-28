import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	max,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import {
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation,
	withTransientD1WriteRetry
} from '$lib/server/db/retry';
import { requireActor, requireAdmin } from '$lib/server/foundation/guards';
import {
	ErrorCode,
	getErrorMessage,
	isAppError,
	ProductError,
	WishlistError
} from '$lib/server/infrastructure/errors';
import { mediaPresetUrl } from '$lib/server/infrastructure/media';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isForeignKeyConstraintError,
	isString,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	uniqueStrings
} from '$lib/server/foundation/utils';
import {
	product,
	productImage,
	productVariant,
	productVariantColor,
	type Product,
	type ProductImage,
	type ProductVariant,
	type ProductVariantColor
} from '../products/products.drizzle';
import {
	insertWishlistItemSchema,
	wishlistItem,
	type InsertWishlistItem,
	type NewWishlistItem,
	type WishlistItem
} from './wishlist.drizzle';
import { inventory, type Inventory } from '../inventory/inventory.drizzle';
import type {
	ListWishlistOptions,
	ListWishlistProductIdsOptions,
	ListWishlistSignalsOptions,
	WishlistItemDTO,
	WishlistListResult,
	WishlistProductSummaryDTO,
	WishlistSignalDTO,
	WishlistSignalAlertStatus,
	WishlistSignalListResult,
	WishlistStatusDTO,
	WishlistTargetInput,
	WishlistVariantSummaryDTO
} from './wishlist.types';

type Db = ReturnType<typeof getDb>;
type QueryExecutor = Db;

type NormalizedWishlistTarget = {
	productId: string;
	variantId: string | null;
};

type WishlistJoinedRow = {
	item: WishlistItem;
	product: Product;
	variant: ProductVariant | null;
	color: ProductVariantColor | null;
	inventory: Inventory | null;
};

type WishlistSignalAggregateRow = {
	productId: string;
	variantId: string | null;
	saveCount: number;
	lastSavedAtMs: number;
	alertStatus: WishlistSignalAlertStatus;
};

export async function addToWishlist(
	ctx: ServiceContext,
	input: WishlistTargetInput
): Promise<WishlistItemDTO> {
	const actor = requireActor(ctx.actor);
	const data = parseInsertWishlistItem(actor.id, input);
	const target = { productId: data.productId, variantId: data.variantId ?? null };

	await assertWishlistTargetsAvailableForCustomer([target]);

	const existing = await findWishlistItemByTarget(getDb(), actor.id, target);
	if (existing) return getWishlistItemDTOById(existing.id);

	const values: NewWishlistItem = {
		id: nanoid(),
		userId: actor.id,
		productId: target.productId,
		variantId: target.variantId
	};

	try {
		const db = getDb();
		const created = await withTransientD1WriteReconciliation<WishlistItem>(
			async () => {
				const [row] = await db.insert(wishlistItem).values(values).returning();
				if (!row) {
					throw new WishlistError('Wishlist item was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const row = await findWishlistItemByTarget(db, actor.id, target);
				return row ? { committed: true, value: row } : { committed: false };
			}
		);
		return getWishlistItemDTOById(created.id);
	} catch (error) {
		throw mapWishlistPersistenceError(error);
	}
}

export async function removeFromWishlist(
	ctx: ServiceContext,
	input: WishlistTargetInput
): Promise<void> {
	const actor = requireActor(ctx.actor);
	const target = normalizeWishlistTarget(input);

	try {
		await withTransientD1WriteRetry(() =>
			getDb()
				.delete(wishlistItem)
				.where(wishlistTargetPredicate(actor.id, target.productId, target.variantId))
				.then(() => undefined)
		);
	} catch (error) {
		throw mapWishlistPersistenceError(error);
	}
}

export async function listWishlist(
	ctx: ServiceContext,
	options: ListWishlistOptions = {}
): Promise<WishlistListResult> {
	const actor = requireActor(ctx.actor);
	return listWishlistForUser(actor.id, options);
}

export async function listWishlistProductIds(
	ctx: ServiceContext,
	options: ListWishlistProductIdsOptions = {}
): Promise<string[]> {
	const actor = requireActor(ctx.actor);
	const limit = normalizeLimit(options.limit);
	const rows = await withTransientD1ReadRetry(() =>
		getDb()
			.select({
				productId: wishlistItem.productId,
				lastAddedAt: max(wishlistItem.addedAt)
			})
			.from(wishlistItem)
			.where(eq(wishlistItem.userId, actor.id))
			.groupBy(wishlistItem.productId)
			.orderBy(desc(max(wishlistItem.addedAt)))
			.limit(limit)
	);

	return rows.map((row) => row.productId);
}

export async function listUserWishlist(
	ctx: ServiceContext,
	input: { userId: string } & ListWishlistOptions
): Promise<WishlistListResult> {
	requireAdmin(ctx.actor);

	const { userId, ...options } = input;
	return listWishlistForUser(normalizeId(userId, 'userId'), options);
}

export async function clearWishlist(ctx: ServiceContext): Promise<void> {
	const actor = requireActor(ctx.actor);

	try {
		await withTransientD1WriteRetry(() =>
			getDb()
				.delete(wishlistItem)
				.where(eq(wishlistItem.userId, actor.id))
				.then(() => undefined)
		);
	} catch (error) {
		throw mapWishlistPersistenceError(error);
	}
}

export function prepareAnonymousWishlistMergeStatements(
	d1: D1Database,
	input: { sourceUserId: string; targetUserId: string }
): D1PreparedStatement[] {
	const sourceUserId = normalizeId(input.sourceUserId, 'sourceUserId');
	const targetUserId = normalizeId(input.targetUserId, 'targetUserId');
	return [
		d1
			.prepare(
				`INSERT OR IGNORE INTO wishlist_item (id, user_id, product_id, variant_id, added_at)
				 SELECT lower(hex(randomblob(16))), ?, product_id, variant_id, added_at
				 FROM wishlist_item WHERE user_id = ?`
			)
			.bind(targetUserId, sourceUserId),
		d1.prepare('DELETE FROM wishlist_item WHERE user_id = ?').bind(sourceUserId)
	];
}

export async function hasUserWishlistDataForMigrationTx(db: Db, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: wishlistItem.id })
		.from(wishlistItem)
		.where(eq(wishlistItem.userId, normalizeId(userId, 'userId')))
		.limit(1);
	return Boolean(row);
}

export async function isWishlisted(
	ctx: ServiceContext,
	input: WishlistTargetInput
): Promise<boolean> {
	const actor = requireActor(ctx.actor);
	const target = normalizeWishlistTarget(input);

	await assertWishlistTargetsAvailableForCustomer([target]);

	const existing = await findWishlistItemByTarget(getDb(), actor.id, target);
	return existing !== null;
}

export async function getWishlistStatuses(
	ctx: ServiceContext,
	input: { targets: WishlistTargetInput[] }
): Promise<WishlistStatusDTO[]> {
	const actor = requireActor(ctx.actor);
	const targets = input.targets.map(normalizeWishlistTarget);

	if (targets.length === 0) return [];

	await assertWishlistTargetsAvailableForCustomer(targets);

	const productIds = uniqueStrings(targets.map((target) => target.productId));
	const rows = await getDb()
		.select()
		.from(wishlistItem)
		.where(and(eq(wishlistItem.userId, actor.id), inArray(wishlistItem.productId, productIds)));
	const savedKeys = new Set(
		rows.map((row) => wishlistTargetKey(row.productId, row.variantId ?? null))
	);

	return targets.map((target) => ({
		productId: target.productId,
		variantId: target.variantId,
		isWishlisted: savedKeys.has(wishlistTargetKey(target.productId, target.variantId))
	}));
}

export async function listWishlistSignals(
	ctx: ServiceContext,
	options: ListWishlistSignalsOptions = {}
): Promise<WishlistSignalListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const includeUnavailable = options.includeUnavailable ?? false;
	const conditions: SQL[] = [];

	if (options.productId) {
		conditions.push(eq(wishlistItem.productId, normalizeId(options.productId, 'productId')));
	}

	if (!includeUnavailable) {
		conditions.push(wishlistAvailabilityCondition());
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const db = getDb();
	const saveCount = count();
	const alertStatus = sql<WishlistSignalAlertStatus>`CASE
		WHEN ${inventory.trackInventory} = 1
			AND ${inventory.quantity} <= 5
			AND ${saveCount} > ${inventory.quantity}
			THEN 'high'
		WHEN ${inventory.trackInventory} = 1
			AND ${inventory.quantity} <= 15
			AND ${saveCount} > (${inventory.quantity} * 0.5)
			THEN 'watch'
		ELSE 'normal'
	END`;
	const signals = db
		.select({
			productId: wishlistItem.productId,
			variantId: wishlistItem.variantId,
			saveCount: saveCount.as('save_count'),
			lastSavedAtMs: sql<number>`max(${wishlistItem.addedAt})`
				.mapWith(Number)
				.as('last_saved_at_ms'),
			alertStatus: alertStatus.as('alert_status')
		})
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
		.where(where)
		.groupBy(
			wishlistItem.productId,
			wishlistItem.variantId,
			inventory.trackInventory,
			inventory.quantity
		)
		.as('wishlist_signals');
	const alertFilter = options.alertLevel ? eq(signals.alertStatus, options.alertLevel) : undefined;
	const filteredTotal = options.alertLevel
		? sql<number>`coalesce(sum(CASE WHEN ${signals.alertStatus} = ${options.alertLevel} THEN 1 ELSE 0 END), 0)`.mapWith(
				Number
			)
		: count();

	const [summaryRows, pageRows] = await Promise.all([
		withTransientD1ReadRetry(() =>
			db
				.select({
					total: filteredTotal,
					totalSignals: count(),
					totalSaves: sql<number>`coalesce(sum(${signals.saveCount}), 0)`.mapWith(Number),
					highRiskVariants:
						sql<number>`coalesce(sum(CASE WHEN ${signals.alertStatus} = 'high' THEN 1 ELSE 0 END), 0)`.mapWith(
							Number
						)
				})
				.from(signals)
		),
		withTransientD1ReadRetry(() =>
			db
				.select()
				.from(signals)
				.where(alertFilter)
				.orderBy(desc(signals.saveCount), desc(signals.lastSavedAtMs))
				.limit(limit)
				.offset(offset)
		)
	]);
	const [summary] = summaryRows;

	const items = await hydrateWishlistSignals(pageRows);

	return {
		items,
		total: Number(summary?.total ?? 0),
		limit,
		offset,
		stats: {
			totalSaves: Number(summary?.totalSaves ?? 0),
			totalSignals: Number(summary?.totalSignals ?? 0),
			highRiskVariants: Number(summary?.highRiskVariants ?? 0)
		}
	};
}

async function listWishlistForUser(
	userId: string,
	options: ListWishlistOptions
): Promise<WishlistListResult> {
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const includeUnavailable = options.includeUnavailable ?? true;
	const conditions = wishlistListConditions(userId, includeUnavailable);
	const where = and(...conditions);
	const db = getDb();

	const countQuery = db
		.select({ total: count() })
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
		.where(where);
	const listQuery = db
		.select({
			item: wishlistItem,
			product,
			variant: productVariant,
			color: productVariantColor,
			inventory
		})
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.leftJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
		.where(where)
		.orderBy(desc(wishlistItem.addedAt))
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		withTransientD1ReadRetry(() => countQuery),
		withTransientD1ReadRetry(() => listQuery)
	]);
	const items = await hydrateWishlistJoinedRows(rows);

	return {
		items,
		total: totalRows[0]?.total ?? 0,
		limit,
		offset
	};
}

function wishlistListConditions(userId: string, includeUnavailable: boolean): SQL[] {
	const conditions: SQL[] = [eq(wishlistItem.userId, userId)];

	if (!includeUnavailable) {
		conditions.push(wishlistAvailabilityCondition());
	}

	return conditions;
}

async function getWishlistItemDTOById(id: string): Promise<WishlistItemDTO> {
	const [row] = await getDb()
		.select({
			item: wishlistItem,
			product: product,
			variant: productVariant,
			color: productVariantColor,
			inventory
		})
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.leftJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
		.where(eq(wishlistItem.id, id))
		.limit(1);

	if (!row) {
		throw new WishlistError('Wishlist item not found.', ErrorCode.WISHLIST_ITEM_NOT_FOUND, { id });
	}

	const [dto] = await hydrateWishlistJoinedRows([row]);

	if (!dto) {
		throw new WishlistError('Wishlist item not found.', ErrorCode.WISHLIST_ITEM_NOT_FOUND, { id });
	}

	return dto;
}

async function hydrateWishlistJoinedRows(rows: WishlistJoinedRow[]): Promise<WishlistItemDTO[]> {
	if (rows.length === 0) return [];

	const productIds = uniqueStrings(rows.map((row) => row.product.id));
	const { imagesByProductId, primaryPricesByProductId } =
		await loadWishlistHydrationMaps(productIds);

	return rows.map((row) => toWishlistItemDTO(row, imagesByProductId, primaryPricesByProductId));
}

async function hydrateWishlistSignals(
	rows: WishlistSignalAggregateRow[]
): Promise<WishlistSignalDTO[]> {
	if (rows.length === 0) return [];

	const productIds = uniqueStrings(rows.map((row) => row.productId));
	const variantIds = uniqueStrings(rows.map((row) => row.variantId).filter(isString));
	const db = getDb();
	const [productRows, variantRows, imageRows, colorRows] = await Promise.all([
		withTransientD1ReadRetry(() =>
			db.select().from(product).where(inArray(product.id, productIds))
		),
		withTransientD1ReadRetry(() =>
			db
				.select({
					variant: productVariant,
					color: productVariantColor,
					inventory: inventory
				})
				.from(productVariant)
				.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
				.leftJoin(inventory, eq(inventory.variantId, productVariant.id))
				.where(variantIds.length > 0 ? inArray(productVariant.id, variantIds) : sql`0`)
		),
		withTransientD1ReadRetry(() => productImagesQuery(db, productIds)),
		withTransientD1ReadRetry(() => productColorsQuery(db, productIds))
	]);
	const imagesByProductId = groupByProductId(imageRows);
	const primaryPricesByProductId = primaryPricesByProductIdFromColors(colorRows);
	const productsById = new Map(productRows.map((row) => [row.id, row]));
	const variantsById = new Map(variantRows.map((row) => [row.variant.id, row]));

	return rows
		.map((row) => {
			const productRow = productsById.get(row.productId);
			if (!productRow) return null;

			const variantJoined = row.variantId ? (variantsById.get(row.variantId) ?? null) : null;
			const imageUrl = resolveWishlistImageUrl(
				imagesByProductId.get(row.productId) ?? [],
				variantJoined ? variantJoined.variant.variantColorId : null
			);
			const primaryPrices = primaryPricesByProductId.get(row.productId);

			return {
				id: row.variantId ? `${row.productId}:${row.variantId}` : row.productId,
				productId: row.productId,
				variantId: row.variantId,
				saveCount: row.saveCount,
				lastSavedAt: new Date(row.lastSavedAtMs),
				alertStatus: row.alertStatus,
				product: toWishlistProductSummaryDTO(
					productRow,
					imageUrl,
					primaryPrices?.basePrice ?? 0,
					primaryPrices?.compareAtPrice ?? null
				),
				variant: variantJoined
					? toWishlistVariantSummaryDTO(
							variantJoined.variant,
							variantJoined.color,
							variantJoined.inventory
						)
					: null,
				imageUrl,
				effectivePrice: variantJoined
					? variantJoined.color.basePrice
					: (primaryPrices?.basePrice ?? 0),
				isAvailable:
					productRow.isActive &&
					(row.variantId === null ||
						(variantJoined?.variant.isActive === true &&
							isWishlistInventoryAvailable(variantJoined.inventory)))
			};
		})
		.filter((row): row is WishlistSignalDTO => row !== null);
}

async function loadWishlistHydrationMaps(productIds: string[]): Promise<{
	imagesByProductId: Map<string, ProductImage[]>;
	primaryPricesByProductId: Map<string, { basePrice: number; compareAtPrice: number | null }>;
}> {
	if (productIds.length === 0) {
		return {
			imagesByProductId: new Map(),
			primaryPricesByProductId: new Map()
		};
	}

	const db = getDb();
	const [images, colors] = await withTransientD1ReadRetry(() =>
		db.batch([productImagesQuery(db, productIds), productColorsQuery(db, productIds)])
	);

	return {
		imagesByProductId: groupByProductId(images),
		primaryPricesByProductId: primaryPricesByProductIdFromColors(colors)
	};
}

function productImagesQuery(db: QueryExecutor, productIds: string[]) {
	return db
		.select()
		.from(productImage)
		.where(inArray(productImage.productId, productIds))
		.orderBy(asc(productImage.position), asc(productImage.createdAt));
}

function productColorsQuery(db: QueryExecutor, productIds: string[]) {
	return db
		.select()
		.from(productVariantColor)
		.where(inArray(productVariantColor.productId, productIds))
		.orderBy(asc(productVariantColor.sortOrder), asc(productVariantColor.createdAt));
}

function primaryPricesByProductIdFromColors(
	colors: ProductVariantColor[]
): Map<string, { basePrice: number; compareAtPrice: number | null }> {
	const priceMap = new Map<string, { basePrice: number; compareAtPrice: number | null }>();

	for (const color of colors) {
		if (!priceMap.has(color.productId)) {
			priceMap.set(color.productId, {
				basePrice: color.basePrice,
				compareAtPrice: color.compareAtPrice
			});
		}
	}

	return priceMap;
}

function toWishlistItemDTO(
	row: WishlistJoinedRow,
	imagesByProductId: Map<string, ProductImage[]>,
	primaryPricesByProductId: Map<string, { basePrice: number; compareAtPrice: number | null }>
): WishlistItemDTO {
	const imageUrl = resolveWishlistImageUrl(
		imagesByProductId.get(row.product.id) ?? [],
		row.variant ? row.variant.variantColorId : null
	);
	const variant =
		row.variant && row.color
			? toWishlistVariantSummaryDTO(row.variant, row.color, row.inventory)
			: null;
	const primaryPrices = primaryPricesByProductId.get(row.product.id);

	return {
		id: row.item.id,
		userId: row.item.userId,
		productId: row.item.productId,
		variantId: row.item.variantId,
		addedAt: row.item.addedAt,
		product: toWishlistProductSummaryDTO(
			row.product,
			imageUrl,
			primaryPrices?.basePrice ?? 0,
			primaryPrices?.compareAtPrice ?? null
		),
		variant,
		imageUrl,
		effectivePrice: variant?.effectivePrice ?? primaryPrices?.basePrice ?? 0,
		isAvailable:
			row.product.isActive &&
			(row.item.variantId === null ||
				(row.variant?.isActive === true && isWishlistInventoryAvailable(row.inventory)))
	};
}

function wishlistAvailabilityCondition(): SQL {
	return and(
		eq(product.isActive, true),
		or(
			isNull(wishlistItem.variantId),
			and(
				eq(productVariant.isActive, true),
				or(
					eq(inventory.trackInventory, false),
					eq(inventory.allowBackorder, true),
					gt(inventory.quantity, inventory.reservedQuantity)
				)
			)
		)
	) as SQL;
}

function isWishlistInventoryAvailable(inventoryRow: Inventory | null): boolean {
	if (!inventoryRow) return false;
	return (
		!inventoryRow.trackInventory ||
		inventoryRow.allowBackorder ||
		inventoryRow.quantity > inventoryRow.reservedQuantity
	);
}

function toWishlistProductSummaryDTO(
	row: Product,
	imageUrl: string | null,
	basePrice: number,
	compareAtPrice: number | null
): WishlistProductSummaryDTO {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		shortDescription: row.shortDescription,
		basePrice,
		compareAtPrice,
		isActive: row.isActive,
		imageUrl
	};
}

function toWishlistVariantSummaryDTO(
	row: ProductVariant,
	colorRow: ProductVariantColor,
	inventoryRow?: { quantity: number; trackInventory: boolean } | null
): WishlistVariantSummaryDTO {
	return {
		id: row.id,
		productId: row.productId,
		size: row.size,
		color: colorRow.color,
		colorHex: colorRow.colorHex,
		priceOverride: null,
		effectivePrice: colorRow.basePrice,
		isActive: row.isActive,
		inventoryQuantity: inventoryRow ? inventoryRow.quantity : null,
		trackInventory: inventoryRow ? inventoryRow.trackInventory : false
	};
}

async function assertWishlistTargetsAvailableForCustomer(
	targets: NormalizedWishlistTarget[]
): Promise<void> {
	if (targets.length === 0) return;

	const productIds = uniqueStrings(targets.map((target) => target.productId));
	const variantIds = uniqueStrings(targets.map((target) => target.variantId).filter(isString));
	const db = getDb();
	const productRows = await db.select().from(product).where(inArray(product.id, productIds));
	const productsById = new Map(productRows.map((row) => [row.id, row]));

	for (const productId of productIds) {
		const productRow = productsById.get(productId);

		if (!productRow) {
			throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
		}

		if (!productRow.isActive) {
			throw new ProductError('Product is unavailable.', ErrorCode.PRODUCT_UNAVAILABLE, {
				productId
			});
		}
	}

	if (variantIds.length === 0) return;

	const variantRows = await db
		.select()
		.from(productVariant)
		.where(inArray(productVariant.id, variantIds));
	const variantsById = new Map(variantRows.map((row) => [row.id, row]));

	for (const target of targets) {
		if (!target.variantId) continue;

		const variantRow = variantsById.get(target.variantId);

		if (!variantRow || variantRow.productId !== target.productId) {
			throw new ProductError(
				'Product variant not found for this product.',
				ErrorCode.VARIANT_NOT_FOUND,
				{
					productId: target.productId,
					variantId: target.variantId
				}
			);
		}

		if (!variantRow.isActive) {
			throw new ProductError('Product variant is unavailable.', ErrorCode.VARIANT_UNAVAILABLE, {
				productId: target.productId,
				variantId: target.variantId
			});
		}
	}
}

async function findWishlistItemByTarget(
	db: QueryExecutor,
	userId: string,
	target: NormalizedWishlistTarget
): Promise<WishlistItem | null> {
	const [row] = await db
		.select()
		.from(wishlistItem)
		.where(wishlistTargetPredicate(userId, target.productId, target.variantId))
		.limit(1);

	return row ?? null;
}

function parseInsertWishlistItem(userId: string, input: WishlistTargetInput): InsertWishlistItem {
	const target = normalizeWishlistTarget(input);
	const result = insertWishlistItemSchema.safeParse({
		userId,
		productId: target.productId,
		variantId: target.variantId
	});

	if (!result.success) {
		throw new WishlistError('Invalid wishlist item data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		userId: result.data.userId,
		productId: result.data.productId,
		variantId: result.data.variantId ?? null
	};
}

function normalizeWishlistTarget(input: WishlistTargetInput): NormalizedWishlistTarget {
	return {
		productId: normalizeId(input.productId, 'productId'),
		variantId:
			input.variantId === undefined || input.variantId === null
				? null
				: normalizeId(input.variantId, 'variantId')
	};
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new WishlistError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function wishlistTargetPredicate(userId: string, productId: string, variantId: string | null): SQL {
	return and(
		eq(wishlistItem.userId, userId),
		eq(wishlistItem.productId, productId),
		variantId ? eq(wishlistItem.variantId, variantId) : isNull(wishlistItem.variantId)
	) as SQL;
}

function resolveWishlistImageUrl(images: ProductImage[], variantId: string | null): string | null {
	const variantPrimary = variantId
		? images.find((image) => image.variantId === variantId && image.isPrimary)
		: null;
	if (variantPrimary) return mediaPresetUrl(variantPrimary.r2Key, 'card600');

	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return mediaPresetUrl(productPrimary.r2Key, 'card600');

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return mediaPresetUrl(anyPrimary.r2Key, 'card600');

	const variantImage = variantId ? images.find((image) => image.variantId === variantId) : null;
	if (variantImage) return mediaPresetUrl(variantImage.r2Key, 'card600');

	const firstImage = images[0];
	return firstImage ? mediaPresetUrl(firstImage.r2Key, 'card600') : null;
}

function wishlistTargetKey(productId: string, variantId: string | null): string {
	return `${productId}:${variantId ?? ''}`;
}

function mapWishlistPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	rethrowTransientD1Error(error);

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new WishlistError(
			'Wishlist item already exists.',
			ErrorCode.WISHLIST_ITEM_ALREADY_EXISTS
		);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new WishlistError('Related wishlist record not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
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
