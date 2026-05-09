import { and, asc, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { requireAdmin } from '$lib/server/modules/auth/guards';
import {
	ErrorCode,
	getErrorMessage,
	isAppError,
	MediaError,
	ProductError
} from '$lib/server/modules/errors';
import {
	buildMediaKey,
	deleteObjectSafe,
	getMediaBucket,
	uploadImage
} from '$lib/server/modules/media/r2';
import { mediaUrl } from '$lib/server/modules/media/utils';
import type { ServiceContext } from '$lib/server/modules/service-context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isString,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	uniqueStrings
} from '$lib/server/modules/service-utils';
import {
	category,
	insertCategorySchema,
	insertProductImageSchema,
	insertProductSchema,
	insertProductVariantSchema,
	insertTagSchema,
	product,
	productImage,
	productTag,
	productVariant,
	tag,
	updateCategorySchema,
	updateProductSchema,
	updateProductVariantSchema,
	updateTagSchema,
	type Category,
	type InsertCategory,
	type InsertProduct,
	type InsertProductImage,
	type InsertProductVariant,
	type InsertTag,
	type NewCategory,
	type NewProductImage,
	type Product,
	type ProductImage,
	type ProductVariant,
	type Tag,
	type UpdateCategory,
	type UpdateProduct,
	type UpdateProductVariant,
	type UpdateTag
} from './products.drizzle';
import type {
	AddProductImageInput,
	CategoryDTO,
	CategoryLookup,
	CreateCategoryInput,
	CreateProductInput,
	CreateProductVariantInput,
	CreateTagInput,
	GetCategoryOptions,
	GetProductOptions,
	ListCategoriesOptions,
	ListProductsOptions,
	ListProductVariantsOptions,
	ListTagsOptions,
	ProductDTO,
	ProductImageDTO,
	ProductListResult,
	ProductLookup,
	ProductVariantDTO,
	TagDTO,
	TagLookup,
	UpdateCategoryInput,
	UpdateProductInput,
	UpdateProductVariantInput,
	UpdateTagInput
} from './products.types';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

type UploadedImage = {
	bucket: R2Bucket;
	key: string;
};

export async function createCategory(
	ctx: ServiceContext,
	input: CreateCategoryInput
): Promise<CategoryDTO> {
	requireAdmin(ctx.actor);

	const { image, ...rawData } = input;
	const data = parseInsertCategory(rawData);
	const id = nanoid();
	const uploadedImage = image ? await uploadCategoryImage(ctx, id, image) : null;

	try {
		if (data.parentId) {
			await assertCategoryExists(data.parentId, 'Parent category not found.');
		}

		const values: NewCategory = {
			id,
			...data,
			imageR2Key: uploadedImage?.key ?? null
		};

		const [created] = await getDb().insert(category).values(values).returning();

		if (!created) {
			throw new ProductError('Category was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return toCategoryDTO(created);
	} catch (error) {
		if (uploadedImage) {
			await deleteObjectSafe(uploadedImage.bucket, uploadedImage.key);
		}

		throw mapCategoryPersistenceError(error);
	}
}

export async function getCategory(
	ctx: ServiceContext | null,
	lookup: CategoryLookup,
	options: GetCategoryOptions = {}
): Promise<CategoryDTO> {
	const includeInactive = resolveIncludeInactive(ctx, options.includeInactive);
	const row = await findCategoryByLookup(lookup, { includeInactive });

	if (!row) {
		throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { lookup });
	}

	return toCategoryDTO(row);
}

export async function listCategories(
	ctx: ServiceContext | null = null,
	options: ListCategoriesOptions = {}
): Promise<CategoryDTO[]> {
	const includeInactive = resolveIncludeInactive(ctx, options.includeInactive);
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const conditions: SQL[] = [];

	if (!includeInactive) {
		conditions.push(eq(category.isActive, true));
	}

	if (options.parentId !== undefined) {
		conditions.push(
			options.parentId === null
				? isNull(category.parentId)
				: eq(category.parentId, options.parentId)
		);
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const query = getDb()
		.select()
		.from(category)
		.orderBy(asc(category.sortOrder), asc(category.name))
		.limit(limit)
		.offset(offset);
	const rows = where ? await query.where(where) : await query;

	return rows.map(toCategoryDTO);
}

export async function updateCategory(
	ctx: ServiceContext,
	lookup: CategoryLookup,
	input: UpdateCategoryInput
): Promise<CategoryDTO> {
	requireAdmin(ctx.actor);

	const existing = await findCategoryByLookup(lookup, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { lookup });
	}

	const { image, removeImage, ...rawData } = input;

	if (image && removeImage) {
		throw new ProductError(
			'Choose either a new image or removeImage, not both.',
			ErrorCode.VALIDATION_ERROR
		);
	}

	const data = parseUpdateCategory(rawData);

	if (data.parentId) {
		if (data.parentId === existing.id) {
			throw new ProductError('A category cannot be its own parent.', ErrorCode.VALIDATION_ERROR, {
				categoryId: existing.id
			});
		}

		await assertCategoryExists(data.parentId, 'Parent category not found.');
	}

	const uploadedImage = image ? await uploadCategoryImage(ctx, existing.id, image) : null;
	const removeImageBucket =
		removeImage && existing.imageR2Key && !uploadedImage ? requireMediaBucket(ctx) : null;
	const updateValues: Partial<NewCategory> = removeUndefinedValues({
		...data,
		imageR2Key: uploadedImage ? uploadedImage.key : removeImage ? null : undefined
	});

	if (Object.keys(updateValues).length === 0) {
		return toCategoryDTO(existing);
	}

	try {
		const [updated] = await getDb()
			.update(category)
			.set(updateValues)
			.where(eq(category.id, existing.id))
			.returning();

		if (!updated) {
			throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { lookup });
		}

		if ((uploadedImage || removeImage) && existing.imageR2Key) {
			const bucket = uploadedImage?.bucket ?? removeImageBucket;

			if (!bucket) return toCategoryDTO(updated);

			await deleteObjectSafe(bucket, existing.imageR2Key);
		}

		return toCategoryDTO(updated);
	} catch (error) {
		if (uploadedImage) {
			await deleteObjectSafe(uploadedImage.bucket, uploadedImage.key);
		}

		throw mapCategoryPersistenceError(error);
	}
}

