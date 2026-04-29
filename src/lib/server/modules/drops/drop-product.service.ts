import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { DropError, ErrorCode } from '$lib/server/modules/errors';
import { product } from '$lib/server/modules/products/products.drizzle';
import {
	drop,
	dropProduct,
	insertDropProductSchema,
	updateDropProductSchema,
	type DropProduct
} from './drops.drizzle';
import { getDropById } from './drop.service';
import {
	assertDropPermission,
	assertNonEmptyUpdate,
	dropProductNotFound,
	normalizeLimit,
	normalizeOffset,
	parseDropInput,
	wrapDropPersistenceError,
	type DropServiceActor
} from './service-utils';

const createDropProductInputSchema = insertDropProductSchema;
const updateDropProductInputSchema = updateDropProductSchema.omit({
	dropId: true,
	productId: true
});

export type CreateDropProductInput = z.infer<typeof createDropProductInputSchema>;
export type UpdateDropProductInput = z.infer<typeof updateDropProductInputSchema>;

export type ListDropProductsOptions = {
	actor?: DropServiceActor | null;
	dropId?: string;
	productId?: string;
	limit?: number;
	offset?: number;
};

export type DropProductMutationOptions = {
	actor: DropServiceActor;
};

export async function listDropProducts(
	options: ListDropProductsOptions = {}
): Promise<DropProduct[]> {
	const filters = buildDropProductFilters(options);

	return getDb()
		.select()
		.from(dropProduct)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(asc(dropProduct.sortOrder))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getDropProduct(dropId: string, productId: string): Promise<DropProduct> {
	const [row] = await getDb()
		.select()
		.from(dropProduct)
		.where(and(eq(dropProduct.dropId, dropId), eq(dropProduct.productId, productId)))
		.limit(1);

	if (!row) dropProductNotFound({ dropId, productId });
	return row;
}

export async function addProductToDrop(
	input: CreateDropProductInput,
	options: DropProductMutationOptions
): Promise<DropProduct> {
	assertDropPermission(options.actor, 'update');

	const parsed = parseDropInput(createDropProductInputSchema, input, 'drop product');
	const targetDrop = await getDropById(parsed.dropId, {
		actor: options.actor,
		includeArchived: true
	});
	await assertDropProductEligible(parsed.productId);
	await assertProductNotInAnotherActiveDrop(parsed.dropId, parsed.productId, targetDrop.status);

	try {
		return getDb().transaction(async (tx) => {
			if (parsed.isHero) {
				await tx
					.update(dropProduct)
					.set({ isHero: false })
					.where(eq(dropProduct.dropId, parsed.dropId));
			}

			const [created] = await tx.insert(dropProduct).values(parsed).returning();
			return created;
		});
	} catch (error) {
		wrapDropPersistenceError(error, 'Product is already in this drop.');
	}
}

export async function updateDropProduct(
	dropId: string,
	productId: string,
	input: UpdateDropProductInput,
	options: DropProductMutationOptions
): Promise<DropProduct> {
	assertDropPermission(options.actor, 'update');

	await getDropProduct(dropId, productId);
	const parsed = parseDropInput(updateDropProductInputSchema, input, 'drop product');
	assertNonEmptyUpdate(parsed, 'drop product');

	try {
		return getDb().transaction(async (tx) => {
			if (parsed.isHero) {
				await tx.update(dropProduct).set({ isHero: false }).where(eq(dropProduct.dropId, dropId));
			}

			const [updated] = await tx
				.update(dropProduct)
				.set(parsed)
				.where(and(eq(dropProduct.dropId, dropId), eq(dropProduct.productId, productId)))
				.returning();

			if (!updated) dropProductNotFound({ dropId, productId });
			return updated;
		});
	} catch (error) {
		wrapDropPersistenceError(error, 'Unable to update drop product.');
	}
}

export async function setHeroDropProduct(
	dropId: string,
	productId: string,
	options: DropProductMutationOptions
): Promise<DropProduct> {
	return updateDropProduct(dropId, productId, { isHero: true }, options);
}

export async function removeProductFromDrop(
	dropId: string,
	productId: string,
	options: DropProductMutationOptions
): Promise<DropProduct> {
	assertDropPermission(options.actor, 'update');

	const existing = await getDropProduct(dropId, productId);
	const [deleted] = await getDb()
		.delete(dropProduct)
		.where(and(eq(dropProduct.dropId, dropId), eq(dropProduct.productId, productId)))
		.returning();

	return deleted ?? existing;
}

export async function setDropProducts(
	dropId: string,
	inputs: Array<Omit<CreateDropProductInput, 'dropId'>>,
	options: DropProductMutationOptions
): Promise<DropProduct[]> {
	assertDropPermission(options.actor, 'update');

	const targetDrop = await getDropById(dropId, { actor: options.actor, includeArchived: true });
	for (const input of inputs) {
		await assertDropProductEligible(input.productId);
		await assertProductNotInAnotherActiveDrop(dropId, input.productId, targetDrop.status);
	}

	const heroCount = inputs.filter((input) => input.isHero).length;
	if (heroCount > 1) {
		throw new DropError('Only one hero product is allowed per drop.', ErrorCode.CONFLICT, {
			dropId
		});
	}

	await getDb().delete(dropProduct).where(eq(dropProduct.dropId, dropId));
	if (inputs.length === 0) return [];

	return getDb()
		.insert(dropProduct)
		.values(inputs.map((input) => ({ ...input, dropId })))
		.returning();
}

async function assertDropProductEligible(productId: string) {
	const [row] = await getDb()
		.select({ id: product.id, tier: product.tier })
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!row) {
		throw new DropError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
	}

	if (row.tier !== 'drop') {
		throw new DropError(
			'Only drop-tier products can be added to drops.',
			ErrorCode.VALIDATION_ERROR,
			{
				productId,
				tier: row.tier
			}
		);
	}
}

async function assertProductNotInAnotherActiveDrop(
	dropId: string,
	productId: string,
	targetDropStatus: string
) {
	if (targetDropStatus === 'archived') return;

	const [row] = await getDb()
		.select({ dropId: dropProduct.dropId })
		.from(dropProduct)
		.innerJoin(drop, eq(dropProduct.dropId, drop.id))
		.where(
			and(
				eq(dropProduct.productId, productId),
				sql`${dropProduct.dropId} != ${dropId}`,
				inArray(drop.status, ['teaser', 'live', 'sold_out'])
			)
		)
		.limit(1);

	if (row) {
		throw new DropError('Product is already assigned to another active drop.', ErrorCode.CONFLICT, {
			productId,
			dropId
		});
	}
}

function buildDropProductFilters(options: ListDropProductsOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.dropId) filters.push(eq(dropProduct.dropId, options.dropId));
	if (options.productId) filters.push(eq(dropProduct.productId, options.productId));

	return filters;
}
