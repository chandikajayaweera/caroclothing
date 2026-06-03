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
	CartError,
	DropError,
	ErrorCode,
	ProductError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import { mediaUrl } from '$lib/server/infrastructure/media';
import type { ServiceActor, ServiceContext, SystemActor } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	resolveNow
} from '$lib/server/foundation/utils';
import { drop as dropTable, dropProduct as dropProductTable } from '../drops/drops.drizzle';
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
	cart as cartTable,
	cartItem as cartItemTable,
	insertCartItemSchema,
	updateCartItemSchema,
	type Cart,
	type CartItem,
	type NewCart,
	type NewCartItem
} from './cart.drizzle';
import type {
	AddCartItemInput,
	AdminCartDTO,
	CartAccessInput,
	CartDTO,
	CartItemAvailabilityStatus,
	CartItemDTO,
	CartListResult,
	CheckoutCartDTO,
	CheckoutOrderCartDTO,
	CheckoutOrderCartItemDTO,
	ExpiredGuestCartCleanupResult,
	ListCartsOptions,
	MergeGuestCartIntoUserInput,
	MergeUserCartIntoUserInput,
	OrderCartDeleteResult,
	RemoveCartItemInput,
	UpdateCartItemQuantityInput
} from './cart.types';

type Db = ReturnType<typeof getDb>;
export type CartTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Tx = CartTx;
type QueryExecutor = Db | Tx;

type CartOwner =
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

type CartWithItemRow = {
	cart: Cart;
	item: CartItem;
};

type PurchasableVariant = {
	product: Product;
	variant: ProductVariant;
	unitPrice: number;
};

type CartDeleteResult = {
	itemCount: number;
	releasedQuantity: number;
};

const GUEST_CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CLEANUP_DEFAULT_LIMIT = 100;
const CLEANUP_MAX_LIMIT = 500;
const MAX_CART_ITEM_QUANTITY = 10;

export async function getCart(
	ctx: ServiceContext,
	input: CartAccessInput = {}
): Promise<CartDTO | null> {
	const owner = resolveCartOwner(ctx, input, { required: false });
	if (!owner) return null;

	const now = resolveNow(ctx, input.now);
	const row = await findActiveCartByOwnerTx(getDb(), owner, now);
	if (!row) return null;

	return hydrateCartTx(getDb(), row, now);
}

export async function getOrCreateCart(
	ctx: ServiceContext,
	input: CartAccessInput = {}
): Promise<CartDTO> {
	const owner = resolveCartOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	const row = await getDb().transaction(async (tx) => getOrCreateCartTx(tx, owner, now));
	return hydrateCartTx(getDb(), row, now);
}

export async function addItemToCart(
	ctx: ServiceContext,
	input: AddCartItemInput
): Promise<CartDTO> {
	return addItemToCartWithRetry(ctx, input, true);
}

export async function updateCartItemQuantity(
	ctx: ServiceContext,
	input: UpdateCartItemQuantityInput
): Promise<CartDTO> {
	const owner = resolveCartOwner(ctx, input, { required: true });
	const cartItemId = normalizeId(input.cartItemId, 'cartItemId');
	const quantity = normalizeCartItemQuantity(input.quantity, 'quantity');
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction(async (tx) => {
			const row = await findOwnedCartItemTx(tx, owner, cartItemId, now);
			await loadPurchasableVariantTx(tx, row.item.variantId, now);

			const delta = quantity - row.item.quantity;
			if (delta > 0) {
				await reserveInventoryTx(tx as InventoryTx, {
					variantId: row.item.variantId,
					quantity: delta,
					referenceId: row.item.id,
					now
				});
			} else if (delta < 0) {
				await releaseInventoryReservationTx(tx as InventoryTx, {
					variantId: row.item.variantId,
					quantity: Math.abs(delta),
					referenceId: row.item.id,
					now
				});
			}

			if (delta !== 0) {
				const [updated] = await tx
					.update(cartItemTable)
					.set(parseUpdateCartItemQuantity(quantity, now))
					.where(eq(cartItemTable.id, row.item.id))
					.returning();

				if (!updated) {
					throw new CartError('Cart item not found.', ErrorCode.CART_ITEM_NOT_FOUND, {
						cartItemId
					});
				}
			}

			const updatedCart = await touchAndReloadCartTx(tx, row.cart.id, now);
			return hydrateCartTx(tx, updatedCart, now);
		});
	} catch (error) {
		throw mapCartPersistenceError(error);
	}
}

export async function removeCartItem(
	ctx: ServiceContext,
	input: RemoveCartItemInput
): Promise<CartDTO> {
	const owner = resolveCartOwner(ctx, input, { required: true });
	const cartItemId = normalizeId(input.cartItemId, 'cartItemId');
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction(async (tx) => {
			const row = await findOwnedCartItemTx(tx, owner, cartItemId, now);

			await releaseInventoryReservationTx(tx as InventoryTx, {
				variantId: row.item.variantId,
				quantity: row.item.quantity,
				referenceId: row.item.id,
				now
			});
			await tx.delete(cartItemTable).where(eq(cartItemTable.id, row.item.id));

			const updatedCart = await touchAndReloadCartTx(tx, row.cart.id, now);
			return hydrateCartTx(tx, updatedCart, now);
		});
	} catch (error) {
		throw mapCartPersistenceError(error);
	}
}