export async function deleteCategory(ctx: ServiceContext, lookup: CategoryLookup): Promise<void> {
	requireAdmin(ctx.actor);

	const existing = await findCategoryByLookup(lookup, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { lookup });
	}

	const bucket = existing.imageR2Key ? requireMediaBucket(ctx) : null;

	try {
		const [deleted] = await getDb()
			.delete(category)
			.where(eq(category.id, existing.id))
			.returning({ id: category.id });

		if (!deleted) {
			throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { lookup });
		}
	} catch (error) {
		throw mapCategoryPersistenceError(error);
	}

	if (bucket && existing.imageR2Key) {
		await deleteObjectSafe(bucket, existing.imageR2Key);
	}
}

export async function createProduct(
	ctx: ServiceContext,
	input: CreateProductInput
): Promise<ProductDTO> {
	requireAdmin(ctx.actor);

	const { tagIds, ...rawData } = input;
	const data = parseInsertProduct(rawData);
	validateResolvedProductPricing(data);
	const normalizedTagIds = normalizeTagIds(tagIds);
	const db = getDb();

	try {
		const created = await db.transaction(async (tx) => {
			if (data.categoryId) {
				await assertCategoryExistsTx(tx, data.categoryId, 'Product category not found.');
			}

			if (tagIds !== undefined) {
				await assertTagsExistTx(tx, normalizedTagIds);
			}

			const [row] = await tx.insert(product).values(data).returning();

			if (!row) {
				throw new ProductError('Product was not created.', ErrorCode.INTERNAL_ERROR);
			}

			if (normalizedTagIds.length > 0) {
				await tx.insert(productTag).values(
					normalizedTagIds.map((tagId) => ({
						productId: row.id,
						tagId
					}))
				);
			}

			return row;
		});

		return hydrateProduct(created, { includeInactiveRelations: true });
	} catch (error) {
		throw mapProductPersistenceError(error);
	}
}

export async function getProduct(
	ctx: ServiceContext | null,
	lookup: ProductLookup,
	options: GetProductOptions = {}
): Promise<ProductDTO> {
	const includeInactive = resolveIncludeInactive(ctx, options.includeInactive);
	const row = await findProductByLookup(lookup, { includeInactive });

	if (!row) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
	}

	return hydrateProduct(row, { includeInactiveRelations: includeInactive });
}

export async function listProducts(
	ctx: ServiceContext | null = null,
	options: ListProductsOptions = {}
): Promise<ProductListResult> {
	const includeInactive = resolveIncludeInactive(ctx, options.includeInactive);
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const conditions = productListConditions(options, includeInactive);
	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const db = getDb();

	const listQuery = db
		.select()
		.from(product)
		.orderBy(desc(product.createdAt), asc(product.name))
		.limit(limit)
		.offset(offset);
	const countQuery = db.select({ total: count() }).from(product);

	const [rows, totalRows] = await Promise.all([
		where ? listQuery.where(where) : listQuery,
		where ? countQuery.where(where) : countQuery
	]);

	return {
		items: await hydrateProducts(rows, { includeInactiveRelations: includeInactive }),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function updateProduct(
	ctx: ServiceContext,
	lookup: ProductLookup,
	input: UpdateProductInput
): Promise<ProductDTO> {
	requireAdmin(ctx.actor);

	const existing = await findProductByLookup(lookup, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
	}

	const { tagIds, ...rawData } = input;
	const data = parseUpdateProduct(rawData);
	validateResolvedProductPricing({
		tier: data.tier ?? existing.tier,
		basePrice: data.basePrice ?? existing.basePrice,
		compareAtPrice:
			data.compareAtPrice === undefined ? existing.compareAtPrice : data.compareAtPrice
	});

	const normalizedTagIds = normalizeTagIds(tagIds);
	const updateValues = removeUndefinedValues(data);

	if (Object.keys(updateValues).length === 0 && tagIds === undefined) {
		return hydrateProduct(existing, { includeInactiveRelations: true });
	}

	try {
		const updated = await getDb().transaction(async (tx) => {
			if (data.categoryId) {
				await assertCategoryExistsTx(tx, data.categoryId, 'Product category not found.');
			}

			if (tagIds !== undefined) {
				await assertTagsExistTx(tx, normalizedTagIds);
			}

			const [row] =
				Object.keys(updateValues).length > 0
					? await tx
							.update(product)
							.set(updateValues)
							.where(eq(product.id, existing.id))
							.returning()
					: [existing];

			if (!row) {
				throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
			}

			if (tagIds !== undefined) {
				await tx.delete(productTag).where(eq(productTag.productId, existing.id));

				if (normalizedTagIds.length > 0) {
					await tx.insert(productTag).values(
						normalizedTagIds.map((tagId) => ({
							productId: existing.id,
							tagId
						}))
					);
				}
			}

			return row;
		});

		return hydrateProduct(updated, { includeInactiveRelations: true });
	} catch (error) {
		throw mapProductPersistenceError(error);
	}
}

export async function deleteProduct(ctx: ServiceContext, lookup: ProductLookup): Promise<void> {
	requireAdmin(ctx.actor);

	const existing = await findProductByLookup(lookup, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
	}

	let bucket: R2Bucket | null = null;

	try {
		const imageKeys = await getDb().transaction(async (tx) => {
			const imageRows = await tx
				.select({ r2Key: productImage.r2Key })
				.from(productImage)
				.where(eq(productImage.productId, existing.id));
			const keys = imageRows.map((row) => row.r2Key);

			if (keys.length > 0) {
				bucket = requireMediaBucket(ctx);
			}

			const [deleted] = await tx
				.delete(product)
				.where(eq(product.id, existing.id))
				.returning({ id: product.id });

			if (!deleted) {
				throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
			}

			return keys;
		});

		if (bucket) {
			const mediaBucket = bucket;
			await Promise.all(imageKeys.map((key) => deleteObjectSafe(mediaBucket, key)));
		}
	} catch (error) {
		throw mapProductPersistenceError(error);
	}
}

export async function createProductVariant(
	ctx: ServiceContext,
	productId: string,
	input: CreateProductVariantInput
): Promise<ProductVariantDTO> {
	requireAdmin(ctx.actor);

	const data = parseInsertProductVariant(productId, input);
	const productRow = await findProductByLookup({ id: data.productId }, { includeInactive: true });

	if (!productRow) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, {
			productId: data.productId
		});
	}

	try {
		const [created] = await getDb().insert(productVariant).values(data).returning();

		if (!created) {
			throw new ProductError('Product variant was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return toProductVariantDTO(created, productRow);
	} catch (error) {
		throw mapProductVariantPersistenceError(error);
	}
}

export async function updateProductVariant(
	ctx: ServiceContext,
	variantId: string,
	input: UpdateProductVariantInput
): Promise<ProductVariantDTO> {
	requireAdmin(ctx.actor);

	const existing = await findProductVariantById(variantId, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			variantId
		});
	}

	const data = parseUpdateProductVariant(input);
	const updateValues = removeUndefinedValues(data);

	if (Object.keys(updateValues).length === 0) {
		return hydrateProductVariant(existing);
	}

	try {
		const [updated] = await getDb()
			.update(productVariant)
			.set(updateValues)
			.where(eq(productVariant.id, existing.id))
			.returning();

		if (!updated) {
			throw new ProductError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
				variantId
			});
		}

		return hydrateProductVariant(updated);
	} catch (error) {
		throw mapProductVariantPersistenceError(error);
	}
}

