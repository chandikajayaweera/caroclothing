import type { InsertReview, Review, ReviewMedia, UpdateReview } from './reviews.drizzle';

export const MAX_REVIEW_MEDIA_FILES = 5;

export type ReviewMediaType = ReviewMedia['type'];

export type ReviewMediaDTO = {
	id: string;
	reviewId: string;
	r2Key: string;
	mediaUrl: string;
	type: ReviewMediaType;
	position: number;
	createdAt: Date;
};

export type ReviewProductSummaryDTO = {
	id: string;
	name: string;
	slug: string;
	isActive: boolean;
	primaryImageUrl: string | null;
};

export type PublicReviewDTO = {
	id: string;
	productId: string;
	rating: number;
	title: string | null;
	body: string | null;
	isVerifiedPurchase: boolean;
	reviewerName: string;
	reviewerImageUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
	media: ReviewMediaDTO[];
};

export type ReviewDTO = PublicReviewDTO & {
	userId: string;
	orderId: string | null;
	isApproved: boolean;
	adminNote: string | null;
	product: ReviewProductSummaryDTO | null;
};

export type ReviewListResult = {
	items: ReviewDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type PublicReviewListResult = {
	items: PublicReviewDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ReviewSummaryDTO = {
	productId: string;
	averageRating: number | null;
	reviewCount: number;
	verifiedCount: number;
	distribution: {
		1: number;
		2: number;
		3: number;
		4: number;
		5: number;
	};
};

export type ReviewModerationSummaryDTO = {
	totalCount: number;
	approvedCount: number;
	pendingCount: number;
	verifiedCount: number;
	averageRating: number | null;
};

export type ReviewEligibleOrderDTO = {
	orderId: string;
	orderNumber: string;
	status: string;
	createdAt: Date;
};

export type ReviewEligibilityDTO = {
	productId: string;
	canReview: boolean;
	hasReviewed: boolean;
	hasPurchased: boolean;
	existingReviewId: string | null;
	eligibleOrders: ReviewEligibleOrderDTO[];
	reason: 'already_reviewed' | 'product_unavailable' | 'order_not_eligible' | null;
};

export type ListProductReviewsInput = {
	productId: string;
	includeUnapproved?: boolean;
	limit?: number;
	offset?: number;
};

export type GetProductReviewSummaryInput = {
	productId: string;
	includeUnapproved?: boolean;
};

export type ListRecentApprovedReviewsInput = {
	productId?: string;
	limit?: number;
	offset?: number;
};

export type CreateReviewInput = Pick<
	InsertReview,
	'productId' | 'orderId' | 'rating' | 'title' | 'body'
> & {
	files?: File[] | null;
};

export type GetReviewInput = {
	reviewId: string;
};

export type ListMyReviewsInput = {
	productId?: string;
	limit?: number;
	offset?: number;
};

export type GetReviewEligibilityInput = {
	productId: string;
	orderId?: string | null;
};

export type UpdateMyReviewInput = Pick<UpdateReview, 'title' | 'body'> & {
	reviewId: string;
	rating?: Review['rating'];
	now?: Date;
};

export type AddReviewMediaInput = {
	reviewId: string;
	files: File[];
};

export type DeleteReviewMediaInput = {
	mediaId: string;
};

export type ReorderReviewMediaInput = {
	reviewId: string;
	mediaIdsInOrder: string[];
};

export type ListReviewsInput = {
	productId?: string;
	userId?: string;
	orderId?: string | null;
	isApproved?: boolean;
	isVerifiedPurchase?: boolean;
	rating?: number;
	query?: string | null;
	limit?: number;
	offset?: number;
};

export type ListPendingReviewsInput = {
	limit?: number;
	offset?: number;
};

export type GetReviewModerationSummaryInput = {
	productId?: string;
};

export type ModerateReviewInput = {
	reviewId: string;
	isApproved: boolean;
	adminNote?: string | null;
	now?: Date;
};

export type DeleteReviewInput = {
	reviewId: string;
};
