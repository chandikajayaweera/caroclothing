import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { requireActor, requireAdmin } from '$lib/server/foundation/guards';
import {
	ErrorCode,
	getErrorMessage,
	isAppError,
	ProductError,
	WishlistError
} from '$lib/server/infrastructure/errors';
import { mediaUrl } from '$lib/server/infrastructure/media';
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
import type {
	ListWishlistOptions,
	ListWishlistSignalsOptions,
	MergeWishlistIntoUserInput,
	WishlistItemDTO,
	WishlistListResult,
	WishlistMergeResult,
	WishlistProductSummaryDTO,
	WishlistSignalDTO,
	WishlistSignalListResult,
	WishlistStatusDTO,
	WishlistTargetInput,
	WishlistVariantSummaryDTO
} from './wishlist.types';

type Db = ReturnType<typeof getDb>;
export type WishlistTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Tx = WishlistTx;
type QueryExecutor = Db | Tx;

type NormalizedWishlistTarget = {
	productId: string;
	variantId: string | null;
};

type WishlistJoinedRow = {
	item: WishlistItem;
	product: Product;
	variant: ProductVariant | null;
	color: ProductVariantColor | null;
};

type WishlistSignalAggregateRow = {
	productId: string;
	variantId: string | null;
	saveCount: number;
	lastSavedAtMs: number;
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
		userId: actor.id,
		productId: target.productId,
		variantId: target.variantId
	};

	try {
		const [created] = await getDb().insert(wishlistItem).values(values).returning();

		if (!created) {
			throw new WishlistError('Wishlist item was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return getWishlistItemDTOById(created.id);
	} catch (error) {
		const racedExisting = await findWishlistItemByTarget(getDb(), actor.id, target);
		if (racedExisting && isUniqueConstraintError(getErrorMessage(error))) {
			return getWishlistItemDTOById(racedExisting.id);
		}

		throw mapWishlistPersistenceError(error);
	}
}

export async function removeFromWishlist(
	ctx: ServiceContext,
	input: WishlistTargetInput
): Promise<void> {
	const actor = requireActor(ctx.actor);
	const target = normalizeWishlistTarget(input);

	await getDb()
		.delete(wishlistItem)
		.where(wishlistTargetPredicate(actor.id, target.productId, target.variantId));
}

export async function listWishlist(
	ctx: ServiceContext,
	options: ListWishlistOptions = {}
): Promise<WishlistListResult> {
	const actor = requireActor(ctx.actor);
	return listWishlistForUser(actor.id, options);
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

	await getDb().delete(wishlistItem).where(eq(wishlistItem.userId, actor.id));
}

export async function mergeWishlistIntoUser(
	ctx: ServiceContext,
	input: MergeWishlistIntoUserInput
): Promise<WishlistMergeResult> {
	try {
		return await getDb().transaction(async (tx) => mergeWishlistIntoUserTx(tx, ctx, input));
	} catch (error) {
		throw mapWishlistPersistenceError(error);
	}
}

export async function mergeWishlistIntoUserTx(
	tx: WishlistTx,
	ctx: ServiceContext,
	input: MergeWishlistIntoUserInput
): Promise<WishlistMergeResult> {
	const actor = requireActor(ctx.actor);
	const sourceUserId = normalizeId(input.sourceUserId, 'sourceUserId');

	if (sourceUserId === actor.id) {
		return {
			sourceUserId,
			targetUserId: actor.id,
			movedCount: 0,
			duplicateCount: 0
		};
	}

	const rows = await tx.select().from(wishlistItem).where(eq(wishlistItem.userId, sourceUserId));
	let movedCount = 0;
	let duplicateCount = 0;

	for (const row of rows) {
		const target = {
			productId: row.productId,
			variantId: row.variantId ?? null
		};
		const existing = await findWishlistItemByTarget(tx, actor.id, target);

		if (existing) {
			await tx.delete(wishlistItem).where(eq(wishlistItem.id, row.id));
			duplicateCount += 1;
			continue;
		}

		await tx.update(wishlistItem).set({ userId: actor.id }).where(eq(wishlistItem.id, row.id));
		movedCount += 1;
	}

	return {
		sourceUserId,
		targetUserId: actor.id,
		movedCount,
		duplicateCount
	};
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
		conditions.push(eq(product.isActive, true));
		conditions.push(or(isNull(wishlistItem.variantId), eq(productVariant.isActive, true)) as SQL);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const aggregateRows = await getDb()
		.select({
			productId: wishlistItem.productId,
			variantId: wishlistItem.variantId,
			saveCount: count(),
			lastSavedAtMs: sql<number>`max(${wishlistItem.addedAt})`
		})
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.where(where)
		.groupBy(wishlistItem.productId, wishlistItem.variantId)
		.orderBy(desc(count()), desc(sql`max(${wishlistItem.addedAt})`));

	const total = aggregateRows.length;
	const pageRows = aggregateRows.slice(offset, offset + limit);
	const items = await hydrateWishlistSignals(pageRows);

	return {
		items,
		total,
		limit,
		offset
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

	const [totalRow] = await db
		.select({ total: count() })
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.where(where);
	const rows = await db
		.select({
			item: wishlistItem,
			product,
			variant: productVariant,
			color: productVariantColor
		})
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.leftJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.where(where)
		.orderBy(desc(wishlistItem.addedAt))
		.limit(limit)
		.offset(offset);
	const items = await hydrateWishlistJoinedRows(rows);

	return {
		items,
		total: totalRow?.total ?? 0,
		limit,
		offset
	};
}

function wishlistListConditions(userId: string, includeUnavailable: boolean): SQL[] {
	const conditions: SQL[] = [eq(wishlistItem.userId, userId)];

	if (!includeUnavailable) {
		conditions.push(eq(product.isActive, true));
		conditions.push(or(isNull(wishlistItem.variantId), eq(productVariant.isActive, true)) as SQL);
	}

	return conditions;
}

async function getWishlistItemDTOById(id: string): Promise<WishlistItemDTO> {
	const [row] = await getDb()
		.select({
			item: wishlistItem,
			product: product,
			variant: productVariant,
			color: productVariantColor
		})
		.from(wishlistItem)
		.innerJoin(product, eq(wishlistItem.productId, product.id))
		.leftJoin(productVariant, eq(wishlistItem.variantId, productVariant.id))
		.leftJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
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
	const imagesByProductId = await loadProductImagesByProductId(productIds);
	const primaryPricesByProductId = await loadPrimaryPricesByProductId(productIds);

	return rows.map((row) => toWishlistItemDTO(row, imagesByProductId, primaryPricesByProductId));
}

async function loadPrimaryPricesByProductId(productIds: string[]): Promise<Map<string, { basePrice: number; compareAtPrice: number | null }>> {
	const priceMap = new Map<string, { basePrice: number; compareAtPrice: number | null }>();
	if (productIds.length === 0) return priceMap;

	const colors = await getDb()
		.select()
		.from(productVariantColor)
		.where(inArray(productVariantColor.productId, productIds))
		.orderBy(asc(productVariantColor.sortOrder), asc(productVariantColor.createdAt));

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

async function hydrateWishlistSignals(
	rows: WishlistSignalAggregateRow[]
): Promise<WishlistSignalDTO[]> {
	if (rows.length === 0) return [];

	const productIds = uniqueStrings(rows.map((row) => row.productId));
	const variantIds = uniqueStrings(rows.map((row) => row.variantId).filter(isString));
	const db = getDb();
	const productRows = await db.select().from(product).where(inArray(product.id, productIds));
	const variantRows =
		variantIds.length > 0
			? await db
					.select({
						variant: productVariant,
						color: productVariantColor
					})
					.from(productVariant)
					.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
					.where(inArray(productVariant.id, variantIds))
			: [];
	const imagesByProductId = await loadProductImagesByProductId(productIds);
	const primaryPricesByProductId = await loadPrimaryPricesByProductId(productIds);
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
				productId: row.productId,
				variantId: row.variantId,
				saveCount: row.saveCount,
				lastSavedAt: new Date(row.lastSavedAtMs),
				product: toWishlistProductSummaryDTO(
					productRow,
					imageUrl,
					primaryPrices?.basePrice ?? 0,
					primaryPrices?.compareAtPrice ?? null
				),
				variant: variantJoined ? toWishlistVariantSummaryDTO(variantJoined.variant, variantJoined.color) : null,
				imageUrl,
				effectivePrice: variantJoined ? variantJoined.color.basePrice : primaryPrices?.basePrice ?? 0,
				isAvailable:
					productRow.isActive && (row.variantId === null || variantJoined?.variant.isActive === true)
			};
		})
		.filter((row): row is WishlistSignalDTO => row !== null);
}

