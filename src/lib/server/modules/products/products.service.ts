import { and, asc, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import {
	guardBatchCondition,
	guardPreviousBatchChanges,
	isD1BatchGuardError
} from '$lib/server/db/batch';
import {
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation
} from '$lib/server/db/retry';
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
	getMediaBucket,
	getMediaBucketOptional,
	isInvalidImageUploadMessage,
	uploadImage,
	type StoredImageMetadata
} from '$lib/server/infrastructure/media/r2';
import { mediaPresetUrl } from '$lib/server/infrastructure/media';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	hasInventoryHistoryForVariantIdsTx,
	type InventoryTx
} from '../inventory/inventory.service';
import { review as reviewTable } from '../reviews/reviews.drizzle';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isString,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow,
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
	type NewTag,
	type NewCategory,
	type NewColor,
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
	ListProductsByIdsInput,
	ListProductsOptions,
	ListProductVariantsOptions,
	ListTagsOptions,
	ProductDTO,
	ProductImageDTO,
	ProductListResult,
	ProductLookup,
	ProductVariantDTO,
	PublicCategoryDTO,
	PublicProductDTO,
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
type Tx = Db;
type BatchItem = Parameters<Db['batch']>[0][number];

type UploadedImage = StoredImageMetadata & {
	bucket: R2Bucket;
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
	const db = getDb();
	const values: NewCategory = {
		id,
		...data,
		imageR2Key: uploadedImage?.key ?? null,
		imageMimeType: uploadedImage?.mimeType ?? null,
		imageByteSize: uploadedImage?.byteSize ?? null,
		imageOriginalFilename: uploadedImage?.originalFilename ?? null,
		imageWidth: null,
		imageHeight: null
	};

	try {
		if (data.parentId) {
			await assertCategoryExists(data.parentId, 'Parent category not found.');
		}

		const created = await withTransientD1WriteReconciliation<Category>(
			async () => {
				const [row] = await db.insert(category).values(values).returning();
				if (!row) {
					throw new ProductError('Category was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db.select().from(category).where(eq(category.id, id)).limit(1);
				return row && row.imageR2Key === values.imageR2Key
					? { committed: true, value: row }
					: { committed: false };
			}
		);

		return toCategoryDTO(created);
	} catch (error) {
		if (uploadedImage) {
			await cleanupUnreferencedCategoryImage(uploadedImage);
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
	const rows = await withTransientD1ReadRetry(() => (where ? query.where(where) : query));

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
		await assertCategoryParentDoesNotCreateCycle(existing.id, data.parentId);
	}

	const uploadedImage = image ? await uploadCategoryImage(ctx, existing.id, image) : null;
	const removeImageBucket =
		removeImage && existing.imageR2Key && !uploadedImage ? requireMediaBucket(ctx) : null;
	const updateValues: Partial<NewCategory> = removeUndefinedValues({
		...data,
		imageR2Key: uploadedImage ? uploadedImage.key : removeImage ? null : undefined,
		imageMimeType: uploadedImage ? uploadedImage.mimeType : removeImage ? null : undefined,
		imageByteSize: uploadedImage ? uploadedImage.byteSize : removeImage ? null : undefined,
		imageOriginalFilename: uploadedImage
			? uploadedImage.originalFilename
			: removeImage
				? null
				: undefined,
		imageWidth: uploadedImage ? null : removeImage ? null : undefined,
		imageHeight: uploadedImage ? null : removeImage ? null : undefined
	});

	if (Object.keys(updateValues).length === 0) {
		return toCategoryDTO(existing);
	}

	try {
		const db = getDb();
		const now = resolveNow(ctx);
		const stableUpdateValues: Partial<NewCategory> = { ...updateValues, updatedAt: now };
		const updated = await withTransientD1WriteReconciliation<Category>(
			async () => {
				const [row] = await db
					.update(category)
					.set(stableUpdateValues)
					.where(and(eq(category.id, existing.id), eq(category.updatedAt, existing.updatedAt)))
					.returning();
				if (!row) {
					throw new ProductError(
						'Category changed before it could be updated.',
						ErrorCode.CONFLICT,
						{ lookup }
					);
				}
				return row;
			},
			async () => {
				const [row] = await db.select().from(category).where(eq(category.id, existing.id)).limit(1);
				return row && recordMatchesPatch(row, stableUpdateValues)
					? { committed: true, value: row }
					: { committed: false };
			}
		);

		if ((uploadedImage || removeImage) && existing.imageR2Key) {
			const bucket = uploadedImage?.bucket ?? removeImageBucket;

			if (!bucket) return toCategoryDTO(updated);

			await deleteObjectSafe(bucket, existing.imageR2Key);
		}

		return toCategoryDTO(updated);
	} catch (error) {
		if (uploadedImage) {
			await cleanupUnreferencedCategoryImage(uploadedImage);
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
		const db = getDb();
		await withTransientD1WriteReconciliation(
			async () => {
				const [deleted] = await db
					.delete(category)
					.where(eq(category.id, existing.id))
					.returning({ id: category.id });
				if (!deleted) {
					throw new ProductError('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { lookup });
				}
			},
			async () => {
				const [row] = await db
					.select({ id: category.id })
					.from(category)
					.where(eq(category.id, existing.id))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
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

	const { tagIds, newTagNames, images, primaryImageIndex, variants, imageMetadata, ...rawData } =
		input;
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

	let created: Product;
	try {
		if (data.categoryId) {
			await assertCategoryExistsTx(db, data.categoryId, 'Product category not found.');
		}
		const resolvedTags = await resolveProductTagsTx(db, normalizedTagIds, normalizedNewTagNames);
		const imageValues = uploadedImages.map(
			(image): NewProductImage => ({
				id: nanoid(),
				productId,
				variantId: image.variantId,
				r2Key: image.key,
				mimeType: image.mimeType,
				byteSize: image.byteSize,
				originalFilename: image.originalFilename,
				width: null,
				height: null,
				altText: image.altText,
				position: image.position,
				isPrimary: image.isPrimary
			})
		);
		const statements: [BatchItem, ...BatchItem[]] = [
			db.insert(product).values({ id: productId, ...data } as NewProduct)
		];
		if (resolvedTags.newTags.length > 0) {
			statements.push(db.insert(tag).values(resolvedTags.newTags));
		}
		if (resolvedTags.ids.length > 0) {
			statements.push(
				db.insert(productTag).values(resolvedTags.ids.map((tagId) => ({ productId, tagId })))
			);
		}
		if (prepared.colors.length > 0) {
			statements.push(
				db.insert(productVariantColor).values(
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
				)
			);
		}
		if (prepared.variants.length > 0) {
			statements.push(
				db.insert(productVariant).values(
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
				)
			);
		}
		if (imageValues.length > 0) {
			statements.push(db.insert(productImage).values(imageValues));
		}
		created = await withTransientD1WriteReconciliation<Product>(
			async () => {
				await db.batch(statements);
				const row = await findProductByLookup({ id: productId }, { includeInactive: true });
				if (!row) {
					throw new ProductError('Product was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const row = await findProductByLookup({ id: productId }, { includeInactive: true });
				if (!row) return { committed: false };
				if (imageValues.length > 0) {
					const storedImages = await db
						.select({ r2Key: productImage.r2Key })
						.from(productImage)
						.where(eq(productImage.productId, productId));
					const storedKeys = new Set(storedImages.map((image) => image.r2Key));
					if (!imageValues.every((image) => storedKeys.has(image.r2Key))) {
						return { committed: false };
					}
				}
				return { committed: true, value: row };
			}
		);
	} catch (error) {
		await cleanupUnreferencedProductImages(uploadedImages);
		throw mapProductPersistenceError(error);
	}

	return hydrateProduct(created, { includeInactiveRelations: true });
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

	const rows = await withTransientD1ReadRetry(() => (where ? listQuery.where(where) : listQuery));
	const totalRows = await withTransientD1ReadRetry(() =>
		where ? countQuery.where(where) : countQuery
	);

	return {
		items: await hydrateProducts(rows, { includeInactiveRelations: includeInactive }),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function listProductsByIds(
	ctx: ServiceContext | null,
	input: ListProductsByIdsInput,
	options: GetProductOptions = {}
): Promise<ProductDTO[]> {
	const productIds = uniqueStrings(
		input.productIds.map((id) => id.trim()).filter((id) => id.length > 0)
	);
	if (productIds.length > 100) {
		throw new ProductError(
			'A maximum of 100 products can be loaded at once.',
			ErrorCode.VALIDATION_ERROR
		);
	}
	if (productIds.length === 0) return [];

	const includeInactive = resolveIncludeInactive(ctx, options.includeInactive);
	const where = includeInactive
		? inArray(product.id, productIds)
		: and(inArray(product.id, productIds), eq(product.isActive, true));
	const rows = await withTransientD1ReadRetry(() => getDb().select().from(product).where(where));
	const hydrated = await hydrateProducts(rows, { includeInactiveRelations: includeInactive });
	const productById = new Map(hydrated.map((item) => [item.id, item]));

	return productIds
		.map((productId) => productById.get(productId))
		.filter((item): item is ProductDTO => item !== undefined);
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

	if (Object.keys(updateValues).length === 0 && tagIds === undefined && newTagNames === undefined) {
		return hydrateProduct(existing, { includeInactiveRelations: true });
	}

	try {
		const db = getDb();
		if (data.categoryId) {
			await assertCategoryExistsTx(db, data.categoryId, 'Product category not found.');
		}
		const shouldUpdateTags = tagIds !== undefined || newTagNames !== undefined;
		const resolvedTags = shouldUpdateTags
			? await resolveProductTagsTx(db, normalizedTagIds, normalizedNewTagNames)
			: { ids: [], newTags: [] };
		const now = resolveNow(ctx);
		const stableUpdateValues = { ...updateValues, updatedAt: now };
		const statements: [BatchItem, ...BatchItem[]] = [
			db
				.update(product)
				.set(stableUpdateValues)
				.where(and(eq(product.id, existing.id), eq(product.updatedAt, existing.updatedAt))),
			...guardPreviousBatchChanges(db)
		];
		if (shouldUpdateTags) {
			if (resolvedTags.newTags.length > 0) {
				statements.push(db.insert(tag).values(resolvedTags.newTags));
			}
			statements.push(db.delete(productTag).where(eq(productTag.productId, existing.id)));
			if (resolvedTags.ids.length > 0) {
				statements.push(
					db
						.insert(productTag)
						.values(resolvedTags.ids.map((tagId) => ({ productId: existing.id, tagId })))
				);
			}
		}
		const updated = await withTransientD1WriteReconciliation<Product>(
			async () => {
				await db.batch(statements);
				const row = await findProductByLookup({ id: existing.id }, { includeInactive: true });
				if (!row) {
					throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
				}
				return row;
			},
			async () => {
				const row = await findProductByLookup({ id: existing.id }, { includeInactive: true });
				if (!row || row.updatedAt.getTime() !== now.getTime()) {
					return { committed: false };
				}
				if (shouldUpdateTags) {
					const storedTags = await db
						.select({ tagId: productTag.tagId })
						.from(productTag)
						.where(eq(productTag.productId, existing.id));
					const storedIds = storedTags.map((item) => item.tagId).sort();
					const expectedIds = [...resolvedTags.ids].sort();
					if (
						storedIds.length !== expectedIds.length ||
						storedIds.some((id, index) => id !== expectedIds[index])
					) {
						return { committed: false };
					}
				}
				return { committed: true, value: row };
			}
		);

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
		mimeType: string | null;
		byteSize: number | null;
		originalFilename: string | null;
		width: number | null;
		height: number | null;
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
					key: uploadResult.key,
					mimeType: uploadResult.mimeType,
					byteSize: uploadResult.byteSize,
					originalFilename: uploadResult.originalFilename
				});

				newImageInsertData.push({
					id: img.id,
					variantId: resolvedVariantId,
					r2Key: uploadResult.key,
					mimeType: uploadResult.mimeType,
					byteSize: uploadResult.byteSize,
					originalFilename: uploadResult.originalFilename,
					width: null,
					height: null,
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
	const now = resolveNow(ctx);

	let updated: Product;
	try {
		const db = getDb();
		if (data.categoryId) {
			await assertCategoryExistsTx(db, data.categoryId, 'Product category not found.');
		}
		const shouldUpdateTags = tagIds !== undefined || newTagNames !== undefined;
		const resolvedTags = shouldUpdateTags
			? await resolveProductTagsTx(db, normalizedTagIds, normalizedNewTagNames)
			: { ids: [], newTags: [] };
		const currentSizes = await db
			.select()
			.from(productVariant)
			.where(eq(productVariant.productId, existing.id));
		const currentImages = await db
			.select()
			.from(productImage)
			.where(eq(productImage.productId, existing.id));
		const currentImagesById = new Map(currentImages.map((row) => [row.id, row]));
		const statements: [BatchItem, ...BatchItem[]] = [
			db
				.update(product)
				.set({ ...updateValues, updatedAt: now })
				.where(and(eq(product.id, existing.id), eq(product.updatedAt, existing.updatedAt))),
			...guardPreviousBatchChanges(db)
		];

		if (shouldUpdateTags) {
			if (resolvedTags.newTags.length > 0) {
				statements.push(db.insert(tag).values(resolvedTags.newTags));
			}
			statements.push(db.delete(productTag).where(eq(productTag.productId, existing.id)));
			if (resolvedTags.ids.length > 0) {
				statements.push(
					db
						.insert(productTag)
						.values(resolvedTags.ids.map((tagId) => ({ productId: existing.id, tagId })))
				);
			}
		}

		for (const variant of variants) {
			const colorId = clientToDbColorId.get(variant.id)!;
			if (variant.isDeleted) {
				statements.push(
					db
						.delete(productVariantColor)
						.where(
							and(
								eq(productVariantColor.id, colorId),
								eq(productVariantColor.productId, existing.id)
							)
						)
				);
				continue;
			}

			if (variant.isNew) {
				statements.push(
					db.insert(productVariantColor).values({
						id: colorId,
						productId: existing.id,
						colorId: variant.colorId ?? null,
						color: variant.color,
						colorHex: variant.colorHex ?? null,
						basePrice: variant.basePrice,
						compareAtPrice: variant.compareAtPrice ?? null,
						sortOrder: variant.sortOrder
					})
				);
				statements.push(
					db.insert(productVariant).values(
						variant.sizes.map((size) => ({
							id: nanoid(),
							productId: existing.id,
							variantColorId: colorId,
							size,
							isActive: true,
							sortOrder: 1
						}))
					)
				);
				continue;
			}

			statements.push(
				db
					.update(productVariantColor)
					.set({
						colorId: variant.colorId ?? null,
						color: variant.color,
						colorHex: variant.colorHex ?? null,
						basePrice: variant.basePrice,
						compareAtPrice: variant.compareAtPrice ?? null,
						sortOrder: variant.sortOrder
					})
					.where(
						and(eq(productVariantColor.id, colorId), eq(productVariantColor.productId, existing.id))
					)
			);
			const dbSizes = currentSizes.filter((row) => row.variantColorId === colorId);
			const existingSizeNames = new Set(dbSizes.map((row) => row.size));
			const sizesToInsert = variant.sizes.filter((size) => !existingSizeNames.has(size));
			const sizesToDelete = dbSizes.filter((row) => !variant.sizes.includes(row.size));
			if (sizesToInsert.length > 0) {
				statements.push(
					db.insert(productVariant).values(
						sizesToInsert.map((size) => ({
							id: nanoid(),
							productId: existing.id,
							variantColorId: colorId,
							size,
							isActive: true,
							sortOrder: 1
						}))
					)
				);
			}
			if (sizesToDelete.length > 0) {
				statements.push(
					db.delete(productVariant).where(
						inArray(
							productVariant.id,
							sizesToDelete.map((row) => row.id)
						)
					)
				);
			}
		}

		if (images.length > 0) {
			statements.push(
				db
					.update(productImage)
					.set({ isPrimary: false })
					.where(eq(productImage.productId, existing.id))
			);
		}
		for (const image of images) {
			const variantId = image.variantId ? (clientToDbColorId.get(image.variantId) ?? null) : null;
			if (image.isDeleted) {
				const stored = currentImagesById.get(image.id);
				if (stored) deletedImageKeys.push(stored.r2Key);
				statements.push(
					db
						.delete(productImage)
						.where(and(eq(productImage.id, image.id), eq(productImage.productId, existing.id)))
				);
			} else if (image.isNew) {
				const insertData = newImageInsertData.find((row) => row.id === image.id);
				if (insertData) {
					statements.push(
						db.insert(productImage).values({
							...insertData,
							productId: existing.id,
							variantId,
							altText: image.altText ?? null,
							position: image.position,
							isPrimary: image.isPrimary
						})
					);
				}
			} else {
				statements.push(
					db
						.update(productImage)
						.set({
							variantId,
							altText: image.altText ?? null,
							position: image.position,
							isPrimary: image.isPrimary
						})
						.where(and(eq(productImage.id, image.id), eq(productImage.productId, existing.id)))
				);
			}
		}

		if (images.length > 0) {
			statements.push(
				db
					.update(productImage)
					.set({
						isPrimary: sql`CASE WHEN ${productImage.id} = (
							SELECT candidate.id FROM product_image AS candidate
							WHERE candidate.product_id = ${productImage.productId}
								AND candidate.variant_id IS ${productImage.variantId}
							ORDER BY candidate.is_primary DESC, candidate.position ASC,
								candidate.created_at ASC, candidate.id ASC
							LIMIT 1
						) THEN 1 ELSE 0 END`
					})
					.where(eq(productImage.productId, existing.id))
			);
		}

		updated = await withTransientD1WriteReconciliation<Product>(
			async () => {
				await db.batch(statements);
				const row = await findProductByLookup({ id: existing.id }, { includeInactive: true });
				if (!row) {
					throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
				}
				return row;
			},
			async () => {
				const row = await findProductByLookup({ id: existing.id }, { includeInactive: true });
				if (!row) return { committed: false };
				const mediaKeys = [...uploadedR2Images.map((image) => image.key), ...deletedImageKeys];
				if (mediaKeys.length > 0) {
					const storedImages = await db
						.select({ r2Key: productImage.r2Key })
						.from(productImage)
						.where(eq(productImage.productId, existing.id));
					const storedKeys = new Set(storedImages.map((image) => image.r2Key));
					const uploadedReferenced = uploadedR2Images.every((image) => storedKeys.has(image.key));
					const deletedUnreferenced = deletedImageKeys.every((key) => !storedKeys.has(key));
					if (uploadedReferenced && deletedUnreferenced) {
						return { committed: true, value: row };
					}
					return { committed: false };
				}
				return row.updatedAt.getTime() === now.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);
	} catch (error) {
		await cleanupUnreferencedProductImages(uploadedR2Images);
		throw mapProductPersistenceError(error);
	}

	if (deleteMediaBucket && deletedImageKeys.length > 0) {
		await Promise.all(deletedImageKeys.map((key) => deleteObjectSafe(deleteMediaBucket, key)));
	}

	return hydrateProduct(updated, { includeInactiveRelations: true });
}

export async function deleteProduct(ctx: ServiceContext, lookup: ProductLookup): Promise<void> {
	requireAdmin(ctx.actor);

	const existing = await findProductByLookup(lookup, { includeInactive: true });

	if (!existing) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { lookup });
	}

	let bucket: R2Bucket | null = null;
	let imageKeys: string[] = [];

	try {
		const db = getDb();
		const variantRows = await db
			.select({ id: productVariant.id })
			.from(productVariant)
			.where(eq(productVariant.productId, existing.id));
		const imageRows = await db
			.select({ r2Key: productImage.r2Key })
			.from(productImage)
			.where(eq(productImage.productId, existing.id));
		await assertProductDeletionHasNoHistoryTx(
			db,
			existing.id,
			variantRows.map((row) => row.id)
		);
		imageKeys = imageRows.map((row) => row.r2Key);
		if (imageKeys.length > 0 && ctx.event) {
			bucket = getMediaBucketOptional(ctx.event);
		}
		const deleteStatements: [BatchItem, ...BatchItem[]] = [
			db.delete(productImage).where(eq(productImage.productId, existing.id)),
			db.delete(product).where(eq(product.id, existing.id)),
			...guardPreviousBatchChanges(db)
		];
		await withTransientD1WriteReconciliation(
			async () => {
				await db.batch(deleteStatements);
			},
			async () => {
				const row = await findProductByLookup({ id: existing.id }, { includeInactive: true });
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
	} catch (error) {
		throw mapProductPersistenceError(error);
	}

	if (bucket) {
		await Promise.all(imageKeys.map((key) => deleteObjectSafe(bucket, key)));
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
		const db = getDb();
		const now = resolveNow(ctx);
		const values: NewProductVariant = {
			id: nanoid(),
			...data,
			createdAt: now,
			updatedAt: now
		};
		const created = await withTransientD1WriteReconciliation<ProductVariant>(
			async () => {
				const [row] = await db.insert(productVariant).values(values).returning();
				if (!row) {
					throw new ProductError('Product variant was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(productVariant)
					.where(eq(productVariant.id, values.id!))
					.limit(1);
				return row ? { committed: true, value: row } : { committed: false };
			}
		);
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
		const db = getDb();
		const now = resolveNow(ctx);
		const stableUpdateValues: Partial<NewProductVariant> = { ...updateValues, updatedAt: now };
		const updated = await withTransientD1WriteReconciliation<ProductVariant>(
			async () => {
				const [row] = await db
					.update(productVariant)
					.set(stableUpdateValues)
					.where(
						and(
							eq(productVariant.id, existing.id),
							eq(productVariant.updatedAt, existing.updatedAt)
						)
					)
					.returning();
				if (!row) {
					throw new ProductError(
						'Product variant changed before it could be updated.',
						ErrorCode.CONFLICT,
						{ variantId }
					);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(productVariant)
					.where(eq(productVariant.id, existing.id))
					.limit(1);
				return row && recordMatchesPatch(row, stableUpdateValues)
					? { committed: true, value: row }
					: { committed: false };
			}
		);
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
		if (await hasInventoryHistoryForVariantIdsTx(getDb(), [existing.id])) {
			throw new ProductError(
				'Product variants with inventory history cannot be deleted. Deactivate the variant instead.',
				ErrorCode.CONFLICT,
				{ variantId: existing.id }
			);
		}
		const db = getDb();
		await withTransientD1WriteReconciliation(
			async () => {
				const [deleted] = await db
					.delete(productVariant)
					.where(
						and(
							eq(productVariant.id, existing.id),
							eq(productVariant.updatedAt, existing.updatedAt)
						)
					)
					.returning({ id: productVariant.id });
				if (!deleted) {
					throw new ProductError(
						'Product variant changed before it could be deleted.',
						ErrorCode.CONFLICT,
						{ variantId }
					);
				}
			},
			async () => {
				const [row] = await db
					.select({ id: productVariant.id })
					.from(productVariant)
					.where(eq(productVariant.id, existing.id))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
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
	const now = resolveNow(ctx);
	const values: NewProductVariantColor = {
		id: nanoid(),
		productId,
		colorId: parsed.colorId ?? null,
		color: parsed.color,
		colorHex: parsed.colorHex,
		basePrice: parsed.basePrice,
		compareAtPrice: parsed.compareAtPrice,
		sortOrder: parsed.sortOrder ?? 0,
		createdAt: now,
		updatedAt: now
	};

	try {
		await assertProductExistsTx(db, productId, 'Product not found.');
		validateResolvedProductPricing(values);
		const created = await withTransientD1WriteReconciliation<ProductVariantColor>(
			async () => {
				const [row] = await db.insert(productVariantColor).values(values).returning();
				if (!row) {
					throw new ProductError(
						'Product variant color was not created.',
						ErrorCode.INTERNAL_ERROR
					);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(productVariantColor)
					.where(eq(productVariantColor.id, values.id!))
					.limit(1);
				return row ? { committed: true, value: row } : { committed: false };
			}
		);
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
	const result = updateProductVariantColorSchema.omit({ productId: true }).safeParse(input);

	if (!result.success) {
		throw new ProductError('Invalid product variant color data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	const updateValues = removeUndefinedValues(result.data);

	try {
		const [existing] = await db
			.select()
			.from(productVariantColor)
			.where(eq(productVariantColor.id, colorId))
			.limit(1);
		if (!existing) {
			throw new ProductError('Product variant color not found.', ErrorCode.VARIANT_NOT_FOUND, {
				colorId
			});
		}
		if (Object.keys(updateValues).length === 0) return existing;
		validateResolvedProductPricing({ ...existing, ...updateValues });
		const now = resolveNow(ctx);
		const stableUpdateValues: Partial<NewProductVariantColor> = {
			...updateValues,
			updatedAt: now
		};
		const updated = await withTransientD1WriteReconciliation<ProductVariantColor>(
			async () => {
				const [row] = await db
					.update(productVariantColor)
					.set(stableUpdateValues)
					.where(
						and(
							eq(productVariantColor.id, existing.id),
							eq(productVariantColor.updatedAt, existing.updatedAt)
						)
					)
					.returning();
				if (!row) {
					throw new ProductError(
						'Product variant color changed before it could be updated.',
						ErrorCode.CONFLICT,
						{ colorId }
					);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(productVariantColor)
					.where(eq(productVariantColor.id, existing.id))
					.limit(1);
				return row && recordMatchesPatch(row, stableUpdateValues)
					? { committed: true, value: row }
					: { committed: false };
			}
		);
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
		const [existing] = await db
			.select()
			.from(productVariantColor)
			.where(eq(productVariantColor.id, colorId))
			.limit(1);
		if (!existing) {
			throw new ProductError('Product variant color not found.', ErrorCode.VARIANT_NOT_FOUND, {
				colorId
			});
		}
		const variants = await db
			.select({ id: productVariant.id })
			.from(productVariant)
			.where(eq(productVariant.variantColorId, colorId));
		if (
			await hasInventoryHistoryForVariantIdsTx(
				db,
				variants.map((row) => row.id)
			)
		) {
			throw new ProductError(
				'Variant colors with inventory history cannot be deleted. Deactivate their variants instead.',
				ErrorCode.CONFLICT,
				{ colorId }
			);
		}
		await withTransientD1WriteReconciliation(
			async () => {
				const [deleted] = await db
					.delete(productVariantColor)
					.where(
						and(
							eq(productVariantColor.id, existing.id),
							eq(productVariantColor.updatedAt, existing.updatedAt)
						)
					)
					.returning({ id: productVariantColor.id });
				if (!deleted) {
					throw new ProductError(
						'Product variant color changed before it could be deleted.',
						ErrorCode.CONFLICT,
						{ colorId }
					);
				}
			},
			async () => {
				const [row] = await db
					.select({ id: productVariantColor.id })
					.from(productVariantColor)
					.where(eq(productVariantColor.id, existing.id))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
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

	const rows = await withTransientD1ReadRetry(() =>
		getDb()
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
			.offset(offset)
	);

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
	const values: NewProductImage = {
		id: nanoid(),
		...data,
		r2Key: uploadedImage.key,
		mimeType: uploadedImage.mimeType,
		byteSize: uploadedImage.byteSize,
		originalFilename: uploadedImage.originalFilename,
		width: null,
		height: null
	};

	try {
		const db = getDb();
		const insertQuery = db.insert(productImage).values(values).returning();
		const created = await withTransientD1WriteReconciliation<ProductImage>(
			async () => {
				const createdRows = values.isPrimary
					? (
							await db.batch([
								clearPrimaryProductImagesTx(db, values.productId, values.variantId ?? null),
								insertQuery
							])
						)[1]
					: await insertQuery;
				const [row] = createdRows;
				if (!row) {
					throw new ProductError('Product image was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(productImage)
					.where(eq(productImage.id, values.id!))
					.limit(1);
				return row?.r2Key === uploadedImage.key
					? { committed: true, value: row }
					: { committed: false };
			}
		);

		return toProductImageDTO(created);
	} catch (error) {
		await cleanupUnreferencedProductImages([uploadedImage]);
		throw mapProductImagePersistenceError(error);
	}
}

export async function setPrimaryProductImage(
	ctx: ServiceContext,
	imageId: string
): Promise<ProductImageDTO> {
	requireAdmin(ctx.actor);

	try {
		const db = getDb();
		const existing = await findProductImageByIdTx(db, imageId);

		if (!existing) {
			throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, { imageId });
		}

		if (existing.isPrimary) return toProductImageDTO(existing);
		const updated = await withTransientD1WriteReconciliation<ProductImage>(
			async () => {
				const [, updatedRows] = await db.batch([
					clearPrimaryProductImagesTx(db, existing.productId, existing.variantId),
					db
						.update(productImage)
						.set({ isPrimary: true })
						.where(eq(productImage.id, existing.id))
						.returning()
				]);
				const [row] = updatedRows;
				if (!row) {
					throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, {
						imageId
					});
				}
				return row;
			},
			async () => {
				const rows = await db
					.select()
					.from(productImage)
					.where(productImagePrimaryScopePredicate(existing.productId, existing.variantId));
				const primaryRows = rows.filter((row) => row.isPrimary);
				const row = rows.find((item) => item.id === existing.id);
				return row?.isPrimary && primaryRows.length === 1
					? { committed: true, value: row }
					: { committed: false };
			}
		);
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
		const db = getDb();
		await assertProductExistsTx(db, productId, 'Product not found.');
		const existingRows = await db
			.select()
			.from(productImage)
			.where(eq(productImage.productId, productId))
			.orderBy(asc(productImage.position), asc(productImage.createdAt));
		assertExactProductImageOrder(productId, existingRows, imageIdsInOrder);

		const updates = imageIdsInOrder.map((imageId, position) =>
			db
				.update(productImage)
				.set({ position })
				.where(and(eq(productImage.id, imageId), eq(productImage.productId, productId)))
		);
		const [firstUpdate, ...remainingUpdates] = updates;
		if (firstUpdate) {
			const idsSql = sql.join(
				imageIdsInOrder.map((id) => sql`${id}`),
				sql`, `
			);
			const setGuard = guardBatchCondition(
				db,
				sql`(SELECT count(*) FROM ${productImage} WHERE ${productImage.productId} = ${productId}) = ${imageIdsInOrder.length}
					AND NOT EXISTS (
						SELECT 1 FROM ${productImage}
						WHERE ${productImage.productId} = ${productId}
							AND ${productImage.id} NOT IN (${idsSql})
					)`
			);
			await withTransientD1WriteReconciliation(
				async () => {
					await db.batch([...setGuard, firstUpdate, ...remainingUpdates]);
				},
				async () => {
					const stored = await db
						.select({ id: productImage.id, position: productImage.position })
						.from(productImage)
						.where(eq(productImage.productId, productId));
					const positionById = new Map(stored.map((row) => [row.id, row.position]));
					const committed =
						stored.length === imageIdsInOrder.length &&
						imageIdsInOrder.every((id, position) => positionById.get(id) === position);
					return committed ? { committed: true, value: undefined } : { committed: false };
				}
			);
		}
		const rows = await db
			.select()
			.from(productImage)
			.where(eq(productImage.productId, productId))
			.orderBy(asc(productImage.position), asc(productImage.createdAt));

		return rows.map(toProductImageDTO);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new ProductError(
				'Product images changed before they could be reordered.',
				ErrorCode.CONFLICT,
				{ productId }
			);
		}
		throw mapProductImagePersistenceError(error);
	}
}

export async function deleteProductImage(ctx: ServiceContext, imageId: string): Promise<void> {
	requireAdmin(ctx.actor);

	try {
		const db = getDb();
		const existing = await findProductImageByIdTx(db, imageId);
		if (!existing) {
			throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, { imageId });
		}
		const bucket = requireMediaBucket(ctx);
		await withTransientD1WriteReconciliation(
			async () => {
				const [deleted] = await db
					.delete(productImage)
					.where(eq(productImage.id, existing.id))
					.returning({ id: productImage.id });
				if (!deleted) {
					throw new ProductError('Product image not found.', ErrorCode.MEDIA_NOT_FOUND, {
						imageId
					});
				}
			},
			async () => {
				const row = await findProductImageByIdTx(db, existing.id);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
		await deleteObjectSafe(bucket, existing.r2Key);
	} catch (error) {
		throw mapProductImagePersistenceError(error);
	}
}

export async function createTag(ctx: ServiceContext, input: CreateTagInput): Promise<TagDTO> {
	requireAdmin(ctx.actor);

	const data = parseInsertTag(input);
	const values: NewTag = { id: nanoid(), ...data };

	try {
		const db = getDb();
		const created = await withTransientD1WriteReconciliation<Tag>(
			async () => {
				const [row] = await db.insert(tag).values(values).returning();
				if (!row) {
					throw new ProductError('Tag was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db.select().from(tag).where(eq(tag.id, values.id!)).limit(1);
				return row ? { committed: true, value: row } : { committed: false };
			}
		);
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
	const rows = await withTransientD1ReadRetry(() =>
		getDb()
			.select()
			.from(tag)
			.orderBy(asc(tag.name), asc(tag.slug))
			.limit(normalizeLimit(options.limit))
			.offset(normalizeOffset(options.offset))
	);

	return rows.map(toTagDTO);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listColors(_ctx: ServiceContext): Promise<Color[]> {
	return withTransientD1ReadRetry(() => getDb().select().from(color).orderBy(asc(color.name)));
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

	const result = insertColorSchema.safeParse(input);
	if (!result.success) {
		throw new ProductError('Invalid color data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}
	const parsed = result.data;
	const db = getDb();

	const formattedName = formatColorName(parsed.name);
	const hexValue = parsed.hex.toUpperCase();
	const now = resolveNow(ctx);
	const values: NewColor = {
		id: nanoid(),
		name: formattedName,
		hex: hexValue,
		createdAt: now,
		updatedAt: now
	};

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
		const created = await withTransientD1WriteReconciliation<Color>(
			async () => {
				const [row] = await db.insert(color).values(values).returning();
				if (!row) {
					throw new ProductError('Color was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db.select().from(color).where(eq(color.id, values.id!)).limit(1);
				return row ? { committed: true, value: row } : { committed: false };
			}
		);
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
		await withTransientD1WriteReconciliation(
			async () => {
				const [deleted] = await db
					.delete(color)
					.where(eq(color.id, colorId))
					.returning({ id: color.id });
				if (!deleted) {
					throw new ProductError('Color not found.', ErrorCode.NOT_FOUND);
				}
			},
			async () => {
				const [row] = await db
					.select({ id: color.id })
					.from(color)
					.where(eq(color.id, colorId))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
	} catch (error) {
		throw mapColorPersistenceError(error);
	}
}

function mapColorPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	rethrowTransientD1Error(error);

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
		const db = getDb();
		const updated = await withTransientD1WriteReconciliation<Tag>(
			async () => {
				const [row] = await db
					.update(tag)
					.set(updateValues)
					.where(
						and(eq(tag.id, existing.id), eq(tag.name, existing.name), eq(tag.slug, existing.slug))
					)
					.returning();
				if (!row) {
					throw new ProductError('Tag changed before it could be updated.', ErrorCode.CONFLICT, {
						lookup
					});
				}
				return row;
			},
			async () => {
				const [row] = await db.select().from(tag).where(eq(tag.id, existing.id)).limit(1);
				return row && recordMatchesPatch(row, updateValues)
					? { committed: true, value: row }
					: { committed: false };
			}
		);
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
		const db = getDb();
		await withTransientD1WriteReconciliation(
			async () => {
				const [deleted] = await db
					.delete(tag)
					.where(
						and(eq(tag.id, existing.id), eq(tag.name, existing.name), eq(tag.slug, existing.slug))
					)
					.returning({ id: tag.id });
				if (!deleted) {
					throw new ProductError('Tag changed before it could be deleted.', ErrorCode.CONFLICT, {
						lookup
					});
				}
			},
			async () => {
				const [row] = await db
					.select({ id: tag.id })
					.from(tag)
					.where(eq(tag.id, existing.id))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
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
		const db = getDb();
		await assertProductExistsTx(db, productId, 'Product not found.');
		await assertTagsExistTx(db, normalizedTagIds);
		const deleteQuery = db.delete(productTag).where(eq(productTag.productId, productId));
		await withTransientD1WriteReconciliation(
			async () => {
				if (normalizedTagIds.length > 0) {
					await db.batch([
						deleteQuery,
						db.insert(productTag).values(normalizedTagIds.map((tagId) => ({ productId, tagId })))
					]);
				} else {
					await deleteQuery;
				}
			},
			async () => {
				const rows = await db
					.select({ tagId: productTag.tagId })
					.from(productTag)
					.where(eq(productTag.productId, productId));
				const storedIds = rows.map((row) => row.tagId).sort();
				const expectedIds = [...normalizedTagIds].sort();
				const committed =
					storedIds.length === expectedIds.length &&
					storedIds.every((id, index) => id === expectedIds[index]);
				return committed ? { committed: true, value: undefined } : { committed: false };
			}
		);
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
		const db = getDb();
		await assertProductExistsTx(db, productId, 'Product not found.');
		await assertTagsExistTx(db, [normalizedTagId]);
		await withTransientD1WriteReconciliation(
			() =>
				db
					.insert(productTag)
					.values({ productId, tagId: normalizedTagId })
					.onConflictDoNothing()
					.then(() => undefined),
			async () => {
				const [row] = await db
					.select({ tagId: productTag.tagId })
					.from(productTag)
					.where(and(eq(productTag.productId, productId), eq(productTag.tagId, normalizedTagId)))
					.limit(1);
				return row ? { committed: true, value: undefined } : { committed: false };
			}
		);
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
		const db = getDb();
		await assertProductExistsTx(db, productId, 'Product not found.');
		await withTransientD1WriteReconciliation(
			() =>
				db
					.delete(productTag)
					.where(and(eq(productTag.productId, productId), eq(productTag.tagId, normalizedTagId)))
					.then(() => undefined),
			async () => {
				const [row] = await db
					.select({ tagId: productTag.tagId })
					.from(productTag)
					.where(and(eq(productTag.productId, productId), eq(productTag.tagId, normalizedTagId)))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
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
		imageUrl: row.imageR2Key ? mediaPresetUrl(row.imageR2Key, 'hero960') : null,
		imageMimeType: row.imageMimeType,
		imageByteSize: row.imageByteSize,
		imageOriginalFilename: row.imageOriginalFilename,
		imageWidth: row.imageWidth,
		imageHeight: row.imageHeight,
		parentId: row.parentId,
		sortOrder: row.sortOrder,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

export function toPublicCategoryDTO(row: CategoryDTO): PublicCategoryDTO {
	const { imageMimeType, imageByteSize, imageOriginalFilename, ...publicCategory } = row;
	void imageMimeType;
	void imageByteSize;
	void imageOriginalFilename;
	return publicCategory;
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
		imageUrl: mediaPresetUrl(row.r2Key, 'card600'),
		mimeType: row.mimeType,
		byteSize: row.byteSize,
		originalFilename: row.originalFilename,
		width: row.width,
		height: row.height,
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
	const primaryImage = resolvePrimaryImage(images);

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
		primaryImageR2Key: primaryImage?.r2Key ?? null,
		primaryImageUrl: primaryImage?.imageUrl ?? null
	};
}

export function toPublicProductDTO(row: ProductDTO): PublicProductDTO {
	const images = row.images.map(({ mimeType, byteSize, originalFilename, ...image }) => {
		void mimeType;
		void byteSize;
		void originalFilename;
		return image;
	});

	return {
		...row,
		category: row.category ? toPublicCategoryDTO(row.category) : null,
		images
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
		'tagIds' | 'newTagNames' | 'images' | 'primaryImageIndex' | 'variants' | 'imageMetadata'
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

function parseUpdateProduct(
	input: Omit<UpdateProductInput, 'tagIds' | 'newTagNames'>
): UpdateProduct {
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

async function resolveProductTagsTx(
	tx: Db | Tx,
	tagIds: string[],
	newTagNames: string[]
): Promise<{ ids: string[]; newTags: NewTag[] }> {
	await assertTagsExistTx(tx, tagIds);

	if (newTagNames.length === 0) return { ids: tagIds, newTags: [] };

	const candidates = new Map<string, { name: string; slug: string }>();
	for (const name of newTagNames) {
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
		if (!candidates.has(slug)) candidates.set(slug, { name, slug });
	}
	const slugs = [...candidates.keys()];
	const existingRows = await tx.select().from(tag).where(inArray(tag.slug, slugs));
	const existingBySlug = new Map(existingRows.map((row) => [row.slug, row]));
	const newTags: NewTag[] = [];
	const resolvedIds = [...tagIds];
	for (const candidate of candidates.values()) {
		const existing = existingBySlug.get(candidate.slug);
		if (existing) {
			resolvedIds.push(existing.id);
			continue;
		}
		const values: NewTag = { id: nanoid(), name: candidate.name, slug: candidate.slug };
		newTags.push(values);
		resolvedIds.push(values.id!);
	}
	return { ids: uniqueStrings(resolvedIds), newTags };
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
	const [row] = await withTransientD1ReadRetry(() =>
		getDb()
			.select()
			.from(category)
			.where(where ?? predicate)
			.limit(1)
	);

	return row ?? null;
}

async function findProductByLookup(
	lookup: ProductLookup,
	options: { includeInactive: boolean }
): Promise<Product | null> {
	const predicate = productLookupPredicate(lookup);
	const where = options.includeInactive ? predicate : and(predicate, eq(product.isActive, true));
	const [row] = await withTransientD1ReadRetry(() =>
		getDb()
			.select()
			.from(product)
			.where(where ?? predicate)
			.limit(1)
	);

	return row ?? null;
}

async function findTagByLookup(lookup: TagLookup): Promise<Tag | null> {
	const [row] = await withTransientD1ReadRetry(() =>
		getDb().select().from(tag).where(tagLookupPredicate(lookup)).limit(1)
	);

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
	const [row] = await withTransientD1ReadRetry(() =>
		getDb()
			.select()
			.from(productVariant)
			.where(where ?? predicate)
			.limit(1)
	);

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

async function assertCategoryParentDoesNotCreateCycle(
	categoryId: string,
	parentId: string
): Promise<void> {
	let currentId: string | null = parentId;
	const visited = new Set<string>();

	while (currentId) {
		if (currentId === categoryId || visited.has(currentId)) {
			throw new ProductError(
				'A category cannot be moved beneath itself or one of its descendants.',
				ErrorCode.VALIDATION_ERROR,
				{ categoryId, parentId }
			);
		}
		visited.add(currentId);

		const [row] = await getDb()
			.select({ id: category.id, parentId: category.parentId })
			.from(category)
			.where(eq(category.id, currentId))
			.limit(1);
		if (!row) {
			throw new ProductError('Parent category not found.', ErrorCode.CATEGORY_NOT_FOUND, {
				categoryId: currentId
			});
		}

		currentId = row.parentId;
	}
}

async function assertProductDeletionHasNoHistoryTx(
	tx: Db | Tx,
	productId: string,
	variantIds: string[]
): Promise<void> {
	const reviewRows = await tx
		.select({ id: reviewTable.id })
		.from(reviewTable)
		.where(eq(reviewTable.productId, productId))
		.limit(1);
	const hasInventoryHistory = await hasInventoryHistoryForVariantIdsTx(
		tx as InventoryTx,
		variantIds
	);

	if (reviewRows[0] || hasInventoryHistory) {
		throw new ProductError(
			'Products with review or inventory history cannot be deleted. Deactivate the product instead.',
			ErrorCode.CONFLICT,
			{ productId }
		);
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

function clearPrimaryProductImagesTx(tx: Db | Tx, productId: string, variantId: string | null) {
	return tx
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

	const categoryQuery = db
		.select()
		.from(category)
		.where(
			categoryIds.length === 0
				? sql`0`
				: options.includeInactiveRelations
					? inArray(category.id, categoryIds)
					: and(inArray(category.id, categoryIds), eq(category.isActive, true))
		);
	const variantsQuery = db
		.select()
		.from(productVariant)
		.where(
			options.includeInactiveRelations
				? inArray(productVariant.productId, productIds)
				: and(inArray(productVariant.productId, productIds), eq(productVariant.isActive, true))
		)
		.orderBy(asc(productVariant.sortOrder), asc(productVariant.size));
	const variantColorsQuery = db
		.select()
		.from(productVariantColor)
		.where(inArray(productVariantColor.productId, productIds));
	const imagesQuery = db
		.select()
		.from(productImage)
		.where(inArray(productImage.productId, productIds))
		.orderBy(asc(productImage.position), asc(productImage.createdAt));
	const tagsQuery = db
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

	const categories = await withTransientD1ReadRetry(() => categoryQuery);
	const variants = await withTransientD1ReadRetry(() => variantsQuery);
	const variantColors = await withTransientD1ReadRetry(() => variantColorsQuery);
	const images = await withTransientD1ReadRetry(() => imagesQuery);
	const tagRows = await withTransientD1ReadRetry(() => tagsQuery);
	const categoryById = new Map(categories.map((row) => [row.id, row]));
	const variantColorById = new Map(variantColors.map((row) => [row.id, row]));

	const variantsByProductId = new Map<string, ProductVariantDTO[]>();
	for (const row of variants) {
		const colorRow = variantColorById.get(row.variantColorId);
		if (!colorRow) {
			throw new ProductError('Product variant color not found.', ErrorCode.INTERNAL_ERROR, {
				variantId: row.id,
				variantColorId: row.variantColorId
			});
		}
		const pid = row.productId;
		const current = variantsByProductId.get(pid) ?? [];
		current.push(toProductVariantDTO(row, colorRow));
		variantsByProductId.set(pid, current);
	}
	for (const current of variantsByProductId.values()) {
		current.sort(
			(a, b) =>
				a.sortOrder - b.sortOrder || a.size.localeCompare(b.size) || a.color.localeCompare(b.color)
		);
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

function resolvePrimaryImage(images: ProductImageDTO[]): ProductImageDTO | null {
	const productPrimary = images.find((image) => image.variantId === null && image.isPrimary);
	if (productPrimary) return productPrimary;

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return anyPrimary;

	return images[0] ?? null;
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
		const uploaded = await uploadImage(bucket, key, image);
		return { bucket, ...uploaded };
	} catch (error) {
		if (isAppError(error)) throw error;

		const message = getErrorMessage(error);
		throw new MediaError('Category image upload failed.', resolveMediaUploadCode(message), {
			cause: message
		});
	}
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
		const uploaded = await uploadImage(bucket, key, image);
		return { bucket, ...uploaded };
	} catch (error) {
		if (isAppError(error)) throw error;

		const message = getErrorMessage(error);
		throw new MediaError('Product image upload failed.', resolveMediaUploadCode(message), {
			cause: message
		});
	}
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

async function cleanupUnreferencedCategoryImage(image: UploadedImage): Promise<void> {
	try {
		const [referenced] = await withTransientD1ReadRetry(() =>
			getDb()
				.select({ id: category.id })
				.from(category)
				.where(eq(category.imageR2Key, image.key))
				.limit(1)
		);
		if (!referenced) await deleteObjectSafe(image.bucket, image.key);
	} catch {
		// Preserve the object when database commit state cannot be proven.
	}
}

async function cleanupUnreferencedProductImages(images: UploadedImage[]): Promise<void> {
	if (images.length === 0) return;

	try {
		const keys = uniqueStrings(images.map((image) => image.key));
		const referencedRows = await withTransientD1ReadRetry(() =>
			getDb()
				.select({ r2Key: productImage.r2Key })
				.from(productImage)
				.where(inArray(productImage.r2Key, keys))
		);
		const referencedKeys = new Set(referencedRows.map((row) => row.r2Key));
		await Promise.all(
			images
				.filter((image) => !referencedKeys.has(image.key))
				.map((image) => deleteObjectSafe(image.bucket, image.key))
		);
	} catch {
		// Preserve objects when database commit state cannot be proven.
	}
}

function resolveMediaUploadCode(message: string): ErrorCode {
	return isInvalidImageUploadMessage(message)
		? ErrorCode.INVALID_MEDIA_TYPE
		: ErrorCode.MEDIA_UPLOAD_FAILED;
}

function recordMatchesPatch(row: object, patch: Record<string, unknown>): boolean {
	const record = row as Record<string, unknown>;
	return Object.entries(patch).every(([key, expected]) => {
		const actual = record[key];
		if (actual instanceof Date && expected instanceof Date) {
			return actual.getTime() === expected.getTime();
		}
		return actual === expected;
	});
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
	rethrowTransientD1Error(error);

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
	if (isD1BatchGuardError(error)) {
		throw new ProductError(
			'Product changed while it was being saved. Refresh and try again.',
			ErrorCode.CONFLICT
		);
	}
	rethrowTransientD1Error(error);

	const message = getErrorMessage(error);

	if (message.includes('product_variant')) {
		mapProductVariantPersistenceError(error);
	}

	if (message.includes('product_image')) {
		mapProductImagePersistenceError(error);
	}
	if (message.includes('tag.')) {
		mapTagPersistenceError(error);
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
	rethrowTransientD1Error(error);

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
	rethrowTransientD1Error(error);

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
	rethrowTransientD1Error(error);

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
	rethrowTransientD1Error(error);

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

	const [stats] = await withTransientD1ReadRetry(() =>
		db
			.select({
				total: count(),
				active:
					sql<number>`coalesce(sum(CASE WHEN ${product.isActive} = 1 THEN 1 ELSE 0 END), 0)`.mapWith(
						Number
					)
			})
			.from(product)
	);

	const total = Number(stats?.total ?? 0);
	const active = Number(stats?.active ?? 0);
	const inactive = Math.max(0, total - active);

	return {
		total,
		active,
		inactive
	};
}
