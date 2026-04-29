import { and, asc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode } from '$lib/server/modules/errors';
import {
	insertProductVariantSchema,
	product,
	productVariant,
	updateProductVariantSchema,
	type ProductVariant
} from './products.drizzle';
import {
	assertNonEmptyUpdate,
	assertProductPermission,
	normalizeLimit,
	normalizeOffset,
	notFound,
	parseProductServiceInput,
	wrapProductPersistenceError,
	type ProductServiceActor
} from './service-utils';

const createProductVariantInputSchema = insertProductVariantSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateProductVariantInputSchema = updateProductVariantSchema.omit({
	id: true,
	productId: true,
	createdAt: true,
	updatedAt: true
});

export type CreateProductVariantInput = z.infer<typeof createProductVariantInputSchema>;
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantInputSchema>;

export type ListProductVariantsOptions = {
	productId?: string;
	includeInactive?: boolean;
	limit?: number;
	offset?: number;
};

export type ProductVariantMutationOptions = {
	actor: ProductServiceActor;
};

export async function listProductVariants(
	options: ListProductVariantsOptions = {}
): Promise<ProductVariant[]> {
	const filters = buildVariantFilters(options);

	return getDb()
		.select()
		.from(productVariant)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(asc(productVariant.sortOrder), asc(productVariant.size), asc(productVariant.color))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getProductVariantById(id: string): Promise<ProductVariant> {
	const [row] = await getDb()
		.select()
		.from(productVariant)
		.where(eq(productVariant.id, id))
		.limit(1);

	if (!row) notFound('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, { id });
	return row;
}

export async function getProductVariantBySku(sku: string): Promise<ProductVariant> {
	const [row] = await getDb()
		.select()
		.from(productVariant)
		.where(eq(productVariant.sku, sku))
		.limit(1);

	if (!row) notFound('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, { sku });
	return row;
}

export async function createProductVariant(
	input: CreateProductVariantInput,
	options: ProductVariantMutationOptions
): Promise<ProductVariant> {
	assertProductPermission(options.actor, 'productVariant', 'create');

	const parsed = parseProductServiceInput(
		createProductVariantInputSchema,
		input,
		'product variant'
	);
	await assertProductExists(parsed.productId);

	try {
		const [created] = await getDb().insert(productVariant).values(parsed).returning();
		return created;
	} catch (error) {
		wrapProductPersistenceError(error, 'Variant SKU or size/color already exists.');
	}
}

export async function updateProductVariant(
	id: string,
	input: UpdateProductVariantInput,
	options: ProductVariantMutationOptions
): Promise<ProductVariant> {
	assertProductPermission(options.actor, 'productVariant', 'update');

	const parsed = parseProductServiceInput(
		updateProductVariantInputSchema,
		input,
		'product variant'
	);
	assertNonEmptyUpdate(parsed, 'product variant');
	await getProductVariantById(id);

	try {
		const [updated] = await getDb()
			.update(productVariant)
			.set(parsed)
			.where(eq(productVariant.id, id))
			.returning();

		if (!updated) notFound('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, { id });
		return updated;
	} catch (error) {
		wrapProductPersistenceError(error, 'Variant SKU or size/color already exists.');
	}
}

export async function activateProductVariant(
	id: string,
	options: ProductVariantMutationOptions
): Promise<ProductVariant> {
	return updateProductVariant(id, { isActive: true }, options);
}

export async function deactivateProductVariant(
	id: string,
	options: ProductVariantMutationOptions
): Promise<ProductVariant> {
	return updateProductVariant(id, { isActive: false }, options);
}

export async function deleteProductVariant(
	id: string,
	options: ProductVariantMutationOptions
): Promise<ProductVariant> {
	assertProductPermission(options.actor, 'productVariant', 'delete');

	const existing = await getProductVariantById(id);
	const [deleted] = await getDb()
		.delete(productVariant)
		.where(eq(productVariant.id, id))
		.returning();
	return deleted ?? existing;
}

async function assertProductExists(productId: string) {
	const [row] = await getDb()
		.select({ id: product.id })
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!row) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
}

function buildVariantFilters(options: ListProductVariantsOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.productId) filters.push(eq(productVariant.productId, options.productId));
	if (!options.includeInactive) filters.push(eq(productVariant.isActive, true));

	return filters;
}
