import type { TestDatabase } from '../db';
import { seedProduct, seedVariant, seedVariantColor } from '../factories/products';

export type SeedProductWithVariantOptions = {
	product?: Parameters<typeof seedProduct>[1];
	variantColor?: Parameters<typeof seedVariantColor>[2];
	variant?: Parameters<typeof seedVariant>[3];
};

export async function seedProductWithVariant(
	db: TestDatabase,
	options: SeedProductWithVariantOptions = {}
) {
	const product = await seedProduct(db, options.product);
	const variantColor = await seedVariantColor(db, product.id, options.variantColor);
	const variant = await seedVariant(db, product.id, variantColor.id, options.variant);

	return { product, variantColor, variant };
}