export async function clearCart(
	ctx: ServiceContext,
	input: CartAccessInput = {}
): Promise<CartDTO> {
	const owner = resolveCartOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction(async (tx) => {
			const row = await getOrCreateCartTx(tx, owner, now);
			await clearCartItemsTx(tx, row.id, now);
			const updatedCart = await touchAndReloadCartTx(tx, row.id, now, { promoCodeId: null });
			return hydrateCartTx(tx, updatedCart, now);
		});
	} catch (error) {
		throw mapCartPersistenceError(error);
	}
}

export async function getCheckoutCart(
	ctx: ServiceContext,
	input: CartAccessInput = {}
): Promise<CheckoutCartDTO> {
	const cart = await getOrCreateCart(ctx, input);
	const blockingReasons = checkoutBlockingReasons(cart);

	return {
		...cart,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

export async function getCheckoutCartForOrderTx(
	tx: CartTx,
	ctx: ServiceContext,
	input: CartAccessInput = {}
): Promise<CheckoutOrderCartDTO> {
	const owner = resolveCartOwner(ctx, input, { required: true });
	const now = resolveNow(ctx, input.now);
	const row = await findCartByOwnerTx(tx, owner);

	if (!row) {
		throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND);
	}

	if (isCartExpired(row, now)) {
		throw new CartError('Cart has expired.', ErrorCode.CHECKOUT_SESSION_EXPIRED, {
			cartId: row.id
		});
	}

	return hydrateCheckoutOrderCartTx(tx, row, now);
}

export async function deleteCartAfterOrderPlacementTx(
	tx: CartTx,
	input: { cartId: string }
): Promise<OrderCartDeleteResult> {
	const cartId = normalizeId(input.cartId, 'cartId');
	const items = await tx.select().from(cartItemTable).where(eq(cartItemTable.cartId, cartId));
	await tx.delete(cartItemTable).where(eq(cartItemTable.cartId, cartId));
	await tx.delete(cartTable).where(eq(cartTable.id, cartId));

	return {
		cartId,
		itemCount: items.length
	};
}

export async function mergeGuestCartIntoUserCart(
	ctx: ServiceContext,
	input: MergeGuestCartIntoUserInput
): Promise<CartDTO> {
	const actor = requireAccountActor(ctx);
	const sessionToken = normalizeSessionToken(input.sessionToken);
	const now = resolveNow(ctx, input.now);
	const sourceOwner: CartOwner = { type: 'guest', userId: null, sessionToken };
	const targetOwner: CartOwner = { type: 'user', userId: actor.id, sessionToken: null };

	try {
		return await getDb().transaction(async (tx) => {
			const sourceCart = await findCartByOwnerTx(tx, sourceOwner);
			if (sourceCart && isCartExpired(sourceCart, now)) {
				await deleteCartByIdTx(tx, sourceCart.id, now);
			}

			const activeSourceCart = sourceCart && !isCartExpired(sourceCart, now) ? sourceCart : null;
			const targetCart = await findActiveCartByOwnerTx(tx, targetOwner, now);

			if (!activeSourceCart) {
				const row = targetCart ?? (await getOrCreateCartTx(tx, targetOwner, now));
				return hydrateCartTx(tx, row, now);
			}

			if (!targetCart) {
				const converted = await convertCartOwnerTx(tx, activeSourceCart.id, targetOwner, now);
				return hydrateCartTx(tx, converted, now);
			}

			await mergeCartRowsTx(tx, activeSourceCart, targetCart, now);
			const updatedTarget = await reloadCartByIdTx(tx, targetCart.id);
			return hydrateCartTx(tx, updatedTarget, now);
		});
	} catch (error) {
		throw mapCartMergeError(error);
	}
}

export async function mergeUserCartIntoUserCart(
	ctx: ServiceContext,
	input: MergeUserCartIntoUserInput
): Promise<CartDTO> {
	try {
		return await getDb().transaction(async (tx) => mergeUserCartIntoUserCartTx(tx, ctx, input));
	} catch (error) {
		throw mapCartMergeError(error);
	}
}

export async function mergeUserCartIntoUserCartTx(
	tx: CartTx,
	ctx: ServiceContext,
	input: MergeUserCartIntoUserInput
): Promise<CartDTO> {
	const actor = requireAccountActor(ctx);
	const sourceUserId = normalizeId(input.sourceUserId, 'sourceUserId');
	const now = resolveNow(ctx, input.now);

	if (sourceUserId === actor.id) {
		throw new CartError('Source and target users must be different.', ErrorCode.VALIDATION_ERROR, {
			sourceUserId,
			targetUserId: actor.id
		});
	}

	const targetOwner: CartOwner = { type: 'user', userId: actor.id, sessionToken: null };

	const sourceCarts = await findUserCartsTx(tx, sourceUserId);
	let targetCart = await findActiveCartByOwnerTx(tx, targetOwner, now);

	if (sourceCarts.length === 0) {
		const row = targetCart ?? (await getOrCreateCartTx(tx, targetOwner, now));
		return hydrateCartTx(tx, row, now);
	}

	const [firstSourceCart, ...remainingSourceCarts] = sourceCarts;

	if (!targetCart) {
		targetCart = await convertCartOwnerTx(tx, firstSourceCart.id, targetOwner, now);
	} else {
		await mergeCartRowsTx(tx, firstSourceCart, targetCart, now);
	}

	for (const sourceCart of remainingSourceCarts) {
		await mergeCartRowsTx(tx, sourceCart, targetCart, now);
	}

	const updatedTarget = await reloadCartByIdTx(tx, targetCart.id);
	return hydrateCartTx(tx, updatedTarget, now);
}

export async function listCarts(
	ctx: ServiceContext,
	options: ListCartsOptions = {}
): Promise<CartListResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const conditions = cartListConditions(options, now);
	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const db = getDb();
	const rowsQuery = db
		.select()
		.from(cartTable)
		.orderBy(desc(cartTable.updatedAt), desc(cartTable.createdAt))
		.limit(limit)
		.offset(offset);
	const totalQuery = db.select({ total: count() }).from(cartTable);
	const [rows, totalRows] = await Promise.all([
		where ? rowsQuery.where(where) : rowsQuery,
		where ? totalQuery.where(where) : totalQuery
	]);

	return {
		items: await hydrateAdminCartsTx(db, rows, now),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function getCartById(
	ctx: ServiceContext,
	input: { cartId: string; now?: Date }
): Promise<AdminCartDTO> {
	requireAdmin(ctx.actor);

	const cartId = normalizeId(input.cartId, 'cartId');
	const now = resolveNow(ctx, input.now);
	const row = await reloadCartByIdTx(getDb(), cartId);
	return hydrateAdminCartTx(getDb(), row, now);
}

export async function getCartForUser(
	ctx: ServiceContext,
	input: { userId: string; now?: Date }
): Promise<AdminCartDTO | null> {
	requireAdmin(ctx.actor);

	const userId = normalizeId(input.userId, 'userId');
	const now = resolveNow(ctx, input.now);
	const row = await findActiveCartByOwnerTx(
		getDb(),
		{ type: 'user', userId, sessionToken: null },
		now
	);

	return row ? hydrateAdminCartTx(getDb(), row, now) : null;
}

export async function deleteExpiredGuestCarts(
	ctx: ServiceContext,
	input: { now?: Date; limit?: number } = {}
): Promise<ExpiredGuestCartCleanupResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx, input.now);
	const limit = normalizeLimit(input.limit, CLEANUP_DEFAULT_LIMIT, CLEANUP_MAX_LIMIT);

	try {
		return await getDb().transaction(async (tx) => {
			const rows = await tx
				.select()
				.from(cartTable)
				.where(
					and(
						isNotNull(cartTable.sessionToken),
						isNotNull(cartTable.expiresAt),
						lte(cartTable.expiresAt, now)
					)
				)
				.orderBy(asc(cartTable.expiresAt), asc(cartTable.createdAt))
				.limit(limit);

			let itemCount = 0;
			let releasedQuantity = 0;

			for (const row of rows) {
				const result = await deleteCartByIdTx(tx, row.id, now);
				itemCount += result.itemCount;
				releasedQuantity += result.releasedQuantity;
			}

			return {
				deletedCount: rows.length,
				cartIds: rows.map((row) => row.id),
				itemCount,
				releasedQuantity
			};
		});
	} catch (error) {
		throw mapCartPersistenceError(error);
	}
}

