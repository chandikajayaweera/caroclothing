import { and, desc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import { getDb } from '$lib/server/db';
import {
	AuthError,
	ErrorCode,
	WishlistError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';
import {
	product,
	productVariant,
	type Product,
	type ProductVariant
} from '$lib/server/modules/products/products.drizzle';
import { insertWishlistItemSchema, wishlistItem, type WishlistItem } from './wishlist.drizzle';

const NO_VARIANT_SENTINEL = '';

export type WishlistServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

const createWishlistItemInputSchema = insertWishlistItemSchema.omit({
	id: true,
	addedAt: true
});

const addWishlistItemInputSchema = createWishlistItemInputSchema.omit({
	userId: true
});

const updateWishlistItemVariantInputSchema = z.object({
	variantId: z.string().optional().nullable()
});

export type CreateWishlistItemInput = z.infer<typeof createWishlistItemInputSchema>;
export type AddWishlistItemInput = z.infer<typeof addWishlistItemInputSchema>;
export type UpdateWishlistItemVariantInput = z.infer<typeof updateWishlistItemVariantInputSchema>;

export type WishlistItemDetails = WishlistItem & {
	product: Product;
	variant: ProductVariant | null;
};

export type ListWishlistItemsOptions = {
	actor: WishlistServiceActor;
	userId?: string;
	productId?: string;
	limit?: number;
	offset?: number;
};

export type WishlistMutationOptions = {
	actor: WishlistServiceActor;
};

export async function listWishlistItems(
	options: ListWishlistItemsOptions
): Promise<WishlistItem[]> {
	assertWishlistPermission(options.actor, 'read');
	const userId = resolveReadableUserId(options.actor, options.userId);
	const filters = buildWishlistFilters({ userId, productId: options.productId });

	return getDb()
		.select()
		.from(wishlistItem)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(wishlistItem.addedAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function listWishlistItemDetails(
	options: ListWishlistItemsOptions
): Promise<WishlistItemDetails[]> {
	const rows = await listWishlistItems(options);
	const details = await Promise.all(rows.map((row) => toWishlistItemDetails(row)));
	return details.filter((row): row is WishlistItemDetails => row !== null);
}

export async function getWishlistItemById(
	id: string,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'read');

	const row = await findWishlistItemById(id);
	if (!row) wishlistItemNotFound({ id });

	assertCanAccessWishlistUser(options.actor, row.userId, 'read');
	return row;
}

export async function getWishlistItem(
	input: AddWishlistItemInput,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'read');
	const parsed = parseWishlistInput(addWishlistItemInputSchema, input, 'wishlist item');
	const variantId = normalizeVariantId(parsed.variantId);

	const [row] = await getDb()
		.select()
		.from(wishlistItem)
		.where(
			and(
				eq(wishlistItem.userId, options.actor.id),
				eq(wishlistItem.productId, parsed.productId),
				eq(wishlistItem.variantId, variantId)
			)
		)
		.limit(1);

	if (!row) wishlistItemNotFound({ productId: parsed.productId, variantId });
	return row;
}

export async function addWishlistItem(
	input: AddWishlistItemInput,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'create');

	const parsed = parseWishlistInput(addWishlistItemInputSchema, input, 'wishlist item');
	const variantId = normalizeVariantId(parsed.variantId);
	await assertProductWishlistable(parsed.productId);
	await assertVariantBelongsToProduct(parsed.productId, variantId);

	try {
		const [created] = await getDb()
			.insert(wishlistItem)
			.values({
				userId: options.actor.id,
				productId: parsed.productId,
				variantId
			})
			.returning();

		return created;
	} catch (error) {
		wrapWishlistPersistenceError(error, 'Wishlist item already exists.');
	}
}

export async function createWishlistItemForUser(
	input: CreateWishlistItemInput,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'create');

	const parsed = parseWishlistInput(createWishlistItemInputSchema, input, 'wishlist item');
	assertCanAccessWishlistUser(options.actor, parsed.userId, 'create');

	const variantId = normalizeVariantId(parsed.variantId);
	await assertProductWishlistable(parsed.productId);
	await assertVariantBelongsToProduct(parsed.productId, variantId);

	try {
		const [created] = await getDb()
			.insert(wishlistItem)
			.values({
				userId: parsed.userId,
				productId: parsed.productId,
				variantId
			})
			.returning();

		return created;
	} catch (error) {
		wrapWishlistPersistenceError(error, 'Wishlist item already exists.');
	}
}

