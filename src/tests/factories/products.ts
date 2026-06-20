import { nanoid } from 'nanoid';
import {
	category,
	color,
	product,
	productImage,
	productVariant,
	productVariantColor,
	tag,
	type Category,
	type Color,
	type Product,
	type ProductImage,
	type ProductVariant,
	type ProductVariantColor,
	type SizeTier,
	type Tag
} from '$lib/server/modules/products/products.drizzle';
import type { TestDatabase } from '../db';

export async function seedCategory(
	db: TestDatabase,
	overrides: Partial<typeof category.$inferInsert> = {}
): Promise<Category> {
	const [created] = await db
		.insert(category)
		.values({
			id: overrides.id ?? nanoid(),
			name: overrides.name ?? 'Tees',
			slug: overrides.slug ?? `tees-${nanoid(6)}`,
			description: overrides.description ?? null,
			imageR2Key: overrides.imageR2Key ?? null,
			parentId: overrides.parentId ?? null,
			sortOrder: overrides.sortOrder ?? 0,
			isActive: overrides.isActive ?? true
		})
		.returning();

	return created;
}

export async function seedColor(
	db: TestDatabase,
	overrides: Partial<typeof color.$inferInsert> = {}
): Promise<Color> {
	const [created] = await db
		.insert(color)
		.values({
			id: overrides.id ?? nanoid(),
			name: overrides.name ?? `Black ${nanoid(4)}`,
			hex: overrides.hex ?? '#000000'
		})
		.returning();

	return created;
}

export async function seedProduct(
	db: TestDatabase,
	overrides: Partial<typeof product.$inferInsert> = {}
): Promise<Product> {
	const id = overrides.id ?? nanoid();

	const [created] = await db
		.insert(product)
		.values({
			id,
			name: overrides.name ?? `Product ${id}`,
			slug: overrides.slug ?? `product-${id}`,
			description: overrides.description ?? null,
			shortDescription: overrides.shortDescription ?? null,
			categoryId: overrides.categoryId ?? null,
			tier: overrides.tier ?? 'core',
			gender: overrides.gender ?? 'unisex',
			fit: overrides.fit ?? 'oversized',
			material: overrides.material ?? null,
			careInstructions: overrides.careInstructions ?? null,
			isActive: overrides.isActive ?? true,
			isFeatured: overrides.isFeatured ?? false,
			isNewArrival: overrides.isNewArrival ?? true,
			metaTitle: overrides.metaTitle ?? null,
			metaDescription: overrides.metaDescription ?? null
		})
		.returning();

	return created;
}

export async function seedVariantColor(
	db: TestDatabase,
	productId: string,
	overrides: Partial<typeof productVariantColor.$inferInsert> = {}
): Promise<ProductVariantColor> {
	const [created] = await db
		.insert(productVariantColor)
		.values({
			id: overrides.id ?? nanoid(),
			productId,
			colorId: overrides.colorId ?? null,
			color: overrides.color ?? 'Black',
			colorHex: overrides.colorHex ?? '#000000',
			basePrice: overrides.basePrice ?? 2500,
			compareAtPrice: overrides.compareAtPrice ?? null,
			sortOrder: overrides.sortOrder ?? 0
		})
		.returning();

	return created;
}

export async function seedVariant(
	db: TestDatabase,
	productId: string,
	variantColorId: string,
	overrides: Partial<typeof productVariant.$inferInsert> = {}
): Promise<ProductVariant> {
	const [created] = await db
		.insert(productVariant)
		.values({
			id: overrides.id ?? nanoid(),
			productId,
			variantColorId,
			size: overrides.size ?? ('M' satisfies SizeTier),
			isActive: overrides.isActive ?? true,
			sortOrder: overrides.sortOrder ?? 0
		})
		.returning();

	return created;
}

export async function seedProductImage(
	db: TestDatabase,
	productId: string,
	overrides: Partial<typeof productImage.$inferInsert> = {}
): Promise<ProductImage> {
	const [created] = await db
		.insert(productImage)
		.values({
			id: overrides.id ?? nanoid(),
			productId,
			variantId: overrides.variantId ?? null,
			r2Key: overrides.r2Key ?? `products/${productId}/main-${nanoid(8)}.png`,
			altText: overrides.altText ?? null,
			position: overrides.position ?? 0,
			isPrimary: overrides.isPrimary ?? false
		})
		.returning();

	return created;
}

export async function seedTag(
	db: TestDatabase,
	overrides: Partial<typeof tag.$inferInsert> = {}
): Promise<Tag> {
	const id = overrides.id ?? nanoid();

	const [created] = await db
		.insert(tag)
		.values({
			id,
			name: overrides.name ?? `Tag ${id}`,
			slug: overrides.slug ?? `tag-${id}`
		})
		.returning();

	return created;
}