async function addItemToCartWithRetry(
	ctx: ServiceContext,
	input: AddCartItemInput,
	retryOnConflict: boolean
): Promise<CartDTO> {
	const owner = resolveCartOwner(ctx, input, { required: true });
	const variantId = normalizeId(input.variantId, 'variantId');
	const quantity = normalizeCartItemQuantity(input.quantity ?? 1, 'quantity');
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction(async (tx) => {
			const cartRow = await getOrCreateCartTx(tx, owner, now);
			const target = await loadPurchasableVariantTx(tx, variantId, now);
			const existing = await findCartItemByVariantTx(tx, cartRow.id, variantId);

			if (existing) {
				const nextQuantity = existing.quantity + quantity;
				validateCartItemQuantity(nextQuantity, 'quantity');

				await reserveInventoryTx(tx as InventoryTx, {
					variantId,
					quantity,
					referenceId: existing.id,
					now
				});
				await tx
					.update(cartItemTable)
					.set(parseUpdateCartItemQuantity(nextQuantity, now))
					.where(eq(cartItemTable.id, existing.id));
			} else {
				const cartItemId = nanoid();
				const values = parseNewCartItem({
					id: cartItemId,
					cartId: cartRow.id,
					variantId,
					productId: target.product.id,
					quantity,
					unitPrice: target.unitPrice
				});

				await tx.insert(cartItemTable).values(values);
				await reserveInventoryTx(tx as InventoryTx, {
					variantId,
					quantity,
					referenceId: cartItemId,
					now
				});
			}

			const updatedCart = await touchAndReloadCartTx(tx, cartRow.id, now);
			return hydrateCartTx(tx, updatedCart, now);
		});
	} catch (error) {
		if (retryOnConflict && isUniqueConstraintError(getErrorMessage(error))) {
			return addItemToCartWithRetry(ctx, input, false);
		}

		throw mapCartPersistenceError(error);
	}
}

