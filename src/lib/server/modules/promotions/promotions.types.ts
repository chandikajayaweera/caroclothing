import type { InsertPromotion, PromoCode, Promotion, UpdatePromotion } from './promotions.drizzle';

export type PromotionLookup = { id: string };
export type PromoCodeLookup = { id: string } | { code: string };
export type PromotionStatus = 'inactive' | 'scheduled' | 'active' | 'expired' | 'exhausted';
/** @deprecated Use PromotionStatus. */
export type PromoCodeStatus = PromotionStatus;

export type PromotionSnapshot = {
	promotionId: string;
	name: string;
	code: string | null;
	discountType: Promotion['discountType'];
	discountValue: number;
};
/** @deprecated Orders still use this serialized field name. */
export type PromoCodeSnapshot = PromotionSnapshot;

export type PromoCodeDTO = {
	id: string;
	promotionId: string;
	code: string;
	distribution: PromoCode['distribution'];
	isDiscoverable: boolean;
	redemptionChannel: PromoCode['redemptionChannel'];
	partnerReference: string | null;
	usageLimit: number | null;
	usedCount: number;
	remainingUses: number | null;
	/** Raw child-code lifecycle flag. */
	codeIsActive: boolean;
	/** Effective availability after the parent promotion lifecycle is applied. */
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	// Compatibility projection of the parent promotion. New callers should use promotion.
	description: string | null;
	discountType: Promotion['discountType'];
	discountValue: number;
	minOrderAmount: number | null;
	maxDiscountAmount: number | null;
	perUserLimit: number;
	startsAt: Date | null;
	expiresAt: Date | null;
	status: PromotionStatus;
};

export type PromotionDTO = {
	id: string;
	name: string;
	publicTitle: string | null;
	internalDescription: string | null;
	publicDescription: string | null;
	discountType: Promotion['discountType'];
	discountValue: number;
	minOrderAmount: number | null;
	maxDiscountAmount: number | null;
	usageLimit: number | null;
	usedCount: number;
	remainingUses: number | null;
	perUserLimit: number;
	applicationMode: Promotion['applicationMode'];
	eligibilityScope: Promotion['eligibilityScope'];
	visibility: Promotion['visibility'];
	priority: number;
	isActive: boolean;
	startsAt: Date | null;
	expiresAt: Date | null;
	status: PromotionStatus;
	codes: PromoCodeDTO[];
	createdAt: Date;
	updatedAt: Date;
};

export type PromoCodeSummaryDTO = { id: string; promotionId: string; code: string };
export type PromotionUsageDTO = {
	id: string;
	promotionId: string;
	promoCodeId: string | null;
	promoCode: PromoCodeSummaryDTO | null;
	userId: string | null;
	orderId: string;
	discountAmount: number;
	usedAt: Date;
};
/** @deprecated Use PromotionUsageDTO. */
export type PromoCodeUsageDTO = PromotionUsageDTO;

export type CreatePromotionCodeInput = {
	code: string;
	distribution?: PromoCode['distribution'];
	isDiscoverable?: boolean;
	redemptionChannel?: PromoCode['redemptionChannel'];
	partnerReference?: string | null;
	usageLimit?: number | null;
};
export type CreatePromotionInput = Omit<InsertPromotion, 'isActive' | 'usedCount'> & {
	code?: CreatePromotionCodeInput | null;
};
export type UpdatePromotionInput = Omit<UpdatePromotion, 'isActive'>;
export type SetPromotionActiveInput = { promotionId: string; isActive: boolean };

// Compatibility API: creating a code creates an inactive code-mode promotion.
export type CreatePromoCodeInput = {
	code: string;
	description?: string | null;
	discountType: Promotion['discountType'];
	discountValue: number;
	minOrderAmount?: number | null;
	maxDiscountAmount?: number | null;
	usageLimit?: number | null;
	perUserLimit?: number;
	startsAt?: number | null;
	expiresAt?: number | null;
};
export type UpdatePromoCodeInput = Partial<CreatePromoCodeInput>;
export type SetPromoCodeActiveInput = { lookup: PromoCodeLookup; isActive: boolean };

export type ValidatePromoCodeForBagInput = {
	code: string;
	userId?: string | null;
	subtotal: number;
	now?: Date;
};
export type ResolvePromotionForBagInput = {
	code?: string | null;
	userId?: string | null;
	subtotal: number;
	now?: Date;
};
export type PromoValidationResult = {
	promotionId: string;
	promoCodeId: string | null;
	code: string | null;
	promotionName: string;
	applicationMode: Promotion['applicationMode'];
	discountAmount: number;
	subtotal: number;
	totalAfterDiscount: number;
	snapshot: PromotionSnapshot;
};
export type StoredPromotionBagPresentation = {
	promotionId: string;
	promotionName: string;
	applicationMode: Promotion['applicationMode'];
	promoCodeId: string | null;
	code: string | null;
	minOrderAmount: number | null;
};

export type RecordPromoUsageInput = {
	promotionId?: string;
	promoCodeId?: string | null;
	orderId: string;
	userId?: string | null;
	discountAmount: number;
	now?: Date;
};
export type ListPromotionsOptions = {
	includeInactive?: boolean;
	isActive?: boolean;
	applicationMode?: Promotion['applicationMode'];
	visibility?: Promotion['visibility'];
	query?: string | null;
	limit?: number;
	offset?: number;
};
export type PromotionListResult = {
	items: PromotionDTO[];
	total: number;
	limit: number;
	offset: number;
};
export type ListPromoCodesOptions = Omit<ListPromotionsOptions, 'applicationMode' | 'visibility'>;
export type PromoCodeListResult = {
	items: PromoCodeDTO[];
	total: number;
	limit: number;
	offset: number;
};
export type ListPromoCodeUsagesOptions = {
	promotionId?: string;
	promoCodeId?: string;
	userId?: string | null;
	orderId?: string;
	limit?: number;
	offset?: number;
};
export type PromoCodeUsageListResult = {
	items: PromotionUsageDTO[];
	total: number;
	limit: number;
	offset: number;
};
export type GrantPromotionToCustomerInput = {
	promotionId: string;
	userId: string;
	startsAt?: number | null;
	expiresAt?: number | null;
};
export type PromotionCustomerGrantDTO = {
	id: string;
	promotionId: string;
	userId: string;
	startsAt: Date | null;
	expiresAt: Date | null;
	createdAt: Date;
};

export type ReconcilePromoCodeUsageCountInput = { lookup: PromoCodeLookup; now?: Date };
export type ReconcilePromoCodeUsageCountsInput = { limit?: number; offset?: number };
export type PromoUsageReconciliationItem = {
	promoCodeId: string;
	code: string;
	previousUsedCount: number;
	actualUsedCount: number;
	changed: boolean;
	promoCode: PromoCodeDTO;
};
export type PromoUsageReconciliationFailure = { promoCodeId: string; code: string; error: string };
export type PromoUsageReconciliationResult = {
	items: PromoUsageReconciliationItem[];
	failedItems: PromoUsageReconciliationFailure[];
	checkedCount: number;
	changedCount: number;
	unchangedCount: number;
	failedCount: number;
	limit: number;
	offset: number;
	hasMore: boolean;
};
