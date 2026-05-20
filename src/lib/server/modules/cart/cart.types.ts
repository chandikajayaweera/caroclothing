import type { SizeTier } from '../products/products.drizzle';

export type CartOwnerType = 'user' | 'guest';

export type CartItemAvailabilityStatus = 'available' | 'backorder' | 'unavailable' | 'untracked';

export type CartAccessInput = {
	sessionToken?: string | null;
	now?: Date;
};

export type AddCartItemInput = CartAccessInput & {
	variantId: string;
	quantity?: number;
};

export type UpdateCartItemQuantityInput = CartAccessInput & {
	cartItemId: string;
	quantity: number;
};

export type RemoveCartItemInput = CartAccessInput & {
	cartItemId: string;
};

export type MergeGuestCartIntoUserInput = {
	sessionToken: string;
	now?: Date;
};

export type MergeUserCartIntoUserInput = {
	sourceUserId: string;
	now?: Date;
};

export type CartItemDTO = {
	id: string;
	cartId: string;
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
	availabilityStatus: CartItemAvailabilityStatus;
	availableQuantity: number | null;
	reservedForItem: number;
	isBackorder: boolean;
	addedAt: Date;
	updatedAt: Date;
};

export type CartDTO = {
	id: string;
	ownerType: CartOwnerType;
	userId: string | null;
	expiresAt: Date | null;
	items: CartItemDTO[];
	itemCount: number;
	subtotal: number;
	discountAmount: number;
	totalBeforeShipping: number;
	hasUnavailableItems: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type CheckoutCartDTO = CartDTO & {
	canCheckout: boolean;
	blockingReasons: string[];
};

export type CheckoutOrderCartItemDTO = CartItemDTO & {
	productImageR2Key: string | null;
};

export type CheckoutOrderCartDTO = Omit<CheckoutCartDTO, 'items'> & {
	items: CheckoutOrderCartItemDTO[];
	promoCodeId: string | null;
};

export type OrderCartDeleteResult = {
	cartId: string;
	itemCount: number;
};

export type AdminCartDTO = CartDTO & {
	sessionToken: string | null;
	promoCodeId: string | null;
};

export type ListCartsOptions = {
	ownerType?: CartOwnerType;
	userId?: string;
	includeExpired?: boolean;
	limit?: number;
	offset?: number;
};

export type CartListResult = {
	items: AdminCartDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ExpiredGuestCartCleanupResult = {
	deletedCount: number;
	cartIds: string[];
	itemCount: number;
	releasedQuantity: number;
};
