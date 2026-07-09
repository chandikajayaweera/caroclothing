import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import {
	color,
	product,
	productImage,
	productTag,
	productVariant,
	tag,
	type SizeTier
} from './products.drizzle';
import {
	addProductImage,
	createColor,
	createProduct,
	createProductVariant,
	deleteProduct,
	listProducts,
	setPrimaryProductImage,
	setProductTags,
	updateProductFull
} from './products.service';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import {
	createFakeR2Bucket,
	makeImage,
	makeMediaAdminCtx as makeAdminCtx,
	makeMediaCustomerCtx as makePublicCtx
} from '../../../../tests/fakes/media';
import { makeAdminCtx as makeAdminCtxWithoutMedia } from '../../../../tests/context';
import { seedProduct, seedTag, seedVariantColor } from '../../../../tests/factories/products';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) {
			throw new Error('Test database has not been initialized.');
		}

		return dbState.db;
	}
}));

type CreateProductInput = Parameters<typeof createProduct>[1];
type CreateProductVariantInput = NonNullable<CreateProductInput['variants']>[number];

let harness: TestDatabaseHarness;

function db() {
	return harness.db;
}

function baseProductInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
	const id = crypto.randomUUID().replaceAll('-', '').slice(0, 10);

	return {
		name: `Core Tee ${id}`,
		slug: `core-tee-${id}`,
		description: null,
		shortDescription: null,
		categoryId: null,
		gender: 'unisex',
		fit: 'oversized',
		material: null,
		careInstructions: null,
		isActive: true,
		isFeatured: false,
		isNewArrival: true,
		metaTitle: null,
		metaDescription: null,
		...overrides
	};
}

function variantInput(
	overrides: Partial<CreateProductVariantInput> = {}
): CreateProductVariantInput {
	return {
		clientId: 'black-card',
		colorId: null,
		color: 'Black',
		colorHex: '#000000',
		basePrice: 2500,
		compareAtPrice: null,
		sortOrder: 0,
		sizes: ['M' satisfies SizeTier],
		...overrides
	};
}

async function productRows() {
	return db().select().from(product);
}