export async function deleteProductVariant(ctx: ServiceContext, variantId: string): Promise<void> {
	requireAdmin(ctx.actor);

	const existing = await findProductVariantById(variantId, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
			variantId
		});
	}

	try {
		const [deleted] = await getDb()
			.delete(productVariant)
			.where(eq(productVariant.id, existing.id))
			.returning({ id: productVariant.id });

		if (!deleted) {
			throw new ProductError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, {
				variantId
			});
		}
	} catch (error) {
		throw mapProductVariantPersistenceError(error);
	}
}

export async function listProductVariants(
	ctx: ServiceContext | null,
	productId: string,
	options: ListProductVariantsOptions = {}
): Promise<ProductVariantDTO[]> {
	const includeInactive = resolveIncludeInactive(ctx, options.includeInactive);
	const productRow = await findProductByLookup({ id: productId }, { includeInactive });

	if (!productRow) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
	}

	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const conditions: SQL[] = [eq(productVariant.productId, productId)];

	if (!includeInactive) {
		conditions.push(eq(productVariant.isActive, true));
	}

	const rows = await getDb()
		.select()
		.from(productVariant)
		.where(and(...conditions))
		.orderBy(asc(productVariant.sortOrder), asc(productVariant.size), asc(productVariant.color))
		.limit(limit)
		.offset(offset);

	return rows.map((row) => toProductVariantDTO(row, productRow));
}

export async function addProductImage(
	ctx: ServiceContext,
	input: AddProductImageInput
): Promise<ProductImageDTO> {
	requireAdmin(ctx.actor);

	const { image, ...rawData } = input;
	const data = parseAddProductImage(rawData);
	await assertProductExists(data.productId, 'Product not found.');
	await assertVariantBelongsToProduct(data.productId, data.variantId ?? null);

	const uploadedImage = await uploadProductImage(
		ctx,
		data.productId,
		data.variantId ?? null,
		image
	);

	try {
		const values: NewProductImage = {
			...data,
			r2Key: uploadedImage.key
		};
		const created = await getDb().transaction(async (tx) => {
			if (values.isPrimary) {
				await clearPrimaryProductImagesTx(tx, values.productId, values.variantId ?? null);
			}

			const [row] = await tx.insert(productImage).values(values).returning();

			if (!row) {
				throw new ProductError('Product image was not created.', ErrorCode.INTERNAL_ERROR);
			}

			return row;
		});

		return toProductImageDTO(created);
	} catch (error) {
		await deleteObjectSafe(uploadedImage.bucket, uploadedImage.key);
		throw mapProductImagePersistenceError(error);
	}
}

export async function setPrimaryProductImage(
	ctx: ServiceContext,
	imageId: string
): Promise<ProductImageDTO> {
	requireAdmin(ctx.actor);

	try {
		const updated = await getDb().transaction(async (tx) => {
			const existing = await findProductImageByIdTx(tx, imageId);

			if (!existing) {
				throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, {
					imageId
				});
			}

			await clearPrimaryProductImagesTx(tx, existing.productId, existing.variantId);

			const [row] = await tx
				.update(productImage)
				.set({ isPrimary: true })
				.where(eq(productImage.id, existing.id))
				.returning();

			if (!row) {
				throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, {
					imageId
				});
			}

			return row;
		});

		return toProductImageDTO(updated);
	} catch (error) {
		throw mapProductImagePersistenceError(error);
	}
}

