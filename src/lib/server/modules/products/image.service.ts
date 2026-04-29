import { and, asc, eq, isNull, ne, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode } from '$lib/server/modules/errors';
import { buildMediaKey, deleteObjectSafe, uploadImage } from '$lib/server/modules/media/r2';
import {
	insertProductImageSchema,
	product,
	productImage,
	productVariant,
	updateProductImageSchema,
	type ProductImage
} from './products.drizzle';
import {
	assertNonEmptyUpdate,
	assertProductPermission,
	normalizeLimit,
	normalizeOffset,
	notFound,
	parseProductServiceInput,
	requireMediaBucket,
	sanitizeMediaVariant,
	wrapMediaError,
	wrapProductPersistenceError,
	type ProductServiceActor
} from './service-utils';

const createProductImageInputSchema = insertProductImageSchema.omit({
	id: true,
	createdAt: true
});

const updateProductImageInputSchema = updateProductImageSchema.omit({
	id: true,
	productId: true,
	r2Key: true,
	createdAt: true
});

export type CreateProductImageInput = z.infer<typeof createProductImageInputSchema>;
export type UpdateProductImageInput = z.infer<typeof updateProductImageInputSchema>;

export type UploadProductImageInput = {
	productId: string;
	file: File;
	variantId?: string | null;
	altText?: string | null;
	position?: number;
	isPrimary?: boolean;
	imageVariant?: string;
};

export type ListProductImagesOptions = {
	productId?: string;
	variantId?: string | null;
	limit?: number;
	offset?: number;
};

export type ProductImageMutationOptions = {
	actor: ProductServiceActor;
};

export type ProductImageMediaMutationOptions = ProductImageMutationOptions & {
	bucket: R2Bucket;
};