export async function toggleWishlistItem(
	input: AddWishlistItemInput,
	options: WishlistMutationOptions
): Promise<{ action: 'added' | 'removed'; item: WishlistItem }> {
	assertWishlistPermission(options.actor, 'update');

	const parsed = parseWishlistInput(addWishlistItemInputSchema, input, 'wishlist item');
	const variantId = normalizeVariantId(parsed.variantId);

	const [existing] = await getDb()
		.select()
		.from(wishlistItem)
		.where(
			and(
				eq(wishlistItem.userId, options.actor.id),
				eq(wishlistItem.productId, parsed.productId),
				eq(wishlistItem.variantId, variantId)
			)
		)
		.limit(1);

	if (existing) {
		const item = await deleteWishlistItem(existing.id, options);
		return { action: 'removed', item };
	}

	const item = await addWishlistItem(parsed, options);
	return { action: 'added', item };
}

export async function updateWishlistItemVariant(
	id: string,
	input: UpdateWishlistItemVariantInput,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'update');

	const existing = await getWishlistItemById(id, options);
	const parsed = parseWishlistInput(updateWishlistItemVariantInputSchema, input, 'wishlist item');
	const variantId = normalizeVariantId(parsed.variantId);
	await assertVariantBelongsToProduct(existing.productId, variantId);

	try {
		const [updated] = await getDb()
			.update(wishlistItem)
			.set({ variantId })
			.where(eq(wishlistItem.id, id))
			.returning();

		if (!updated) wishlistItemNotFound({ id });
		return updated;
	} catch (error) {
		wrapWishlistPersistenceError(error, 'Wishlist item already exists.');
	}
}

export async function deleteWishlistItem(
	id: string,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'delete');

	const existing = await getWishlistItemById(id, options);
	const [deleted] = await getDb().delete(wishlistItem).where(eq(wishlistItem.id, id)).returning();
	return deleted ?? existing;
}

export async function removeWishlistItem(
	input: AddWishlistItemInput,
	options: WishlistMutationOptions
): Promise<WishlistItem> {
	assertWishlistPermission(options.actor, 'delete');

	const existing = await getWishlistItem(input, options);
	const [deleted] = await getDb()
		.delete(wishlistItem)
		.where(eq(wishlistItem.id, existing.id))
		.returning();

	return deleted ?? existing;
}

export async function clearWishlist(
	userId: string,
	options: WishlistMutationOptions
): Promise<WishlistItem[]> {
	assertCanAccessWishlistUser(options.actor, userId, 'delete');

	const deleted = await getDb()
		.delete(wishlistItem)
		.where(eq(wishlistItem.userId, userId))
		.returning();
	return deleted;
}

export async function mergeWishlistIntoUser(
	sourceUserId: string,
	options: WishlistMutationOptions & { targetUserId?: string }
): Promise<WishlistItem[]> {
	const targetUserId = options.targetUserId ?? options.actor.id;
	assertCanAccessWishlistUser(options.actor, targetUserId, 'update');
	if (sourceUserId === targetUserId)
		return listWishlistItems({ actor: options.actor, userId: targetUserId });

	await getDb().transaction(async (tx) => {
		const sourceItems = await tx
			.select()
			.from(wishlistItem)
			.where(eq(wishlistItem.userId, sourceUserId));

		for (const sourceItem of sourceItems) {
			const [existingTargetItem] = await tx
				.select({ id: wishlistItem.id })
				.from(wishlistItem)
				.where(
					and(
						eq(wishlistItem.userId, targetUserId),
						eq(wishlistItem.productId, sourceItem.productId),
						eq(wishlistItem.variantId, sourceItem.variantId)
					)
				)
				.limit(1);

			if (existingTargetItem) {
				await tx.delete(wishlistItem).where(eq(wishlistItem.id, sourceItem.id));
				continue;
			}

			await tx
				.update(wishlistItem)
				.set({ userId: targetUserId })
				.where(eq(wishlistItem.id, sourceItem.id));
		}
	});

	return listWishlistItems({ actor: { ...options.actor, id: targetUserId }, userId: targetUserId });
}

export async function isProductInWishlist(
	input: AddWishlistItemInput,
	options: WishlistMutationOptions
): Promise<boolean> {
	const item = await findWishlistItemForActor(input, options);
	return Boolean(item);
}

export async function getWishlistCount(
	userId: string,
	options: WishlistMutationOptions
): Promise<number> {
	assertCanAccessWishlistUser(options.actor, userId, 'read');

	const rows = await getDb()
		.select({ id: wishlistItem.id })
		.from(wishlistItem)
		.where(eq(wishlistItem.userId, userId));

	return rows.length;
}

async function findWishlistItemForActor(
	input: AddWishlistItemInput,
	options: WishlistMutationOptions
): Promise<WishlistItem | null> {
	assertWishlistPermission(options.actor, 'read');

	const parsed = parseWishlistInput(addWishlistItemInputSchema, input, 'wishlist item');
	const variantId = normalizeVariantId(parsed.variantId);

	const [row] = await getDb()
		.select()
		.from(wishlistItem)
		.where(
			and(
				eq(wishlistItem.userId, options.actor.id),
				eq(wishlistItem.productId, parsed.productId),
				eq(wishlistItem.variantId, variantId)
			)
		)
		.limit(1);

	return row ?? null;
}