export async function reorderProductImages(
	ctx: ServiceContext,
	productId: string,
	imageIdsInOrder: string[]
): Promise<ProductImageDTO[]> {
	requireAdmin(ctx.actor);

	try {
		const rows = await getDb().transaction(async (tx) => {
			await assertProductExistsTx(tx, productId, 'Product not found.');

			const existingRows = await tx
				.select()
				.from(productImage)
				.where(eq(productImage.productId, productId))
				.orderBy(asc(productImage.position), asc(productImage.createdAt));

			assertExactProductImageOrder(productId, existingRows, imageIdsInOrder);

			for (const [position, imageId] of imageIdsInOrder.entries()) {
				await tx.update(productImage).set({ position }).where(eq(productImage.id, imageId));
			}

			return tx
				.select()
				.from(productImage)
				.where(eq(productImage.productId, productId))
				.orderBy(asc(productImage.position), asc(productImage.createdAt));
		});

		return rows.map(toProductImageDTO);
	} catch (error) {
		throw mapProductImagePersistenceError(error);
	}
}

export async function deleteProductImage(ctx: ServiceContext, imageId: string): Promise<void> {
	requireAdmin(ctx.actor);

	let bucket: R2Bucket | null = null;

	try {
		const imageKey = await getDb().transaction(async (tx) => {
			const existing = await findProductImageByIdTx(tx, imageId);

			if (!existing) {
				throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, {
					imageId
				});
			}

			bucket = requireMediaBucket(ctx);

			const [deleted] = await tx
				.delete(productImage)
				.where(eq(productImage.id, existing.id))
				.returning({ id: productImage.id });

			if (!deleted) {
				throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, {
					imageId
				});
			}

			return existing.r2Key;
		});

		if (bucket) {
			const mediaBucket = bucket;
			await deleteObjectSafe(mediaBucket, imageKey);
		}
	} catch (error) {
		throw mapProductImagePersistenceError(error);
	}
}

export async function createTag(ctx: ServiceContext, input: CreateTagInput): Promise<TagDTO> {
	requireAdmin(ctx.actor);

	const data = parseInsertTag(input);

	try {
		const [created] = await getDb().insert(tag).values(data).returning();

		if (!created) {
			throw new ProductError('Tag was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return toTagDTO(created);
	} catch (error) {
		throw mapTagPersistenceError(error);
	}
}

export async function getTag(lookup: TagLookup): Promise<TagDTO> {
	const row = await findTagByLookup(lookup);

	if (!row) {
		throw new ProductError('Tag not found.', ErrorCode.TAG_NOT_FOUND, { lookup });
	}

	return toTagDTO(row);
}

export async function listTags(options: ListTagsOptions = {}): Promise<TagDTO[]> {
	const rows = await getDb()
		.select()
		.from(tag)
		.orderBy(asc(tag.name), asc(tag.slug))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));

	return rows.map(toTagDTO);
}

export async function updateTag(
	ctx: ServiceContext,
	lookup: TagLookup,
	input: UpdateTagInput
): Promise<TagDTO> {
	requireAdmin(ctx.actor);

	const existing = await findTagByLookup(lookup);

	if (!existing) {
		throw new ProductError('Tag not found.', ErrorCode.TAG_NOT_FOUND, { lookup });
	}

	const data = parseUpdateTag(input);
	const updateValues = removeUndefinedValues(data);

	if (Object.keys(updateValues).length === 0) {
		return toTagDTO(existing);
	}

	try {
		const [updated] = await getDb()
			.update(tag)
			.set(updateValues)
			.where(eq(tag.id, existing.id))
			.returning();

		if (!updated) {
			throw new ProductError('Tag not found.', ErrorCode.TAG_NOT_FOUND, { lookup });
		}

		return toTagDTO(updated);
	} catch (error) {
		throw mapTagPersistenceError(error);
	}
}

export async function deleteTag(ctx: ServiceContext, lookup: TagLookup): Promise<void> {
	requireAdmin(ctx.actor);

	const existing = await findTagByLookup(lookup);

	if (!existing) {
		throw new ProductError('Tag not found.', ErrorCode.TAG_NOT_FOUND, { lookup });
	}

	try {
		const [deleted] = await getDb()
			.delete(tag)
			.where(eq(tag.id, existing.id))
			.returning({ id: tag.id });

		if (!deleted) {
			throw new ProductError('Tag not found.', ErrorCode.TAG_NOT_FOUND, { lookup });
		}
	} catch (error) {
		throw mapTagPersistenceError(error);
	}
}

export async function setProductTags(
	ctx: ServiceContext,
	productId: string,
	tagIds: string[]
): Promise<void> {
	requireAdmin(ctx.actor);

	const normalizedTagIds = normalizeTagIds(tagIds);

	try {
		await getDb().transaction(async (tx) => {
			await assertProductExistsTx(tx, productId, 'Product not found.');
			await assertTagsExistTx(tx, normalizedTagIds);

			await tx.delete(productTag).where(eq(productTag.productId, productId));

			if (normalizedTagIds.length > 0) {
				await tx.insert(productTag).values(
					normalizedTagIds.map((tagId) => ({
						productId,
						tagId
					}))
				);
			}
		});
	} catch (error) {
		throw mapProductTagPersistenceError(error);
	}
}