export async function listProductImages(
	options: ListProductImagesOptions = {}
): Promise<ProductImage[]> {
	const filters = buildProductImageFilters(options);

	return getDb()
		.select()
		.from(productImage)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(asc(productImage.position), asc(productImage.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getProductImageById(id: string): Promise<ProductImage> {
	const [row] = await getDb().select().from(productImage).where(eq(productImage.id, id)).limit(1);
	if (!row) notFound('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, { id });
	return row;
}

export async function createProductImage(
	input: CreateProductImageInput,
	options: ProductImageMutationOptions
): Promise<ProductImage> {
	assertProductPermission(options.actor, 'productImage', 'create');

	const parsed = parseProductServiceInput(createProductImageInputSchema, input, 'product image');
	await assertProductExists(parsed.productId);
	await assertVariantBelongsToProduct(parsed.productId, parsed.variantId);

	if (parsed.isPrimary) {
		await clearPrimaryProductImages(parsed.productId, parsed.variantId ?? null);
	}

	try {
		const [created] = await getDb().insert(productImage).values(parsed).returning();
		return created;
	} catch (error) {
		wrapProductPersistenceError(error, 'Product image already exists.');
	}
}

export async function uploadProductImage(
	input: UploadProductImageInput,
	options: ProductImageMediaMutationOptions
): Promise<ProductImage> {
	assertProductPermission(options.actor, 'productImage', 'create');

	await assertProductExists(input.productId);
	await assertVariantBelongsToProduct(input.productId, input.variantId);

	const bucket = requireMediaBucket(options.bucket);
	const r2Key = await uploadProductImageFile(
		bucket,
		input.productId,
		input.file,
		input.imageVariant ?? (input.variantId ? `variant-${input.variantId}` : 'main')
	);

	if (input.isPrimary) {
		await clearPrimaryProductImages(input.productId, input.variantId ?? null);
	}

	try {
		const [created] = await getDb()
			.insert(productImage)
			.values({
				productId: input.productId,
				variantId: input.variantId,
				r2Key,
				altText: input.altText,
				position: input.position,
				isPrimary: input.isPrimary
			})
			.returning();

		return created;
	} catch (error) {
		await deleteObjectSafe(bucket, r2Key);
		wrapProductPersistenceError(error, 'Product image already exists.');
	}
}

export async function updateProductImage(
	id: string,
	input: UpdateProductImageInput,
	options: ProductImageMutationOptions
): Promise<ProductImage> {
	assertProductPermission(options.actor, 'productImage', 'update');

	const existing = await getProductImageById(id);
	const parsed = parseProductServiceInput(updateProductImageInputSchema, input, 'product image');
	assertNonEmptyUpdate(parsed, 'product image');

	const nextVariantId = parsed.variantId === undefined ? existing.variantId : parsed.variantId;
	await assertVariantBelongsToProduct(existing.productId, nextVariantId);

	if (parsed.isPrimary) {
		await clearPrimaryProductImages(existing.productId, nextVariantId ?? null, id);
	}

	try {
		const [updated] = await getDb()
			.update(productImage)
			.set(parsed)
			.where(eq(productImage.id, id))
			.returning();

		if (!updated) notFound('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, { id });
		return updated;
	} catch (error) {
		wrapProductPersistenceError(error, 'Product image update conflicts with an existing image.');
	}
}

export async function replaceProductImageFile(
	id: string,
	file: File,
	options: ProductImageMediaMutationOptions & { imageVariant?: string }
): Promise<ProductImage> {
	assertProductPermission(options.actor, 'productImage', 'update');

	const existing = await getProductImageById(id);
	const bucket = requireMediaBucket(options.bucket);
	const r2Key = await uploadProductImageFile(
		bucket,
		existing.productId,
		file,
		options.imageVariant ?? (existing.variantId ? `variant-${existing.variantId}` : 'main')
	);

	try {
		const [updated] = await getDb()
			.update(productImage)
			.set({ r2Key })
			.where(eq(productImage.id, id))
			.returning();

		await deleteObjectSafe(bucket, existing.r2Key);
		return updated;
	} catch (error) {
		await deleteObjectSafe(bucket, r2Key);
		throw error;
	}
}

export async function setPrimaryProductImage(
	id: string,
	options: ProductImageMutationOptions
): Promise<ProductImage> {
	const existing = await getProductImageById(id);
	await clearPrimaryProductImages(existing.productId, existing.variantId, id);
	return updateProductImage(id, { isPrimary: true }, options);
}

export async function deleteProductImage(
	id: string,
	options: ProductImageMutationOptions & {
		bucket?: R2Bucket | null;
		deleteObject?: boolean;
	}
): Promise<ProductImage> {
	assertProductPermission(options.actor, 'productImage', 'delete');

	const existing = await getProductImageById(id);
	const [deleted] = await getDb().delete(productImage).where(eq(productImage.id, id)).returning();

	if (options.deleteObject !== false) {
		await deleteObjectSafe(requireMediaBucket(options.bucket), existing.r2Key);
	}

	return deleted ?? existing;
}

export async function deleteProductImagesForProduct(
	productId: string,
	options: ProductImageMutationOptions & {
		bucket?: R2Bucket | null;
		deleteObjects?: boolean;
	}
): Promise<ProductImage[]> {
	assertProductPermission(options.actor, 'productImage', 'delete');

	const rows = await getDb()
		.select()
		.from(productImage)
		.where(eq(productImage.productId, productId))
		.orderBy(asc(productImage.position), asc(productImage.createdAt));
	await getDb().delete(productImage).where(eq(productImage.productId, productId));

	if (options.deleteObjects !== false) {
		const bucket = requireMediaBucket(options.bucket);
		await Promise.all(rows.map((image) => deleteObjectSafe(bucket, image.r2Key)));
	}

	return rows;
}

async function assertProductExists(productId: string) {
	const [row] = await getDb()
		.select({ id: product.id })
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!row) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
}

async function assertVariantBelongsToProduct(
	productId: string,
	variantId: string | null | undefined
) {
	if (!variantId) return;

	const [row] = await getDb()
		.select({ id: productVariant.id })
		.from(productVariant)
		.where(and(eq(productVariant.id, variantId), eq(productVariant.productId, productId)))
		.limit(1);

	if (!row) {
		notFound('Product variant not found for this product.', ErrorCode.VARIANT_NOT_FOUND, {
			productId,
			variantId
		});
	}
}

async function clearPrimaryProductImages(
	productId: string,
	variantId: string | null,
	excludeImageId?: string
) {
	const filters: SQL[] = [eq(productImage.productId, productId), eq(productImage.isPrimary, true)];

	if (variantId) filters.push(eq(productImage.variantId, variantId));
	else filters.push(isNull(productImage.variantId));

	if (excludeImageId) filters.push(ne(productImage.id, excludeImageId));

	await getDb()
		.update(productImage)
		.set({ isPrimary: false })
		.where(and(...filters));
}

async function uploadProductImageFile(
	bucket: R2Bucket,
	productId: string,
	file: File,
	variant: string
): Promise<string> {
	const mediaVariant = sanitizeMediaVariant(variant) || 'main';
	const key = buildMediaKey({
		scope: 'products',
		entityId: productId,
		variant: mediaVariant,
		contentType: file.type
	});

	try {
		await uploadImage(bucket, key, file);
		return key;
	} catch (error) {
		wrapMediaError(error, 'Unable to upload product image.');
	}
}

function buildProductImageFilters(options: ListProductImagesOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.productId) filters.push(eq(productImage.productId, options.productId));
	if (options.variantId === null) filters.push(isNull(productImage.variantId));
	if (typeof options.variantId === 'string') {
		filters.push(eq(productImage.variantId, options.variantId));
	}

	return filters;
}