async function loadProductImagesByProductId(
	productIds: string[]
): Promise<Map<string, ProductImage[]>> {
	if (productIds.length === 0) return new Map();

	const rows = await getDb()
		.select()
		.from(productImage)
		.where(inArray(productImage.productId, productIds))
		.orderBy(asc(productImage.position), asc(productImage.createdAt));

	return groupByProductId(rows);
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
	const variant = row.variant && row.color ? toWishlistVariantSummaryDTO(row.variant, row.color) : null;
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
			row.product.isActive && (row.item.variantId === null || row.variant?.isActive === true)
	};
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
		tier: row.tier,
		basePrice,
		compareAtPrice,
		isActive: row.isActive,
		imageUrl
	};
}

function toWishlistVariantSummaryDTO(
	row: ProductVariant,
	colorRow: ProductVariantColor
): WishlistVariantSummaryDTO {
	return {
		id: row.id,
		productId: row.productId,
		size: row.size,
		color: colorRow.color,
		colorHex: colorRow.colorHex,
		priceOverride: null,
		effectivePrice: colorRow.basePrice,
		isActive: row.isActive
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
	if (variantPrimary) return mediaUrl(variantPrimary.r2Key);

	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return mediaUrl(productPrimary.r2Key);

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return mediaUrl(anyPrimary.r2Key);

	const variantImage = variantId ? images.find((image) => image.variantId === variantId) : null;
	if (variantImage) return mediaUrl(variantImage.r2Key);

	const firstImage = images[0];
	return firstImage ? mediaUrl(firstImage.r2Key) : null;
}

function wishlistTargetKey(productId: string, variantId: string | null): string {
	return `${productId}:${variantId ?? ''}`;
}

function mapWishlistPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

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