export async function addProductTag(
	ctx: ServiceContext,
	productId: string,
	tagId: string
): Promise<void> {
	requireAdmin(ctx.actor);

	const normalizedTagId = normalizeTagId(tagId);

	try {
		await getDb().transaction(async (tx) => {
			await assertProductExistsTx(tx, productId, 'Product not found.');
			await assertTagsExistTx(tx, [normalizedTagId]);

			const [existing] = await tx
				.select({ productId: productTag.productId })
				.from(productTag)
				.where(and(eq(productTag.productId, productId), eq(productTag.tagId, normalizedTagId)))
				.limit(1);

			if (existing) return;

			await tx.insert(productTag).values({
				productId,
				tagId: normalizedTagId
			});
		});
	} catch (error) {
		if (isUniqueConstraintError(getErrorMessage(error))) return;

		throw mapProductTagPersistenceError(error);
	}
}

export async function removeProductTag(
	ctx: ServiceContext,
	productId: string,
	tagId: string
): Promise<void> {
	requireAdmin(ctx.actor);

	const normalizedTagId = normalizeTagId(tagId);

	try {
		await getDb().transaction(async (tx) => {
			await assertProductExistsTx(tx, productId, 'Product not found.');

			await tx
				.delete(productTag)
				.where(and(eq(productTag.productId, productId), eq(productTag.tagId, normalizedTagId)));
		});
	} catch (error) {
		throw mapProductTagPersistenceError(error);
	}
}

function toCategoryDTO(row: Category): CategoryDTO {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		imageR2Key: row.imageR2Key,
		imageUrl: row.imageR2Key ? mediaUrl(row.imageR2Key) : null,
		parentId: row.parentId,
		sortOrder: row.sortOrder,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function toTagDTO(row: Tag): TagDTO {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug
	};
}

