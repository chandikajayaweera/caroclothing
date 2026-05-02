import type {
	FitTier,
	GenderTier,
	InsertCategory,
	InsertProduct,
	InsertProductImage,
	InsertProductVariant,
	InsertTag,
	ProductTier,
	SizeTier,
	UpdateCategory,
	UpdateProduct,
	UpdateProductVariant,
	UpdateTag
} from './products.drizzle';

export type CategoryDTO = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	imageR2Key: string | null;
	imageUrl: string | null;
	parentId: string | null;
	sortOrder: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type CategoryLookup =
	| { id: string; slug?: never; name?: never }
	| { id?: never; slug: string; name?: never }
	| { id?: never; slug?: never; name: string };

export type GetCategoryOptions = {
	includeInactive?: boolean;
};

export type ListCategoriesOptions = {
	includeInactive?: boolean;
	parentId?: string | null;
	limit?: number;
	offset?: number;
};

export type CreateCategoryInput = Omit<InsertCategory, 'imageR2Key'> & {
	image?: File | null;
};

export type UpdateCategoryInput = Omit<UpdateCategory, 'imageR2Key'> & {
	image?: File | null;
	removeImage?: boolean;
};

export type ProductLookup = { id: string; slug?: never } | { id?: never; slug: string };

export type TagDTO = {
	id: string;
	name: string;
	slug: string;
};

export type TagLookup =
	| { id: string; slug?: never; name?: never }
	| { id?: never; slug: string; name?: never }
	| { id?: never; slug?: never; name: string };

export type ListTagsOptions = {
	limit?: number;
	offset?: number;
};

export type CreateTagInput = InsertTag;

export type UpdateTagInput = UpdateTag;

export type ProductVariantDTO = {
	id: string;
	productId: string;
	sku: string;
	size: SizeTier;
	color: string;
	colorHex: string | null;
	priceOverride: number | null;
	effectivePrice: number;
	weight: number | null;
	isActive: boolean;
	sortOrder: number;
	createdAt: Date;
	updatedAt: Date;
};

export type ProductVariantReadDTO = ProductVariantDTO;

export type ProductImageDTO = {
	id: string;
	productId: string;
	variantId: string | null;
	r2Key: string;
	imageUrl: string;
	altText: string | null;
	position: number;
	isPrimary: boolean;
	createdAt: Date;
};

export type ProductImageReadDTO = ProductImageDTO;

export type ProductDTO = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	shortDescription: string | null;
	categoryId: string | null;
	category: CategoryDTO | null;
	tier: ProductTier;
	basePrice: number;
	compareAtPrice: number | null;
	gender: GenderTier;
	fit: FitTier;
	material: string | null;
	careInstructions: string | null;
	isActive: boolean;
	isFeatured: boolean;
	isNewArrival: boolean;
	metaTitle: string | null;
	metaDescription: string | null;
	createdAt: Date;
	updatedAt: Date;
	variants: ProductVariantReadDTO[];
	images: ProductImageReadDTO[];
	tags: TagDTO[];
	primaryImageUrl: string | null;
};

export type ProductListResult = {
	items: ProductDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type GetProductOptions = {
	includeInactive?: boolean;
};

export type ListProductsOptions = {
	includeInactive?: boolean;
	categoryId?: string | null;
	tier?: ProductTier;
	gender?: GenderTier;
	isFeatured?: boolean;
	isNewArrival?: boolean;
	limit?: number;
	offset?: number;
};

export type CreateProductInput = InsertProduct & {
	tagIds?: string[];
};

export type UpdateProductInput = UpdateProduct & {
	tagIds?: string[];
};

export type CreateProductVariantInput = Omit<InsertProductVariant, 'productId'>;

export type UpdateProductVariantInput = Omit<UpdateProductVariant, 'productId'>;

export type ListProductVariantsOptions = {
	includeInactive?: boolean;
	limit?: number;
	offset?: number;
};

export type AddProductImageInput = Omit<InsertProductImage, 'r2Key'> & {
	image: File;
};
