import { and, asc, desc, eq, isNull, like, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode, ProductError } from '$lib/server/modules/errors';
import { deleteObjectSafe } from '$lib/server/modules/media/r2';
import {
	category,
	insertProductSchema,
	product,
	productImage,
	updateProductSchema,
	type Product,
	type ProductTier
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

const createProductInputSchema = insertProductSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateProductInputSchema = updateProductSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export type CreateProductInput = z.infer<typeof createProductInputSchema>;
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

export type ListProductsOptions = {
	includeInactive?: boolean;
	categoryId?: string | null;
	tier?: ProductTier;
	gender?: Product['gender'];
	isFeatured?: boolean;
	isNewArrival?: boolean;
	search?: string;
	sortBy?: 'createdAt' | 'name' | 'basePrice';
	sortDirection?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
};

export type ProductMutationOptions = {
	actor: ProductServiceActor;
};

export async function listProducts(options: ListProductsOptions = {}): Promise<Product[]> {
	const filters = buildProductFilters(options);

	return getDb()
		.select()
		.from(product)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(...buildProductOrderBy(options))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getProductById(id: string, options: { includeInactive?: boolean } = {}) {
	const filters = [eq(product.id, id)];
	if (!options.includeInactive) filters.push(eq(product.isActive, true));

	const [row] = await getDb()
		.select()
		.from(product)
		.where(and(...filters))
		.limit(1);

	if (!row) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { id });
	return row;
}

export async function getProductBySlug(slug: string, options: { includeInactive?: boolean } = {}) {
	const filters = [eq(product.slug, slug)];
	if (!options.includeInactive) filters.push(eq(product.isActive, true));

	const [row] = await getDb()
		.select()
		.from(product)
		.where(and(...filters))
		.limit(1);

	if (!row) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { slug });
	return row;
}

export async function getProductDetailsById(
	id: string,
	options: { includeInactive?: boolean } = {}
) {
	await getProductById(id, options);

	const row = await getDb().query.product.findFirst({
		where: (products, { eq }) => eq(products.id, id),
		with: {
			category: true,
			variants: {
				orderBy: (variants, { asc }) => [asc(variants.sortOrder), asc(variants.size)]
			},
			images: {
				orderBy: (images, { asc }) => [asc(images.position), asc(images.createdAt)]
			},
			productTags: {
				with: {
					tag: true
				}
			}
		}
	});

	if (!row) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { id });
	return row;
}

export async function getProductDetailsBySlug(
	slug: string,
	options: { includeInactive?: boolean } = {}
) {
	const row = await getProductBySlug(slug, options);
	return getProductDetailsById(row.id, options);
}

export async function createProduct(
	input: CreateProductInput,
	options: ProductMutationOptions
): Promise<Product> {
	assertProductPermission(options.actor, 'product', 'create');

	const parsed = parseProductServiceInput(createProductInputSchema, input, 'product');
	await assertCategoryExists(parsed.categoryId);
	assertValidProductPricing(parsed);

	try {
		const [created] = await getDb().insert(product).values(parsed).returning();
		return created;
	} catch (error) {
		wrapProductPersistenceError(error, 'Product slug already exists.');
	}
}

export async function updateProduct(
	id: string,
	input: UpdateProductInput,
	options: ProductMutationOptions
): Promise<Product> {
	assertProductPermission(options.actor, 'product', 'update');

	const parsed = parseProductServiceInput(updateProductInputSchema, input, 'product');
	assertNonEmptyUpdate(parsed, 'product');

	const current = await getProductById(id, { includeInactive: true });
	await assertCategoryExists(parsed.categoryId);
	assertValidProductPricing(parsed, current);

	try {
		const [updated] = await getDb()
			.update(product)
			.set(parsed)
			.where(eq(product.id, id))
			.returning();

		if (!updated) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { id });
		return updated;
	} catch (error) {
		wrapProductPersistenceError(error, 'Product slug already exists.');
	}
}

export async function activateProduct(
	id: string,
	options: ProductMutationOptions
): Promise<Product> {
	return updateProduct(id, { isActive: true }, options);
}

export async function deactivateProduct(
	id: string,
	options: ProductMutationOptions
): Promise<Product> {
	return updateProduct(id, { isActive: false }, options);
}

export async function setProductFeatured(
	id: string,
	isFeatured: boolean,
	options: ProductMutationOptions
): Promise<Product> {
	return updateProduct(id, { isFeatured }, options);
}

export async function setProductNewArrival(
	id: string,
	isNewArrival: boolean,
	options: ProductMutationOptions
): Promise<Product> {
	return updateProduct(id, { isNewArrival }, options);
}

export async function deleteProduct(
	id: string,
	options: ProductMutationOptions & { bucket?: R2Bucket | null }
): Promise<Product> {
	assertProductPermission(options.actor, 'product', 'delete');

	const existing = await getProductById(id, { includeInactive: true });
	const images = await getDb()
		.select({ r2Key: productImage.r2Key })
		.from(productImage)
		.where(eq(productImage.productId, id));

	const [deleted] = await getDb().delete(product).where(eq(product.id, id)).returning();

	if (options.bucket) {
		await Promise.all(images.map((image) => deleteObjectSafe(options.bucket!, image.r2Key)));
	}

	return deleted ?? existing;
}

async function assertCategoryExists(categoryId: string | null | undefined) {
	if (!categoryId) return;

	const [row] = await getDb()
		.select({ id: category.id })
		.from(category)
		.where(eq(category.id, categoryId))
		.limit(1);

	if (!row) notFound('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { categoryId });
}

function assertValidProductPricing(
	input: Partial<Pick<Product, 'basePrice' | 'compareAtPrice'>>,
	current?: Product
): void {
	const basePrice = input.basePrice ?? current?.basePrice;
	const compareAtPrice = 'compareAtPrice' in input ? input.compareAtPrice : current?.compareAtPrice;

	if (compareAtPrice != null && basePrice != null && compareAtPrice <= basePrice) {
		throw new ProductError(
			'Compare-at price must be greater than base price.',
			ErrorCode.VALIDATION_ERROR,
			{
				basePrice,
				compareAtPrice
			}
		);
	}
}

function buildProductFilters(options: ListProductsOptions): SQL[] {
	const filters: SQL[] = [];

	if (!options.includeInactive) filters.push(eq(product.isActive, true));
	if (options.categoryId === null) filters.push(isNull(product.categoryId));
	if (typeof options.categoryId === 'string')
		filters.push(eq(product.categoryId, options.categoryId));
	if (options.tier) filters.push(eq(product.tier, options.tier));
	if (options.gender) filters.push(eq(product.gender, options.gender));
	if (options.isFeatured !== undefined) filters.push(eq(product.isFeatured, options.isFeatured));
	if (options.isNewArrival !== undefined)
		filters.push(eq(product.isNewArrival, options.isNewArrival));
	if (options.search) filters.push(like(product.name, `%${options.search}%`));

	return filters;
}

function buildProductOrderBy(options: ListProductsOptions): SQL[] {
	const direction = options.sortDirection === 'asc' ? asc : desc;

	switch (options.sortBy) {
		case 'basePrice':
			return [direction(product.basePrice), desc(product.createdAt)];
		case 'name':
			return [direction(product.name), desc(product.createdAt)];
		case 'createdAt':
		default:
			return [direction(product.createdAt)];
	}
}
