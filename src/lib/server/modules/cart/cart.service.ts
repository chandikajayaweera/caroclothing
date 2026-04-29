import { and, asc, desc, eq, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { CartError, ErrorCode, InventoryError, ProductError } from '$lib/server/modules/errors';
import { inventory, inventoryMovement } from '$lib/server/modules/inventory/inventory.drizzle';
import {
	product,
	productVariant,
	type Product,
	type ProductVariant
} from '$lib/server/modules/products/products.drizzle';
import { validatePromoCode } from '$lib/server/modules/promotions/code.service';
import { promoCode } from '$lib/server/modules/promotions/promotions.drizzle';
import {
	cart,
	cartItem,
	insertCartItemSchema,
	insertCartSchema,
	updateCartItemSchema,
	updateCartSchema,
	type Cart,
	type CartItem
} from './cart.drizzle';
import {
	assertCartPermission,
	assertNonEmptyUpdate,
	cartItemNotFound,
	cartNotFound,
	emptyCart,
	isAdmin,
	normalizeLimit,
	normalizeOffset,
	parseCartInput,
	roundMoney,
	wrapCartPersistenceError,
	type CartAccessContext,
	type CartServiceActor
} from './service-utils';

const GUEST_CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CART_ITEM_QUANTITY = 10;

const createCartInputSchema = insertCartSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateCartInputSchema = updateCartSchema.omit({
	id: true,
	userId: true,
	sessionToken: true,
	createdAt: true,
	updatedAt: true
});

const addCartItemInputSchema = insertCartItemSchema
	.omit({
		id: true,
		cartId: true,
		productId: true,
		unitPrice: true,
		addedAt: true,
		updatedAt: true
	})
	.extend({
		quantity: z.number().int().min(1).max(MAX_CART_ITEM_QUANTITY).optional()
	});

const updateCartItemQuantityInputSchema = updateCartItemSchema
	.pick({
		quantity: true
	})
	.required();

const applyPromoCodeInputSchema = z.object({
	code: z.string().min(1)
});

export type CreateCartInput = z.infer<typeof createCartInputSchema>;
export type UpdateCartInput = z.infer<typeof updateCartInputSchema>;
export type AddCartItemInput = z.infer<typeof addCartItemInputSchema>;
export type UpdateCartItemQuantityInput = z.infer<typeof updateCartItemQuantityInputSchema>;
export type ApplyPromoCodeInput = z.infer<typeof applyPromoCodeInputSchema>;

export type CartMutationOptions = CartAccessContext;

export type ListCartsOptions = {
	actor: CartServiceActor;
	includeExpired?: boolean;
	userId?: string | null;
	sessionToken?: string;
	limit?: number;
	offset?: number;
};

export type CartDetails = Cart & {
	items: Array<
		CartItem & {
			product: Product;
			variant: ProductVariant;
			lineTotal: number;
			liveUnitPrice: number;
			hasPriceChanged: boolean;
		}
	>;
	promoCode: typeof promoCode.$inferSelect | null;
	subtotal: number;
	total: number;
	itemCount: number;
};

export async function listCarts(options: ListCartsOptions): Promise<Cart[]> {
	assertCartPermission(options.actor, 'read');

	const filters = buildCartFilters(options);

	return getDb()
		.select()
		.from(cart)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(cart.updatedAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getCartById(id: string, options: CartMutationOptions): Promise<Cart> {
	const row = await findCartById(id);
	if (!row) cartNotFound({ id });
	assertCanAccessCart(row, options, 'read');
	return row;
}

export async function getCartByUserId(
	userId: string,
	options: { actor: CartServiceActor }
): Promise<Cart> {
	assertCanAccessUserCart(userId, options.actor, 'read');

	const [row] = await getDb().select().from(cart).where(eq(cart.userId, userId)).limit(1);
	if (!row) cartNotFound({ userId });
	return row;
}

export async function getCartBySessionToken(sessionToken: string): Promise<Cart> {
	const [row] = await getDb()
		.select()
		.from(cart)
		.where(eq(cart.sessionToken, sessionToken))
		.limit(1);

	if (!row) cartNotFound({ sessionToken });
	return row;
}

export async function getOrCreateUserCart(actor: CartServiceActor): Promise<Cart> {
	assertCartPermission(actor, 'create');

	const [existing] = await getDb().select().from(cart).where(eq(cart.userId, actor.id)).limit(1);
	if (existing) return existing;

	const [created] = await getDb()
		.insert(cart)
		.values({ userId: actor.id, sessionToken: null, expiresAt: null })
		.returning();

	return created;
}

export async function getOrCreateGuestCart(sessionToken: string): Promise<Cart> {
	const parsed = parseCartInput(
		createCartInputSchema.pick({ sessionToken: true }),
		{ sessionToken },
		'guest cart'
	);

	const [existing] = await getDb()
		.select()
		.from(cart)
		.where(eq(cart.sessionToken, parsed.sessionToken!))
		.limit(1);

	if (existing) return refreshGuestCartExpiry(existing.id);

	const [created] = await getDb()
		.insert(cart)
		.values({
			sessionToken: parsed.sessionToken,
			expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS)
		})
		.returning();

	return created;
}

export async function getCartDetails(
	id: string,
	options: CartMutationOptions
): Promise<CartDetails> {
	const targetCart = await getCartById(id, options);
	return buildCartDetails(targetCart);
}

export async function updateCart(
	id: string,
	input: UpdateCartInput,
	options: CartMutationOptions
): Promise<Cart> {
	const targetCart = await getCartById(id, options);
	assertCanAccessCart(targetCart, options, 'update');

	const parsed = parseCartInput(updateCartInputSchema, input, 'cart');
	assertNonEmptyUpdate(parsed, 'cart');

	const [updated] = await getDb().update(cart).set(parsed).where(eq(cart.id, id)).returning();
	return updated ?? targetCart;
}

export async function deleteCart(id: string, options: CartMutationOptions): Promise<Cart> {
	const targetCart = await getCartById(id, options);
	assertCanAccessCart(targetCart, options, 'delete');

	await releaseAllCartReservations(id);
	const [deleted] = await getDb().delete(cart).where(eq(cart.id, id)).returning();
	return deleted ?? targetCart;
}

export async function addCartItem(
	cartId: string,
	input: AddCartItemInput,
	options: CartMutationOptions
): Promise<CartItem> {
	const targetCart = await getCartById(cartId, options);
	assertCanAccessCart(targetCart, options, 'update');

	const parsed = parseCartInput(addCartItemInputSchema, input, 'cart item');
	const quantityToAdd = parsed.quantity ?? 1;
	const pricedVariant = await getPricedVariant(parsed.variantId);

	let changedItem: CartItem;
	let reservedQuantity = 0;

	try {
		changedItem = await getDb().transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(cartItem)
				.where(and(eq(cartItem.cartId, cartId), eq(cartItem.variantId, parsed.variantId)))
				.limit(1);

			const nextQuantity = existing ? existing.quantity + quantityToAdd : quantityToAdd;
			assertCartQuantity(nextQuantity);

			reservedQuantity = await reserveInventory(
				parsed.variantId,
				quantityToAdd,
				existing?.id ?? null
			);

			if (existing) {
				const [updated] = await tx
					.update(cartItem)
					.set({ quantity: nextQuantity })
					.where(eq(cartItem.id, existing.id))
					.returning();

				return updated;
			}

			const [created] = await tx
				.insert(cartItem)
				.values({
					cartId,
					variantId: parsed.variantId,
					productId: pricedVariant.product.id,
					quantity: quantityToAdd,
					unitPrice: pricedVariant.unitPrice
				})
				.returning();

			return created;
		});
	} catch (error) {
		if (reservedQuantity > 0) {
			await releaseInventory(parsed.variantId, reservedQuantity, null);
		}
		wrapCartPersistenceError(error, 'Cart item already exists.');
	}

	await refreshCartPromotion(cartId);
	return changedItem;
}