async function getOrCreateCartTx(tx: Tx, owner: CartOwner, now: Date): Promise<Cart> {
	const existing = await findCartByOwnerTx(tx, owner);

	if (existing) {
		if (isCartExpired(existing, now)) {
			await deleteCartByIdTx(tx, existing.id, now);
		} else {
			return existing;
		}
	}

	const values: NewCart = {
		userId: owner.type === 'user' ? owner.userId : null,
		sessionToken: owner.type === 'guest' ? owner.sessionToken : null,
		expiresAt: owner.type === 'guest' ? new Date(now.getTime() + GUEST_CART_TTL_MS) : null
	};

	try {
		const [created] = await tx.insert(cartTable).values(values).returning();

		if (!created) {
			throw new CartError('Cart was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return created;
	} catch (error) {
		if (isUniqueConstraintError(getErrorMessage(error))) {
			const racedCart = await findActiveCartByOwnerTx(tx, owner, now);
			if (racedCart) return racedCart;
		}

		throw error;
	}
}

async function findCartByOwnerTx(tx: QueryExecutor, owner: CartOwner): Promise<Cart | null> {
	const [row] = await tx
		.select()
		.from(cartTable)
		.where(cartOwnerPredicate(owner))
		.orderBy(desc(cartTable.updatedAt), desc(cartTable.createdAt))
		.limit(1);

	return row ?? null;
}

async function findActiveCartByOwnerTx(
	tx: QueryExecutor,
	owner: CartOwner,
	now: Date
): Promise<Cart | null> {
	const row = await findCartByOwnerTx(tx, owner);
	if (!row || isCartExpired(row, now)) return null;
	return row;
}

async function findUserCartsTx(tx: QueryExecutor, userId: string): Promise<Cart[]> {
	return tx
		.select()
		.from(cartTable)
		.where(and(eq(cartTable.userId, userId), isNull(cartTable.sessionToken)))
		.orderBy(desc(cartTable.updatedAt), desc(cartTable.createdAt));
}

async function findOwnedCartItemTx(
	tx: QueryExecutor,
	owner: CartOwner,
	cartItemId: string,
	now: Date
): Promise<CartWithItemRow> {
	const [row] = await tx
		.select({
			cart: cartTable,
			item: cartItemTable
		})
		.from(cartItemTable)
		.innerJoin(cartTable, eq(cartItemTable.cartId, cartTable.id))
		.where(and(eq(cartItemTable.id, cartItemId), cartOwnerPredicate(owner)))
		.limit(1);

	if (!row) {
		throw new CartError('Cart item not found.', ErrorCode.CART_ITEM_NOT_FOUND, { cartItemId });
	}

	if (isCartExpired(row.cart, now)) {
		throw new CartError('Cart has expired.', ErrorCode.CHECKOUT_SESSION_EXPIRED, {
			cartId: row.cart.id
		});
	}

	return row;
}

async function findCartItemByVariantTx(
	tx: QueryExecutor,
	cartId: string,
	variantId: string
): Promise<CartItem | null> {
	const [row] = await tx
		.select()
		.from(cartItemTable)
		.where(and(eq(cartItemTable.cartId, cartId), eq(cartItemTable.variantId, variantId)))
		.limit(1);

	return row ?? null;
}

async function reloadCartByIdTx(tx: QueryExecutor, cartId: string): Promise<Cart> {
	const [row] = await tx.select().from(cartTable).where(eq(cartTable.id, cartId)).limit(1);

	if (!row) {
		throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND, { cartId });
	}

	return row;
}

async function touchAndReloadCartTx(
	tx: Tx,
	cartId: string,
	now: Date,
	extraValues: Partial<NewCart> = {}
): Promise<Cart> {
	const [row] = await tx
		.update(cartTable)
		.set({ ...extraValues, updatedAt: now })
		.where(eq(cartTable.id, cartId))
		.returning();

	if (!row) {
		throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND, { cartId });
	}

	return row;
}

