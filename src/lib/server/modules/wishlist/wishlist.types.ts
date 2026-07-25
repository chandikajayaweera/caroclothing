import type { SizeTier } from '../products/products.drizzle';

export type WishlistTargetInput = {
	productId: string;
	variantId?: string | null;
};

export type WishlistProductSummaryDTO = {
	id: string;
	name: string;
	slug: string;
	shortDescription: string | null;
	basePrice: number;
	compareAtPrice: number | null;
	isActive: boolean;
	imageUrl: string | null;
};

export type WishlistVariantSummaryDTO = {
	id: string;
	productId: string;
	size: SizeTier;
	color: string;
	colorHex: string | null;
	priceOverride: number | null;
	effectivePrice: number;
	isActive: boolean;
	inventoryQuantity: number | null;
	trackInventory: boolean;
};

export type WishlistItemDTO = {
	id: string;
	userId: string;
	productId: string;
	variantId: string | null;
	addedAt: Date;
	product: WishlistProductSummaryDTO;
	variant: WishlistVariantSummaryDTO | null;
	imageUrl: string | null;
	effectivePrice: number;
	isAvailable: boolean;
};

export type WishlistStatusDTO = {
	productId: string;
	variantId: string | null;
	isWishlisted: boolean;
};

export type ListWishlistOptions = {
	includeUnavailable?: boolean;
	limit?: number;
	offset?: number;
};

export type MergeWishlistIntoUserInput = {
	sourceUserId: string;
};

export type WishlistMergeResult = {
	sourceUserId: string;
	targetUserId: string;
	movedCount: number;
	duplicateCount: number;
};

export type WishlistListResult = {
	items: WishlistItemDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ListWishlistSignalsOptions = {
	productId?: string;
	includeUnavailable?: boolean;
	alertLevel?: WishlistSignalAlertStatus;
	limit?: number;
	offset?: number;
};

export type WishlistSignalAlertStatus = 'high' | 'watch' | 'normal';

export type WishlistSignalDTO = {
	id: string;
	productId: string;
	variantId: string | null;
	saveCount: number;
	lastSavedAt: Date;
	alertStatus: WishlistSignalAlertStatus;
	product: WishlistProductSummaryDTO;
	variant: WishlistVariantSummaryDTO | null;
	imageUrl: string | null;
	effectivePrice: number;
	isAvailable: boolean;
};

export type WishlistSignalListResult = {
	items: WishlistSignalDTO[];
	total: number;
	limit: number;
	offset: number;
	stats: {
		totalSaves: number;
		totalSignals: number;
		highRiskVariants: number;
	};
};