export async function addItemToUserCart(
	input: AddCartItemInput,
	options: { actor: CartServiceActor }
): Promise<CartItem> {
	const userCart = await getOrCreateUserCart(options.actor);
	return addCartItem(userCart.id, input, { actor: options.actor });
}

export async function addItemToGuestCart(
	sessionToken: string,
	input: AddCartItemInput
): Promise<CartItem> {
	const guestCart = await getOrCreateGuestCart(sessionToken);
	return addCartItem(guestCart.id, input, { sessionToken });
}

export async function updateCartItemQuantity(
	id: string,
	input: UpdateCartItemQuantityInput,
	options: CartMutationOptions
): Promise<CartItem> {
	const existing = await getCartItemById(id, options);
	const parsed = parseCartInput(updateCartItemQuantityInputSchema, input, 'cart item');
	const quantityDelta = parsed.quantity - existing.quantity;

	let reservedQuantity = 0;
	if (quantityDelta > 0)
		reservedQuantity = await reserveInventory(existing.variantId, quantityDelta, existing.id);
	if (quantityDelta < 0)
		await releaseInventory(existing.variantId, Math.abs(quantityDelta), existing.id);

	let updated: CartItem | undefined;
	try {
		[updated] = await getDb()
			.update(cartItem)
			.set({ quantity: parsed.quantity })
			.where(eq(cartItem.id, id))
			.returning();
	} catch (error) {
		if (reservedQuantity > 0) {
			await releaseInventory(existing.variantId, reservedQuantity, existing.id);
		}
		throw error;
	}

	if (!updated) cartItemNotFound({ id });
	await refreshCartPromotion(existing.cartId);
	return updated;
}

