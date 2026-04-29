import { and, asc, eq, isNull, like, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode } from '$lib/server/modules/errors';
import { buildMediaKey, deleteObjectSafe, uploadImage } from '$lib/server/modules/media/r2';
import {
	category,
	insertCategorySchema,
	updateCategorySchema,
	type Category
} from './products.drizzle';
import {
	assertNonEmptyUpdate,
	assertProductPermission,
	conflict,
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

const createCategoryInputSchema = insertCategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateCategoryInputSchema = updateCategorySchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

export type ListCategoriesOptions = {
	includeInactive?: boolean;
	parentId?: string | null;
	search?: string;
	limit?: number;
	offset?: number;
};

export type CategoryMutationOptions = {
	actor: ProductServiceActor;
};

export type CategoryMediaMutationOptions = CategoryMutationOptions & {
	bucket: R2Bucket;
	variant?: string;
};

export type CreateCategoryOptions = CategoryMutationOptions & {
	bucket?: R2Bucket | null;
	imageFile?: File | null;
	imageVariant?: string;
};

export async function listCategories(options: ListCategoriesOptions = {}): Promise<Category[]> {
	const filters = buildCategoryFilters(options);

	return getDb()
		.select()
		.from(category)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(asc(category.sortOrder), asc(category.name))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getCategoryById(id: string): Promise<Category> {
	const [row] = await getDb().select().from(category).where(eq(category.id, id)).limit(1);
	if (!row) notFound('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { id });
	return row;
}

export async function getCategoryBySlug(slug: string): Promise<Category> {
	const [row] = await getDb().select().from(category).where(eq(category.slug, slug)).limit(1);
	if (!row) notFound('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { slug });
	return row;
}

export async function createCategory(
	input: CreateCategoryInput,
	options: CreateCategoryOptions
): Promise<Category> {
	assertProductPermission(options.actor, 'category', 'create');

	const parsed = parseProductServiceInput(createCategoryInputSchema, input, 'category');
	if (parsed.imageR2Key && options.imageFile) {
		conflict('Provide either imageR2Key or imageFile, not both.', { field: 'imageR2Key' });
	}

	await assertValidParentCategory(parsed.parentId);

	const id = nanoid();
	const bucket = options.imageFile ? requireMediaBucket(options.bucket) : null;
	const imageR2Key = options.imageFile
		? await uploadCategoryImageFile(bucket!, id, options.imageFile, options.imageVariant)
		: parsed.imageR2Key;

	try {
		const [created] = await getDb()
			.insert(category)
			.values({ ...parsed, id, imageR2Key })
			.returning();

		return created;
	} catch (error) {
		if (bucket && imageR2Key) await deleteObjectSafe(bucket, imageR2Key);
		wrapProductPersistenceError(error, 'Category slug already exists.');
	}
}

export async function updateCategory(
	id: string,
	input: UpdateCategoryInput,
	options: CategoryMutationOptions
): Promise<Category> {
	assertProductPermission(options.actor, 'category', 'update');

	const parsed = parseProductServiceInput(updateCategoryInputSchema, input, 'category');
	assertNonEmptyUpdate(parsed, 'category');

	await getCategoryById(id);
	await assertValidParentCategory(parsed.parentId, id);

	try {
		const [updated] = await getDb()
			.update(category)
			.set(parsed)
			.where(eq(category.id, id))
			.returning();

		if (!updated) notFound('Category not found.', ErrorCode.CATEGORY_NOT_FOUND, { id });
		return updated;
	} catch (error) {
		wrapProductPersistenceError(error, 'Category slug already exists.');
	}
}

export async function activateCategory(
	id: string,
	options: CategoryMutationOptions
): Promise<Category> {
	return updateCategory(id, { isActive: true }, options);
}

export async function deactivateCategory(
	id: string,
	options: CategoryMutationOptions
): Promise<Category> {
	return updateCategory(id, { isActive: false }, options);
}

export async function replaceCategoryImage(
	id: string,
	file: File,
	options: CategoryMediaMutationOptions
): Promise<Category> {
	assertProductPermission(options.actor, 'category', 'update');

	const existing = await getCategoryById(id);
	const bucket = requireMediaBucket(options.bucket);
	const newKey = await uploadCategoryImageFile(bucket, id, file, options.variant);

	try {
		const [updated] = await getDb()
			.update(category)
			.set({ imageR2Key: newKey })
			.where(eq(category.id, id))
			.returning();

		if (existing.imageR2Key) await deleteObjectSafe(bucket, existing.imageR2Key);
		return updated;
	} catch (error) {
		await deleteObjectSafe(bucket, newKey);
		throw error;
	}
}

export async function deleteCategoryImage(
	id: string,
	options: CategoryMediaMutationOptions
): Promise<Category> {
	assertProductPermission(options.actor, 'category', 'update');

	const existing = await getCategoryById(id);
	const bucket = requireMediaBucket(options.bucket);

	const [updated] = await getDb()
		.update(category)
		.set({ imageR2Key: null })
		.where(eq(category.id, id))
		.returning();

	await deleteObjectSafe(bucket, existing.imageR2Key);
	return updated;
}

export async function deleteCategory(
	id: string,
	options: CategoryMutationOptions & { bucket?: R2Bucket | null }
): Promise<Category> {
	assertProductPermission(options.actor, 'category', 'delete');

	const existing = await getCategoryById(id);
	const [deleted] = await getDb().delete(category).where(eq(category.id, id)).returning();

	if (options.bucket) await deleteObjectSafe(options.bucket, existing.imageR2Key);
	return deleted ?? existing;
}

async function assertValidParentCategory(parentId: string | null | undefined, categoryId?: string) {
	if (!parentId) return;
	if (categoryId && parentId === categoryId) {
		conflict('Category cannot be its own parent.', { parentId });
	}

	const [parent] = await getDb().select().from(category).where(eq(category.id, parentId)).limit(1);
	if (!parent) {
		notFound('Parent category not found.', ErrorCode.CATEGORY_NOT_FOUND, { parentId });
	}

	await assertParentDoesNotCreateCycle(parentId, categoryId);
}

async function assertParentDoesNotCreateCycle(parentId: string, categoryId?: string) {
	if (!categoryId) return;

	let nextParentId: string | null = parentId;

	while (nextParentId) {
		if (nextParentId === categoryId) {
			conflict('Category parent would create a cycle.', { parentId, categoryId });
		}

		const [row] = await getDb()
			.select({ parentId: category.parentId })
			.from(category)
			.where(eq(category.id, nextParentId))
			.limit(1);

		nextParentId = row?.parentId ?? null;
	}
}

async function uploadCategoryImageFile(
	bucket: R2Bucket,
	categoryId: string,
	file: File,
	variant = 'category'
): Promise<string> {
	const mediaVariant = sanitizeMediaVariant(variant) || 'category';
	const key = buildMediaKey({
		scope: 'categories',
		entityId: categoryId,
		variant: mediaVariant,
		contentType: file.type
	});

	try {
		await uploadImage(bucket, key, file);
		return key;
	} catch (error) {
		wrapMediaError(error, 'Unable to upload category image.');
	}
}

function buildCategoryFilters(options: ListCategoriesOptions): SQL[] {
	const filters: SQL[] = [];

	if (!options.includeInactive) filters.push(eq(category.isActive, true));
	if (options.parentId === null) filters.push(isNull(category.parentId));
	if (typeof options.parentId === 'string') filters.push(eq(category.parentId, options.parentId));
	if (options.search) filters.push(like(category.name, `%${options.search}%`));

	return filters;
}