async function convertCartOwnerTx(
	tx: Tx,
	cartId: string,
	owner: CartOwner,
	now: Date
): Promise<Cart> {
	const [row] = await tx
		.update(cartTable)
		.set({
			userId: owner.type === 'user' ? owner.userId : null,
			sessionToken: owner.type === 'guest' ? owner.sessionToken : null,
			expiresAt: owner.type === 'guest' ? new Date(now.getTime() + GUEST_CART_TTL_MS) : null,
			updatedAt: now
		})
		.where(eq(cartTable.id, cartId))
		.returning();

	if (!row) {
		throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND, { cartId });
	}

	return row;
}

async function clearCartItemsTx(tx: Tx, cartId: string, now: Date): Promise<CartDeleteResult> {
	const items = await tx.select().from(cartItemTable).where(eq(cartItemTable.cartId, cartId));
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

	await tx.delete(cartItemTable).where(eq(cartItemTable.cartId, cartId));

	return {
		itemCount: items.length,
		releasedQuantity
	};
}

async function deleteCartByIdTx(tx: Tx, cartId: string, now: Date): Promise<CartDeleteResult> {
	const result = await clearCartItemsTx(tx, cartId, now);
	await tx.delete(cartTable).where(eq(cartTable.id, cartId));
	return result;
}

async function mergeCartRowsTx(
	tx: Tx,
	sourceCart: Cart,
	targetCart: Cart,
	now: Date
): Promise<void> {
	if (sourceCart.id === targetCart.id) return;

	const sourceItems = await tx
		.select()
		.from(cartItemTable)
		.where(eq(cartItemTable.cartId, sourceCart.id))
		.orderBy(asc(cartItemTable.addedAt));

	for (const sourceItem of sourceItems) {
		const targetItem = await findCartItemByVariantTx(tx, targetCart.id, sourceItem.variantId);

		if (!targetItem) {
			await tx
				.update(cartItemTable)
				.set({ cartId: targetCart.id, updatedAt: now })
				.where(eq(cartItemTable.id, sourceItem.id));
			continue;
		}

		const acceptedQuantity = Math.min(
			sourceItem.quantity,
			MAX_CART_ITEM_QUANTITY - targetItem.quantity
		);

		await releaseInventoryReservationTx(tx as InventoryTx, {
			variantId: sourceItem.variantId,
			quantity: sourceItem.quantity,
			referenceId: sourceItem.id,
			now
		});

		if (acceptedQuantity > 0) {
			await reserveInventoryTx(tx as InventoryTx, {
				variantId: sourceItem.variantId,
				quantity: acceptedQuantity,
				referenceId: targetItem.id,
				now
			});
			await tx
				.update(cartItemTable)
				.set({
					quantity: targetItem.quantity + acceptedQuantity,
					updatedAt: now
				})
				.where(eq(cartItemTable.id, targetItem.id));
		}

		await tx.delete(cartItemTable).where(eq(cartItemTable.id, sourceItem.id));
	}

	await tx.delete(cartTable).where(eq(cartTable.id, sourceCart.id));
	await touchAndReloadCartTx(tx, targetCart.id, now);
}

async function loadPurchasableVariantTx(
	tx: QueryExecutor,
	variantId: string,
	now: Date
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

	if (row.product.tier === 'drop') {
		await assertProductInLiveDropTx(tx, row.product.id, now);
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

async function assertProductInLiveDropTx(
	tx: QueryExecutor,
	productId: string,
	now: Date
): Promise<void> {
	const [row] = await tx
		.select({ dropId: dropTable.id })
		.from(dropProductTable)
		.innerJoin(dropTable, eq(dropProductTable.dropId, dropTable.id))
		.where(
			and(
				eq(dropProductTable.productId, productId),
				eq(dropTable.status, 'live'),
				or(isNull(dropTable.endAt), gt(dropTable.endAt, now))
			)
		)
		.limit(1);

	if (!row) {
		throw new DropError('Drop is not live for this product.', ErrorCode.DROP_NOT_LIVE, {
			productId
		});
	}
}

async function hydrateCartTx(tx: QueryExecutor, row: Cart, now: Date): Promise<CartDTO> {
	const [dto] = await hydrateCartsTx(tx, [row], now);

	if (!dto) {
		throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND, { cartId: row.id });
	}

	return dto;
}

async function hydrateCheckoutOrderCartTx(
	tx: QueryExecutor,
	row: Cart,
	now: Date
): Promise<CheckoutOrderCartDTO> {
	const cart = await hydrateCartTx(tx, row, now);
	const itemRows = await tx
		.select()
		.from(cartItemTable)
		.where(eq(cartItemTable.cartId, row.id))
		.orderBy(asc(cartItemTable.addedAt));
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
				resolveCartImageR2Key(imagesByProductId.get(item.productId) ?? [], variantColorId)
			];
		})
	);
	const items: CheckoutOrderCartItemDTO[] = cart.items.map((item) => ({
		...item,
		productImageR2Key: imageKeyByItemId.get(item.id) ?? null
	}));
	const cartWithItems = {
		...cart,
		items
	};
	const blockingReasons = checkoutBlockingReasons(cartWithItems);

	return {
		...cartWithItems,
		promoCodeId: row.promoCodeId ?? null,
		canCheckout: blockingReasons.length === 0,
		blockingReasons
	};
}

