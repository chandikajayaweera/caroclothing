import type {
	FitTier,
	GenderTier,
	InsertCategory,
	InsertProduct,
	InsertProductImage,
	InsertProductVariant,
	InsertProductVariantColor,
	InsertTag,
	SizeTier,
	UpdateCategory,
	UpdateProduct,
	UpdateProductVariant,
	UpdateProductVariantColor,
	UpdateTag
} from './products.drizzle';

export type CategoryDTO = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	imageR2Key: string | null;
	imageUrl: string | null;
	imageMimeType: string | null;
	imageByteSize: number | null;
	imageOriginalFilename: string | null;
	imageWidth: number | null;
	imageHeight: number | null;
	parentId: string | null;
	sortOrder: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type PublicCategoryDTO = Omit<
	CategoryDTO,
	'imageMimeType' | 'imageByteSize' | 'imageOriginalFilename'
>;

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

type CategoryImageMetadataFields =
	| 'imageR2Key'
	| 'imageMimeType'
	| 'imageByteSize'
	| 'imageOriginalFilename'
	| 'imageWidth'
	| 'imageHeight';

export type CreateCategoryInput = Omit<InsertCategory, CategoryImageMetadataFields> & {
	image?: File | null;
};

export type UpdateCategoryInput = Omit<UpdateCategory, CategoryImageMetadataFields> & {
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
	variantColorId: string;
	colorId: string | null;
	size: SizeTier;
	color: string;
	colorHex: string | null;
	priceOverride: number | null;
	basePrice: number;
	compareAtPrice: number | null;
	effectivePrice: number;
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
	mimeType: string | null;
	byteSize: number | null;
	originalFilename: string | null;
	width: number | null;
	height: number | null;
	altText: string | null;
	position: number;
	isPrimary: boolean;
	createdAt: Date;
};

export type ProductImageReadDTO = ProductImageDTO;

export type PublicProductImageDTO = Omit<
	ProductImageReadDTO,
	'mimeType' | 'byteSize' | 'originalFilename'
>;

export type ProductDTO = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	shortDescription: string | null;
	categoryId: string | null;
	category: CategoryDTO | null;
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
	primaryImageR2Key: string | null;
	tags: TagDTO[];
	primaryImageUrl: string | null;
};

export type PublicProductDTO = Omit<ProductDTO, 'category' | 'images'> & {
	category: PublicCategoryDTO | null;
	images: PublicProductImageDTO[];
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
	gender?: GenderTier;
	isFeatured?: boolean;
	isNewArrival?: boolean;
	limit?: number;
	offset?: number;
	query?: string;
};

export type ListProductsByIdsInput = {
	productIds: string[];
};

export type CreateProductDraftVariantInput = {
	clientId: string;
	colorId?: string | null;
	color: string;
	colorHex?: string | null;
	basePrice: number;
	compareAtPrice?: number | null;
	sortOrder: number;
	sizes: SizeTier[];
};

export type CreateProductImageMetadataInput = {
	variantClientId?: string | null;
	altText?: string | null;
	position?: number;
	isPrimary?: boolean;
};

export type CreateProductInput = InsertProduct & {
	tagIds?: string[];
	newTagNames?: string[];
	images?: File[];
	primaryImageIndex?: number;
	variants?: CreateProductDraftVariantInput[];
	imageMetadata?: CreateProductImageMetadataInput[];
};

export type UpdateProductInput = UpdateProduct & {
	tagIds?: string[];
	newTagNames?: string[];
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

export type CreateProductVariantColorInput = Omit<InsertProductVariantColor, 'productId'>;
export type UpdateProductVariantColorInput = Omit<UpdateProductVariantColor, 'productId'>;

export type UpdateProductDraftVariantInput = {
	id: string;
	colorId?: string | null;
	color: string;
	colorHex?: string | null;
	basePrice: number;
	compareAtPrice?: number | null;
	sortOrder: number;
	sizes: SizeTier[];
	isNew?: boolean;
	isDeleted?: boolean;
};

export type UpdateProductDraftImageInput = {
	id: string;
	variantId?: string | null;
	altText?: string | null;
	position: number;
	isPrimary: boolean;
	isNew?: boolean;
	isDeleted?: boolean;
	fileIndex?: number;
};

export type UpdateProductFullInput = UpdateProductInput & {
	variants?: UpdateProductDraftVariantInput[];
	images?: UpdateProductDraftImageInput[];
	newImageFiles?: File[];
};

export type ProductStatsDTO = {
	total: number;
	active: number;
	inactive: number;
};
