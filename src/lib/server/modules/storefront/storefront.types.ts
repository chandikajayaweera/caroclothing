import type { PublicCategoryDTO, PublicProductDTO } from '../products/products.types';
import type { PublicReviewDTO } from '../reviews/reviews.types';
import type { ShippingQuoteDTO } from '../shipping/shipping.types';
import type {
	StorefrontSection,
	StorefrontSectionMedia,
	UpdateStorefrontSection
} from './storefront.drizzle';

export type StorefrontSectionLookup = { id: string };
export type StorefrontSectionMediaDTO = {
	id: string;
	role: StorefrontSectionMedia['role'];
	r2Key: string;
	imageUrl: string;
	mimeType: string;
	byteSize: number;
	originalFilename: string | null;
	width: number | null;
	height: number | null;
	altText: string | null;
	focalX: number;
	focalY: number;
};

export type PublicStorefrontSectionMediaDTO = Omit<
	StorefrontSectionMediaDTO,
	'mimeType' | 'byteSize' | 'originalFilename'
>;

export type StorefrontProductDTO = PublicProductDTO & {
	stockStatus: 'available' | 'low-stock' | 'sold-out';
	totalStock: number;
	hasAvailable: boolean;
};

export type StorefrontSectionBaseDTO = {
	id: string;
	pageKey: StorefrontSection['pageKey'];
	type: StorefrontSection['type'];
	adminName: string;
	layoutVariant: StorefrontSection['layoutVariant'];
	sourceType: StorefrontSection['sourceType'];
	eyebrow: string | null;
	title: string | null;
	body: string | null;
	primaryCtaLabel: string | null;
	primaryCtaUrl: string | null;
	secondaryCtaLabel: string | null;
	secondaryCtaUrl: string | null;
	itemLimit: number;
	sortOrder: number;
	media: StorefrontSectionMediaDTO[];
};

export type PublicStorefrontSectionBaseDTO = Omit<StorefrontSectionBaseDTO, 'media'> & {
	media: PublicStorefrontSectionMediaDTO[];
};

export type HomePageSectionDTO = PublicStorefrontSectionBaseDTO & {
	product: StorefrontProductDTO | null;
	products: StorefrontProductDTO[];
	categories: PublicCategoryDTO[];
	promotion: {
		id: string;
		title: string;
		description: string | null;
		discountType: 'percentage' | 'fixed';
		discountValue: number;
	} | null;
	shipping: ShippingQuoteDTO | null;
	reviews: PublicReviewDTO[];
};

export type HomePageDTO = {
	sections: HomePageSectionDTO[];
	generatedAt: Date;
};

export type AdminStorefrontSectionDTO = StorefrontSectionBaseDTO & {
	productId: string | null;
	categoryId: string | null;
	promotionId: string | null;
	shippingMethodId: string | null;
	categoryIds: string[];
	enabled: boolean;
	startsAt: Date | null;
	endsAt: Date | null;
	visibilityStatus: 'disabled' | 'scheduled' | 'live' | 'ended';
	createdAt: Date;
	updatedAt: Date;
};

export type CreateStorefrontSectionInput = {
	pageKey?: StorefrontSection['pageKey'];
	type: StorefrontSection['type'];
	adminName: string;
	layoutVariant: StorefrontSection['layoutVariant'];
	sourceType: StorefrontSection['sourceType'];
	eyebrow?: string | null;
	title?: string | null;
	body?: string | null;
	primaryCtaLabel?: string | null;
	primaryCtaUrl?: string | null;
	secondaryCtaLabel?: string | null;
	secondaryCtaUrl?: string | null;
	productId?: string | null;
	categoryId?: string | null;
	promotionId?: string | null;
	shippingMethodId?: string | null;
	itemLimit?: number;
	sortOrder?: number;
	enabled?: boolean;
	startsAt?: number | null;
	endsAt?: number | null;
	categoryIds?: string[];
	desktopImage?: File | null;
	mobileImage?: File | null;
	desktopAltText?: string | null;
	mobileAltText?: string | null;
	desktopFocalX?: number;
	desktopFocalY?: number;
	mobileFocalX?: number;
	mobileFocalY?: number;
};

export type UpdateStorefrontSectionInput = UpdateStorefrontSection & {
	categoryIds?: string[];
	desktopImage?: File | null;
	mobileImage?: File | null;
	removeDesktopImage?: boolean;
	removeMobileImage?: boolean;
	desktopAltText?: string | null;
	mobileAltText?: string | null;
	desktopFocalX?: number;
	desktopFocalY?: number;
	mobileFocalX?: number;
	mobileFocalY?: number;
};

export type ReorderStorefrontSectionsInput = {
	pageKey?: StorefrontSection['pageKey'];
	sectionIds: string[];
};

export type StorefrontEditorOptionsDTO = {
	products: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
	categories: Array<{
		id: string;
		name: string;
		slug: string;
		parentId: string | null;
		isActive: boolean;
	}>;
	promotions: Array<{ id: string; name: string; status: string; visibility: string }>;
	shippingMethods: Array<{ id: string; name: string; isActive: boolean }>;
};