async function hydrateAdminCartTx(tx: QueryExecutor, row: Cart, now: Date): Promise<AdminCartDTO> {
	const [dto] = await hydrateAdminCartsTx(tx, [row], now);

	if (!dto) {
		throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND, { cartId: row.id });
	}

	return dto;
}

async function hydrateAdminCartsTx(
	tx: QueryExecutor,
	rows: Cart[],
	now: Date
): Promise<AdminCartDTO[]> {
	const carts = await hydrateCartsTx(tx, rows, now);
	const rowById = new Map(rows.map((row) => [row.id, row]));

	return carts.map((cart) => {
		const row = rowById.get(cart.id);

		return {
			...cart,
			sessionToken: row?.sessionToken ?? null,
			promoCodeId: row?.promoCodeId ?? null
		};
	});
}

async function hydrateCartsTx(tx: QueryExecutor, rows: Cart[], now: Date): Promise<CartDTO[]> {
	if (rows.length === 0) return [];

	const cartIds = rows.map((row) => row.id);
	const itemRows = await tx
		.select()
		.from(cartItemTable)
		.where(inArray(cartItemTable.cartId, cartIds))
		.orderBy(asc(cartItemTable.addedAt));
	const productIds = uniqueStrings(itemRows.map((item) => item.productId));
	const variantIds = uniqueStrings(itemRows.map((item) => item.variantId));
	const [productRows, variantRows, imageRows, inventoryRows, liveDropProductIds] =
		await loadCartHydrationRelationsTx(tx, productIds, variantIds, now);
	const productsById = new Map(productRows.map((productRow) => [productRow.id, productRow]));
	const variantsById = new Map(variantRows.map((variantRow) => [variantRow.id, variantRow]));
	const imagesByProductId = groupByProductId(imageRows);
	const inventoryByVariantId = new Map(
		inventoryRows.map((inventoryRow) => [inventoryRow.variantId, inventoryRow])
	);
	const liveDropProductIdSet = new Set(liveDropProductIds);
	const reservedByItemId = await loadReservedQuantitiesByItemId(tx, itemRows);
	const itemsByCartId = groupByCartId(itemRows);

	return rows.map((row) => {
		const items = (itemsByCartId.get(row.id) ?? []).map((item) =>
			toCartItemDTO({
				item,
				product: productsById.get(item.productId) ?? null,
				variant: variantsById.get(item.variantId) ?? null,
				images: imagesByProductId.get(item.productId) ?? [],
				inventory: inventoryByVariantId.get(item.variantId) ?? null,
				reservedForItem: reservedByItemId.get(item.id) ?? 0,
				liveDropProductIds: liveDropProductIdSet
			})
		);
		const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);

		return {
			id: row.id,
			ownerType: row.userId ? 'user' : 'guest',
			userId: row.userId,
			expiresAt: row.expiresAt,
			items,
			itemCount: items.reduce((total, item) => total + item.quantity, 0),
			subtotal,
			discountAmount: 0,
			totalBeforeShipping: subtotal,
			hasUnavailableItems: items.some((item) => item.availabilityStatus === 'unavailable'),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt
		};
	});
}

type HydratedCartVariant = ProductVariant & {
	color: string;
	colorHex: string | null;
	priceOverride: number | null;
	basePrice: number;
	compareAtPrice: number | null;
};

async function loadCartHydrationRelationsTx(
	tx: QueryExecutor,
	productIds: string[],
	variantIds: string[],
	now: Date
): Promise<
	[Product[], HydratedCartVariant[], ProductImage[], InventoryAvailabilityDTO[], string[]]
> {
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
	const dropProductIds = productRows.filter((row) => row.tier === 'drop').map((row) => row.id);
	const liveDropRows =
		dropProductIds.length > 0
			? await tx
					.select({ productId: dropProductTable.productId })
					.from(dropProductTable)
					.innerJoin(dropTable, eq(dropProductTable.dropId, dropTable.id))
					.where(
						and(
							inArray(dropProductTable.productId, dropProductIds),
							eq(dropTable.status, 'live'),
							or(isNull(dropTable.endAt), gt(dropTable.endAt, now))
						)
					)
			: [];

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
		inventoryRows,
		liveDropRows.map((row) => row.productId)
	];
}

