export type ProductUiSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';

export type ProductUiColor = {
	id: string;
	name: string;
	hex: string;
};

export type ProductUiOption<T extends string = string> = {
	value: T;
	label: string;
};

export type ProductUiCategory = {
	id: string;
	name: string;
};

export type ProductUiTag = {
	id: string;
	name: string;
};

export type ProductUiImageMetadata = {
	altText?: string | null;
};

export type ProductBasicsForm = {
	name?: string;
	slug?: string;
	categoryId?: string | null;
	gender?: string;
	fit?: string;
	shortDescription?: string | null;
	description?: string | null;
	isActive?: boolean;
	isFeatured?: boolean;
	isNewArrival?: boolean;
	imageMetadata?: ProductUiImageMetadata[];
};

export type ProductPublishingForm = {
	material?: string | null;
	careInstructions?: string | null;
	metaTitle?: string | null;
	metaDescription?: string | null;
};

export type ProductTagsForm = {
	tagIds: string[];
	newTagNames: string[];
};

export type ProductPreviewForm = ProductTagsForm & {
	name?: string;
	shortDescription?: string | null;
	gender?: string;
	fit?: string;
	isActive?: boolean;
};

export type ProductUiVariant = {
	clientId: string;
	colorId?: string | null;
	color: string;
	colorHex?: string | null;
	basePrice: number;
	compareAtPrice?: number | null;
	sortOrder: number;
	sizes: string[];
};

export type ProductVariantsForm = {
	variants: ProductUiVariant[];
	syncPrices: boolean;
};

export type ProductUiImage = {
	id: string;
	imageUrl: string;
	altText?: string | null;
	isPrimary: boolean;
	variantId?: string | null;
};

export type ProductVariantImagePreview = {
	index: number;
	preview: { url: string };
	meta: { isPrimary: boolean };
};

export type ProductFieldError = string | string[] | undefined;
export type ProductFieldConstraints = Record<string, unknown>;

export type ProductBasicsErrors = Partial<Record<'name' | 'slug', ProductFieldError>>;
export type ProductBasicsConstraints = Partial<
	Record<'name' | 'slug' | 'shortDescription' | 'description', ProductFieldConstraints>
>;

type ProductVariantFieldErrors = {
	basePrice?: string[];
	compareAtPrice?: string[];
	sizes?: { [index: number]: string[]; _errors?: string[] };
};

export type ProductVariantsErrors = {
	variants?: { [index: number]: ProductVariantFieldErrors; _errors?: string[] };
};

export type ProductPublishingConstraints = Partial<
	Record<'material' | 'careInstructions' | 'metaTitle' | 'metaDescription', ProductFieldConstraints>
>;