export async function removeCartItem(id: string, options: CartMutationOptions): Promise<CartItem> {
	const existing = await getCartItemById(id, options);
	await releaseInventory(existing.variantId, existing.quantity, existing.id);

	const [deleted] = await getDb().delete(cartItem).where(eq(cartItem.id, id)).returning();
	if (!deleted) cartItemNotFound({ id });

	await refreshCartPromotion(existing.cartId);
	return deleted;
}

export async function clearCart(id: string, options: CartMutationOptions): Promise<Cart> {
	const targetCart = await getCartById(id, options);
	assertCanAccessCart(targetCart, options, 'delete');

	await releaseAllCartReservations(id);
	await getDb().delete(cartItem).where(eq(cartItem.cartId, id));

	const [updated] = await getDb()
		.update(cart)
		.set({ promoCodeId: null, discountAmount: 0 })
		.where(eq(cart.id, id))
		.returning();

	return updated ?? targetCart;
}

export async function getCartItemById(id: string, options: CartMutationOptions): Promise<CartItem> {
	const [row] = await getDb().select().from(cartItem).where(eq(cartItem.id, id)).limit(1);
	if (!row) cartItemNotFound({ id });

	await getCartById(row.cartId, options);
	return row;
}

export async function applyPromoCodeToCart(
	id: string,
	input: ApplyPromoCodeInput,
	options: CartMutationOptions
): Promise<Cart> {
	const targetCart = await getCartById(id, options);
	assertCanAccessCart(targetCart, options, 'update');

	const parsed = parseCartInput(applyPromoCodeInputSchema, input, 'promo code');
	const subtotal = await getCartSubtotal(id);
	if (subtotal <= 0) emptyCart({ cartId: id });

	const validation = await validatePromoCode({
		code: parsed.code,
		subtotal,
		userId: targetCart.userId
	});

	const [updated] = await getDb()
		.update(cart)
		.set({
			promoCodeId: validation.promoCode.id,
			discountAmount: validation.discountAmount
		})
		.where(eq(cart.id, id))
		.returning();

	return updated ?? targetCart;
}

export async function removePromoCodeFromCart(
	id: string,
	options: CartMutationOptions
): Promise<Cart> {
	const targetCart = await getCartById(id, options);
	assertCanAccessCart(targetCart, options, 'update');

	const [updated] = await getDb()
		.update(cart)
		.set({ promoCodeId: null, discountAmount: 0 })
		.where(eq(cart.id, id))
		.returning();

	return updated ?? targetCart;
}

export async function refreshCartPromotion(id: string): Promise<Cart> {
	const targetCart = await findCartById(id);
	if (!targetCart) cartNotFound({ id });
	if (!targetCart.promoCodeId) return targetCart;

	const [code] = await getDb()
		.select()
		.from(promoCode)
		.where(eq(promoCode.id, targetCart.promoCodeId))
		.limit(1);

	if (!code) return removePromoSilently(id, targetCart);

	const subtotal = await getCartSubtotal(id);

	try {
		const validation = await validatePromoCode({
			code: code.code,
			subtotal,
			userId: targetCart.userId
		});

		const [updated] = await getDb()
			.update(cart)
			.set({ discountAmount: validation.discountAmount })
			.where(eq(cart.id, id))
			.returning();

		return updated ?? targetCart;
	} catch {
		return removePromoSilently(id, targetCart);
	}
}

