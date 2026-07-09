import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNull,
	like,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { requireAdmin } from '$lib/server/foundation/guards';
import { generateSlug } from '$lib/shared/slug';
import {
	ErrorCode,
	getErrorMessage,
	isAppError,
	MediaError,
	ProductError
} from '$lib/server/infrastructure/errors';
import {
	buildMediaKey,
	deleteObjectSafe,
	getImagesBindingOptional,
	getMediaBucket,
	getMediaBucketOptional,
	uploadImage
} from '$lib/server/infrastructure/media/r2';
import { mediaUrl } from '$lib/server/infrastructure/media';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isString,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	uniqueStrings
} from '$lib/server/foundation/utils';
import {
	category,
	color,
	insertCategorySchema,
	insertColorSchema,
	insertProductImageSchema,
	insertProductSchema,
	insertProductVariantSchema,
	insertProductVariantColorSchema,
	insertTagSchema,
	product,
	productImage,
	productTag,
	productVariant,
	productVariantColor,
	SIZE_TIERS,
	tag,
	updateCategorySchema,
	updateProductSchema,
	updateProductVariantSchema,
	updateProductVariantColorSchema,
	updateTagSchema,
	type Category,
	type Color,
	type InsertCategory,
	type InsertColor,
	type InsertProduct,
	type InsertProductImage,
	type InsertProductVariant,
	type InsertProductVariantColor,
	type InsertTag,
	type NewCategory,
	type NewProduct,
	type NewProductImage,
	type NewProductVariant,
	type NewProductVariantColor,
	type Product,
	type ProductImage,
	type SizeTier,
	type ProductVariant,
	type ProductVariantColor,
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
	CreateProductDraftVariantInput,
	CreateProductImageMetadataInput,
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
	UpdateTagInput,
	CreateProductVariantColorInput,
	UpdateProductVariantColorInput,
	UpdateProductFullInput,
	ProductStatsDTO
} from './products.types';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

type UploadedImage = {
	bucket: R2Bucket;
	key: string;
};

type UploadedProductImage = UploadedImage & {
	variantId: string | null;
	altText: string | null;
	position: number;
	isPrimary: boolean;
};

type PreparedProductVariants = {
	colors: (NewProductVariantColor & { clientId: string })[];
	variants: NewProductVariant[];
};

type NormalizedProductImageMetadata = {
	variantClientId: string | null;
	variantId: string | null;
	altText: string | null;
	position: number;
	isPrimary: boolean;
};

type NormalizedUpdateProductVariant = {
	id: string;
	colorId: string | null;
	color: string;
	colorHex: string | null;
	basePrice: number;
	compareAtPrice: number | null;
	sortOrder: number;
	sizes: SizeTier[];
	isNew: boolean;
	isDeleted: boolean;
};

