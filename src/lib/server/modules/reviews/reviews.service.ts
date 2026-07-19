import { and, asc, count, desc, eq, inArray, isNull, like, or, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import {
	ErrorCode,
	getErrorMessage,
	isAppError,
	MediaError,
	ProductError,
	ReviewError
} from '$lib/server/infrastructure/errors';
import {
	buildMediaKey,
	deleteObjectSafe,
	getMediaBucket,
	getMediaBucketOptional,
	uploadImage,
	type StoredImageMetadata
} from '$lib/server/infrastructure/media/r2';
import { mediaPresetUrl } from '$lib/server/infrastructure/media';
import type { ServiceActor, ServiceContext, SystemActor } from '$lib/server/foundation/context';
import {
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow,
	uniqueStrings
} from '$lib/server/foundation/utils';
import { user } from '../auth/auth.drizzle';
import { order as orderTable, orderItem } from '../orders/orders.drizzle';
import {
	product,
	productImage,
	type Product,
	type ProductImage
} from '../products/products.drizzle';
import {
	insertReviewMediaSchema,
	insertReviewSchema,
	review,
	reviewMedia,
	type InsertReviewMedia,
	type NewReview,
	type NewReviewMedia,
	type Review,
	type ReviewMedia
} from './reviews.drizzle';
import {
	MAX_REVIEW_MEDIA_FILES,
	type AddReviewMediaInput,
	type CreateReviewInput,
	type DeleteReviewInput,
	type DeleteReviewMediaInput,
	type GetProductReviewSummaryInput,
	type GetReviewEligibilityInput,
	type GetReviewInput,
	type GetReviewModerationSummaryInput,
	type ListMyReviewsInput,
	type ListPendingReviewsInput,
	type ListProductReviewsInput,
	type ListRecentApprovedReviewsInput,
	type ListReviewsInput,
	type ModerateReviewInput,
	type PublicReviewDTO,
	type PublicReviewListResult,
	type ReorderReviewMediaInput,
	type ReviewDTO,
	type ReviewEligibleOrderDTO,
	type ReviewEligibilityDTO,
	type ReviewListResult,
	type ReviewMediaDTO,
	type ReviewModerationSummaryDTO,
	type ReviewProductSummaryDTO,
	type ReviewSummaryDTO,
	type UpdateMyReviewInput
} from './reviews.types';

type Db = ReturnType<typeof getDb>;
export type ReviewsTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | ReviewsTx;
type User = typeof user.$inferSelect;
type AnyActor = ServiceActor | SystemActor;

type UploadedReviewMedia = StoredImageMetadata & {
	bucket: R2Bucket;
	type: ReviewMedia['type'];
	position: number;
};

type ReviewRelations = {
	user: User | null;
	product: Product | null;
	media: ReviewMedia[];
	productImages: ProductImage[];
};

const DEFAULT_LIMIT = 20;
const ADMIN_DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const REVIEWER_FALLBACK_NAME = 'Caro customer';

export async function listProductReviews(
	ctx: ServiceContext | null,
	input: ListProductReviewsInput
): Promise<PublicReviewListResult> {
	const includeUnapproved = input.includeUnapproved ?? false;
	if (includeUnapproved) requireAdmin(ctx?.actor);

	const productId = normalizeId(input.productId, 'productId');
	await assertProductExistsTx(getDb(), productId, { activeOnly: !includeUnapproved });

	const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(input.offset);
	const conditions: SQL[] = [eq(review.productId, productId)];
	if (!includeUnapproved) conditions.push(eq(review.isApproved, true));

	const result = await listPublicReviewsByWhere(and(...conditions) as SQL, limit, offset);

	return result;
}

export async function getProductReviewSummary(
	ctx: ServiceContext | null,
	input: GetProductReviewSummaryInput
): Promise<ReviewSummaryDTO> {
	const includeUnapproved = input.includeUnapproved ?? false;
	if (includeUnapproved) requireAdmin(ctx?.actor);

	const productId = normalizeId(input.productId, 'productId');
	await assertProductExistsTx(getDb(), productId, { activeOnly: !includeUnapproved });

	const conditions: SQL[] = [eq(review.productId, productId)];
	if (!includeUnapproved) conditions.push(eq(review.isApproved, true));

	return buildReviewSummary(productId, and(...conditions) as SQL);
}

export async function listRecentApprovedReviews(
	input: ListRecentApprovedReviewsInput = {}
): Promise<PublicReviewListResult> {
	const productId = input.productId ? normalizeId(input.productId, 'productId') : null;
	const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(input.offset);
	const conditions: SQL[] = [eq(review.isApproved, true), eq(product.isActive, true)];

	if (productId) conditions.push(eq(review.productId, productId));

	const where = and(...conditions) as SQL;
	const db = getDb();
	const listQuery = db
		.select({ row: review })
		.from(review)
		.innerJoin(product, eq(review.productId, product.id))
		.where(where)
		.orderBy(desc(review.createdAt))
		.limit(limit)
		.offset(offset);
	const countQuery = db
		.select({ total: count() })
		.from(review)
		.innerJoin(product, eq(review.productId, product.id))
		.where(where);
	const [rows, totalRows] = await Promise.all([listQuery, countQuery]);
	const dtos = await hydrateReviews(
		db,
		rows.map((row) => row.row)
	);

	return {
		items: dtos.map(toPublicReviewDTO),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function createReview(
	ctx: ServiceContext,
	input: CreateReviewInput
): Promise<ReviewDTO> {
	const actor = requireActor(ctx.actor);
	const reviewId = nanoid();
	const files = normalizeMediaFiles(input.files);
	const now = resolveNow(ctx);
	const data = parseCreateReviewInput(reviewId, actor.id, input, now);
	const db = getDb();

	await assertProductExistsTx(db, data.productId, { activeOnly: true });

	const eligibleOrders = await listEligibleReviewOrdersTx(db, actor.id, data.productId);
	if (eligibleOrders.length === 0) {
		throw new ReviewError('Verified purchase required to review.', ErrorCode.VALIDATION_ERROR);
	}
	data.orderId = data.orderId || eligibleOrders[0].orderId;
	data.isVerifiedPurchase = true;

	await assertVerifiedPurchaseEligibleTx(db, {
		userId: actor.id,
		productId: data.productId,
		orderId: data.orderId
	});
	await assertNoExistingReviewTx(db, actor.id, data.productId);

	const uploadedMedia =
		files.length > 0 ? await uploadReviewMediaFiles(ctx, reviewId, files, 0) : [];

	let createdId: string;
	try {
		createdId = await db.transaction(async (tx) => {
			await assertProductExistsTx(tx, data.productId, { activeOnly: true });

			const txEligibleOrders = await listEligibleReviewOrdersTx(tx, actor.id, data.productId);
			if (txEligibleOrders.length === 0) {
				throw new ReviewError('Verified purchase required to review.', ErrorCode.VALIDATION_ERROR);
			}
			data.orderId = data.orderId || txEligibleOrders[0].orderId;
			data.isVerifiedPurchase = true;

			await assertVerifiedPurchaseEligibleTx(tx, {
				userId: actor.id,
				productId: data.productId,
				orderId: data.orderId
			});
			await assertNoExistingReviewTx(tx, actor.id, data.productId);

			const [created] = await tx.insert(review).values(data).returning();
			if (!created) {
				throw new ReviewError('Review was not created.', ErrorCode.INTERNAL_ERROR);
			}

			if (uploadedMedia.length > 0) {
				await tx.insert(reviewMedia).values(
					uploadedMedia.map((item) =>
						parseNewReviewMedia({
							reviewId,
							r2Key: item.key,
							type: item.type,
							mimeType: item.mimeType,
							byteSize: item.byteSize,
							originalFilename: item.originalFilename,
							width: null,
							height: null,
							position: item.position
						})
					)
				);
			}

			return created.id;
		});
	} catch (error) {
		await cleanupUploadedMedia(uploadedMedia);
		throw mapReviewPersistenceError(error);
	}

	return hydrateReviewById(getDb(), createdId);
}

export async function getReview(
	ctx: ServiceContext | null,
	input: GetReviewInput
): Promise<ReviewDTO | PublicReviewDTO> {
	const row = await loadReviewByIdTx(getDb(), input.reviewId);

	if (!row.isApproved) {
		requireOwnerOrAdmin(ctx?.actor, row.userId);
	}

	const dto = await hydrateReviewById(getDb(), row.id);
	return canReadPrivateReview(ctx?.actor, row) ? dto : toPublicReviewDTO(dto);
}

export async function listMyReviews(
	ctx: ServiceContext,
	input: ListMyReviewsInput = {}
): Promise<ReviewListResult> {
	const actor = requireActor(ctx.actor);
	const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(input.offset);
	const conditions: SQL[] = [eq(review.userId, actor.id)];

	if (input.productId)
		conditions.push(eq(review.productId, normalizeId(input.productId, 'productId')));

	return listReviewsByWhere(and(...conditions) as SQL, limit, offset);
}

export async function getReviewEligibility(
	ctx: ServiceContext,
	input: GetReviewEligibilityInput
): Promise<ReviewEligibilityDTO> {
	const actor = requireActor(ctx.actor);
	const productId = normalizeId(input.productId, 'productId');
	const productRow = await findProductByIdTx(getDb(), productId);

	if (!productRow) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
	}

	const existingReview = await findReviewByUserAndProductTx(getDb(), actor.id, productId);
	const eligibleOrders = await listEligibleReviewOrdersTx(getDb(), actor.id, productId);
	const hasPurchased = eligibleOrders.length > 0;
	const requestedOrderId = input.orderId ? normalizeId(input.orderId, 'orderId') : null;
	const orderIsEligible = requestedOrderId
		? eligibleOrders.some((orderRow) => orderRow.orderId === requestedOrderId)
		: true;
	const reason = existingReview
		? 'already_reviewed'
		: !productRow.isActive
			? 'product_unavailable'
			: !hasPurchased
				? 'order_not_eligible'
				: !orderIsEligible
					? 'order_not_eligible'
					: null;

	return {
		productId,
		canReview: reason === null,
		hasReviewed: existingReview !== null,
		hasPurchased,
		existingReviewId: existingReview?.id ?? null,
		eligibleOrders,
		reason
	};
}

export async function updateMyReview(
	ctx: ServiceContext,
	input: UpdateMyReviewInput
): Promise<ReviewDTO> {
	const actor = requireActor(ctx.actor);
	const reviewId = normalizeId(input.reviewId, 'reviewId');
	const values = parseCustomerReviewUpdate(input);

	try {
		return await getDb().transaction(async (tx) => {
			const existing = await loadReviewByIdTx(tx, reviewId);
			requireOwnerOrAdmin(actor, existing.userId);

			if (Object.keys(values).length === 0) {
				return hydrateReviewById(tx, existing.id);
			}

			const shouldResetApproval = !isAdminActor(actor);
			const updateValues = removeUndefinedValues({
				...values,
				isApproved: shouldResetApproval ? false : undefined,
				adminNote: shouldResetApproval ? null : undefined,
				updatedAt: resolveNow(ctx, input.now)
			});

			const [updated] = await tx
				.update(review)
				.set(updateValues)
				.where(eq(review.id, existing.id))
				.returning();
			if (!updated) {
				throw new ReviewError('Review not found.', ErrorCode.REVIEW_NOT_FOUND, { reviewId });
			}

			return hydrateReviewById(tx, updated.id);
		});
	} catch (error) {
		throw mapReviewPersistenceError(error);
	}
}

export async function addReviewMedia(
	ctx: ServiceContext,
	input: AddReviewMediaInput
): Promise<ReviewDTO> {
	const actor = requireActor(ctx.actor);
	const reviewId = normalizeId(input.reviewId, 'reviewId');
	const files = normalizeMediaFiles(input.files, { requireFiles: true });
	const existing = await loadReviewByIdTx(getDb(), reviewId);
	requireOwnerOrAdmin(actor, existing.userId);

	const existingMedia = await loadReviewMediaTx(getDb(), existing.id);
	assertReviewMediaLimit(existingMedia.length + files.length);

	const uploadedMedia = await uploadReviewMediaFiles(ctx, existing.id, files, existingMedia.length);

	try {
		return await getDb().transaction(async (tx) => {
			const reviewRow = await loadReviewByIdTx(tx, existing.id);
			requireOwnerOrAdmin(actor, reviewRow.userId);

			const currentMedia = await loadReviewMediaTx(tx, reviewRow.id);
			assertReviewMediaLimit(currentMedia.length + uploadedMedia.length);

			await tx.insert(reviewMedia).values(
				uploadedMedia.map((item) =>
					parseNewReviewMedia({
						reviewId: reviewRow.id,
						r2Key: item.key,
						type: item.type,
						mimeType: item.mimeType,
						byteSize: item.byteSize,
						originalFilename: item.originalFilename,
						width: null,
						height: null,
						position: currentMedia.length + item.position - existingMedia.length
					})
				)
			);

			if (!isAdminActor(actor)) {
				await resetReviewApprovalTx(tx, reviewRow.id, resolveNow(ctx));
			}

			return hydrateReviewById(tx, reviewRow.id);
		});
	} catch (error) {
		await cleanupUploadedMedia(uploadedMedia);
		throw mapReviewPersistenceError(error);
	}
}

export async function deleteReviewMedia(
	ctx: ServiceContext,
	input: DeleteReviewMediaInput
): Promise<ReviewDTO> {
	const actor = requireActor(ctx.actor);
	const mediaId = normalizeId(input.mediaId, 'mediaId');
	const mediaRow = await loadReviewMediaByIdTx(getDb(), mediaId);
	const reviewRow = await loadReviewByIdTx(getDb(), mediaRow.reviewId);
	requireOwnerOrAdmin(actor, reviewRow.userId);

	const bucket = requireMediaBucket(ctx);

	try {
		const dto = await getDb().transaction(async (tx) => {
			const currentMedia = await loadReviewMediaByIdTx(tx, mediaId);
			const currentReview = await loadReviewByIdTx(tx, currentMedia.reviewId);
			requireOwnerOrAdmin(actor, currentReview.userId);

			const [deleted] = await tx
				.delete(reviewMedia)
				.where(eq(reviewMedia.id, currentMedia.id))
				.returning();
			if (!deleted) {
				throw new ReviewError('Review media not found.', ErrorCode.REVIEW_MEDIA_NOT_FOUND, {
					mediaId
				});
			}

			await compactReviewMediaPositionsTx(tx, currentReview.id);

			if (!isAdminActor(actor)) {
				await resetReviewApprovalTx(tx, currentReview.id, resolveNow(ctx));
			}

			return hydrateReviewById(tx, currentReview.id);
		});

		await deleteObjectSafe(bucket, mediaRow.r2Key);
		return dto;
	} catch (error) {
		throw mapReviewPersistenceError(error);
	}
}

export async function reorderReviewMedia(
	ctx: ServiceContext,
	input: ReorderReviewMediaInput
): Promise<ReviewDTO> {
	const actor = requireActor(ctx.actor);
	const reviewId = normalizeId(input.reviewId, 'reviewId');
	const mediaIdsInOrder = input.mediaIdsInOrder.map((id) => normalizeId(id, 'mediaId'));

	try {
		return await getDb().transaction(async (tx) => {
			const reviewRow = await loadReviewByIdTx(tx, reviewId);
			requireOwnerOrAdmin(actor, reviewRow.userId);

			const mediaRows = await loadReviewMediaTx(tx, reviewRow.id);
			assertExactReviewMediaOrder(reviewRow.id, mediaRows, mediaIdsInOrder);

			for (const [position, mediaId] of mediaIdsInOrder.entries()) {
				await tx.update(reviewMedia).set({ position }).where(eq(reviewMedia.id, mediaId));
			}

			if (!isAdminActor(actor)) {
				await resetReviewApprovalTx(tx, reviewRow.id, resolveNow(ctx));
			}

			return hydrateReviewById(tx, reviewRow.id);
		});
	} catch (error) {
		throw mapReviewPersistenceError(error);
	}
}

export async function listReviews(
	ctx: ServiceContext,
	input: ListReviewsInput = {}
): Promise<ReviewListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(input.limit, ADMIN_DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(input.offset);
	const where = buildAdminReviewWhere(input);

	return listReviewsByWhere(where, limit, offset);
}

export async function listPendingReviews(
	ctx: ServiceContext,
	input: ListPendingReviewsInput = {}
): Promise<ReviewListResult> {
	requireAdmin(ctx.actor);

	return listReviewsByWhere(
		eq(review.isApproved, false),
		normalizeLimit(input.limit, ADMIN_DEFAULT_LIMIT, MAX_LIMIT),
		normalizeOffset(input.offset)
	);
}

export async function getReviewModerationSummary(
	ctx: ServiceContext,
	input: GetReviewModerationSummaryInput = {}
): Promise<ReviewModerationSummaryDTO> {
	requireAdmin(ctx.actor);

	const conditions: SQL[] = [];
	if (input.productId)
		conditions.push(eq(review.productId, normalizeId(input.productId, 'productId')));
	const where = conditions.length > 0 ? (and(...conditions) as SQL) : undefined;
	const query = getDb().select().from(review);
	const rows = where ? await query.where(where) : await query;
	const totalCount = rows.length;
	const approvedCount = rows.filter((row) => row.isApproved).length;
	const verifiedCount = rows.filter((row) => row.isVerifiedPurchase).length;
	const ratingTotal = rows.reduce((total, row) => total + row.rating, 0);

	return {
		totalCount,
		approvedCount,
		pendingCount: totalCount - approvedCount,
		verifiedCount,
		averageRating: totalCount > 0 ? roundRating(ratingTotal / totalCount) : null
	};
}

export async function moderateReview(
	ctx: ServiceContext,
	input: ModerateReviewInput
): Promise<ReviewDTO> {
	requireAdmin(ctx.actor);

	const reviewId = normalizeId(input.reviewId, 'reviewId');
	const adminNote = normalizeNullableText(input.adminNote, 'adminNote', 500);

	try {
		return await getDb().transaction(async (tx) => {
			const existing = await loadReviewByIdTx(tx, reviewId);
			const [updated] = await tx
				.update(review)
				.set({
					isApproved: input.isApproved,
					adminNote,
					updatedAt: resolveNow(ctx, input.now)
				})
				.where(eq(review.id, existing.id))
				.returning();
			if (!updated) {
				throw new ReviewError('Review not found.', ErrorCode.REVIEW_NOT_FOUND, { reviewId });
			}

			return hydrateReviewById(tx, updated.id);
		});
	} catch (error) {
		throw mapReviewPersistenceError(error);
	}
}

export async function deleteReview(ctx: ServiceContext, input: DeleteReviewInput): Promise<void> {
	const actor = requireActor(ctx.actor);
	const reviewId = normalizeId(input.reviewId, 'reviewId');
	const existing = await loadReviewByIdTx(getDb(), reviewId);
	requireOwnerOrAdmin(actor, existing.userId);

	const existingMedia = await loadReviewMediaTx(getDb(), existing.id);
	const bucket = existingMedia.length > 0 ? requireMediaBucket(ctx) : null;

	try {
		await getDb().transaction(async (tx) => {
			const reviewRow = await loadReviewByIdTx(tx, existing.id);
			requireOwnerOrAdmin(actor, reviewRow.userId);

			const [deleted] = await tx.delete(review).where(eq(review.id, reviewRow.id)).returning({
				id: review.id
			});
			if (!deleted) {
				throw new ReviewError('Review not found.', ErrorCode.REVIEW_NOT_FOUND, { reviewId });
			}
		});
	} catch (error) {
		throw mapReviewPersistenceError(error);
	}

	if (bucket) {
		await Promise.all(existingMedia.map((media) => deleteObjectSafe(bucket, media.r2Key)));
	}
}

export async function listReviewMediaKeysForAccountDeletionTx(
	tx: ReviewsTx,
	userId: string
): Promise<string[]> {
	const rows = await tx
		.select({ r2Key: reviewMedia.r2Key })
		.from(reviewMedia)
		.innerJoin(review, eq(reviewMedia.reviewId, review.id))
		.where(eq(review.userId, normalizeId(userId, 'userId')));

	return uniqueStrings(rows.map((row) => row.r2Key));
}

export async function deleteReviewMediaObjectsForAccountDeletion(
	ctx: ServiceContext,
	keys: string[]
): Promise<void> {
	const uniqueKeys = uniqueStrings(keys);
	if (uniqueKeys.length === 0) return;

	if (!ctx.event) {
		console.error('[reviews] Cannot clean deleted account media without a request event.');
		return;
	}

	const bucket = getMediaBucketOptional(ctx.event);
	if (!bucket) {
		console.error('[reviews] Cannot clean deleted account media because R2 is not configured.');
		return;
	}

	await Promise.all(uniqueKeys.map((key) => deleteObjectSafe(bucket, key)));
}

async function listPublicReviewsByWhere(
	where: SQL,
	limit: number,
	offset: number
): Promise<PublicReviewListResult> {
	const list = await listReviewsByWhere(where, limit, offset);
	return {
		...list,
		items: list.items.map(toPublicReviewDTO)
	};
}

async function listReviewsByWhere(
	where: SQL | undefined,
	limit: number,
	offset: number
): Promise<ReviewListResult> {
	const db = getDb();
	const listQuery = db
		.select()
		.from(review)
		.orderBy(desc(review.createdAt), desc(review.updatedAt))
		.limit(limit)
		.offset(offset);
	const countQuery = db.select({ total: count() }).from(review);
	const [rows, totalRows] = await Promise.all([
		where ? listQuery.where(where) : listQuery,
		where ? countQuery.where(where) : countQuery
	]);

	return {
		items: await hydrateReviews(db, rows),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

async function buildReviewSummary(productId: string, where: SQL): Promise<ReviewSummaryDTO> {
	const rows = await getDb()
		.select({
			rating: review.rating,
			isVerifiedPurchase: review.isVerifiedPurchase
		})
		.from(review)
		.where(where);
	const distribution = {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0
	};

	for (const row of rows) {
		distribution[row.rating as 1 | 2 | 3 | 4 | 5] += 1;
	}

	const reviewCount = rows.length;
	const ratingTotal = rows.reduce((total, row) => total + row.rating, 0);

	return {
		productId,
		averageRating: reviewCount > 0 ? roundRating(ratingTotal / reviewCount) : null,
		reviewCount,
		verifiedCount: rows.filter((row) => row.isVerifiedPurchase).length,
		distribution
	};
}

async function hydrateReviewById(db: QueryExecutor, reviewId: string): Promise<ReviewDTO> {
	const row = await loadReviewByIdTx(db, reviewId);
	const [dto] = await hydrateReviews(db, [row]);

	if (!dto) {
		throw new ReviewError('Review not found.', ErrorCode.REVIEW_NOT_FOUND, { reviewId });
	}

	return dto;
}

async function hydrateReviews(db: QueryExecutor, rows: Review[]): Promise<ReviewDTO[]> {
	if (rows.length === 0) return [];

	const reviewIds = rows.map((row) => row.id);
	const userIds = uniqueStrings(rows.map((row) => row.userId));
	const productIds = uniqueStrings(rows.map((row) => row.productId));
	const [userRows, productRows, mediaRows, imageRows] = await Promise.all([
		userIds.length > 0 ? db.select().from(user).where(inArray(user.id, userIds)) : [],
		productIds.length > 0 ? db.select().from(product).where(inArray(product.id, productIds)) : [],
		db
			.select()
			.from(reviewMedia)
			.where(inArray(reviewMedia.reviewId, reviewIds))
			.orderBy(asc(reviewMedia.position), asc(reviewMedia.createdAt)),
		productIds.length > 0
			? db
					.select()
					.from(productImage)
					.where(inArray(productImage.productId, productIds))
					.orderBy(asc(productImage.position), asc(productImage.createdAt))
			: []
	]);
	const usersById = new Map(userRows.map((row) => [row.id, row]));
	const productsById = new Map(productRows.map((row) => [row.id, row]));
	const mediaByReviewId = groupByReviewId(mediaRows);
	const imagesByProductId = groupByProductId(imageRows);

	return rows.map((row) =>
		toReviewDTO(row, {
			user: usersById.get(row.userId) ?? null,
			product: productsById.get(row.productId) ?? null,
			media: mediaByReviewId.get(row.id) ?? [],
			productImages: imagesByProductId.get(row.productId) ?? []
		})
	);
}

function toReviewDTO(row: Review, relations: ReviewRelations): ReviewDTO {
	return {
		id: row.id,
		productId: row.productId,
		userId: row.userId,
		orderId: row.orderId,
		rating: row.rating,
		title: row.title,
		body: row.body,
		isVerifiedPurchase: row.isVerifiedPurchase,
		isApproved: row.isApproved,
		adminNote: row.adminNote,
		reviewerName: relations.user?.name ?? REVIEWER_FALLBACK_NAME,
		reviewerImageUrl: relations.user?.image ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		media: relations.media.map(toReviewMediaDTO),
		product: relations.product
			? toReviewProductSummaryDTO(relations.product, relations.productImages)
			: null
	};
}

function toPublicReviewDTO(dto: ReviewDTO): PublicReviewDTO {
	return {
		id: dto.id,
		productId: dto.productId,
		rating: dto.rating,
		title: dto.title,
		body: dto.body,
		isVerifiedPurchase: dto.isVerifiedPurchase,
		reviewerName: dto.reviewerName,
		reviewerImageUrl: dto.reviewerImageUrl,
		createdAt: dto.createdAt,
		updatedAt: dto.updatedAt,
		media: dto.media
	};
}

function toReviewMediaDTO(row: ReviewMedia): ReviewMediaDTO {
	return {
		id: row.id,
		reviewId: row.reviewId,
		r2Key: row.r2Key,
		mediaUrl: mediaPresetUrl(row.r2Key, 'square400'),
		type: row.type,
		mimeType: row.mimeType,
		byteSize: row.byteSize,
		originalFilename: row.originalFilename,
		width: row.width,
		height: row.height,
		position: row.position,
		createdAt: row.createdAt
	};
}

function toReviewProductSummaryDTO(row: Product, images: ProductImage[]): ReviewProductSummaryDTO {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		isActive: row.isActive,
		primaryImageUrl: resolvePrimaryProductImageUrl(images)
	};
}

function resolvePrimaryProductImageUrl(images: ProductImage[]): string | null {
	const primary = images.find((image) => image.variantId === null && image.isPrimary);
	if (primary) return mediaPresetUrl(primary.r2Key, 'card600');

	const anyPrimary = images.find((image) => image.isPrimary);
	if (anyPrimary) return mediaPresetUrl(anyPrimary.r2Key, 'card600');

	const first = images[0];
	return first ? mediaPresetUrl(first.r2Key, 'card600') : null;
}

function parseCreateReviewInput(
	reviewId: string,
	userId: string,
	input: CreateReviewInput,
	now: Date
): NewReview {
	const result = insertReviewSchema.safeParse({
		productId: normalizeId(input.productId, 'productId'),
		userId,
		orderId:
			input.orderId === undefined || input.orderId === null
				? null
				: normalizeId(input.orderId, 'orderId'),
		rating: normalizeRating(input.rating),
		title: normalizeNullableText(input.title, 'title', 150, 1),
		body: normalizeNullableText(input.body, 'body', 2000, 10),
		isVerifiedPurchase: input.orderId !== undefined && input.orderId !== null
	});

	if (!result.success) {
		throw new ReviewError('Invalid review data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return removeUndefinedValues({
		id: reviewId,
		...result.data,
		isVerifiedPurchase: result.data.isVerifiedPurchase ?? false,
		createdAt: now,
		updatedAt: now
	}) as NewReview;
}

function parseCustomerReviewUpdate(input: UpdateMyReviewInput): Partial<NewReview> {
	const values: Partial<NewReview> = {};

	if (input.rating !== undefined) values.rating = normalizeRating(input.rating);
	if ('title' in input) values.title = normalizeNullableText(input.title, 'title', 150, 1);
	if ('body' in input) values.body = normalizeNullableText(input.body, 'body', 2000, 10);

	return values;
}

function parseNewReviewMedia(input: InsertReviewMedia): NewReviewMedia {
	const result = insertReviewMediaSchema.safeParse(input);

	if (!result.success) {
		throw new ReviewError('Invalid review media data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

async function loadReviewByIdTx(db: QueryExecutor, reviewId: string): Promise<Review> {
	const normalizedId = normalizeId(reviewId, 'reviewId');
	const [row] = await db.select().from(review).where(eq(review.id, normalizedId)).limit(1);

	if (!row) {
		throw new ReviewError('Review not found.', ErrorCode.REVIEW_NOT_FOUND, {
			reviewId: normalizedId
		});
	}

	return row;
}

async function loadReviewMediaTx(db: QueryExecutor, reviewId: string): Promise<ReviewMedia[]> {
	return db
		.select()
		.from(reviewMedia)
		.where(eq(reviewMedia.reviewId, normalizeId(reviewId, 'reviewId')))
		.orderBy(asc(reviewMedia.position), asc(reviewMedia.createdAt));
}

async function loadReviewMediaByIdTx(db: QueryExecutor, mediaId: string): Promise<ReviewMedia> {
	const normalizedId = normalizeId(mediaId, 'mediaId');
	const [row] = await db
		.select()
		.from(reviewMedia)
		.where(eq(reviewMedia.id, normalizedId))
		.limit(1);

	if (!row) {
		throw new ReviewError('Review media not found.', ErrorCode.REVIEW_MEDIA_NOT_FOUND, {
			mediaId: normalizedId
		});
	}

	return row;
}

async function findReviewByUserAndProductTx(
	db: QueryExecutor,
	userId: string,
	productId: string
): Promise<Review | null> {
	const [row] = await db
		.select()
		.from(review)
		.where(and(eq(review.userId, userId), eq(review.productId, productId)))
		.limit(1);

	return row ?? null;
}

async function assertNoExistingReviewTx(
	db: QueryExecutor,
	userId: string,
	productId: string
): Promise<void> {
	const existing = await findReviewByUserAndProductTx(db, userId, productId);
	if (existing) {
		throw new ReviewError(
			'You have already reviewed this product.',
			ErrorCode.REVIEW_ALREADY_EXISTS,
			{
				productId,
				reviewId: existing.id
			}
		);
	}
}

async function findProductByIdTx(db: QueryExecutor, productId: string): Promise<Product | null> {
	const normalizedId = normalizeId(productId, 'productId');
	const [row] = await db.select().from(product).where(eq(product.id, normalizedId)).limit(1);

	return row ?? null;
}

async function assertProductExistsTx(
	db: QueryExecutor,
	productId: string,
	options: { activeOnly: boolean }
): Promise<Product> {
	const row = await findProductByIdTx(db, productId);

	if (!row) {
		throw new ProductError('Product not found.', ErrorCode.PRODUCT_NOT_FOUND, { productId });
	}

	if (options.activeOnly && !row.isActive) {
		throw new ProductError('Product is unavailable.', ErrorCode.PRODUCT_UNAVAILABLE, {
			productId
		});
	}

	return row;
}

async function assertVerifiedPurchaseEligibleTx(
	db: QueryExecutor,
	input: { userId: string; productId: string; orderId: string }
): Promise<void> {
	const [row] = await db
		.select({ orderId: orderTable.id })
		.from(orderItem)
		.innerJoin(orderTable, eq(orderItem.orderId, orderTable.id))
		.where(
			and(
				eq(orderTable.id, normalizeId(input.orderId, 'orderId')),
				eq(orderTable.userId, input.userId),
				eq(orderTable.status, 'delivered'),
				eq(orderItem.productId, input.productId)
			)
		)
		.limit(1);

	if (!row) {
		throw new ReviewError(
			'This order is not eligible to verify a review for this product.',
			ErrorCode.REVIEW_NOT_ELIGIBLE,
			input
		);
	}
}

async function listEligibleReviewOrdersTx(
	db: QueryExecutor,
	userId: string,
	productId: string
): Promise<ReviewEligibleOrderDTO[]> {
	const rows = await db
		.select({
			orderId: orderTable.id,
			orderNumber: orderTable.orderNumber,
			status: orderTable.status,
			createdAt: orderTable.createdAt
		})
		.from(orderItem)
		.innerJoin(orderTable, eq(orderItem.orderId, orderTable.id))
		.where(
			and(
				eq(orderTable.userId, userId),
				eq(orderTable.status, 'delivered'),
				eq(orderItem.productId, productId)
			)
		)
		.orderBy(desc(orderTable.createdAt));
	const seen = new Set<string>();
	const result: ReviewEligibleOrderDTO[] = [];

	for (const row of rows) {
		if (seen.has(row.orderId)) continue;
		seen.add(row.orderId);
		result.push(row);
	}

	return result;
}

async function resetReviewApprovalTx(tx: ReviewsTx, reviewId: string, now: Date): Promise<void> {
	await tx
		.update(review)
		.set({ isApproved: false, adminNote: null, updatedAt: now })
		.where(eq(review.id, reviewId));
}

async function compactReviewMediaPositionsTx(tx: ReviewsTx, reviewId: string): Promise<void> {
	const rows = await loadReviewMediaTx(tx, reviewId);

	for (const [position, row] of rows.entries()) {
		if (row.position === position) continue;
		await tx.update(reviewMedia).set({ position }).where(eq(reviewMedia.id, row.id));
	}
}

function buildAdminReviewWhere(input: ListReviewsInput): SQL | undefined {
	const conditions: SQL[] = [];

	if (input.productId)
		conditions.push(eq(review.productId, normalizeId(input.productId, 'productId')));
	if (input.userId) conditions.push(eq(review.userId, normalizeId(input.userId, 'userId')));
	if (input.orderId !== undefined) {
		conditions.push(
			input.orderId === null
				? isNull(review.orderId)
				: eq(review.orderId, normalizeId(input.orderId, 'orderId'))
		);
	}
	if (input.isApproved !== undefined) conditions.push(eq(review.isApproved, input.isApproved));
	if (input.isVerifiedPurchase !== undefined)
		conditions.push(eq(review.isVerifiedPurchase, input.isVerifiedPurchase));
	if (input.rating !== undefined) conditions.push(eq(review.rating, normalizeRating(input.rating)));
	if (input.query) {
		const term = `%${sanitizeLikeTerm(input.query)}%`;
		conditions.push(or(like(review.title, term), like(review.body, term)) as SQL);
	}

	return conditions.length > 0 ? (and(...conditions) as SQL) : undefined;
}

async function uploadReviewMediaFiles(
	ctx: ServiceContext,
	reviewId: string,
	files: File[],
	startPosition: number
): Promise<UploadedReviewMedia[]> {
	const bucket = requireMediaBucket(ctx);
	const uploaded: UploadedReviewMedia[] = [];

	try {
		for (const [index, file] of files.entries()) {
			const position = startPosition + index;
			const key = buildMediaKey({
				scope: 'reviews',
				entityId: reviewId,
				variant: `media-${position}`,
				contentType: file.type
			});
			const result = await uploadImage(bucket, key, file);

			uploaded.push({
				bucket,
				key: result.key,
				type: 'image',
				mimeType: result.mimeType,
				byteSize: result.byteSize,
				originalFilename: result.originalFilename,
				position
			});
		}
	} catch (error) {
		await cleanupUploadedMedia(uploaded);
		throw mapMediaUploadError(error, 'Review media upload failed.');
	}

	return uploaded;
}

async function cleanupUploadedMedia(items: UploadedReviewMedia[]): Promise<void> {
	await Promise.all(items.map((item) => deleteObjectSafe(item.bucket, item.key)));
}

function requireMediaBucket(ctx: ServiceContext): R2Bucket {
	if (!ctx.event) {
		throw new MediaError(
			'Request event is required for review media changes.',
			ErrorCode.MEDIA_UPLOAD_FAILED
		);
	}

	try {
		return getMediaBucket(ctx.event);
	} catch (error) {
		if (isAppError(error)) throw error;

		throw new MediaError('R2 media bucket is not configured.', ErrorCode.MEDIA_UPLOAD_FAILED, {
			cause: getErrorMessage(error)
		});
	}
}

function mapMediaUploadError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	const cause = getErrorMessage(error);
	throw new MediaError(message, resolveMediaErrorCode(cause), { cause });
}

function resolveMediaErrorCode(message: string): ErrorCode {
	return message.includes('Unsupported') || message.includes('empty') || message.includes('large')
		? ErrorCode.INVALID_MEDIA_TYPE
		: ErrorCode.MEDIA_UPLOAD_FAILED;
}

function normalizeMediaFiles(
	files: File[] | null | undefined,
	options: { requireFiles?: boolean } = {}
): File[] {
	const normalized = (files ?? []).filter((file) => file.size > 0);

	if (options.requireFiles && normalized.length === 0) {
		throw new ReviewError('At least one media file is required.', ErrorCode.VALIDATION_ERROR);
	}

	assertReviewMediaLimit(normalized.length);
	return normalized;
}

function assertReviewMediaLimit(count: number): void {
	if (count > MAX_REVIEW_MEDIA_FILES) {
		throw new ReviewError('Too many review media files.', ErrorCode.VALIDATION_ERROR, {
			max: MAX_REVIEW_MEDIA_FILES,
			count
		});
	}
}

function assertExactReviewMediaOrder(
	reviewId: string,
	existingRows: ReviewMedia[],
	mediaIdsInOrder: string[]
): void {
	const uniqueIds = uniqueStrings(mediaIdsInOrder);
	const existingIds = existingRows.map((row) => row.id);
	const existingIdSet = new Set(existingIds);
	const providedIdSet = new Set(mediaIdsInOrder);
	const missingIds = existingIds.filter((id) => !providedIdSet.has(id));
	const unknownIds = mediaIdsInOrder.filter((id) => !existingIdSet.has(id));

	if (
		uniqueIds.length !== mediaIdsInOrder.length ||
		missingIds.length > 0 ||
		unknownIds.length > 0 ||
		existingIds.length !== mediaIdsInOrder.length
	) {
		throw new ReviewError(
			'Media order must include every review media item exactly once.',
			ErrorCode.VALIDATION_ERROR,
			{
				reviewId,
				missingIds,
				unknownIds
			}
		);
	}
}

function canReadPrivateReview(
	actor: AnyActor | null | undefined,
	row: Pick<Review, 'userId'>
): boolean {
	if (!actor) return false;
	if (isAdminActor(actor)) return true;
	return actor.id === row.userId && !('isAnonymous' in actor && actor.isAnonymous);
}

function isAdminActor(actor: AnyActor | null | undefined): boolean {
	return actor?.role === 'adminUser';
}

function normalizeRating(value: number): number {
	if (!Number.isInteger(value) || value < 1 || value > 5) {
		throw new ReviewError('Rating must be between 1 and 5.', ErrorCode.VALIDATION_ERROR, {
			rating: value
		});
	}

	return value;
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new ReviewError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function normalizeNullableText(
	value: string | null | undefined,
	field: string,
	maxLength: number,
	minLength = 0
): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;

	const normalized = value.trim();
	if (normalized.length === 0) return null;
	if (normalized.length < minLength || normalized.length > maxLength) {
		throw new ReviewError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			[field]: value,
			minLength,
			maxLength
		});
	}

	return normalized;
}

function roundRating(value: number): number {
	return Math.round(value * 10) / 10;
}

function sanitizeLikeTerm(value: string): string {
	return value.trim().replace(/[%_]/g, '');
}

function groupByReviewId<T extends { reviewId: string }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const row of rows) {
		const current = groups.get(row.reviewId) ?? [];
		current.push(row);
		groups.set(row.reviewId, current);
	}

	return groups;
}

function groupByProductId<T extends { productId: string }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();

	for (const row of rows) {
		const current = groups.get(row.productId) ?? [];
		current.push(row);
		groups.set(row.productId, current);
	}

	return groups;
}

function mapReviewPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);
	const normalized = message.toLowerCase();

	if (isUniqueConstraintError(normalized)) {
		throw new ReviewError('Review already exists.', ErrorCode.REVIEW_ALREADY_EXISTS);
	}

	if (isForeignKeyConstraintError(normalized)) {
		throw new ReviewError('Related review record not found.', ErrorCode.NOT_FOUND);
	}

	if (normalized.includes('check constraint failed')) {
		throw new ReviewError('Invalid review data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}