export async function mergeGuestCartIntoUserCart(
	sessionToken: string,
	options: { actor: CartServiceActor }
): Promise<Cart> {
	assertCartPermission(options.actor, 'update');

	const [guestCart] = await getDb()
		.select()
		.from(cart)
		.where(eq(cart.sessionToken, sessionToken))
		.limit(1);

	if (!guestCart) return getOrCreateUserCart(options.actor);

	const userCart = await getOrCreateUserCart(options.actor);
	const reservationReleases: Array<{ variantId: string; quantity: number; referenceId: string }> =
		[];

	await getDb().transaction(async (tx) => {
		const guestItems = await tx.select().from(cartItem).where(eq(cartItem.cartId, guestCart.id));

		for (const guestItem of guestItems) {
			const [existing] = await tx
				.select()
				.from(cartItem)
				.where(and(eq(cartItem.cartId, userCart.id), eq(cartItem.variantId, guestItem.variantId)))
				.limit(1);

			if (existing) {
				const capacity = Math.max(MAX_CART_ITEM_QUANTITY - existing.quantity, 0);
				const movedQuantity = Math.min(guestItem.quantity, capacity);
				const excessQuantity = guestItem.quantity - movedQuantity;

				await tx
					.update(cartItem)
					.set({
						quantity: existing.quantity + movedQuantity
					})
					.where(eq(cartItem.id, existing.id));
				await tx.delete(cartItem).where(eq(cartItem.id, guestItem.id));

				if (excessQuantity > 0) {
					reservationReleases.push({
						variantId: guestItem.variantId,
						quantity: excessQuantity,
						referenceId: guestItem.id
					});
				}
			} else {
				await tx.update(cartItem).set({ cartId: userCart.id }).where(eq(cartItem.id, guestItem.id));
			}
		}

		await tx.delete(cart).where(eq(cart.id, guestCart.id));
	});

	await Promise.all(
		reservationReleases.map((release) =>
			releaseInventory(release.variantId, release.quantity, release.referenceId)
		)
	);

	await refreshCartPromotion(userCart.id);
	return getCartById(userCart.id, { actor: options.actor });
}

export async function mergeUserCartIntoUserCart(
	sourceUserId: string,
	options: { actor: CartServiceActor; targetUserId?: string }
): Promise<Cart> {
	assertCartPermission(options.actor, 'update');

	const targetUserId = options.targetUserId ?? options.actor.id;
	assertCanAccessUserCart(targetUserId, options.actor, 'update');
	if (sourceUserId === targetUserId)
		return getOrCreateUserCart({ ...options.actor, id: targetUserId });

	const [targetCart] = await getDb()
		.select()
		.from(cart)
		.where(eq(cart.userId, targetUserId))
		.limit(1);
	const sourceCarts = await getDb().select().from(cart).where(eq(cart.userId, sourceUserId));

	if (sourceCarts.length === 0) return getOrCreateUserCart({ ...options.actor, id: targetUserId });

	let targetCartId = targetCart?.id;
	const reservationReleases: Array<{ variantId: string; quantity: number; referenceId: string }> =
		[];

	await getDb().transaction(async (tx) => {
		for (const sourceCart of sourceCarts) {
			if (!targetCartId) {
				await tx
					.update(cart)
					.set({
						userId: targetUserId,
						sessionToken: null,
						expiresAt: null
					})
					.where(eq(cart.id, sourceCart.id));

				targetCartId = sourceCart.id;
				continue;
			}

			const sourceItems = await tx
				.select()
				.from(cartItem)
				.where(eq(cartItem.cartId, sourceCart.id));

			for (const sourceItem of sourceItems) {
				const [existingTargetItem] = await tx
					.select()
					.from(cartItem)
					.where(
						and(eq(cartItem.cartId, targetCartId), eq(cartItem.variantId, sourceItem.variantId))
					)
					.limit(1);

				if (existingTargetItem) {
					const nextQuantity = Math.min(
						existingTargetItem.quantity + sourceItem.quantity,
						MAX_CART_ITEM_QUANTITY
					);
					const movedQuantity = nextQuantity - existingTargetItem.quantity;
					const excessQuantity = sourceItem.quantity - movedQuantity;

					await tx
						.update(cartItem)
						.set({ quantity: nextQuantity })
						.where(eq(cartItem.id, existingTargetItem.id));
					await tx.delete(cartItem).where(eq(cartItem.id, sourceItem.id));

					if (excessQuantity > 0) {
						reservationReleases.push({
							variantId: sourceItem.variantId,
							quantity: excessQuantity,
							referenceId: sourceItem.id
						});
					}
					continue;
				}

				await tx
					.update(cartItem)
					.set({ cartId: targetCartId })
					.where(eq(cartItem.id, sourceItem.id));
			}

			await tx.delete(cart).where(eq(cart.id, sourceCart.id));
		}
	});

	await Promise.all(
		reservationReleases.map((release) =>
			releaseInventory(release.variantId, release.quantity, release.referenceId)
		)
	);

	await refreshCartPromotion(targetCartId);
	return getCartById(targetCartId, { actor: { ...options.actor, id: targetUserId } });
}