type NormalizedUpdateProductImage = {
	id: string;
	variantId: string | null;
	altText: string | null;
	position: number;
	isPrimary: boolean;
	isNew: boolean;
	isDeleted: boolean;
	fileIndex?: number;
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

	const {
		tagIds,
		newTagNames,
		images,
		primaryImageIndex,
		variants,
		imageMetadata,
		...rawData
	} = input;
	const data = parseInsertProduct(rawData);

	const normalizedTagIds = normalizeTagIds(tagIds);
	const normalizedNewTagNames = normalizeNewTagNames(newTagNames);
	const productId = nanoid();
	const prepared = prepareCreateProductVariants(productId, variants);
	const variantIdByClientId = new Map<string, string>(
		prepared.colors.map((c) => [c.clientId, c.id!])
	);
	const productImages = images ?? [];
	const normalizedImageMetadata = normalizeCreateProductImageMetadata(
		imageMetadata,
		productImages.length,
		data.name,
		primaryImageIndex,
		variantIdByClientId
	);
	const uploadedImages = await uploadProductImages(
		ctx,
		productId,
		productImages,
		normalizedImageMetadata
	);
	const db = getDb();

	try {
		const created = await db.transaction(async (tx) => {
			if (data.categoryId) {
				await assertCategoryExistsTx(tx, data.categoryId, 'Product category not found.');
			}

			const resolvedTagIds = await resolveProductTagIdsTx(
				tx,
				normalizedTagIds,
				normalizedNewTagNames
			);
			const values: NewProduct = {
				id: productId,
				...data
			};

			const [row] = await tx.insert(product).values(values).returning();

			if (!row) {
				throw new ProductError('Product was not created.', ErrorCode.INTERNAL_ERROR);
			}

			if (resolvedTagIds.length > 0) {
				await tx.insert(productTag).values(
					resolvedTagIds.map((tagId) => ({
						productId: row.id,
						tagId
					}))
				);
			}

			if (prepared.colors.length > 0) {
				await tx.insert(productVariantColor).values(
					prepared.colors.map(
						(c): NewProductVariantColor => ({
							id: c.id,
							productId: c.productId,
							colorId: c.colorId ?? null,
							color: c.color,
							colorHex: c.colorHex,
							basePrice: c.basePrice,
							compareAtPrice: c.compareAtPrice,
							sortOrder: c.sortOrder
						})
					)
				);
			}

			if (prepared.variants.length > 0) {
				await tx.insert(productVariant).values(
					prepared.variants.map(
						(v): NewProductVariant => ({
							id: v.id,
							productId: v.productId,
							variantColorId: v.variantColorId,
							size: v.size,
							isActive: v.isActive,
							sortOrder: v.sortOrder
						})
					)
				);
			}

			if (uploadedImages.length > 0) {
				await tx.insert(productImage).values(
					uploadedImages.map(
						(image): NewProductImage => ({
							productId: row.id,
							variantId: image.variantId,
							r2Key: image.key,
							altText: image.altText,
							position: image.position,
							isPrimary: image.isPrimary
						})
					)
				);
			}

			return row;
		});

		return hydrateProduct(created, { includeInactiveRelations: true });
	} catch (error) {
		await cleanupUploadedImages(uploadedImages);
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

	const { tagIds, newTagNames, ...rawData } = input;
	const data = parseUpdateProduct(rawData);

	const normalizedTagIds = normalizeTagIds(tagIds);
	const normalizedNewTagNames = normalizeNewTagNames(newTagNames);
	const updateValues = removeUndefinedValues(data);

	if (
		Object.keys(updateValues).length === 0 &&
		tagIds === undefined &&
		newTagNames === undefined
	) {
		return hydrateProduct(existing, { includeInactiveRelations: true });
	}

	try {
		const updated = await getDb().transaction(async (tx) => {
			if (data.categoryId) {
				await assertCategoryExistsTx(tx, data.categoryId, 'Product category not found.');
			}

			const shouldUpdateTags = tagIds !== undefined || newTagNames !== undefined;
			const resolvedTagIds = shouldUpdateTags
				? await resolveProductTagIdsTx(tx, normalizedTagIds, normalizedNewTagNames)
				: [];

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

			if (shouldUpdateTags) {
				await tx.delete(productTag).where(eq(productTag.productId, existing.id));

				if (resolvedTagIds.length > 0) {
					await tx.insert(productTag).values(
						resolvedTagIds.map((tagId) => ({
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

export async function updateProductFull(
	ctx: ServiceContext,
	lookup: ProductLookup,
	input: UpdateProductFullInput
): Promise<ProductDTO> {
	requireAdmin(ctx.actor);

	const existing = await findProductByLookup(lookup, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
	}

	const {
		tagIds,
		newTagNames,
		variants: rawVariants = [],
		images: rawImages = [],
		newImageFiles = [],
		...rawData
	} = input;

	const data = parseUpdateProduct(rawData);

	const normalizedTagIds = normalizeTagIds(tagIds);
	const normalizedNewTagNames = normalizeNewTagNames(newTagNames);
	const updateValues = removeUndefinedValues(data);
	const variants = normalizeUpdateProductDraftVariants(rawVariants);
	const images = normalizeUpdateProductDraftImages(rawImages);

	await assertUpdateProductFullOwnership(existing.id, variants, images);

	// Generate and map client-side UUIDs to new DB IDs
	const clientToDbColorId = new Map<string, string>();
	for (const variant of variants) {
		if (variant.isNew) {
			clientToDbColorId.set(variant.id, nanoid());
		} else {
			clientToDbColorId.set(variant.id, variant.id);
		}
	}

	const uploadedR2Images: UploadedImage[] = [];
	const newImageInsertData: {
		id: string;
		variantId: string | null;
		r2Key: string;
		altText: string | null;
		position: number;
		isPrimary: boolean;
	}[] = [];
	const deleteMediaBucket = images.some((image) => image.isDeleted && !image.isNew)
		? requireMediaBucket(ctx)
		: null;

	try {
		for (const img of images) {
			if (img.isNew && !img.isDeleted) {
				if (
					img.fileIndex === undefined ||
					img.fileIndex < 0 ||
					img.fileIndex >= newImageFiles.length
				) {
					throw new ProductError('New image is missing matching file.', ErrorCode.VALIDATION_ERROR);
				}
				const file = newImageFiles[img.fileIndex];
				const resolvedVariantId = img.variantId
					? clientToDbColorId.get(img.variantId) || null
					: null;

				const uploadResult = await uploadProductImage(ctx, existing.id, resolvedVariantId, file);

				uploadedR2Images.push({
					bucket: uploadResult.bucket,
					key: uploadResult.key
				});

				newImageInsertData.push({
					id: img.id,
					variantId: resolvedVariantId,
					r2Key: uploadResult.key,
					altText: img.altText ?? null,
					position: img.position,
					isPrimary: img.isPrimary
				});
			}
		}
	} catch (error) {
		await cleanupUploadedImages(uploadedR2Images);
		throw error;
	}

	const deletedImageKeys: string[] = [];

	try {
		const updated = await getDb().transaction(async (tx) => {
			if (data.categoryId) {
				await assertCategoryExistsTx(tx, data.categoryId, 'Product category not found.');
			}

			const shouldUpdateTags = tagIds !== undefined || newTagNames !== undefined;
			const resolvedTagIds = shouldUpdateTags
				? await resolveProductTagIdsTx(tx, normalizedTagIds, normalizedNewTagNames)
				: [];

			const [productRow] =
				Object.keys(updateValues).length > 0
					? await tx
							.update(product)
							.set(updateValues)
							.where(eq(product.id, existing.id))
							.returning()
					: [existing];

			if (!productRow) {
				throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
			}

			if (shouldUpdateTags) {
				await tx.delete(productTag).where(eq(productTag.productId, existing.id));

				if (resolvedTagIds.length > 0) {
					await tx.insert(productTag).values(
						resolvedTagIds.map((tagId) => ({
							productId: existing.id,
							tagId
						}))
					);
				}
			}

			// Sync variants (variant colors & size variants)
			for (const v of variants) {
				const dbColorId = clientToDbColorId.get(v.id)!;

				if (v.isDeleted) {
					await tx.delete(productVariantColor).where(eq(productVariantColor.id, dbColorId));
				} else if (v.isNew) {
					await tx.insert(productVariantColor).values({
						id: dbColorId,
						productId: existing.id,
						colorId: v.colorId ?? null,
						color: v.color,
						colorHex: v.colorHex ?? null,
						basePrice: v.basePrice,
						compareAtPrice: v.compareAtPrice ?? null,
						sortOrder: v.sortOrder
					});

					if (v.sizes && v.sizes.length > 0) {
						await tx.insert(productVariant).values(
							v.sizes.map((size) => ({
								id: nanoid(),
								productId: existing.id,
								variantColorId: dbColorId,
								size,
								isActive: true,
								sortOrder: 1
							}))
						);
					}
				} else {
					await tx
						.update(productVariantColor)
						.set({
							colorId: v.colorId ?? null,
							color: v.color,
							colorHex: v.colorHex ?? null,
							basePrice: v.basePrice,
							compareAtPrice: v.compareAtPrice ?? null,
							sortOrder: v.sortOrder
						})
						.where(eq(productVariantColor.id, dbColorId));

					const dbSizes = await tx
						.select()
						.from(productVariant)
						.where(eq(productVariant.variantColorId, dbColorId));

					const dbSizeTiers = dbSizes.map((ds) => ds.size);
					const sizesToInsert = v.sizes.filter((sz) => !dbSizeTiers.includes(sz));
					const sizesToDelete = dbSizes.filter((ds) => !v.sizes.includes(ds.size));

					if (sizesToInsert.length > 0) {
						await tx.insert(productVariant).values(
							sizesToInsert.map((size) => ({
								id: nanoid(),
								productId: existing.id,
								variantColorId: dbColorId,
								size,
								isActive: true,
								sortOrder: 1
							}))
						);
					}

					if (sizesToDelete.length > 0) {
						await tx.delete(productVariant).where(
							inArray(
								productVariant.id,
								sizesToDelete.map((d) => d.id)
							)
						);
					}
				}
			}

			// Sync images
			if (images.length > 0) {
				await tx
					.update(productImage)
					.set({ isPrimary: false })
					.where(eq(productImage.productId, existing.id));
			}

			for (const img of images) {
				const resolvedVariantId = img.variantId
					? clientToDbColorId.get(img.variantId) || null
					: null;

				if (img.isDeleted) {
					const [dbImg] = await tx
						.select({ r2Key: productImage.r2Key })
						.from(productImage)
						.where(eq(productImage.id, img.id));
					if (dbImg) {
						deletedImageKeys.push(dbImg.r2Key);
					}
					await tx.delete(productImage).where(eq(productImage.id, img.id));
				} else if (img.isNew) {
					const insertData = newImageInsertData.find((d) => d.id === img.id);
					if (insertData) {
						await tx.insert(productImage).values({
							id: insertData.id,
							productId: existing.id,
							variantId: resolvedVariantId,
							r2Key: insertData.r2Key,
							altText: img.altText ?? null,
							position: img.position,
							isPrimary: img.isPrimary
						});
					}
				} else {
					await tx
						.update(productImage)
						.set({
							variantId: resolvedVariantId,
							altText: img.altText ?? null,
							position: img.position,
							isPrimary: img.isPrimary
						})
						.where(eq(productImage.id, img.id));
				}
			}

			// Normalize primary states (ensuring exactly one primary per product-wide and per variant)
			const remainingImages = await tx
				.select()
				.from(productImage)
				.where(eq(productImage.productId, existing.id));

			if (remainingImages.length > 0) {
				const globalImages = remainingImages.filter((ri) => !ri.variantId);
				const globalPrimary = globalImages.filter((ri) => ri.isPrimary);
				if (globalImages.length > 0 && globalPrimary.length !== 1) {
					await tx
						.update(productImage)
						.set({ isPrimary: false })
						.where(and(eq(productImage.productId, existing.id), isNull(productImage.variantId)));
					await tx
						.update(productImage)
						.set({ isPrimary: true })
						.where(eq(productImage.id, globalImages[0].id));
				}

				const variantGroups = new Map<string, typeof remainingImages>();
				for (const img of remainingImages) {
					if (img.variantId) {
						if (!variantGroups.has(img.variantId)) {
							variantGroups.set(img.variantId, []);
						}
						variantGroups.get(img.variantId)!.push(img);
					}
				}

				for (const [vId, vImgs] of variantGroups.entries()) {
					const primary = vImgs.filter((ri) => ri.isPrimary);
					if (primary.length !== 1) {
						await tx
							.update(productImage)
							.set({ isPrimary: false })
							.where(eq(productImage.variantId, vId));
						await tx
							.update(productImage)
							.set({ isPrimary: true })
							.where(eq(productImage.id, vImgs[0].id));
					}
				}
			}

			return productRow;
		});

		if (deleteMediaBucket && deletedImageKeys.length > 0) {
			await Promise.all(deletedImageKeys.map((key) => deleteObjectSafe(deleteMediaBucket, key)));
		}

		return hydrateProduct(updated, { includeInactiveRelations: true });
	} catch (error) {
		await cleanupUploadedImages(uploadedR2Images);
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

			if (keys.length > 0 && ctx.event) {
				bucket = getMediaBucketOptional(ctx.event);
			}

			// Delete related images first to avoid cascade UNIQUE constraint conflicts in SQLite
			await tx.delete(productImage).where(eq(productImage.productId, existing.id));

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

	const [colorRow] = await getDb()
		.select()
		.from(productVariantColor)
		.where(
			and(
				eq(productVariantColor.id, data.variantColorId),
				eq(productVariantColor.productId, data.productId)
			)
		)
		.limit(1);

	if (!colorRow) {
		throw new ProductError(
			'Product variant color not found for this product.',
			ErrorCode.VALIDATION_ERROR,
			{
				productId: data.productId,
				variantColorId: data.variantColorId
			}
		);
	}

	try {
		const [created] = await getDb().insert(productVariant).values(data).returning();

		if (!created) {
			throw new ProductError('Product variant was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return toProductVariantDTO(created, colorRow);
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

export async function createProductVariantColor(
	ctx: ServiceContext,
	productId: string,
	input: CreateProductVariantColorInput
): Promise<ProductVariantColor> {
	requireAdmin(ctx.actor);

	const parsed = parseInsertProductVariantColor(productId, input);
	const db = getDb();

	try {
		const [created] = await db
			.insert(productVariantColor)
			.values({
				id: nanoid(),
				productId,
				color: parsed.color,
				colorHex: parsed.colorHex,
				basePrice: parsed.basePrice,
				compareAtPrice: parsed.compareAtPrice,
				sortOrder: parsed.sortOrder ?? 0
			})
			.returning();

		if (!created) {
			throw new ProductError('Product variant color was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return created;
	} catch (error) {
		throw mapProductPersistenceError(error);
	}
}

export async function updateProductVariantColor(
	ctx: ServiceContext,
	colorId: string,
	input: UpdateProductVariantColorInput
): Promise<ProductVariantColor> {
	requireAdmin(ctx.actor);

	const db = getDb();
	const result = updateProductVariantColorSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product variant color data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	const updateValues = removeUndefinedValues(result.data);

	try {
		const [updated] = await db
			.update(productVariantColor)
			.set(updateValues)
			.where(eq(productVariantColor.id, colorId))
			.returning();

		if (!updated) {
			throw new ProductError('Product variant color not found.', ErrorCode.VARIANT_NOT_FOUND, {
				colorId
			});
		}

		return updated;
	} catch (error) {
		throw mapProductPersistenceError(error);
	}
}

export async function deleteProductVariantColor(
	ctx: ServiceContext,
	colorId: string
): Promise<void> {
	requireAdmin(ctx.actor);

	const db = getDb();

	try {
		const [deleted] = await db
			.delete(productVariantColor)
			.where(eq(productVariantColor.id, colorId))
			.returning({ id: productVariantColor.id });

		if (!deleted) {
			throw new ProductError('Product variant color not found.', ErrorCode.VARIANT_NOT_FOUND, {
				colorId
			});
		}
	} catch (error) {
		throw mapProductPersistenceError(error);
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
		.select({
			variant: productVariant,
			color: productVariantColor
		})
		.from(productVariant)
		.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.where(and(...conditions))
		.orderBy(
			asc(productVariant.sortOrder),
			asc(productVariant.size),
			asc(productVariantColor.color)
		)
		.limit(limit)
		.offset(offset);

	return rows.map(({ variant, color }) => toProductVariantDTO(variant, color));
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listColors(_ctx: ServiceContext): Promise<Color[]> {
	const db = getDb();
	let rows = await db.select().from(color).orderBy(asc(color.name));
	if (rows.length === 0) {
		const blackId = nanoid();
		const whiteId = nanoid();
		await db
			.insert(color)
			.values([
				{ id: blackId, name: 'Black', hex: '#000000' },
				{ id: whiteId, name: 'White', hex: '#ffffff' }
			])
			.onConflictDoNothing();
		rows = await db.select().from(color).orderBy(asc(color.name));
	}
	return rows;
}

function formatColorName(val: string): string {
	return val
		.split(' ')
		.map((word) => {
			if (!word) return '';
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join(' ')
		.trim();
}

export async function createColor(ctx: ServiceContext, input: InsertColor): Promise<Color> {
	requireAdmin(ctx.actor);

	const parsed = insertColorSchema.parse(input);
	const db = getDb();

	const formattedName = formatColorName(parsed.name);
	const hexValue = parsed.hex.toUpperCase();

	// Check if name or hex already exists case-insensitively / normalized
	const existing = await db
		.select()
		.from(color)
		.where(
			or(
				sql`lower(${color.name}) = ${formattedName.toLowerCase()}`,
				sql`upper(${color.hex}) = ${hexValue}`
			)
		)
		.limit(1);

	if (existing.length > 0) {
		const match = existing[0];
		if (match.name.toLowerCase() === formattedName.toLowerCase()) {
			throw new ProductError(`Color name "${formattedName}" already exists.`, ErrorCode.CONFLICT);
		} else {
			throw new ProductError(
				`Color hex "${hexValue}" is already used by color "${match.name}".`,
				ErrorCode.CONFLICT
			);
		}
	}

	try {
		const [created] = await db
			.insert(color)
			.values({
				id: nanoid(),
				name: formattedName,
				hex: hexValue
			})
			.returning();

		if (!created) {
			throw new ProductError('Color was not created.', ErrorCode.INTERNAL_ERROR);
		}
		return created;
	} catch (error) {
		throw mapColorPersistenceError(error);
	}
}

export async function deleteColor(ctx: ServiceContext, colorId: string): Promise<void> {
	requireAdmin(ctx.actor);

	const db = getDb();

	// Check if this color is used by any product variant
	const used = await db
		.select({ count: count() })
		.from(productVariantColor)
		.where(eq(productVariantColor.colorId, colorId))
		.limit(1);

	if (used.length > 0 && used[0].count > 0) {
		throw new ProductError(
			'This color is currently used by one or more products and cannot be deleted.',
			ErrorCode.CONFLICT
		);
	}

	try {
		const [deleted] = await db
			.delete(color)
			.where(eq(color.id, colorId))
			.returning({ id: color.id });

		if (!deleted) {
			throw new ProductError('Color not found.', ErrorCode.NOT_FOUND);
		}
	} catch (error) {
		throw mapColorPersistenceError(error);
	}
}

function mapColorPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new ProductError('Color name already exists.', ErrorCode.CONFLICT);
	}

	throw error;
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

function toProductVariantDTO(
	row: ProductVariant,
	colorRow: ProductVariantColor
): ProductVariantDTO {
	return {
		id: row.id,
		productId: row.productId,
		variantColorId: row.variantColorId,
		colorId: colorRow.colorId,
		size: row.size,
		color: colorRow.color,
		colorHex: colorRow.colorHex,
		priceOverride: null,
		basePrice: colorRow.basePrice,
		compareAtPrice: colorRow.compareAtPrice,
		effectivePrice: colorRow.basePrice,
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
		variants: ProductVariantDTO[];
		images: ProductImage[];
		tags: Tag[];
	}
): ProductDTO {
	const images = input.images.map(toProductImageDTO);
	const primaryVariant = input.variants[0];

	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		shortDescription: row.shortDescription,
		categoryId: row.categoryId,
		category: input.category ? toCategoryDTO(input.category) : null,
		basePrice: primaryVariant ? primaryVariant.basePrice : 0,
		compareAtPrice: primaryVariant ? primaryVariant.compareAtPrice : null,
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
		variants: input.variants,
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

function parseInsertProduct(
	input: Omit<
		CreateProductInput,
		| 'tagIds'
		| 'newTagNames'
		| 'images'
		| 'primaryImageIndex'
		| 'variants'
		| 'imageMetadata'
	>
): InsertProduct {
	const result = insertProductSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function parseUpdateProduct(input: Omit<UpdateProductInput, 'tagIds' | 'newTagNames'>): UpdateProduct {
	const result = updateProductSchema.safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function normalizeUpdateProductDraftVariants(input: unknown): NormalizedUpdateProductVariant[] {
	const rows = readRecordArray(input, 'variants');
	const seenIds = new Set<string>();
	const seenColors = new Set<string>();

	return rows.map((row, index) => {
		const id = readRequiredString(row.id, `variants[${index}].id`, 64);
		const isNew = row.isNew === true;
		const isDeleted = row.isDeleted === true;

		if (seenIds.has(id)) {
			throw new ProductError('Product variant IDs must be unique.', ErrorCode.VALIDATION_ERROR, {
				id
			});
		}
		seenIds.add(id);

		if (isDeleted) {
			return {
				id,
				colorId: null,
				color: '',
				colorHex: null,
				basePrice: 2500,
				compareAtPrice: null,
				sortOrder: 0,
				sizes: [],
				isNew,
				isDeleted
			};
		}

		const color = readRequiredString(row.color, `variants[${index}].color`, 50);
		const colorKey = color.toLowerCase();

		if (seenColors.has(colorKey)) {
			throw new ProductError(
				'Product variant color already exists for this product.',
				ErrorCode.CONFLICT,
				{ color }
			);
		}
		seenColors.add(colorKey);

		const colorHex = readNullableString(row.colorHex, `variants[${index}].colorHex`, 7);
		if (colorHex && !/^#[0-9A-Fa-f]{6}$/.test(colorHex)) {
			throw new ProductError('Product variant color hex is invalid.', ErrorCode.VALIDATION_ERROR, {
				colorHex
			});
		}

		const basePrice = readInteger(row.basePrice, `variants[${index}].basePrice`, {
			min: 1
		});
		const compareAtPrice = readNullablePositiveInteger(
			row.compareAtPrice,
			`variants[${index}].compareAtPrice`
		);
		const sortOrder = readInteger(row.sortOrder, `variants[${index}].sortOrder`, {
			min: 0
		});
		const sizes = normalizeUpdateProductSizes(row.sizes, index);

		validateResolvedProductPricing({ basePrice, compareAtPrice });

		const colorId = readNullableString(row.colorId, `variants[${index}].colorId`, 64);

		return {
			id,
			colorId,
			color,
			colorHex,
			basePrice,
			compareAtPrice,
			sortOrder,
			sizes,
			isNew,
			isDeleted
		};
	});
}

function normalizeUpdateProductDraftImages(input: unknown): NormalizedUpdateProductImage[] {
	const rows = readRecordArray(input, 'images');
	const seenIds = new Set<string>();

	const images = rows.map((row, index): NormalizedUpdateProductImage => {
		const id = readRequiredString(row.id, `images[${index}].id`, 64);
		const variantId = readNullableString(row.variantId, `images[${index}].variantId`, 64);
		const altText = readNullableString(row.altText, `images[${index}].altText`, 255);
		const position = readInteger(row.position, `images[${index}].position`, { min: 0 });
		const isNew = row.isNew === true;
		const isDeleted = row.isDeleted === true;
		const fileIndex =
			row.fileIndex === undefined || row.fileIndex === null
				? undefined
				: readInteger(row.fileIndex, `images[${index}].fileIndex`, { min: 0 });

		if (seenIds.has(id)) {
			throw new ProductError('Product image IDs must be unique.', ErrorCode.VALIDATION_ERROR, {
				id
			});
		}
		seenIds.add(id);

		if (isNew && !isDeleted && fileIndex === undefined) {
			throw new ProductError('New image is missing matching file.', ErrorCode.VALIDATION_ERROR, {
				imageId: id
			});
		}

		return {
			id,
			variantId,
			altText,
			position,
			isPrimary: row.isPrimary === true,
			isNew,
			isDeleted,
			fileIndex
		};
	});

	normalizeUpdateProductImagePrimaries(images);
	return images;
}

function normalizeUpdateProductImagePrimaries(images: NormalizedUpdateProductImage[]): void {
	const scopedImages = new Map<string, NormalizedUpdateProductImage[]>();

	for (const image of images) {
		if (image.isDeleted) continue;

		const scope = image.variantId ?? 'product';
		const current = scopedImages.get(scope) ?? [];
		current.push(image);
		scopedImages.set(scope, current);
	}

	for (const entries of scopedImages.values()) {
		const primaryIndex = entries.findIndex((entry) => entry.isPrimary);
		const keepIndex = primaryIndex >= 0 ? primaryIndex : 0;

		for (const [index, entry] of entries.entries()) {
			entry.isPrimary = index === keepIndex;
		}
	}
}

async function assertUpdateProductFullOwnership(
	productId: string,
	variants: NormalizedUpdateProductVariant[],
	images: NormalizedUpdateProductImage[]
): Promise<void> {
	const db = getDb();
	const existingVariantIds = uniqueStrings(
		variants.filter((variant) => !variant.isNew).map((variant) => variant.id)
	);

	if (existingVariantIds.length > 0) {
		const rows = await db
			.select({ id: productVariantColor.id })
			.from(productVariantColor)
			.where(
				and(
					eq(productVariantColor.productId, productId),
					inArray(productVariantColor.id, existingVariantIds)
				)
			);
		const foundIds = new Set(rows.map((row) => row.id));
		const missingIds = existingVariantIds.filter((id) => !foundIds.has(id));

		if (missingIds.length > 0) {
			throw new ProductError(
				'One or more product variants were not found.',
				ErrorCode.VARIANT_NOT_FOUND,
				{
					productId,
					variantIds: missingIds
				}
			);
		}
	}

	const existingImageIds = uniqueStrings(
		images.filter((image) => !image.isNew).map((image) => image.id)
	);

	if (existingImageIds.length > 0) {
		const rows = await db
			.select({ id: productImage.id })
			.from(productImage)
			.where(
				and(eq(productImage.productId, productId), inArray(productImage.id, existingImageIds))
			);
		const foundIds = new Set(rows.map((row) => row.id));
		const missingIds = existingImageIds.filter((id) => !foundIds.has(id));

		if (missingIds.length > 0) {
			throw new ProductError(
				'One or more product images were not found.',
				ErrorCode.MEDIA_NOT_FOUND,
				{
					productId,
					imageIds: missingIds
				}
			);
		}
	}

	const activeVariantIds = new Set(
		variants.filter((variant) => !variant.isDeleted).map((variant) => variant.id)
	);
	const invalidImage = images.find(
		(image) => !image.isDeleted && image.variantId && !activeVariantIds.has(image.variantId)
	);

	if (invalidImage) {
		throw new ProductError(
			'Product image is linked to an unknown or deleted product variant.',
			ErrorCode.VARIANT_NOT_FOUND,
			{
				productId,
				imageId: invalidImage.id,
				variantId: invalidImage.variantId
			}
		);
	}
}

function normalizeUpdateProductSizes(value: unknown, variantIndex: number): SizeTier[] {
	if (!Array.isArray(value)) {
		throw new ProductError(
			'At least one size is required for each product variant.',
			ErrorCode.VALIDATION_ERROR,
			{
				variantIndex
			}
		);
	}

	const seenSizes = new Set<string>();
	const sizes: SizeTier[] = [];

	for (const [sizeIndex, rawSize] of value.entries()) {
		if (typeof rawSize !== 'string' || !(SIZE_TIERS as readonly string[]).includes(rawSize)) {
			throw new ProductError('Invalid product size.', ErrorCode.INVALID_SIZE, {
				variantIndex,
				sizeIndex,
				size: rawSize
			});
		}

		if (seenSizes.has(rawSize)) {
			throw new ProductError(
				'Duplicate sizes are not allowed within the same product variant.',
				ErrorCode.VALIDATION_ERROR,
				{ variantIndex, size: rawSize }
			);
		}

		seenSizes.add(rawSize);
		sizes.push(rawSize as SizeTier);
	}

	if (sizes.length === 0) {
		throw new ProductError(
			'At least one size is required for each product variant.',
			ErrorCode.VALIDATION_ERROR,
			{
				variantIndex
			}
		);
	}

	return sizes;
}

function readRecordArray(value: unknown, fieldName: string): Record<string, unknown>[] {
	if (!Array.isArray(value)) {
		throw new ProductError(`${fieldName} must be an array.`, ErrorCode.VALIDATION_ERROR, {
			fieldName
		});
	}

	return value.map((entry, index) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new ProductError(
				`${fieldName} contains an invalid entry.`,
				ErrorCode.VALIDATION_ERROR,
				{
					fieldName,
					index
				}
			);
		}

		return entry as Record<string, unknown>;
	});
}

function readRequiredString(value: unknown, path: string, maxLength: number): string {
	if (typeof value !== 'string') {
		throw new ProductError(`${path} must be a string.`, ErrorCode.VALIDATION_ERROR, { path });
	}

	const normalized = value.trim();
	if (!normalized || normalized.length > maxLength) {
		throw new ProductError(`${path} is invalid.`, ErrorCode.VALIDATION_ERROR, { path });
	}

	return normalized;
}

function readNullableString(value: unknown, path: string, maxLength: number): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string') {
		throw new ProductError(`${path} must be a string.`, ErrorCode.VALIDATION_ERROR, { path });
	}

	const normalized = value.trim();
	if (!normalized) return null;
	if (normalized.length > maxLength) {
		throw new ProductError(`${path} is too long.`, ErrorCode.VALIDATION_ERROR, { path });
	}

	return normalized;
}

function readInteger(
	value: unknown,
	path: string,
	options: { min?: number; positive?: boolean } = {}
): number {
	const resolved = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

	if (typeof resolved !== 'number' || !Number.isInteger(resolved)) {
		throw new ProductError(`${path} must be an integer.`, ErrorCode.VALIDATION_ERROR, { path });
	}

	if (options.positive && resolved <= 0) {
		throw new ProductError(`${path} must be positive.`, ErrorCode.VALIDATION_ERROR, { path });
	}

	if (options.min !== undefined && resolved < options.min) {
		throw new ProductError(`${path} is below the allowed minimum.`, ErrorCode.VALIDATION_ERROR, {
			path,
			min: options.min
		});
	}

	return resolved;
}

function readNullablePositiveInteger(value: unknown, path: string): number | null {
	if (value === undefined || value === null || value === '') return null;
	return readInteger(value, path, { positive: true });
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

function normalizeNullableId(value: string | null | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function normalizePrimaryImageIndex(value: number | undefined, imageCount: number): number {
	if (imageCount === 0) return 0;

	const index = value ?? 0;
	if (!Number.isInteger(index) || index < 0 || index >= imageCount) {
		throw new ProductError('Primary image selection is invalid.', ErrorCode.VALIDATION_ERROR, {
			primaryImageIndex: value,
			imageCount
		});
	}

	return index;
}

function parseInsertProductVariantColor(
	productId: string,
	input: Omit<InsertProductVariantColor, 'productId'>
): InsertProductVariantColor {
	const result = insertProductVariantColorSchema.safeParse({ ...input, productId });

	if (!result.success) {
		throw new ProductError('Invalid product variant color data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function prepareCreateProductVariants(
	productId: string,
	variants: CreateProductDraftVariantInput[] | undefined
): PreparedProductVariants {
	if (!variants || variants.length === 0) return { colors: [], variants: [] };

	const seenClientIds = new Set<string>();
	const seenColors = new Set<string>();
	const preparedColors: (NewProductVariantColor & { clientId: string })[] = [];
	const preparedVariants: NewProductVariant[] = [];

	for (const variant of variants) {
		const clientId = variant.clientId.trim();

		if (!clientId || clientId.length > 64) {
			throw new ProductError('Invalid draft variant ID.', ErrorCode.VALIDATION_ERROR, {
				clientId: variant.clientId
			});
		}

		if (seenClientIds.has(clientId)) {
			throw new ProductError('Draft variant IDs must be unique.', ErrorCode.VALIDATION_ERROR, {
				clientId
			});
		}

		const colorName = variant.color.trim();
		const colorKey = colorName.toLowerCase();
		if (seenColors.has(colorKey)) {
			throw new ProductError(
				'Product variant color already exists for this product.',
				ErrorCode.CONFLICT,
				{
					color: colorName
				}
			);
		}

		const parsedColor = parseInsertProductVariantColor(productId, {
			colorId: variant.colorId ?? null,
			color: variant.color,
			colorHex: variant.colorHex,
			basePrice: variant.basePrice,
			compareAtPrice: variant.compareAtPrice,
			sortOrder: variant.sortOrder
		});

		validateResolvedProductPricing({
			basePrice: parsedColor.basePrice,
			compareAtPrice: parsedColor.compareAtPrice
		});

		const colorId = nanoid();
		seenClientIds.add(clientId);
		seenColors.add(colorKey);

		preparedColors.push({
			id: colorId,
			clientId,
			productId,
			colorId: parsedColor.colorId ?? null,
			color: parsedColor.color,
			colorHex: parsedColor.colorHex ?? null,
			basePrice: parsedColor.basePrice,
			compareAtPrice: parsedColor.compareAtPrice ?? null,
			sortOrder: parsedColor.sortOrder ?? 0
		});

		if (!variant.sizes || variant.sizes.length === 0) {
			throw new ProductError(
				'At least one size is required for each color variant.',
				ErrorCode.VALIDATION_ERROR,
				{
					color: colorName
				}
			);
		}

		const seenSizes = new Set<string>();
		for (const size of variant.sizes) {
			if (seenSizes.has(size)) {
				throw new ProductError(
					'Duplicate sizes are not allowed within the same color variant.',
					ErrorCode.VALIDATION_ERROR,
					{
						color: colorName,
						size
					}
				);
			}
			seenSizes.add(size);

			const parsedVariant = parseInsertProductVariant(productId, {
				variantColorId: colorId,
				size,
				isActive: true,
				sortOrder: variant.sortOrder
			});

			preparedVariants.push({
				id: nanoid(),
				productId,
				variantColorId: colorId,
				size: parsedVariant.size,
				isActive: parsedVariant.isActive ?? true,
				sortOrder: parsedVariant.sortOrder ?? 0
			});
		}
	}

	return { colors: preparedColors, variants: preparedVariants };
}

function normalizeCreateProductImageMetadata(
	metadata: CreateProductImageMetadataInput[] | undefined,
	imageCount: number,
	productName: string,
	primaryImageIndex: number | undefined,
	variantIdByClientId: Map<string, string>
): NormalizedProductImageMetadata[] {
	if (!metadata || metadata.length === 0) {
		const normalizedPrimaryImageIndex = normalizePrimaryImageIndex(primaryImageIndex, imageCount);

		return Array.from({ length: imageCount }, (_, position) => ({
			variantClientId: null,
			variantId: null,
			altText: productName,
			position,
			isPrimary: position === normalizedPrimaryImageIndex
		}));
	}

	if (metadata.length !== imageCount) {
		throw new ProductError(
			'Image metadata must match the number of uploaded images.',
			ErrorCode.VALIDATION_ERROR,
			{
				imageCount,
				metadataCount: metadata.length
			}
		);
	}

	const normalized = metadata.map((entry, index): NormalizedProductImageMetadata => {
		const variantClientId = normalizeNullableId(entry.variantClientId);
		const variantId = variantClientId ? variantIdByClientId.get(variantClientId) : null;
		const position = entry.position ?? index;
		const altText = entry.altText?.trim() || null;

		if (variantClientId && !variantId) {
			throw new ProductError(
				'Product image variant selection is invalid.',
				ErrorCode.VALIDATION_ERROR,
				{
					variantClientId
				}
			);
		}

		if (!Number.isInteger(position) || position < 0) {
			throw new ProductError('Product image position is invalid.', ErrorCode.VALIDATION_ERROR, {
				position
			});
		}

		if (altText && altText.length > 255) {
			throw new ProductError(
				'Product image alt text must be 255 characters or less.',
				ErrorCode.VALIDATION_ERROR,
				{
					altText
				}
			);
		}

		return {
			variantClientId,
			variantId: variantId ?? null,
			altText,
			position,
			isPrimary: entry.isPrimary ?? false
		};
	});

	ensureOnePrimaryProductImagePerScope(normalized);
	return normalized;
}

function ensureOnePrimaryProductImagePerScope(metadata: NormalizedProductImageMetadata[]): void {
	const byScope = new Map<string, NormalizedProductImageMetadata[]>();

	for (const entry of metadata) {
		const scope = entry.variantId ?? 'product';
		const entries = byScope.get(scope) ?? [];
		entries.push(entry);
		byScope.set(scope, entries);
	}

	for (const [scope, entries] of byScope) {
		const primaryEntries = entries.filter((entry) => entry.isPrimary);

		if (primaryEntries.length > 1) {
			throw new ProductError(
				'Only one primary product image is allowed per product or variant.',
				ErrorCode.VALIDATION_ERROR,
				{
					scope
				}
			);
		}

		if (primaryEntries.length === 0 && entries[0]) {
			entries[0].isPrimary = true;
		}
	}
}

function normalizeNewTagNames(names: string[] | undefined): string[] {
	if (names === undefined) return [];

	const seen = new Set<string>();
	const normalizedNames: string[] = [];

	for (const name of names) {
		const normalizedName = name.trim().replace(/\s+/g, ' ');
		const key = normalizedName.toLowerCase();

		if (!normalizedName || seen.has(key)) continue;
		if (normalizedName.length > 50) {
			throw new ProductError(
				'Tag name must be 50 characters or less.',
				ErrorCode.VALIDATION_ERROR,
				{
					name
				}
			);
		}

		seen.add(key);
		normalizedNames.push(normalizedName);
	}

	return normalizedNames;
}

async function resolveProductTagIdsTx(
	tx: Db | Tx,
	tagIds: string[],
	newTagNames: string[]
): Promise<string[]> {
	await assertTagsExistTx(tx, tagIds);

	if (newTagNames.length === 0) return tagIds;

	const createdOrExistingTagIds = await findOrCreateTagsByNamesTx(tx, newTagNames);
	return uniqueStrings([...tagIds, ...createdOrExistingTagIds]);
}

async function findOrCreateTagsByNamesTx(tx: Db | Tx, names: string[]): Promise<string[]> {
	const tagIds: string[] = [];

	for (const name of names) {
		const slug = generateSlug(name);

		if (!slug) {
			throw new ProductError(
				'Tag name must contain at least one letter or number.',
				ErrorCode.VALIDATION_ERROR,
				{
					name
				}
			);
		}

		const existing = await findTagByLookupTx(tx, { slug });

		if (existing) {
			tagIds.push(existing.id);
			continue;
		}

		try {
			const [created] = await tx.insert(tag).values({ name, slug }).returning();

			if (!created) {
				throw new ProductError('Tag was not created.', ErrorCode.INTERNAL_ERROR);
			}

			tagIds.push(created.id);
		} catch (error) {
			if (!isUniqueConstraintError(getErrorMessage(error))) throw error;

			const concurrent = await findTagByLookupTx(tx, { slug });

			if (!concurrent) throw error;
			tagIds.push(concurrent.id);
		}
	}

	return tagIds;
}

async function findTagByLookupTx(tx: Db | Tx, lookup: TagLookup): Promise<Tag | null> {
	const [row] = await tx.select().from(tag).where(tagLookupPredicate(lookup)).limit(1);
	return row ?? null;
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

	if (options.gender) conditions.push(eq(product.gender, options.gender));
	if (options.isFeatured !== undefined) conditions.push(eq(product.isFeatured, options.isFeatured));
	if (options.isNewArrival !== undefined)
		conditions.push(eq(product.isNewArrival, options.isNewArrival));

	if (options.query) {
		conditions.push(
			or(like(product.name, `%${options.query}%`), like(product.slug, `%${options.query}%`))!
		);
	}

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

	const existing = await getDb()
		.select()
		.from(productVariantColor)
		.where(and(eq(productVariantColor.id, variantId), eq(productVariantColor.productId, productId)))
		.limit(1)
		.then((rows) => rows[0] ?? null);

	if (!existing) {
		throw new ProductError(
			'Product variant color not found for this product.',
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
	const [colorRow] = await getDb()
		.select()
		.from(productVariantColor)
		.where(eq(productVariantColor.id, row.variantColorId))
		.limit(1);

	if (!colorRow) {
		throw new ProductError('Product variant color not found.', ErrorCode.INTERNAL_ERROR, {
			variantColorId: row.variantColorId
		});
	}

	return toProductVariantDTO(row, colorRow);
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
		.select({
			variant: productVariant,
			color: productVariantColor
		})
		.from(productVariant)
		.innerJoin(productVariantColor, eq(productVariant.variantColorId, productVariantColor.id))
		.where(
			options.includeInactiveRelations
				? inArray(productVariant.productId, productIds)
				: and(inArray(productVariant.productId, productIds), eq(productVariant.isActive, true))
		)
		.orderBy(
			asc(productVariant.sortOrder),
			asc(productVariant.size),
			asc(productVariantColor.color)
		);
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

	const variantsByProductId = new Map<string, ProductVariantDTO[]>();
	for (const row of variants) {
		const pid = row.variant.productId;
		const current = variantsByProductId.get(pid) ?? [];
		current.push(toProductVariantDTO(row.variant, row.color));
		variantsByProductId.set(pid, current);
	}

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
	basePrice?: number;
	compareAtPrice?: number | null;
}): void {
	if (input.basePrice === undefined) return;

	if (input.compareAtPrice != null && input.compareAtPrice <= input.basePrice) {
		throw new ProductError(
			'compareAtPrice must be greater than basePrice.',
			ErrorCode.VALIDATION_ERROR,
			{ basePrice: input.basePrice, compareAtPrice: input.compareAtPrice }
		);
	}

	if (input.basePrice < 2500 || input.basePrice > 3200) {
		throw new ProductError(
			'Product basePrice must be between 2500 and 3200.',
			ErrorCode.VALIDATION_ERROR,
			{ basePrice: input.basePrice }
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
		await uploadImage(bucket, key, image, {
			images: getImagesBindingOptional(ctx.event),
			profile: 'category'
		});
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
		await uploadImage(bucket, key, image, {
			images: getImagesBindingOptional(ctx.event),
			profile: 'product'
		});
	} catch (error) {
		if (isAppError(error)) throw error;

		const message = getErrorMessage(error);
		throw new MediaError('Product image upload failed.', resolveMediaUploadCode(message), {
			cause: message
		});
	}

	return { bucket, key };
}

async function uploadProductImages(
	ctx: ServiceContext,
	productId: string,
	images: File[],
	metadata: NormalizedProductImageMetadata[]
): Promise<UploadedProductImage[]> {
	if (images.length === 0) return [];

	const uploadedImages: UploadedProductImage[] = [];

	try {
		for (const [position, image] of images.entries()) {
			const imageMetadata = metadata[position];

			if (!imageMetadata) {
				throw new ProductError(
					'Image metadata must match the number of uploaded images.',
					ErrorCode.VALIDATION_ERROR,
					{
						imageIndex: position
					}
				);
			}

			const uploaded = await uploadProductImage(ctx, productId, imageMetadata.variantId, image);

			uploadedImages.push({
				...uploaded,
				variantId: imageMetadata.variantId,
				altText: imageMetadata.altText,
				position: imageMetadata.position,
				isPrimary: imageMetadata.isPrimary
			});
		}
	} catch (error) {
		await cleanupUploadedImages(uploadedImages);
		throw error;
	}

	return uploadedImages;
}

async function cleanupUploadedImages(images: UploadedImage[]): Promise<void> {
	await Promise.all(images.map((image) => deleteObjectSafe(image.bucket, image.key)));
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

	if (message.includes('product_variant')) {
		mapProductVariantPersistenceError(error);
	}

	if (message.includes('product_image')) {
		mapProductImagePersistenceError(error);
	}

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

export async function getProductStats(ctx: ServiceContext): Promise<ProductStatsDTO> {
	requireAdmin(ctx.actor);
	const db = getDb();

	const [totalRows, activeRows] = await Promise.all([
		db.select({ count: count() }).from(product),
		db.select({ count: count() }).from(product).where(eq(product.isActive, true))
	]);

	const total = Number(totalRows[0]?.count ?? 0);
	const active = Number(activeRows[0]?.count ?? 0);
	const inactive = Math.max(0, total - active);

	return {
		total,
		active,
		inactive
	};
}