async function toWishlistItemDetails(row: WishlistItem): Promise<WishlistItemDetails | null> {
	const [productRow] = await getDb()
		.select()
		.from(product)
		.where(eq(product.id, row.productId))
		.limit(1);

	if (!productRow) return null;

	const variant = row.variantId ? await findVariantById(row.variantId) : null;

	return {
		...row,
		product: productRow,
		variant
	};
}

async function findWishlistItemById(id: string): Promise<WishlistItem | null> {
	const [row] = await getDb().select().from(wishlistItem).where(eq(wishlistItem.id, id)).limit(1);
	return row ?? null;
}

async function assertProductWishlistable(productId: string) {
	const [row] = await getDb()
		.select({ id: product.id, isActive: product.isActive })
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!row) {
		throw new WishlistError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
	}

	if (!row.isActive) {
		throw new WishlistError('Product is unavailable.', ErrorCode.PRODUCT_UNAVAILABLE, {
			productId
		});
	}
}

async function assertVariantBelongsToProduct(productId: string, variantId: string) {
	if (!variantId) return;

	const [row] = await getDb()
		.select({ id: productVariant.id, isActive: productVariant.isActive })
		.from(productVariant)
		.where(and(eq(productVariant.id, variantId), eq(productVariant.productId, productId)))
		.limit(1);

	if (!row) {
		throw new WishlistError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			productId,
			variantId
		});
	}

	if (!row.isActive) {
		throw new WishlistError('Product variant is unavailable.', ErrorCode.VARIANT_UNAVAILABLE, {
			productId,
			variantId
		});
	}
}

async function findVariantById(variantId: string): Promise<ProductVariant | null> {
	const [row] = await getDb()
		.select()
		.from(productVariant)
		.where(eq(productVariant.id, variantId))
		.limit(1);

	return row ?? null;
}

function buildWishlistFilters(input: { userId?: string; productId?: string }): SQL[] {
	const filters: SQL[] = [];
	if (input.userId) filters.push(eq(wishlistItem.userId, input.userId));
	if (input.productId) filters.push(eq(wishlistItem.productId, input.productId));
	return filters;
}

function resolveReadableUserId(
	actor: WishlistServiceActor,
	userId: string | undefined
): string | undefined {
	if (isAdmin(actor)) return userId;
	if (!userId || userId === actor.id) return actor.id;

	throw new AuthError(
		'You do not have permission to access this wishlist.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		undefined,
		{ userId, action: 'read' }
	);
}

type WishlistAction = 'create' | 'read' | 'update' | 'delete';

function assertCanAccessWishlistUser(
	actor: WishlistServiceActor,
	userId: string,
	action: WishlistAction
) {
	assertWishlistPermission(actor, action);
	if (isAdmin(actor) || actor.id === userId) return;

	throw new AuthError(
		'You do not have permission to access this wishlist.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		undefined,
		{ userId, action }
	);
}

function assertWishlistPermission(
	actor: WishlistServiceActor | null | undefined,
	action: WishlistAction
) {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ wishlist: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource: 'wishlist', action }
		);
	}
}

function getAuthorizedRole(roleId: string): {
	authorize(request: Record<string, string[]>): { success: boolean };
} {
	if (roleId === 'adminUser') return adminUser as unknown as ReturnType<typeof getAuthorizedRole>;
	if (roleId === 'customerUser')
		return customerUser as unknown as ReturnType<typeof getAuthorizedRole>;

	throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
}

function isAdmin(actor: WishlistServiceActor): boolean {
	return actor.role === 'adminUser';
}

function parseWishlistInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new WishlistError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

function normalizeVariantId(variantId: string | null | undefined): string {
	return variantId?.trim() || NO_VARIANT_SENTINEL;
}

function wishlistItemNotFound(details?: Record<string, unknown>): never {
	throw new WishlistError('Wishlist item not found.', ErrorCode.WISHLIST_ITEM_NOT_FOUND, details);
}

function wrapWishlistPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new WishlistError(message, ErrorCode.WISHLIST_ITEM_ALREADY_EXISTS, {
			cause: getErrorMessage(error)
		});
	}

	throw error;
}

function isConstraintError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return message.includes('unique') || message.includes('constraint failed');
}

function normalizeLimit(limit: number | undefined, defaultLimit = 50, maxLimit = 100): number {
	if (limit === undefined) return defaultLimit;
	if (!Number.isFinite(limit)) return defaultLimit;
	return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

function normalizeOffset(offset: number | undefined): number {
	if (offset === undefined || !Number.isFinite(offset)) return 0;
	return Math.max(Math.trunc(offset), 0);
}
