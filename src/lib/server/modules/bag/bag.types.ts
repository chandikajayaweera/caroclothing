import type { SizeTier } from '../products/products.drizzle';
import type { InventoryAvailabilityDTO } from '../inventory/inventory.types';

export type BagOwnerType = 'user' | 'guest';
export type BagCheckoutStatus = 'inactive' | 'active' | 'expired';

export type BagItemAvailabilityStatus =
	| 'available'
	| 'insufficient'
	| 'reserved'
	| 'backorder'
	| 'unavailable'
	| 'untracked';

export type StorefrontVariantAvailabilityDTO = InventoryAvailabilityDTO & {
	availabilityStatus: BagItemAvailabilityStatus;
	checkoutHeldQuantity: number;
	checkoutHoldExpiresAt: Date | null;
	checkoutHoldSecondsRemaining: number | null;
};

export type StorefrontVariantAvailabilityInput = {
	variantIds: string[];
	now?: Date;
};

export type BagAccessInput = {
	sessionToken?: string | null;
	now?: Date;
};

export type AddBagItemInput = BagAccessInput & {
	variantId: string;
	quantity?: number;
};

export type UpdateBagItemQuantityInput = BagAccessInput & {
	bagItemId: string;
	quantity: number;
};

export type RemoveBagItemInput = BagAccessInput & {
	bagItemId: string;
};

export type MergeGuestBagIntoUserInput = {
	sessionToken: string;
	now?: Date;
};

export type MergeUserBagIntoUserInput = {
	sourceUserId: string;
	now?: Date;
};

export type BagItemDTO = {
	id: string;
	bagId: string;
	productId: string;
	variantId: string;
	productName: string | null;
	productSlug: string | null;
	size: SizeTier | null;
	color: string | null;
	colorHex: string | null;
	imageUrl: string | null;
	quantity: number;
	unitPrice: number;
	currentUnitPrice: number | null;
	priceChanged: boolean;
	lineTotal: number;
	availabilityStatus: BagItemAvailabilityStatus;
	availableQuantity: number | null;
	reservedForItem: number;
	reservationExpiresAt: Date | null;
	reservationSecondsRemaining: number | null;
	isBackorder: boolean;
	addedAt: Date;
	updatedAt: Date;
};

export type BagDTO = {
	id: string;
	ownerType: BagOwnerType;
	userId: string | null;
	expiresAt: Date | null;
	checkoutStartedAt: Date | null;
	checkoutExpiresAt: Date | null;
	checkoutStatus: BagCheckoutStatus;
	items: BagItemDTO[];
	itemCount: number;
	subtotal: number;
	discountAmount: number;
	totalBeforeShipping: number;
	hasUnavailableItems: boolean;
	hasInsufficientItems: boolean;
	hasReservedItems: boolean;
	promoCodeId: string | null;
	promoCode: string | null;
	promoMinOrderAmount: number | null;
	freeShippingThreshold: number | null;
	createdAt: Date;
	updatedAt: Date;
};

export type CheckoutBagDTO = BagDTO & {
	canCheckout: boolean;
	blockingReasons: string[];
};

export type CheckoutOrderBagItemDTO = BagItemDTO & {
	productImageR2Key: string | null;
};

export type CheckoutOrderBagDTO = Omit<CheckoutBagDTO, 'items'> & {
	items: CheckoutOrderBagItemDTO[];
	promoCodeId: string | null;
};

export type OrderBagDeleteResult = {
	bagId: string;
	itemCount: number;
};

export type AdminBagDTO = BagDTO & {
	sessionToken: string | null;
	promoCodeId: string | null;
};

export type ListBagsOptions = {
	ownerType?: BagOwnerType;
	userId?: string;
	includeExpired?: boolean;
	status?: 'active' | 'expired' | 'empty' | 'non-empty' | 'all';
	limit?: number;
	offset?: number;
};

export type BagListResult = {
	items: AdminBagDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type BagSummaryDTO = {
	total: number;
	active: number;
	expired: number;
	guest: number;
	user: number;
	totalSubtotal: number;
	totalItems: number;
	activeCheckouts: number;
	checkoutWindowItems: number;
};

export type ExpiredGuestBagCleanupResult = {
	deletedCount: number;
	bagIds: string[];
	itemCount: number;
	releasedQuantity: number;
	skippedCount: number;
	failedCount: number;
	failedBagIds: string[];
};

export type ExpiredBagCheckoutCleanupResult = {
	expiredCount: number;
	bagIds: string[];
	releasedQuantity: number;
	skippedCount: number;
	failedCount: number;
	failedBagIds: string[];
};
