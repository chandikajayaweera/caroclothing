import type { InsertPromoCode, PromoCode, UpdatePromoCode } from './promotions.drizzle';

export type PromoCodeLookup = { id: string } | { code: string };

export type PromoCodeStatus = 'inactive' | 'scheduled' | 'active' | 'expired' | 'exhausted';

export type PromoCodeSnapshot = {
	code: string;
	discountType: PromoCode['discountType'];
	discountValue: number;
};

export type PromoCodeDTO = {
	id: string;
	code: string;
	description: string | null;
	discountType: PromoCode['discountType'];
	discountValue: number;
	minOrderAmount: number | null;
	maxDiscountAmount: number | null;
	usageLimit: number | null;
	usedCount: number;
	remainingUses: number | null;
	perUserLimit: number;
	isActive: boolean;
	startsAt: Date | null;
	expiresAt: Date | null;
	status: PromoCodeStatus;
	createdAt: Date;
	updatedAt: Date;
};

export type PromoCodeSummaryDTO = {
	id: string;
	code: string;
};

export type PromoCodeUsageDTO = {
	id: string;
	promoCodeId: string;
	promoCode: PromoCodeSummaryDTO | null;
	userId: string | null;
	orderId: string;
	discountAmount: number;
	usedAt: Date;
};

export type CreatePromoCodeInput = Omit<InsertPromoCode, 'isActive' | 'usedCount'>;

export type UpdatePromoCodeInput = Omit<UpdatePromoCode, 'isActive' | 'usedCount'>;

export type SetPromoCodeActiveInput = {
	lookup: PromoCodeLookup;
	isActive: boolean;
};

export type ValidatePromoCodeForCartInput = {
	code: string;
	userId?: string | null;
	subtotal: number;
	now?: Date;
};

export type PromoValidationResult = {
	promoCodeId: string;
	code: string;
	discountAmount: number;
	subtotal: number;
	totalAfterDiscount: number;
	snapshot: PromoCodeSnapshot;
};

export type RecordPromoUsageInput = {
	promoCodeId: string;
	orderId: string;
	userId?: string | null;
	discountAmount: number;
	now?: Date;
};

export type ListPromoCodesOptions = {
	includeInactive?: boolean;
	isActive?: boolean;
	query?: string | null;
	limit?: number;
	offset?: number;
};

export type PromoCodeListResult = {
	items: PromoCodeDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ListPromoCodeUsagesOptions = {
	promoCodeId?: string;
	userId?: string | null;
	orderId?: string;
	limit?: number;
	offset?: number;
};

export type PromoCodeUsageListResult = {
	items: PromoCodeUsageDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ReconcilePromoCodeUsageCountInput = {
	lookup: PromoCodeLookup;
	now?: Date;
};

export type ReconcilePromoCodeUsageCountsInput = {
	limit?: number;
	offset?: number;
};

export type PromoUsageReconciliationItem = {
	promoCodeId: string;
	code: string;
	previousUsedCount: number;
	actualUsedCount: number;
	changed: boolean;
	promoCode: PromoCodeDTO;
};

export type PromoUsageReconciliationResult = {
	items: PromoUsageReconciliationItem[];
	checkedCount: number;
	changedCount: number;
	unchangedCount: number;
	limit: number;
	offset: number;
	hasMore: boolean;
};