export async function deleteExpiredGuestCarts(now = new Date()): Promise<Cart[]> {
	const expiredCarts = await getDb()
		.select()
		.from(cart)
		.where(and(isNotNull(cart.expiresAt), lt(cart.expiresAt, now)));

	for (const expiredCart of expiredCarts) {
		await releaseAllCartReservations(expiredCart.id);
	}

	const deleted = await getDb()
		.delete(cart)
		.where(and(isNotNull(cart.expiresAt), lt(cart.expiresAt, now)))
		.returning();

	return deleted;
}

export async function getCartSubtotal(id: string): Promise<number> {
	const items = await getDb().select().from(cartItem).where(eq(cartItem.cartId, id));
	return roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
}

async function buildCartDetails(targetCart: Cart): Promise<CartDetails> {
	const items = await getDb().select().from(cartItem).where(eq(cartItem.cartId, targetCart.id));
	const detailedItems = await Promise.all(items.map(toDetailedCartItem));
	const presentItems = detailedItems.filter(
		(item): item is NonNullable<typeof item> => item !== null
	);
	const subtotal = roundMoney(presentItems.reduce((sum, item) => sum + item.lineTotal, 0));
	const discountAmount = Math.min(targetCart.discountAmount, subtotal);
	const promo = targetCart.promoCodeId
		? ((
				await getDb()
					.select()
					.from(promoCode)
					.where(eq(promoCode.id, targetCart.promoCodeId))
					.limit(1)
			)[0] ?? null)
		: null;

	return {
		...targetCart,
		items: presentItems,
		promoCode: promo,
		subtotal,
		total: roundMoney(Math.max(subtotal - discountAmount, 0)),
		itemCount: presentItems.reduce((sum, item) => sum + item.quantity, 0)
	};
}

async function toDetailedCartItem(item: CartItem): Promise<CartDetails['items'][number] | null> {
	const pricedVariant = await getPricedVariant(item.variantId, { requireActive: false });
	if (!pricedVariant) return null;

	const liveUnitPrice = pricedVariant.unitPrice;
	return {
		...item,
		product: pricedVariant.product,
		variant: pricedVariant.variant,
		lineTotal: roundMoney(item.unitPrice * item.quantity),
		liveUnitPrice,
		hasPriceChanged: liveUnitPrice !== item.unitPrice
	};
}

async function getPricedVariant(
	variantId: string,
	options: { requireActive?: boolean } = {}
): Promise<{ product: Product; variant: ProductVariant; unitPrice: number }> {
	const requireActive = options.requireActive !== false;
	const [row] = await getDb()
		.select({
			variant: productVariant,
			product
		})
		.from(productVariant)
		.innerJoin(product, eq(productVariant.productId, product.id))
		.where(eq(productVariant.id, variantId))
		.limit(1);

	if (!row) {
		throw new ProductError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			variantId
		});
	}

	if (requireActive && (!row.variant.isActive || !row.product.isActive)) {
		throw new ProductError('Product variant is unavailable.', ErrorCode.VARIANT_UNAVAILABLE, {
			variantId
		});
	}

	return {
		product: row.product,
		variant: row.variant,
		unitPrice: row.variant.priceOverride ?? row.product.basePrice
	};
}

async function reserveInventory(
	variantId: string,
	quantity: number,
	referenceId: string | null
): Promise<number> {
	if (quantity <= 0) return 0;

	const [row] = await getDb()
		.select()
		.from(inventory)
		.where(eq(inventory.variantId, variantId))
		.limit(1);
	if (!row || !row.trackInventory) return 0;

	const availableQuantity = row.quantity - row.reservedQuantity;
	if (availableQuantity < quantity) {
		if (row.allowBackorder && row.quantity === 0) return 0;

		throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, {
			variantId,
			requestedQuantity: quantity,
			availableQuantity
		});
	}

	await getDb()
		.update(inventory)
		.set({ reservedQuantity: row.reservedQuantity + quantity })
		.where(eq(inventory.id, row.id));

	await getDb().insert(inventoryMovement).values({
		variantId,
		type: 'reserved',
		quantityDelta: -quantity,
		quantityAfter: row.quantity,
		referenceId,
		note: 'Reserved by cart'
	});

	return quantity;
}