describe('products service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	describe('createProduct', () => {
		it('creates products with variants, tags, and uploaded images', async () => {
			const existingTag = await seedTag(db(), { name: 'Graphic', slug: 'graphic' });
			const bucket = createFakeR2Bucket();
			const ctx = makeAdminCtx(bucket);

			const created = await createProduct(
				ctx,
				baseProductInput({
					name: 'Graphic Tee',
					slug: 'graphic-tee',
					tagIds: [existingTag.id],
					newTagNames: ['Launch'],
					variants: [
						variantInput({
							clientId: 'black-card',
							basePrice: 2500,
							sizes: ['M', 'L']
						})
					],
					images: [makeImage('graphic-front.png')],
					imageMetadata: [
						{
							variantClientId: 'black-card',
							altText: 'Graphic tee front',
							position: 0,
							isPrimary: true
						}
					]
				})
			);

			expect(created.slug).toBe('graphic-tee');
			expect(created.tags.map((row) => row.slug).sort()).toEqual(['graphic', 'launch']);
			expect(created.variants).toHaveLength(2);
			expect(created.images).toHaveLength(1);
			expect(created.images[0]).toMatchObject({
				altText: 'Graphic tee front',
				isPrimary: true,
				imageUrl: expect.stringContaining('/media/_preset/card600/'),
				mimeType: 'image/png',
				byteSize: 4,
				originalFilename: 'graphic-front.png',
				width: null,
				height: null
			});
			expect(created.images[0].variantId).toBeTruthy();
			expect(created.primaryImageR2Key).toBe(created.images[0].r2Key);
			expect(created.primaryImageUrl).toBe(created.images[0].imageUrl);
			expect(bucket.putCalls).toHaveLength(1);
			const stored = bucket.objects.get(created.images[0].r2Key);
			expect(stored).toBeTruthy();
			expect(stored?.options).toMatchObject({
				httpMetadata: {
					contentType: 'image/png',
					cacheControl: 'public, max-age=31536000, immutable'
				},
				customMetadata: {
					originalName: 'graphic-front.png',
					mimeType: 'image/png',
					byteSize: '4'
				}
			});
		});

		it('rejects validation errors before upload and leaves DB and R2 untouched', async () => {
			const bucket = createFakeR2Bucket();

			await expect(
				createProduct(
					makeAdminCtx(bucket),
					baseProductInput({
						images: [makeImage()],
						variants: [
							variantInput({
								basePrice: 4500
							})
						]
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			expect(bucket.putCalls).toHaveLength(0);
			expect(bucket.deleteCalls).toHaveLength(0);
			expect(await productRows()).toHaveLength(0);
		});

		it('cleans uploaded images when a later DB transaction step fails', async () => {
			const bucket = createFakeR2Bucket();

			await expect(
				createProduct(
					makeAdminCtx(bucket),
					baseProductInput({
						categoryId: 'missing-category',
						images: [makeImage('orphan.png')],
						variants: [variantInput()]
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.CATEGORY_NOT_FOUND });

			expect(bucket.putCalls).toHaveLength(1);
			expect(bucket.deleteCalls).toEqual(bucket.putCalls);
			expect(bucket.objects.size).toBe(0);
			expect(await productRows()).toHaveLength(0);
		});

		it('requires admin access for product writes', async () => {
			await expect(
				createProduct(
					makePublicCtx(),
					baseProductInput({
						variants: [variantInput()]
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
		});

		it('fails media uploads without a media bucket before inserting product rows', async () => {
			await expect(
				createProduct(
					makeAdminCtxWithoutMedia(),
					baseProductInput({
						images: [makeImage()],
						variants: [variantInput()]
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.MEDIA_UPLOAD_FAILED });

			expect(await productRows()).toHaveLength(0);
		});
	});

	describe('updateProductFull', () => {
		it('syncs tags, variants, images, primary state, and cleanup after commit', async () => {
			const originalTag = await seedTag(db(), { name: 'Original', slug: 'original' });
			const replacementTag = await seedTag(db(), { name: 'Replacement', slug: 'replacement' });
			const bucket = createFakeR2Bucket();
			const ctx = makeAdminCtx(bucket);
			const created = await createProduct(
				ctx,
				baseProductInput({
					name: 'Editable Tee',
					slug: 'editable-tee',
					tagIds: [originalTag.id],
					variants: [variantInput()],
					images: [makeImage('main.png'), makeImage('variant.png')],
					imageMetadata: [
						{ variantClientId: null, altText: 'Main', position: 0, isPrimary: true },
						{
							variantClientId: 'black-card',
							altText: 'Variant',
							position: 1,
							isPrimary: true
						}
					]
				})
			);
			const existingVariantColorId = created.variants[0].variantColorId;
			const globalImage = created.images.find((image) => image.variantId === null);
			const variantImage = created.images.find(
				(image) => image.variantId === existingVariantColorId
			);
			expect(globalImage).toBeTruthy();
			expect(variantImage).toBeTruthy();
			bucket.putCalls.length = 0;
			bucket.deleteCalls.length = 0;

			const updated = await updateProductFull(
				ctx,
				{ id: created.id },
				{
					name: 'Edited Tee',
					slug: 'edited-tee',
					tagIds: [replacementTag.id],
					newTagNames: ['Fresh'],
					variants: [
						{
							id: existingVariantColorId,
							colorId: null,
							color: 'Washed Black',
							colorHex: '#111111',
							basePrice: 2600,
							compareAtPrice: null,
							sortOrder: 1,
							sizes: ['M', 'L']
						},
						{
							id: 'new-bone-card',
							isNew: true,
							colorId: null,
							color: 'Bone',
							colorHex: '#F8F3E8',
							basePrice: 2700,
							compareAtPrice: null,
							sortOrder: 2,
							sizes: ['S']
						}
					],
					images: [
						{
							id: globalImage!.id,
							variantId: null,
							altText: 'Edited main',
							position: 0,
							isPrimary: true
						},
						{
							id: variantImage!.id,
							variantId: existingVariantColorId,
							altText: 'Remove variant',
							position: 1,
							isPrimary: false,
							isDeleted: true
						},
						{
							id: 'new-bone-image',
							variantId: 'new-bone-card',
							altText: 'Bone front',
							position: 2,
							isPrimary: true,
							isNew: true,
							fileIndex: 0
						}
					],
					newImageFiles: [makeImage('bone.png')]
				}
			);

			expect(updated.name).toBe('Edited Tee');
			expect(updated.tags.map((row) => row.slug).sort()).toEqual(['fresh', 'replacement']);
			expect(updated.variants.map((row) => `${row.color}:${row.size}`).sort()).toEqual([
				'Bone:S',
				'Washed Black:L',
				'Washed Black:M'
			]);
			expect(updated.images.map((image) => image.id).sort()).toEqual(
				[globalImage!.id, 'new-bone-image'].sort()
			);
			expect(updated.images.find((image) => image.id === globalImage!.id)?.altText).toBe(
				'Edited main'
			);
			expect(bucket.putCalls).toHaveLength(1);
			expect(bucket.deleteCalls).toEqual([variantImage!.r2Key]);
			expect(bucket.objects.has(variantImage!.r2Key)).toBe(false);
			expect(
				bucket.objects.has(updated.images.find((image) => image.id === 'new-bone-image')!.r2Key)
			).toBe(true);
		});

		it('cleans newly uploaded images when an update transaction fails', async () => {
			const bucket = createFakeR2Bucket();
			const ctx = makeAdminCtx(bucket);
			const productA = await createProduct(
				ctx,
				baseProductInput({
					name: 'Product A',
					slug: 'product-a',
					variants: [variantInput()]
				})
			);
			const productB = await createProduct(
				ctx,
				baseProductInput({
					name: 'Product B',
					slug: 'product-b',
					variants: [
						variantInput({
							clientId: 'other-card'
						})
					]
				})
			);
			bucket.putCalls.length = 0;
			bucket.deleteCalls.length = 0;

			await expect(
				updateProductFull(
					ctx,
					{ id: productA.id },
					{
						slug: productB.slug,
						images: [
							{
								id: 'failed-new-image',
								variantId: null,
								altText: 'Should be cleaned',
								position: 0,
								isPrimary: true,
								isNew: true,
								fileIndex: 0
							}
						],
						newImageFiles: [makeImage('failed.png')]
					}
				)
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			expect(bucket.putCalls).toHaveLength(1);
			expect(bucket.deleteCalls).toEqual(bucket.putCalls);
			expect(bucket.objects.size).toBe(0);
			const [unchanged] = await db().select().from(product).where(eq(product.id, productA.id));
			expect(unchanged.slug).toBe('product-a');
		});
	});

	describe('image APIs', () => {
		it('keeps one primary image per product-wide and variant-color scope', async () => {
			const productRow = await seedProduct(db(), { slug: 'image-scope-tee' });
			const colorRow = await seedVariantColor(db(), productRow.id);
			const ctx = makeAdminCtx(createFakeR2Bucket());
			const firstGlobal = await addProductImage(ctx, {
				productId: productRow.id,
				variantId: null,
				altText: 'Global one',
				position: 0,
				isPrimary: true,
				image: makeImage('global-one.png')
			});
			const secondGlobal = await addProductImage(ctx, {
				productId: productRow.id,
				variantId: null,
				altText: 'Global two',
				position: 1,
				isPrimary: false,
				image: makeImage('global-two.png')
			});
			const firstVariant = await addProductImage(ctx, {
				productId: productRow.id,
				variantId: colorRow.id,
				altText: 'Variant one',
				position: 2,
				isPrimary: true,
				image: makeImage('variant-one.png')
			});
			const secondVariant = await addProductImage(ctx, {
				productId: productRow.id,
				variantId: colorRow.id,
				altText: 'Variant two',
				position: 3,
				isPrimary: false,
				image: makeImage('variant-two.png')
			});

			await setPrimaryProductImage(ctx, secondGlobal.id);
			await setPrimaryProductImage(ctx, secondVariant.id);

			const rows = await db()
				.select()
				.from(productImage)
				.where(eq(productImage.productId, productRow.id));
			const byId = new Map(rows.map((row) => [row.id, row]));

			expect(byId.get(firstGlobal.id)?.isPrimary).toBe(false);
			expect(byId.get(secondGlobal.id)?.isPrimary).toBe(true);
			expect(byId.get(firstVariant.id)?.isPrimary).toBe(false);
			expect(byId.get(secondVariant.id)?.isPrimary).toBe(true);
		});

		it('deletes product-owned rows and cleans R2 images after product deletion', async () => {
			const tagRow = await seedTag(db(), { name: 'Delete Tag', slug: 'delete-tag' });
			const bucket = createFakeR2Bucket();
			const ctx = makeAdminCtx(bucket);
			const created = await createProduct(
				ctx,
				baseProductInput({
					name: 'Delete Tee',
					slug: 'delete-tee',
					tagIds: [tagRow.id],
					variants: [variantInput()],
					images: [makeImage('delete-main.png'), makeImage('delete-variant.png')],
					imageMetadata: [
						{ variantClientId: null, altText: 'Main', position: 0, isPrimary: true },
						{
							variantClientId: 'black-card',
							altText: 'Variant',
							position: 1,
							isPrimary: true
						}
					]
				})
			);
			bucket.deleteCalls.length = 0;
			const keys = created.images.map((image) => image.r2Key).sort();

			await deleteProduct(ctx, { id: created.id });

			expect(await db().select().from(product).where(eq(product.id, created.id))).toHaveLength(0);
			expect(
				await db().select().from(productImage).where(eq(productImage.productId, created.id))
			).toHaveLength(0);
			expect(
				await db().select().from(productVariant).where(eq(productVariant.productId, created.id))
			).toHaveLength(0);
			expect(
				await db().select().from(productTag).where(eq(productTag.productId, created.id))
			).toHaveLength(0);
			expect(bucket.deleteCalls.toSorted()).toEqual(keys);
			expect(bucket.objects.size).toBe(0);
		});
	});

	describe('catalog reads and product rules', () => {
		it('hides inactive products from public reads and exposes them to admins only when requested', async () => {
			await seedProduct(db(), { name: 'Active Tee', slug: 'active-tee', isActive: true });
			await seedProduct(db(), { name: 'Inactive Tee', slug: 'inactive-tee', isActive: false });

			const publicResult = await listProducts(null, { limit: 10 });
			expect(publicResult.items.map((row) => row.slug)).toEqual(['active-tee']);

			const adminResult = await listProducts(makeAdminCtx(), { includeInactive: true, limit: 10 });
			expect(adminResult.items.map((row) => row.slug).sort()).toEqual([
				'active-tee',
				'inactive-tee'
			]);

			await expect(
				listProducts(makePublicCtx(), { includeInactive: true, limit: 10 })
			).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
		});

		it('validates pricing and compare-at price rules', async () => {
			await expect(
				createProduct(
					makeAdminCtx(),
					baseProductInput({
						variants: [
							variantInput({
								basePrice: 2400
							})
						]
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			await expect(
				createProduct(
					makeAdminCtx(),
					baseProductInput({
						variants: [
							variantInput({
								basePrice: 2500,
								compareAtPrice: 2400
							})
						]
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
		});
	});

	describe('variants, colors, and tags', () => {
		it('rejects creating a size variant with a color card from another product', async () => {
			const firstProduct = await seedProduct(db(), { slug: 'first-product' });
			const secondProduct = await seedProduct(db(), { slug: 'second-product' });
			const firstColor = await seedVariantColor(db(), firstProduct.id);

			await expect(
				createProductVariant(makeAdminCtx(), secondProduct.id, {
					variantColorId: firstColor.id,
					size: 'M',
					isActive: true,
					sortOrder: 0
				})
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			expect(
				await db()
					.select()
					.from(productVariant)
					.where(eq(productVariant.productId, secondProduct.id))
			).toHaveLength(0);
		});

		it('normalizes color names and detects duplicate color names or hex values', async () => {
			await createColor(makeAdminCtx(), { name: 'void black', hex: '#0a0a0a' });

			await expect(
				createColor(makeAdminCtx(), { name: 'VOID BLACK', hex: '#111111' })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			await expect(
				createColor(makeAdminCtx(), { name: 'Different Black', hex: '#0A0A0A' })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			const rows = await db().select().from(color);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ name: 'Void Black', hex: '#0A0A0A' });
		});

		it('replaces product tags atomically', async () => {
			const productRow = await seedProduct(db(), { slug: 'tagged-product' });
			const firstTag = await seedTag(db(), { name: 'First', slug: 'first' });
			const secondTag = await seedTag(db(), { name: 'Second', slug: 'second' });
			await db().insert(productTag).values({ productId: productRow.id, tagId: firstTag.id });

			await setProductTags(makeAdminCtx(), productRow.id, [secondTag.id]);

			const rows = await db()
				.select({ slug: tag.slug })
				.from(productTag)
				.innerJoin(tag, eq(productTag.tagId, tag.id))
				.where(eq(productTag.productId, productRow.id));
			expect(rows.map((row) => row.slug)).toEqual(['second']);
		});

		it('rejects missing tag IDs without changing existing tag assignments', async () => {
			const productRow = await seedProduct(db(), { slug: 'missing-tag-product' });
			const existingTag = await seedTag(db(), { name: 'Existing', slug: 'existing' });
			await db().insert(productTag).values({ productId: productRow.id, tagId: existingTag.id });

			await expect(
				setProductTags(makeAdminCtx(), productRow.id, ['missing-tag'])
			).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

			const rows = await db()
				.select()
				.from(productTag)
				.where(eq(productTag.productId, productRow.id));
			expect(rows).toHaveLength(1);
			expect(rows[0].tagId).toBe(existingTag.id);
		});
	});
});