async function loadReservedQuantitiesByItemId(
	tx: QueryExecutor,
	items: CartItem[]
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

function toCartItemDTO(input: {
	item: CartItem;
	product: Product | null;
	variant: HydratedCartVariant | null;
	images: ProductImage[];
	inventory: InventoryAvailabilityDTO | null;
	reservedForItem: number;
	liveDropProductIds: Set<string>;
}): CartItemDTO {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const currentUnitPrice = input.variant ? (input.variant as any).basePrice : null;
	const availability = resolveCartItemAvailability(input);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const variantColorId = input.variant ? (input.variant as any).variantColorId : null;

	return {
		id: input.item.id,
		cartId: input.item.cartId,
		productId: input.item.productId,
		variantId: input.item.variantId,
		productName: input.product?.name ?? null,
		productSlug: input.product?.slug ?? null,
		size: input.variant?.size ?? null,
		color: input.variant?.color ?? null,
		colorHex: input.variant?.colorHex ?? null,
		imageUrl: input.product ? resolveCartImageUrl(input.images, variantColorId) : null,
		quantity: input.item.quantity,
		unitPrice: input.item.unitPrice,
		currentUnitPrice,
		priceChanged: currentUnitPrice !== null && currentUnitPrice !== input.item.unitPrice,
		lineTotal: input.item.unitPrice * input.item.quantity,
		availabilityStatus: availability.status,
		availableQuantity: availability.availableQuantity,
		reservedForItem: input.reservedForItem,
		isBackorder: availability.status === 'backorder',
		addedAt: input.item.addedAt,
		updatedAt: input.item.updatedAt
	};
}

function resolveCartItemAvailability(input: {
	item: CartItem;
	product: Product | null;
	variant: HydratedCartVariant | null;
	inventory: InventoryAvailabilityDTO | null;
	reservedForItem: number;
	liveDropProductIds: Set<string>;
}): {
	status: CartItemAvailabilityStatus;
	availableQuantity: number | null;
} {
	if (!input.product || !input.variant || input.variant.productId !== input.product.id) {
		return { status: 'unavailable', availableQuantity: 0 };
	}

	if (!input.product.isActive || !input.variant.isActive) {
		return { status: 'unavailable', availableQuantity: 0 };
	}

	if (input.product.tier === 'drop' && !input.liveDropProductIds.has(input.product.id)) {
		return { status: 'unavailable', availableQuantity: 0 };
	}

	if (!input.inventory) {
		return { status: 'unavailable', availableQuantity: 0 };
	}

	if (!input.inventory.trackInventory) {
		return { status: 'untracked', availableQuantity: null };
	}

	const availableQuantity = input.inventory.availableQuantity + input.reservedForItem;

	if (availableQuantity >= input.item.quantity) {
		return { status: 'available', availableQuantity };
	}

	if (input.inventory.allowBackorder) {
		return { status: 'backorder', availableQuantity };
	}

	return { status: 'unavailable', availableQuantity };
}

function parseNewCartItem(input: NewCartItem): NewCartItem {
	const result = insertCartItemSchema.safeParse({
		cartId: input.cartId,
		variantId: input.variantId,
		productId: input.productId,
		quantity: input.quantity,
		unitPrice: input.unitPrice
	});

	if (!result.success) {
		throw new CartError('Invalid cart item data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		id: input.id,
		...result.data
	};
}

function parseUpdateCartItemQuantity(quantity: number, now: Date): Partial<NewCartItem> {
	const result = updateCartItemSchema.safeParse({ quantity });

	if (!result.success) {
		throw new CartError('Invalid cart item quantity.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		quantity: result.data.quantity,
		updatedAt: now
	};
}

function cartListConditions(options: ListCartsOptions, now: Date): SQL[] {
	const conditions: SQL[] = [];

	if (options.ownerType === 'user') conditions.push(isNotNull(cartTable.userId));
	if (options.ownerType === 'guest') conditions.push(isNotNull(cartTable.sessionToken));
	if (options.userId) conditions.push(eq(cartTable.userId, normalizeId(options.userId, 'userId')));

	const status = options.status || 'all';
	if (status === 'active') {
		conditions.push(or(isNull(cartTable.expiresAt), gt(cartTable.expiresAt, now)) as SQL);
	} else if (status === 'expired') {
		conditions.push(and(isNotNull(cartTable.expiresAt), lte(cartTable.expiresAt, now)) as SQL);
	} else if (status === 'empty') {
		const db = getDb();
		const emptySubquery = db.select({ cartId: cartItemTable.cartId }).from(cartItemTable);
		conditions.push(notInArray(cartTable.id, emptySubquery));
	} else if (status === 'non-empty') {
		const db = getDb();
		const emptySubquery = db.select({ cartId: cartItemTable.cartId }).from(cartItemTable);
		conditions.push(inArray(cartTable.id, emptySubquery));
	} else if (!options.includeExpired) {
		conditions.push(or(isNull(cartTable.expiresAt), gt(cartTable.expiresAt, now)) as SQL);
	}

	return conditions;
}

function cartOwnerPredicate(owner: CartOwner): SQL {
	if (owner.type === 'user') {
		return and(eq(cartTable.userId, owner.userId), isNull(cartTable.sessionToken)) as SQL;
	}

	return and(eq(cartTable.sessionToken, owner.sessionToken), isNull(cartTable.userId)) as SQL;
}

function checkoutBlockingReasons(cart: CartDTO): string[] {
	const reasons: string[] = [];

	if (cart.items.length === 0) reasons.push('Cart is empty.');
	if (cart.hasUnavailableItems) reasons.push('One or more cart items are unavailable.');

	return reasons;
}

function resolveCartOwner(
	ctx: ServiceContext,
	input: CartAccessInput,
	options: { required: true }
): CartOwner;
function resolveCartOwner(
	ctx: ServiceContext,
	input: CartAccessInput,
	options: { required: false }
): CartOwner | null;
function resolveCartOwner(
	ctx: ServiceContext,
	input: CartAccessInput,
	options: { required: boolean }
): CartOwner | null {
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
		throw new CartError('Cart owner is required.', ErrorCode.VALIDATION_ERROR);
	}

	return null;
}

function requireAccountActor(ctx: ServiceContext): ServiceActor {
	const actor = requireActor(ctx.actor);

	if (isSystemActor(actor)) {
		throw new CartError('A user account is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	return actor;
}

function isSystemActor(actor: ServiceActor | SystemActor | null | undefined): actor is SystemActor {
	return Boolean(actor?.id.startsWith('system:'));
}

function isCartExpired(row: Cart, now: Date): boolean {
	return row.expiresAt !== null && row.expiresAt <= now;
}

function normalizeCartItemQuantity(value: number, field: string): number {
	validateCartItemQuantity(value, field);
	return value;
}

function validateCartItemQuantity(value: number, field: string): void {
	if (!Number.isInteger(value) || value < 1 || value > MAX_CART_ITEM_QUANTITY) {
		throw new CartError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new CartError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function normalizeSessionToken(value: string): string {
	return normalizeId(value, 'sessionToken');
}

function resolveCartImageUrl(images: ProductImage[], variantId: string): string | null {
	const variantPrimary = images.find((image) => image.variantId === variantId && image.isPrimary);
	if (variantPrimary) return mediaUrl(variantPrimary.r2Key);

	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return mediaUrl(productPrimary.r2Key);

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return mediaUrl(anyPrimary.r2Key);

	const variantImage = images.find((image) => image.variantId === variantId);
	if (variantImage) return mediaUrl(variantImage.r2Key);

	const firstImage = images[0];
	return firstImage ? mediaUrl(firstImage.r2Key) : null;
}

function resolveCartImageR2Key(images: ProductImage[], variantId: string): string | null {
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

function groupByCartId<T extends { cartId: string }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const row of rows) {
		const current = groups.get(row.cartId) ?? [];
		current.push(row);
		groups.set(row.cartId, current);
	}

	return groups;
}

function mapCartMergeError(error: unknown): never {
	if (isAppError(error)) throw error;

	try {
		throw mapCartPersistenceError(error);
	} catch (mappedError) {
		if (isAppError(mappedError)) {
			throw new CartError('Cart migration failed.', ErrorCode.CART_MIGRATION_FAILED, {
				cause: mappedError.message
			});
		}

		throw mappedError;
	}
}

function mapCartPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new CartError('Cart item already exists.', ErrorCode.CART_ITEM_ALREADY_EXISTS);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new CartError('Related cart record not found.', ErrorCode.NOT_FOUND);
	}

	if (isCheckConstraintError(message)) {
		throw new CartError('Invalid cart data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}

export async function deleteCart(
	ctx: ServiceContext,
	input: { cartId: string; now?: Date }
): Promise<{ itemCount: number; releasedQuantity: number }> {
	requireAdmin(ctx.actor);

	const cartId = normalizeId(input.cartId, 'cartId');
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction(async (tx) => {
			return deleteCartByIdTx(tx, cartId, now);
		});
	} catch (error) {
		throw mapCartPersistenceError(error);
	}
}

export async function getCartSummary(
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
}> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx, input.now);
	const db = getDb();

	const [[totalRow], [activeRow], [guestRow], [userRow], [itemStats]] = await Promise.all([
		db.select({ count: count() }).from(cartTable),
		db
			.select({ count: count() })
			.from(cartTable)
			.where(or(isNull(cartTable.expiresAt), gt(cartTable.expiresAt, now))),
		db.select({ count: count() }).from(cartTable).where(isNotNull(cartTable.sessionToken)),
		db.select({ count: count() }).from(cartTable).where(isNotNull(cartTable.userId)),
		db
			.select({
				totalQuantity: sum(cartItemTable.quantity),
				totalValue: sum(sql`${cartItemTable.quantity} * ${cartItemTable.unitPrice}`)
			})
			.from(cartItemTable)
	]);

	return {
		total: Number(totalRow?.count ?? 0),
		active: Number(activeRow?.count ?? 0),
		expired: Math.max(0, Number(totalRow?.count ?? 0) - Number(activeRow?.count ?? 0)),
		guest: Number(guestRow?.count ?? 0),
		user: Number(userRow?.count ?? 0),
		totalSubtotal: Number(itemStats?.totalValue ?? 0),
		totalItems: Number(itemStats?.totalQuantity ?? 0)
	};
}