async function releaseInventory(variantId: string, quantity: number, referenceId: string | null) {
	if (quantity <= 0) return;

	const [row] = await getDb()
		.select()
		.from(inventory)
		.where(eq(inventory.variantId, variantId))
		.limit(1);
	if (!row || !row.trackInventory) return;

	const releasedQuantity = Math.min(quantity, row.reservedQuantity);
	if (releasedQuantity <= 0) return;

	await getDb()
		.update(inventory)
		.set({ reservedQuantity: row.reservedQuantity - releasedQuantity })
		.where(eq(inventory.id, row.id));

	await getDb().insert(inventoryMovement).values({
		variantId,
		type: 'released',
		quantityDelta: releasedQuantity,
		quantityAfter: row.quantity,
		referenceId,
		note: 'Released from cart'
	});
}

async function releaseAllCartReservations(cartId: string) {
	const items = await getDb().select().from(cartItem).where(eq(cartItem.cartId, cartId));
	await Promise.all(items.map((item) => releaseInventory(item.variantId, item.quantity, item.id)));
}

async function findCartById(id: string): Promise<Cart | null> {
	const [row] = await getDb().select().from(cart).where(eq(cart.id, id)).limit(1);
	return row ?? null;
}

async function refreshGuestCartExpiry(id: string): Promise<Cart> {
	const [updated] = await getDb()
		.update(cart)
		.set({ expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS) })
		.where(eq(cart.id, id))
		.returning();

	if (!updated) cartNotFound({ id });
	return updated;
}

async function removePromoSilently(id: string, fallback: Cart): Promise<Cart> {
	const [updated] = await getDb()
		.update(cart)
		.set({ promoCodeId: null, discountAmount: 0 })
		.where(eq(cart.id, id))
		.returning();

	return updated ?? fallback;
}

function buildCartFilters(options: ListCartsOptions): SQL[] {
	const filters: SQL[] = [];

	if (!isAdmin(options.actor)) filters.push(eq(cart.userId, options.actor.id));
	if (isAdmin(options.actor) && options.userId) filters.push(eq(cart.userId, options.userId));
	if (isAdmin(options.actor) && options.userId === null) filters.push(sql`${cart.userId} IS NULL`);
	if (isAdmin(options.actor) && options.sessionToken) {
		filters.push(eq(cart.sessionToken, options.sessionToken));
	}
	if (!isAdmin(options.actor) && options.userId && options.userId !== options.actor.id) {
		throw new CartError(
			'You do not have permission to access this cart.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			{ userId: options.userId, action: 'read' }
		);
	}
	if (!options.includeExpired) {
		filters.push(sql`${cart.expiresAt} IS NULL OR ${cart.expiresAt} > ${new Date()}`);
	}

	return filters;
}

function assertCanAccessUserCart(
	userId: string,
	actor: CartServiceActor,
	action: 'read' | 'update' | 'delete'
) {
	assertCartPermission(actor, action);
	if (isAdmin(actor) || actor.id === userId) return;

	throw new CartError(
		'You do not have permission to access this cart.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			userId,
			action
		}
	);
}

function assertCanAccessCart(
	targetCart: Cart,
	options: CartMutationOptions,
	action: 'read' | 'update' | 'delete'
) {
	if (options.actor) {
		assertCartPermission(options.actor, action);
		if (isAdmin(options.actor)) return;
		if (targetCart.userId && targetCart.userId === options.actor.id) return;
	}

	if (options.sessionToken && targetCart.sessionToken === options.sessionToken) return;

	throw new CartError(
		'You do not have permission to access this cart.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			cartId: targetCart.id,
			action
		}
	);
}

function assertCartQuantity(quantity: number): void {
	if (quantity >= 1 && quantity <= MAX_CART_ITEM_QUANTITY) return;

	throw new CartError(
		`Cart item quantity must be between 1 and ${MAX_CART_ITEM_QUANTITY}.`,
		ErrorCode.VALIDATION_ERROR,
		{ quantity }
	);
}
