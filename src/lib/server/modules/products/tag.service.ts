import { and, asc, eq, inArray, like, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode } from '$lib/server/modules/errors';
import {
	insertProductTagSchema,
	insertTagSchema,
	product,
	productTag,
	tag,
	type Tag
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

const createTagInputSchema = insertTagSchema.omit({ id: true });
const updateTagInputSchema = createTagInputSchema.partial();
const attachProductTagInputSchema = insertProductTagSchema;

export type ProductTag = typeof productTag.$inferSelect;
export type CreateTagInput = z.infer<typeof createTagInputSchema>;
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>;
export type AttachProductTagInput = z.infer<typeof attachProductTagInputSchema>;

export type ListTagsOptions = {
	search?: string;
	limit?: number;
	offset?: number;
};

export type TagMutationOptions = {
	actor: ProductServiceActor;
};

export async function listTags(options: ListTagsOptions = {}): Promise<Tag[]> {
	const filters = buildTagFilters(options);

	return getDb()
		.select()
		.from(tag)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(asc(tag.name))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getTagById(id: string): Promise<Tag> {
	const [row] = await getDb().select().from(tag).where(eq(tag.id, id)).limit(1);
	if (!row) notFound('Tag not found.', ErrorCode.TAG_NOT_FOUND, { id });
	return row;
}

export async function getTagBySlug(slug: string): Promise<Tag> {
	const [row] = await getDb().select().from(tag).where(eq(tag.slug, slug)).limit(1);
	if (!row) notFound('Tag not found.', ErrorCode.TAG_NOT_FOUND, { slug });
	return row;
}

export async function createTag(input: CreateTagInput, options: TagMutationOptions): Promise<Tag> {
	assertProductPermission(options.actor, 'tag', 'create');

	const parsed = parseProductServiceInput(createTagInputSchema, input, 'tag');

	try {
		const [created] = await getDb().insert(tag).values(parsed).returning();
		return created;
	} catch (error) {
		wrapProductPersistenceError(error, 'Tag name or slug already exists.');
	}
}

export async function updateTag(
	id: string,
	input: UpdateTagInput,
	options: TagMutationOptions
): Promise<Tag> {
	assertProductPermission(options.actor, 'tag', 'update');

	const parsed = parseProductServiceInput(updateTagInputSchema, input, 'tag');
	assertNonEmptyUpdate(parsed, 'tag');
	await getTagById(id);

	try {
		const [updated] = await getDb().update(tag).set(parsed).where(eq(tag.id, id)).returning();
		if (!updated) notFound('Tag not found.', ErrorCode.TAG_NOT_FOUND, { id });
		return updated;
	} catch (error) {
		wrapProductPersistenceError(error, 'Tag name or slug already exists.');
	}
}

export async function deleteTag(id: string, options: TagMutationOptions): Promise<Tag> {
	assertProductPermission(options.actor, 'tag', 'delete');

	const existing = await getTagById(id);
	const [deleted] = await getDb().delete(tag).where(eq(tag.id, id)).returning();
	return deleted ?? existing;
}

export async function listTagsForProduct(productId: string): Promise<Tag[]> {
	await assertProductExists(productId);

	return getDb()
		.select({
			id: tag.id,
			name: tag.name,
			slug: tag.slug
		})
		.from(productTag)
		.innerJoin(tag, eq(productTag.tagId, tag.id))
		.where(eq(productTag.productId, productId))
		.orderBy(asc(tag.name));
}

export async function attachTagToProduct(
	input: AttachProductTagInput,
	options: TagMutationOptions
): Promise<ProductTag> {
	assertProductPermission(options.actor, 'tag', 'update');

	const parsed = parseProductServiceInput(attachProductTagInputSchema, input, 'product tag');
	await assertProductExists(parsed.productId);
	await assertTagsExist([parsed.tagId]);

	const existing = await findProductTag(parsed.productId, parsed.tagId);
	if (existing) return existing;

	try {
		const [created] = await getDb().insert(productTag).values(parsed).returning();
		return created;
	} catch (error) {
		wrapProductPersistenceError(error, 'Product tag already exists.');
	}
}

export async function attachTagSlugToProduct(
	productId: string,
	tagSlug: string,
	options: TagMutationOptions
): Promise<ProductTag> {
	const targetTag = await getTagBySlug(tagSlug);
	return attachTagToProduct({ productId, tagId: targetTag.id }, options);
}

export async function detachTagFromProduct(
	productId: string,
	tagId: string,
	options: TagMutationOptions
): Promise<ProductTag> {
	assertProductPermission(options.actor, 'tag', 'update');

	const existing = await findProductTag(productId, tagId);
	if (!existing) notFound('Product tag not found.', ErrorCode.TAG_NOT_FOUND, { productId, tagId });

	const [deleted] = await getDb()
		.delete(productTag)
		.where(and(eq(productTag.productId, productId), eq(productTag.tagId, tagId)))
		.returning();

	return deleted ?? existing;
}

export async function setProductTags(
	productId: string,
	tagIds: string[],
	options: TagMutationOptions
): Promise<ProductTag[]> {
	assertProductPermission(options.actor, 'tag', 'update');

	await assertProductExists(productId);
	const uniqueTagIds = [...new Set(tagIds)];
	await assertTagsExist(uniqueTagIds);

	await getDb().delete(productTag).where(eq(productTag.productId, productId));

	if (uniqueTagIds.length === 0) return [];

	return getDb()
		.insert(productTag)
		.values(uniqueTagIds.map((tagId) => ({ productId, tagId })))
		.returning();
}

async function assertProductExists(productId: string) {
	const [row] = await getDb()
		.select({ id: product.id })
		.from(product)
		.where(eq(product.id, productId))
		.limit(1);

	if (!row) notFound('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
}

async function assertTagsExist(tagIds: string[]) {
	if (tagIds.length === 0) return;

	const rows = await getDb().select({ id: tag.id }).from(tag).where(inArray(tag.id, tagIds));

	if (rows.length === tagIds.length) return;

	const foundIds = new Set(rows.map((row) => row.id));
	const missingTagIds = tagIds.filter((tagId) => !foundIds.has(tagId));
	notFound('One or more tags were not found.', ErrorCode.TAG_NOT_FOUND, { tagIds: missingTagIds });
}

async function findProductTag(productId: string, tagId: string): Promise<ProductTag | null> {
	const [row] = await getDb()
		.select()
		.from(productTag)
		.where(and(eq(productTag.productId, productId), eq(productTag.tagId, tagId)))
		.limit(1);

	return row ?? null;
}

function buildTagFilters(options: ListTagsOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.search) filters.push(like(tag.name, `%${options.search}%`));

	return filters;
}