function toProductVariantDTO(row: ProductVariant, productRow: Product): ProductVariantDTO {
	return {
		id: row.id,
		productId: row.productId,
		sku: row.sku,
		size: row.size,
		color: row.color,
		colorHex: row.colorHex,
		priceOverride: row.priceOverride,
		effectivePrice: row.priceOverride ?? productRow.basePrice,
		weight: row.weight,
		isActive: row.isActive,
		sortOrder: row.sortOrder,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function toProductImageDTO(row: ProductImage): ProductImageDTO {
	return {
		id: row.id,
		productId: row.productId,
		variantId: row.variantId,
		r2Key: row.r2Key,
		imageUrl: mediaUrl(row.r2Key),
		altText: row.altText,
		position: row.position,
		isPrimary: row.isPrimary,
		createdAt: row.createdAt
	};
}

function toProductDTO(
	row: Product,
	input: {
		category: Category | null;
		variants: ProductVariant[];
		images: ProductImage[];
		tags: Tag[];
	}
): ProductDTO {
	const images = input.images.map(toProductImageDTO);

	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		shortDescription: row.shortDescription,
		categoryId: row.categoryId,
		category: input.category ? toCategoryDTO(input.category) : null,
		tier: row.tier,
		basePrice: row.basePrice,
		compareAtPrice: row.compareAtPrice,
		gender: row.gender,
		fit: row.fit,
		material: row.material,
		careInstructions: row.careInstructions,
		isActive: row.isActive,
		isFeatured: row.isFeatured,
		isNewArrival: row.isNewArrival,
		metaTitle: row.metaTitle,
		metaDescription: row.metaDescription,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		variants: input.variants.map((variant) => toProductVariantDTO(variant, row)),
		images,
		tags: input.tags.map(toTagDTO),
		primaryImageUrl: resolvePrimaryImageUrl(images)
	};
}

function parseInsertCategory(input: Omit<CreateCategoryInput, 'image'>): InsertCategory {
	const result = insertCategorySchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid category data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseUpdateCategory(
	input: Omit<UpdateCategoryInput, 'image' | 'removeImage'>
): UpdateCategory {
	const result = updateCategorySchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid category data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseInsertProduct(input: Omit<CreateProductInput, 'tagIds'>): InsertProduct {
	const result = insertProductSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseUpdateProduct(input: Omit<UpdateProductInput, 'tagIds'>): UpdateProduct {
	const result = updateProductSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseInsertProductVariant(
	productId: string,
	input: CreateProductVariantInput
): InsertProductVariant {
	const result = insertProductVariantSchema.safeParse({ ...input, productId });

	if (!result.success) {
		throw new ProductError('Invalid product variant data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseUpdateProductVariant(input: UpdateProductVariantInput): UpdateProductVariant {
	const result = updateProductVariantSchema.omit({ productId: true }).safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product variant data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseAddProductImage(
	input: Omit<AddProductImageInput, 'image'>
): Omit<InsertProductImage, 'r2Key'> {
	const result = insertProductImageSchema.omit({ r2Key: true }).safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product image data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseInsertTag(input: CreateTagInput): InsertTag {
	const result = insertTagSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid tag data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseUpdateTag(input: UpdateTagInput): UpdateTag {
	const result = updateTagSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid tag data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

async function findCategoryByLookup(
	lookup: CategoryLookup,
	options: { includeInactive: boolean }
): Promise<Category | null> {
	const predicate = categoryLookupPredicate(lookup);
	const where = options.includeInactive ? predicate : and(predicate, eq(category.isActive, true));
	const [row] = await getDb()
		.select()
		.from(category)
		.where(where ?? predicate)
		.limit(1);

	return row ?? null;
}

async function findProductByLookup(
	lookup: ProductLookup,
	options: { includeInactive: boolean }
): Promise<Product | null> {
	const predicate = productLookupPredicate(lookup);
	const where = options.includeInactive ? predicate : and(predicate, eq(product.isActive, true));
	const [row] = await getDb()
		.select()
		.from(product)
		.where(where ?? predicate)
		.limit(1);

	return row ?? null;
}

async function findTagByLookup(lookup: TagLookup): Promise<Tag | null> {
	const [row] = await getDb().select().from(tag).where(tagLookupPredicate(lookup)).limit(1);

	return row ?? null;
}

async function findProductVariantById(
	variantId: string,
	options: { includeInactive: boolean }
): Promise<ProductVariant | null> {
	const predicate = eq(productVariant.id, variantId);
	const where = options.includeInactive
		? predicate
		: and(predicate, eq(productVariant.isActive, true));
	const [row] = await getDb()
		.select()
		.from(productVariant)
		.where(where ?? predicate)
		.limit(1);

	return row ?? null;
}

async function findProductImageByIdTx(tx: Db | Tx, imageId: string): Promise<ProductImage | null> {
	const [row] = await tx.select().from(productImage).where(eq(productImage.id, imageId)).limit(1);

	return row ?? null;
}

function categoryLookupPredicate(lookup: CategoryLookup): SQL {
	const entries = [
		'id' in lookup && lookup.id ? ['id', lookup.id] : null,
		'slug' in lookup && lookup.slug ? ['slug', lookup.slug] : null,
		'name' in lookup && lookup.name ? ['name', lookup.name] : null
	].filter((entry): entry is ['id' | 'slug' | 'name', string] => entry !== null);

	if (entries.length !== 1) {
		throw new ProductError(
			'Provide exactly one category lookup field.',
			ErrorCode.VALIDATION_ERROR,
			{
				lookup
			}
		);
	}

	const [field, value] = entries[0];

	if (field === 'id') return eq(category.id, value);
	if (field === 'slug') return eq(category.slug, value);
	return eq(category.name, value);
}

function productLookupPredicate(lookup: ProductLookup): SQL {
	const entries = [
		'id' in lookup && lookup.id ? ['id', lookup.id] : null,
		'slug' in lookup && lookup.slug ? ['slug', lookup.slug] : null
	].filter((entry): entry is ['id' | 'slug', string] => entry !== null);

	if (entries.length !== 1) {
		throw new ProductError(
			'Provide exactly one product lookup field.',
			ErrorCode.VALIDATION_ERROR,
			{
				lookup
			}
		);
	}

	const [field, value] = entries[0];

	if (field === 'id') return eq(product.id, value);
	return eq(product.slug, value);
}

function tagLookupPredicate(lookup: TagLookup): SQL {
	const entries = [
		'id' in lookup && lookup.id ? ['id', lookup.id] : null,
		'slug' in lookup && lookup.slug ? ['slug', lookup.slug] : null,
		'name' in lookup && lookup.name ? ['name', lookup.name] : null
	].filter((entry): entry is ['id' | 'slug' | 'name', string] => entry !== null);

	if (entries.length !== 1) {
		throw new ProductError('Provide exactly one tag lookup field.', ErrorCode.VALIDATION_ERROR, {
			lookup
		});
	}

	const [field, value] = entries[0];

	if (field === 'id') return eq(tag.id, value);
	if (field === 'slug') return eq(tag.slug, value);
	return eq(tag.name, value);
}

function productListConditions(options: ListProductsOptions, includeInactive: boolean): SQL[] {
	const conditions: SQL[] = [];

	if (!includeInactive) {
		conditions.push(eq(product.isActive, true));
	}

	if (options.categoryId !== undefined) {
		conditions.push(
			options.categoryId === null
				? isNull(product.categoryId)
				: eq(product.categoryId, options.categoryId)
		);
	}

	if (options.tier) conditions.push(eq(product.tier, options.tier));
	if (options.gender) conditions.push(eq(product.gender, options.gender));
	if (options.isFeatured !== undefined) conditions.push(eq(product.isFeatured, options.isFeatured));
	if (options.isNewArrival !== undefined)
		conditions.push(eq(product.isNewArrival, options.isNewArrival));

	return conditions;
}

async function assertCategoryExists(id: string, message: string): Promise<void> {
	const [row] = await getDb()
		.select({ id: category.id })
		.from(category)
		.where(eq(category.id, id))
		.limit(1);

	if (!row) {
		throw new ProductError(message, ErrorCode.CATEGORY_NOT_FOUND, { categoryId: id });
	}
}

async function assertCategoryExistsTx(tx: Db | Tx, id: string, message: string): Promise<void> {
	const [row] = await tx
		.select({ id: category.id })
		.from(category)
		.where(eq(category.id, id))
		.limit(1);

	if (!row) {
		throw new ProductError(message, ErrorCode.CATEGORY_NOT_FOUND, { categoryId: id });
	}
}

async function assertProductExists(id: string, message: string): Promise<void> {
	const [row] = await getDb()
		.select({ id: product.id })
		.from(product)
		.where(eq(product.id, id))
		.limit(1);

	if (!row) {
		throw new ProductError(message, ErrorCode.PRODUCT_NOT_FOUND, { productId: id });
	}
}

async function assertProductExistsTx(tx: Db | Tx, id: string, message: string): Promise<void> {
	const [row] = await tx
		.select({ id: product.id })
		.from(product)
		.where(eq(product.id, id))
		.limit(1);

	if (!row) {
		throw new ProductError(message, ErrorCode.PRODUCT_NOT_FOUND, { productId: id });
	}
}

async function assertVariantBelongsToProduct(
	productId: string,
	variantId: string | null
): Promise<void> {
	if (!variantId) return;

	const existing = await findProductVariantById(variantId, { includeInactive: true });

	if (!existing || existing.productId !== productId) {
		throw new ProductError(
			'Product variant not found for this product.',
			ErrorCode.VARIANT_NOT_FOUND,
			{
				productId,
				variantId
			}
		);
	}
}

async function assertTagsExistTx(tx: Db | Tx, tagIds: string[]): Promise<void> {
	if (tagIds.length === 0) return;

	const rows = await tx.select({ id: tag.id }).from(tag).where(inArray(tag.id, tagIds));
	const foundIds = new Set(rows.map((row) => row.id));
	const missingIds = tagIds.filter((id) => !foundIds.has(id));

	if (missingIds.length > 0) {
		throw new ProductError('One or more tags were not found.', ErrorCode.TAG_NOT_FOUND, {
			tagIds: missingIds
		});
	}
}

async function clearPrimaryProductImagesTx(
	tx: Db | Tx,
	productId: string,
	variantId: string | null
): Promise<void> {
	await tx
		.update(productImage)
		.set({ isPrimary: false })
		.where(productImagePrimaryScopePredicate(productId, variantId));
}

function productImagePrimaryScopePredicate(productId: string, variantId: string | null): SQL {
	if (variantId === null) {
		return and(eq(productImage.productId, productId), isNull(productImage.variantId)) as SQL;
	}

	return and(eq(productImage.productId, productId), eq(productImage.variantId, variantId)) as SQL;
}

function assertExactProductImageOrder(
	productId: string,
	existingRows: ProductImage[],
	imageIdsInOrder: string[]
): void {
	const uniqueImageIds = uniqueStrings(imageIdsInOrder);

	if (uniqueImageIds.length !== imageIdsInOrder.length) {
		throw new ProductError(
			'Image order must not contain duplicate IDs.',
			ErrorCode.VALIDATION_ERROR,
			{
				productId,
				imageIds: imageIdsInOrder
			}
		);
	}

	const existingIds = existingRows.map((row) => row.id);
	const existingIdSet = new Set(existingIds);
	const providedIdSet = new Set(imageIdsInOrder);
	const missingIds = existingIds.filter((id) => !providedIdSet.has(id));
	const unknownIds = imageIdsInOrder.filter((id) => !existingIdSet.has(id));

	if (
		missingIds.length > 0 ||
		unknownIds.length > 0 ||
		imageIdsInOrder.length !== existingIds.length
	) {
		throw new ProductError(
			'Image order must include every product image exactly once.',
			ErrorCode.VALIDATION_ERROR,
			{
				productId,
				missingIds,
				unknownIds
			}
		);
	}
}

async function hydrateProduct(
	row: Product,
	options: { includeInactiveRelations: boolean }
): Promise<ProductDTO> {
	const [dto] = await hydrateProducts([row], options);

	if (!dto) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, {
			productId: row.id
		});
	}

	return dto;
}

async function hydrateProductVariant(row: ProductVariant): Promise<ProductVariantDTO> {
	const productRow = await findProductByLookup({ id: row.productId }, { includeInactive: true });

	if (!productRow) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, {
			productId: row.productId
		});
	}

	return toProductVariantDTO(row, productRow);
}

async function hydrateProducts(
	rows: Product[],
	options: { includeInactiveRelations: boolean }
): Promise<ProductDTO[]> {
	if (rows.length === 0) return [];

	const productIds = rows.map((row) => row.id);
	const categoryIds = uniqueStrings(rows.map((row) => row.categoryId).filter(isString));
	const db = getDb();

	const categoryPromise =
		categoryIds.length > 0
			? db
					.select()
					.from(category)
					.where(
						options.includeInactiveRelations
							? inArray(category.id, categoryIds)
							: and(inArray(category.id, categoryIds), eq(category.isActive, true))
					)
			: Promise.resolve([]);
	const variantsPromise = db
		.select()
		.from(productVariant)
		.where(
			options.includeInactiveRelations
				? inArray(productVariant.productId, productIds)
				: and(inArray(productVariant.productId, productIds), eq(productVariant.isActive, true))
		)
		.orderBy(asc(productVariant.sortOrder), asc(productVariant.size), asc(productVariant.color));
	const imagesPromise = db
		.select()
		.from(productImage)
		.where(inArray(productImage.productId, productIds))
		.orderBy(asc(productImage.position), asc(productImage.createdAt));
	const tagsPromise = db
		.select({
			productId: productTag.productId,
			id: tag.id,
			name: tag.name,
			slug: tag.slug
		})
		.from(productTag)
		.innerJoin(tag, eq(productTag.tagId, tag.id))
		.where(inArray(productTag.productId, productIds))
		.orderBy(asc(tag.name));

	const [categories, variants, images, tagRows] = await Promise.all([
		categoryPromise,
		variantsPromise,
		imagesPromise,
		tagsPromise
	]);
	const categoryById = new Map(categories.map((row) => [row.id, row]));
	const variantsByProductId = groupByProductId(variants);
	const imagesByProductId = groupByProductId(images);
	const tagsByProductId = new Map<string, Tag[]>();

	for (const row of tagRows) {
		const current = tagsByProductId.get(row.productId) ?? [];
		current.push({ id: row.id, name: row.name, slug: row.slug });
		tagsByProductId.set(row.productId, current);
	}

	return rows.map((row) =>
		toProductDTO(row, {
			category: row.categoryId ? (categoryById.get(row.categoryId) ?? null) : null,
			variants: variantsByProductId.get(row.id) ?? [],
			images: imagesByProductId.get(row.id) ?? [],
			tags: tagsByProductId.get(row.id) ?? []
		})
	);
}

function resolveIncludeInactive(
	ctx: ServiceContext | null | undefined,
	includeInactive = false
): boolean {
	if (!includeInactive) return false;
	requireAdmin(ctx?.actor);
	return true;
}

function resolvePrimaryImageUrl(images: ProductImageDTO[]): string | null {
	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return productPrimary.imageUrl;

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return anyPrimary.imageUrl;

	return images[0]?.imageUrl ?? null;
}

function validateResolvedProductPricing(input: {
	tier?: Product['tier'];
	basePrice?: number;
	compareAtPrice?: number | null;
}): void {
	const tier = input.tier ?? 'core';

	if (input.basePrice === undefined) return;

	if (input.compareAtPrice != null && input.compareAtPrice <= input.basePrice) {
		throw new ProductError(
			'compareAtPrice must be greater than basePrice.',
			ErrorCode.VALIDATION_ERROR,
			{ basePrice: input.basePrice, compareAtPrice: input.compareAtPrice }
		);
	}

	if (tier === 'drop' && (input.basePrice < 3000 || input.basePrice > 4500)) {
		throw new ProductError(
			'Drop product basePrice must be between 3000 and 4500.',
			ErrorCode.VALIDATION_ERROR,
			{ tier, basePrice: input.basePrice }
		);
	}

	if (tier === 'core' && (input.basePrice < 2500 || input.basePrice > 3200)) {
		throw new ProductError(
			'Core product basePrice must be between 2500 and 3200.',
			ErrorCode.VALIDATION_ERROR,
			{ tier, basePrice: input.basePrice }
		);
	}
}

async function uploadCategoryImage(
	ctx: ServiceContext,
	categoryId: string,
	image: File
): Promise<UploadedImage> {
	const bucket = requireMediaBucket(ctx);
	let key: string;

	try {
		key = buildMediaKey({
			scope: 'categories',
			entityId: categoryId,
			variant: 'image',
			contentType: image.type
		});
		await uploadImage(bucket, key, image);
	} catch (error) {
		if (isAppError(error)) throw error;

		const message = getErrorMessage(error);
		throw new MediaError('Category image upload failed.', resolveMediaUploadCode(message), {
			cause: message
		});
	}

	return { bucket, key };
}

async function uploadProductImage(
	ctx: ServiceContext,
	productId: string,
	variantId: string | null,
	image: File
): Promise<UploadedImage> {
	const bucket = requireMediaBucket(ctx);
	let key: string;

	try {
		key = buildMediaKey({
			scope: 'products',
			entityId: productId,
			variant: variantId ? `variant-${variantId}` : 'main',
			contentType: image.type
		});
		await uploadImage(bucket, key, image);
	} catch (error) {
		if (isAppError(error)) throw error;

		const message = getErrorMessage(error);
		throw new MediaError('Product image upload failed.', resolveMediaUploadCode(message), {
			cause: message
		});
	}

	return { bucket, key };
}

function resolveMediaUploadCode(message: string): ErrorCode {
	return message.includes('Unsupported') || message.includes('empty') || message.includes('large')
		? ErrorCode.INVALID_MEDIA_TYPE
		: ErrorCode.MEDIA_UPLOAD_FAILED;
}

function requireMediaBucket(ctx: ServiceContext): R2Bucket {
	if (!ctx.event) {
		throw new MediaError(
			'Request event is required for media changes.',
			ErrorCode.MEDIA_UPLOAD_FAILED
		);
	}

	try {
		return getMediaBucket(ctx.event);
	} catch (error) {
		if (isAppError(error)) throw error;

		throw new MediaError('R2 media bucket is not configured.', ErrorCode.MEDIA_UPLOAD_FAILED, {
			cause: getErrorMessage(error)
		});
	}
}

function mapCategoryPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new ProductError('Category slug already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ProductError('Related category not found.', ErrorCode.CATEGORY_NOT_FOUND);
	}

	throw error;
}

function mapProductPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new ProductError('Product slug already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ProductError('Related product record not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}

function mapTagPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		if (message.includes('tag.name')) {
			throw new ProductError('Tag name already exists.', ErrorCode.CONFLICT);
		}

		if (message.includes('tag.slug')) {
			throw new ProductError('Tag slug already exists.', ErrorCode.CONFLICT);
		}

		throw new ProductError('Tag already exists.', ErrorCode.CONFLICT);
	}

	throw error;
}

function mapProductTagPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new ProductError('Product tag already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ProductError('Related product or tag not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}

function mapProductVariantPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		if (message.includes('product_variant.sku')) {
			throw new ProductError('Product variant SKU already exists.', ErrorCode.CONFLICT);
		}

		if (
			message.includes('variant_product_size_color_idx') ||
			message.includes('product_variant.product_id') ||
			message.includes('product_variant.size') ||
			message.includes('product_variant.color')
		) {
			throw new ProductError(
				'Product variant size and color already exist for this product.',
				ErrorCode.CONFLICT
			);
		}

		throw new ProductError('Product variant already exists.', ErrorCode.CONFLICT);
	}

	if (isCheckConstraintError(message)) {
		throw new ProductError('Invalid product variant data.', ErrorCode.VALIDATION_ERROR);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND);
	}

	throw error;
}

function mapProductImagePersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new ProductError(
			'A primary product image already exists for this scope.',
			ErrorCode.CONFLICT
		);
	}

	if (isCheckConstraintError(message)) {
		throw new ProductError('Invalid product image data.', ErrorCode.VALIDATION_ERROR);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ProductError('Related product image record not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}

function normalizeTagIds(tagIds: string[] | undefined): string[] {
	if (tagIds === undefined) return [];

	const normalized = uniqueStrings(tagIds);

	if (normalized.some((id) => id.trim().length === 0 || id.length > 64)) {
		throw new ProductError('Invalid tag IDs.', ErrorCode.VALIDATION_ERROR, { tagIds });
	}

	return normalized;
}

function normalizeTagId(tagId: string): string {
	const [normalizedTagId] = normalizeTagIds([tagId]);

	if (!normalizedTagId) {
		throw new ProductError('Invalid tag ID.', ErrorCode.VALIDATION_ERROR, { tagId });
	}

	return normalizedTagId;
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
