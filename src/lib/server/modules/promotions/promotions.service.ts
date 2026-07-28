import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	inArray,
	isNull,
	like,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { guardPreviousBatchChanges, isD1BatchGuardError } from '$lib/server/db/batch';
import {
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation,
	withTransientD1WriteRetry
} from '$lib/server/db/retry';
import type { ServiceContext } from '$lib/server/foundation/context';
import { requireAdmin } from '$lib/server/foundation/guards';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues,
	resolveNow,
	uniqueStrings
} from '$lib/server/foundation/utils';
import {
	ErrorCode,
	PromotionError,
	getErrorMessage,
	isAppError,
	toErrorResponseBody
} from '$lib/server/infrastructure/errors';
import { order as orderTable } from '../orders/orders.drizzle';
import {
	insertPromoCodeSchema,
	insertPromotionCustomerGrantSchema,
	insertPromotionSchema,
	promoCode,
	promotion,
	promotionCustomerGrant,
	promotionUsage,
	updatePromoCodeSchema,
	updatePromotionSchema,
	type InsertPromotion,
	type NewPromotion,
	type PromoCode,
	type Promotion,
	type PromotionUsage
} from './promotions.drizzle';
import type {
	CreatePromoCodeInput,
	CreatePromotionInput,
	GrantPromotionToCustomerInput,
	ListPromoCodeUsagesOptions,
	ListPromoCodesOptions,
	ListPromotionsOptions,
	PromoCodeDTO,
	PromoCodeListResult,
	PromoCodeLookup,
	PromoCodeSummaryDTO,
	PromoCodeUsageDTO,
	PromoCodeUsageListResult,
	PromoUsageReconciliationFailure,
	PromoUsageReconciliationItem,
	PromoUsageReconciliationResult,
	PromoValidationResult,
	StoredPromotionBagPresentation,
	StoredPromotionBagState,
	PromotionDTO,
	PromotionCustomerGrantDTO,
	PromotionListResult,
	PromotionSnapshot,
	PromotionStatus,
	ReconcilePromoCodeUsageCountInput,
	ReconcilePromoCodeUsageCountsInput,
	RecordPromoUsageInput,
	ResolvePromotionForBagInput,
	SetPromoCodeActiveInput,
	SetPromotionActiveInput,
	UpdatePromoCodeInput,
	UpdatePromotionInput,
	ValidatePromoCodeForBagInput
} from './promotions.types';

type Db = ReturnType<typeof getDb>;
type QueryExecutor = Db;
export type PromotionsTx = Db;
export type PromotionsBatchItem = Parameters<Db['batch']>[0][number];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type PromotionWithCodes = { promotion: Promotion; codes: PromoCode[] };
type JoinedCode = { promotion: Promotion; code: PromoCode };

// ---------------------------------------------------------------------------
// Canonical promotion APIs
// ---------------------------------------------------------------------------

export async function createPromotion(
	ctx: ServiceContext,
	input: CreatePromotionInput
): Promise<PromotionDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const { code: codeInput, ...rawPromotion } = input;
	const parsed = insertPromotionSchema.safeParse({
		...rawPromotion,
		isActive: false,
		usedCount: 0
	});
	if (!parsed.success) validationError('Invalid promotion data.', parsed.error.issues);
	assertStartNotPast(parsed.data.startsAt, now);
	if (parsed.data.applicationMode === 'code' && !codeInput) {
		throw new PromotionError('Code promotions require a promo code.', ErrorCode.VALIDATION_ERROR);
	}
	if (parsed.data.applicationMode === 'automatic' && codeInput) {
		throw new PromotionError(
			'Automatic promotions cannot contain promo codes.',
			ErrorCode.VALIDATION_ERROR
		);
	}

	const id = nanoid();
	const promotionValues = toNewPromotionValues(id, parsed.data, now);
	const db = getDb();
	let codeId: string | null = null;
	const statements: [PromotionsBatchItem, ...PromotionsBatchItem[]] = [
		db.insert(promotion).values(promotionValues)
	];
	if (codeInput) {
		codeId = nanoid();
		const parsedCode = insertPromoCodeSchema.safeParse({
			...codeInput,
			code: normalizePromoCode(codeInput.code),
			promotionId: id,
			isActive: true,
			usedCount: 0
		});
		if (!parsedCode.success) validationError('Invalid promo code data.', parsedCode.error.issues);
		statements.push(
			db
				.insert(promoCode)
				.values({ id: codeId, ...parsedCode.data, createdAt: now, updatedAt: now })
		);
	}

	try {
		return await withTransientD1WriteReconciliation<PromotionDTO>(
			async () => {
				await db.batch(statements);
				const row = await loadPromotionWithCodesByIdTx(db, id);
				if (!row) {
					throw new PromotionError('Promotion was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return toPromotionDTO(row, now);
			},
			async () => {
				const row = await loadPromotionWithCodesByIdTx(db, id);
				if (!row || (codeId && !row.codes.some((code) => code.id === codeId))) {
					return { committed: false };
				}
				return { committed: true, value: toPromotionDTO(row, now) };
			}
		);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function getPromotion(
	ctx: ServiceContext,
	input: { promotionId: string }
): Promise<PromotionDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const row = await withTransientD1ReadRetry(() =>
		loadPromotionWithCodesByIdTx(getDb(), normalizeId(input.promotionId, 'promotionId'))
	);
	if (!row) throw new PromotionError('Promotion not found.', ErrorCode.PROMO_NOT_FOUND);
	return toPromotionDTO(row, now);
}

export async function getPublicPromotion(input: {
	promotionId: string;
	now?: Date;
}): Promise<PromotionDTO | null> {
	const now = input.now ?? new Date();
	const row = await withTransientD1ReadRetry(() =>
		loadPromotionWithCodesByIdTx(getDb(), normalizeId(input.promotionId, 'promotionId'))
	);
	if (
		!row ||
		row.promotion.visibility !== 'public' ||
		promotionStatus(row.promotion, now) !== 'active'
	)
		return null;
	return toPromotionDTO(row, now);
}

export async function listPromotions(
	ctx: ServiceContext,
	options: ListPromotionsOptions = {}
): Promise<PromotionListResult> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildPromotionListWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(promotion);
	const listQuery = db
		.select()
		.from(promotion)
		.orderBy(desc(promotion.updatedAt), asc(promotion.name))
		.limit(limit)
		.offset(offset);
	const totalRows = await withTransientD1ReadRetry(() =>
		where ? countQuery.where(where) : countQuery
	);
	const rows = await withTransientD1ReadRetry(() => (where ? listQuery.where(where) : listQuery));
	const codes = await withTransientD1ReadRetry(() =>
		loadCodesByPromotionIdsTx(
			db,
			rows.map((row) => row.id)
		)
	);
	return {
		items: rows.map((row) =>
			toPromotionDTO({ promotion: row, codes: codes.get(row.id) ?? [] }, now)
		),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function updatePromotion(
	ctx: ServiceContext,
	input: { promotionId: string; data: UpdatePromotionInput }
): Promise<PromotionDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const id = normalizeId(input.promotionId, 'promotionId');
	const existing = await loadPromotionByIdTx(getDb(), id);
	if (!existing) throw new PromotionError('Promotion not found.', ErrorCode.PROMO_NOT_FOUND);
	const parsed = updatePromotionSchema.safeParse(removeUndefinedValues(input.data));
	if (!parsed.success) validationError('Invalid promotion data.', parsed.error.issues);
	validateResolvedWindow(existing, parsed.data, now);
	if (parsed.data.applicationMode && parsed.data.applicationMode !== existing.applicationMode) {
		throw new PromotionError(
			'Promotion application mode cannot be changed after creation.',
			ErrorCode.CONFLICT
		);
	}
	const values = removeUndefinedValues({
		...parsed.data,
		startsAt: timestampMsToDate(parsed.data.startsAt),
		expiresAt: timestampMsToDate(parsed.data.expiresAt),
		updatedAt: now
	});
	if (Object.keys(values).length === 1) return getPromotion(ctx, { promotionId: id });
	try {
		const db = getDb();
		return await withTransientD1WriteReconciliation<PromotionDTO>(
			async () => {
				const [updated] = await db
					.update(promotion)
					.set(values)
					.where(and(eq(promotion.id, id), eq(promotion.updatedAt, existing.updatedAt)))
					.returning({ id: promotion.id });
				if (!updated) {
					throw new PromotionError(
						'Promotion changed while it was being saved. Refresh and try again.',
						ErrorCode.CONFLICT
					);
				}
				return getPromotion(ctx, { promotionId: id });
			},
			async () => {
				const current = await loadPromotionByIdTx(db, id);
				return current && recordMatchesPatch(current, values)
					? {
							committed: true,
							value: await getPromotion(ctx, { promotionId: id })
						}
					: { committed: false };
			}
		);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function setPromotionActive(
	ctx: ServiceContext,
	input: SetPromotionActiveInput
): Promise<PromotionDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const id = normalizeId(input.promotionId, 'promotionId');
	const existing = await loadPromotionByIdTx(getDb(), id);
	if (!existing) throw new PromotionError('Promotion not found.', ErrorCode.PROMO_NOT_FOUND);
	if (input.isActive && existing.applicationMode === 'code') {
		const [activeCode] = await getDb()
			.select({ id: promoCode.id })
			.from(promoCode)
			.where(and(eq(promoCode.promotionId, id), eq(promoCode.isActive, true)))
			.limit(1);
		if (!activeCode)
			throw new PromotionError(
				'Activate at least one promo code first.',
				ErrorCode.VALIDATION_ERROR
			);
	}
	const db = getDb();
	const values = { isActive: input.isActive, updatedAt: now };
	try {
		return await withTransientD1WriteReconciliation<PromotionDTO>(
			async () => {
				const activeCodeGuard =
					input.isActive && existing.applicationMode === 'code'
						? exists(
								db
									.select({ id: promoCode.id })
									.from(promoCode)
									.where(and(eq(promoCode.promotionId, id), eq(promoCode.isActive, true)))
							)
						: undefined;
				const [updated] = await db
					.update(promotion)
					.set(values)
					.where(
						and(eq(promotion.id, id), eq(promotion.updatedAt, existing.updatedAt), activeCodeGuard)
					)
					.returning({ id: promotion.id });
				if (!updated) {
					throw new PromotionError(
						'Promotion or active-code state changed. Refresh and try again.',
						ErrorCode.CONFLICT
					);
				}
				return getPromotion(ctx, { promotionId: id });
			},
			async () => {
				const current = await loadPromotionByIdTx(db, id);
				return current && recordMatchesPatch(current, values)
					? {
							committed: true,
							value: await getPromotion(ctx, { promotionId: id })
						}
					: { committed: false };
			}
		);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function addPromotionCode(
	ctx: ServiceContext,
	input: {
		promotionId: string;
		code: string;
		distribution?: PromoCode['distribution'];
		isDiscoverable?: boolean;
		redemptionChannel?: PromoCode['redemptionChannel'];
		partnerReference?: string | null;
		usageLimit?: number | null;
	}
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const promotionRow = await loadPromotionByIdTx(
		getDb(),
		normalizeId(input.promotionId, 'promotionId')
	);
	if (!promotionRow) throw new PromotionError('Promotion not found.', ErrorCode.PROMO_NOT_FOUND);
	if (promotionRow.applicationMode !== 'code')
		throw new PromotionError(
			'Codes can only belong to code promotions.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
	const parsed = insertPromoCodeSchema.safeParse({
		...input,
		code: normalizePromoCode(input.code),
		isActive: true,
		usedCount: 0
	});
	if (!parsed.success) validationError('Invalid promo code data.', parsed.error.issues);
	const id = nanoid();
	const values = { id, ...parsed.data, createdAt: now, updatedAt: now };
	try {
		const db = getDb();
		return await withTransientD1WriteReconciliation<PromoCodeDTO>(
			async () => {
				const [row] = await db.insert(promoCode).values(values).returning();
				if (!row) {
					throw new PromotionError('Promo code was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return toPromoCodeDTO(row, promotionRow, now);
			},
			async () => {
				const joined = await loadJoinedCodeByIdTx(db, id);
				return joined
					? {
							committed: true,
							value: toPromoCodeDTO(joined.code, joined.promotion, now)
						}
					: { committed: false };
			}
		);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function updatePromotionCode(
	ctx: ServiceContext,
	input: {
		promoCodeId: string;
		data: Partial<
			Pick<
				PromoCode,
				| 'code'
				| 'distribution'
				| 'isDiscoverable'
				| 'redemptionChannel'
				| 'partnerReference'
				| 'usageLimit'
				| 'isActive'
			>
		>;
	}
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const joined = await loadJoinedCodeByIdTx(getDb(), normalizeId(input.promoCodeId, 'promoCodeId'));
	if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
	const parsed = updatePromoCodeSchema.safeParse({
		...input.data,
		...(input.data.code ? { code: normalizePromoCode(input.data.code) } : {})
	});
	if (!parsed.success) validationError('Invalid promo code data.', parsed.error.issues);
	const values = { ...parsed.data, updatedAt: now };
	if (Object.keys(values).length === 1) {
		return toPromoCodeDTO(joined.code, joined.promotion, now);
	}
	try {
		const db = getDb();
		return await withTransientD1WriteReconciliation<PromoCodeDTO>(
			async () => {
				const statements: PromotionsBatchItem[] = [
					db
						.update(promoCode)
						.set(values)
						.where(
							and(eq(promoCode.id, joined.code.id), eq(promoCode.updatedAt, joined.code.updatedAt))
						),
					...guardPreviousBatchChanges(db)
				];
				if (parsed.data.isActive !== undefined) {
					const parentActiveValue = parsed.data.isActive
						? true
						: sql<boolean>`EXISTS (
								SELECT 1 FROM ${promoCode}
									WHERE ${promoCode.promotionId} = ${joined.promotion.id}
										AND ${promoCode.id} <> ${joined.code.id}
										AND ${promoCode.isActive} = 1
							)`;
					statements.push(
						db
							.update(promotion)
							.set({ isActive: parentActiveValue, updatedAt: now })
							.where(
								and(
									eq(promotion.id, joined.promotion.id),
									eq(promotion.updatedAt, joined.promotion.updatedAt)
								)
							),
						...guardPreviousBatchChanges(db)
					);
				}
				const [first, ...rest] = statements;
				if (!first) {
					throw new PromotionError(
						'Promo code update produced no statements.',
						ErrorCode.INTERNAL_ERROR
					);
				}
				await db.batch([first, ...rest]);
				const current = await loadJoinedCodeByIdTx(db, joined.code.id);
				if (!current) {
					throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
				}
				return toPromoCodeDTO(current.code, current.promotion, now);
			},
			async () => {
				const current = await loadJoinedCodeByIdTx(db, joined.code.id);
				if (!current || !recordMatchesPatch(current.code, values)) {
					return { committed: false };
				}
				if (parsed.data.isActive !== undefined) {
					const [activeCode] = await db
						.select({ id: promoCode.id })
						.from(promoCode)
						.where(
							and(eq(promoCode.promotionId, joined.promotion.id), eq(promoCode.isActive, true))
						)
						.limit(1);
					if (current.promotion.isActive !== Boolean(activeCode)) {
						return { committed: false };
					}
				}
				return {
					committed: true,
					value: toPromoCodeDTO(current.code, current.promotion, now)
				};
			}
		);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new PromotionError(
				'Promotion or promo code changed while it was being saved. Refresh and try again.',
				ErrorCode.CONFLICT
			);
		}
		throw mapPromotionPersistenceError(error);
	}
}

export async function grantPromotionToCustomer(
	ctx: ServiceContext,
	input: GrantPromotionToCustomerInput
): Promise<void> {
	requireAdmin(ctx.actor);
	const parsed = insertPromotionCustomerGrantSchema.safeParse(input);
	if (!parsed.success) validationError('Invalid customer grant.', parsed.error.issues);
	const db = getDb();
	const values = {
		id: nanoid(),
		...parsed.data,
		startsAt: timestampMsToDate(parsed.data.startsAt),
		expiresAt: timestampMsToDate(parsed.data.expiresAt)
	};
	try {
		await withTransientD1WriteReconciliation(
			() => db.insert(promotionCustomerGrant).values(values),
			async () => {
				const [row] = await db
					.select({ id: promotionCustomerGrant.id })
					.from(promotionCustomerGrant)
					.where(
						and(
							eq(promotionCustomerGrant.promotionId, values.promotionId),
							eq(promotionCustomerGrant.userId, values.userId)
						)
					)
					.limit(1);
				return row ? { committed: true, value: undefined } : { committed: false };
			}
		);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function revokePromotionCustomerGrant(
	ctx: ServiceContext,
	input: { promotionId: string; userId: string }
): Promise<void> {
	requireAdmin(ctx.actor);
	const predicate = and(
		eq(promotionCustomerGrant.promotionId, normalizeId(input.promotionId, 'promotionId')),
		eq(promotionCustomerGrant.userId, normalizeId(input.userId, 'userId'))
	);
	await withTransientD1WriteRetry(() => getDb().delete(promotionCustomerGrant).where(predicate));
}

export async function listPromotionCustomerGrants(
	ctx: ServiceContext,
	input: { promotionId?: string } = {}
): Promise<PromotionCustomerGrantDTO[]> {
	requireAdmin(ctx.actor);
	const query = getDb()
		.select()
		.from(promotionCustomerGrant)
		.orderBy(desc(promotionCustomerGrant.createdAt), asc(promotionCustomerGrant.userId));
	return withTransientD1ReadRetry(() =>
		input.promotionId
			? query.where(
					eq(promotionCustomerGrant.promotionId, normalizeId(input.promotionId, 'promotionId'))
				)
			: query
	);
}

// ---------------------------------------------------------------------------
// Storefront validation and order-batch APIs
// ---------------------------------------------------------------------------

export async function validatePromoCodeForBag(
	input: ValidatePromoCodeForBagInput
): Promise<PromoValidationResult> {
	return withTransientD1ReadRetry(() => validatePromoCodeForBagTx(getDb(), input));
}

export async function validatePromoCodeForBagTx(
	tx: QueryExecutor,
	input: ValidatePromoCodeForBagInput
): Promise<PromoValidationResult> {
	const code = normalizePromoCode(input.code);
	const subtotal = normalizeMoney(input.subtotal, 'subtotal');
	const userId = normalizeNullableId(input.userId, 'userId') ?? null;
	const now = input.now ?? new Date();
	const joined = await loadJoinedCodeByCodeTx(tx, code);
	if (
		!joined ||
		!joined.code.isActive ||
		!['storefront', 'both'].includes(joined.code.redemptionChannel)
	) {
		throw new PromotionError('Invalid or inactive promo code.', ErrorCode.PROMO_NOT_FOUND, {
			code
		});
	}
	if (joined.promotion.applicationMode !== 'code') {
		throw new PromotionError('Promo code is not redeemable.', ErrorCode.PROMO_NOT_APPLICABLE);
	}
	return validateJoinedPromotionForBagTx(tx, joined, { subtotal, userId, now });
}

export async function resolvePromotionForBag(
	input: ResolvePromotionForBagInput
): Promise<PromoValidationResult | null> {
	return withTransientD1ReadRetry(() => {
		const tx = getDb();
		if (input.code) return validatePromoCodeForBagTx(tx, { ...input, code: input.code });
		return resolveBestAutomaticPromotionForBagTx(tx, input);
	});
}

export async function resolveStoredPromotionForBagTx(
	tx: QueryExecutor,
	input: {
		promotionId?: string | null;
		promoCodeId?: string | null;
		userId?: string | null;
		subtotal: number;
		now?: Date;
	}
): Promise<PromoValidationResult | null> {
	const subtotal = normalizeMoney(input.subtotal, 'subtotal');
	const userId = normalizeNullableId(input.userId, 'userId') ?? null;
	const now = input.now ?? new Date();
	if (input.promoCodeId) {
		const joined = await loadJoinedCodeByIdTx(tx, normalizeId(input.promoCodeId, 'promoCodeId'));
		if (!joined || (input.promotionId && joined.promotion.id !== input.promotionId)) return null;
		return validateJoinedPromotionForBagTx(tx, joined, { subtotal, userId, now });
	}
	if (input.promotionId) {
		const row = await loadPromotionByIdTx(tx, normalizeId(input.promotionId, 'promotionId'));
		if (!row || row.applicationMode !== 'automatic') return null;
		return validatePromotionRowForBagTx(tx, row, null, { subtotal, userId, now });
	}
	return resolveBestAutomaticPromotionForBagTx(tx, { subtotal, userId, now });
}

export async function resolveStoredPromotionBagStatesTx(
	tx: QueryExecutor,
	input: {
		items: Array<{
			key: string;
			promotionId?: string | null;
			promoCodeId?: string | null;
			userId?: string | null;
			subtotal: number;
		}>;
		now?: Date;
	}
): Promise<Map<string, StoredPromotionBagState>> {
	const now = input.now ?? new Date();
	const items = input.items.map((item) => ({
		key: normalizeId(item.key, 'key'),
		promotionId: normalizeNullableId(item.promotionId, 'promotionId') ?? null,
		promoCodeId: normalizeNullableId(item.promoCodeId, 'promoCodeId') ?? null,
		userId: normalizeNullableId(item.userId, 'userId') ?? null,
		subtotal: normalizeMoney(item.subtotal, 'subtotal')
	}));
	if (new Set(items.map((item) => item.key)).size !== items.length) {
		throw new PromotionError('Promotion-state keys must be unique.', ErrorCode.VALIDATION_ERROR);
	}
	if (items.length === 0) return new Map();

	const promoCodeIds = uniqueStrings(
		items.flatMap((item) => (item.promoCodeId ? [item.promoCodeId] : []))
	);
	const directPromotionIds = uniqueStrings(
		items.flatMap((item) => (!item.promoCodeId && item.promotionId ? [item.promotionId] : []))
	);
	const joinedCodes =
		promoCodeIds.length > 0
			? await tx
					.select({ code: promoCode, promotion })
					.from(promoCode)
					.innerJoin(promotion, eq(promoCode.promotionId, promotion.id))
					.where(inArray(promoCode.id, promoCodeIds))
			: [];
	const directPromotions =
		directPromotionIds.length > 0
			? await tx.select().from(promotion).where(inArray(promotion.id, directPromotionIds))
			: [];
	const automaticPromotions = items.some((item) => !item.promoCodeId && !item.promotionId)
		? await loadAutomaticPromotionCandidatesTx(tx, now)
		: [];
	const codeById = new Map(joinedCodes.map((row) => [row.code.id, row]));
	const promotionById = new Map(directPromotions.map((row) => [row.id, row]));
	const relevantPromotions = new Map<string, Promotion>();
	for (const row of joinedCodes) relevantPromotions.set(row.promotion.id, row.promotion);
	for (const row of directPromotions) relevantPromotions.set(row.id, row);
	for (const row of automaticPromotions) relevantPromotions.set(row.id, row);

	const userIds = uniqueStrings(items.flatMap((item) => (item.userId ? [item.userId] : [])));
	const promotionIds = [...relevantPromotions.keys()];
	const grantRows =
		userIds.length > 0 && promotionIds.length > 0
			? await tx
					.select({
						promotionId: promotionCustomerGrant.promotionId,
						userId: promotionCustomerGrant.userId
					})
					.from(promotionCustomerGrant)
					.where(
						and(
							inArray(promotionCustomerGrant.promotionId, promotionIds),
							inArray(promotionCustomerGrant.userId, userIds),
							sql`(${promotionCustomerGrant.startsAt} IS NULL OR ${promotionCustomerGrant.startsAt} <= ${now.getTime()})`,
							sql`(${promotionCustomerGrant.expiresAt} IS NULL OR ${promotionCustomerGrant.expiresAt} > ${now.getTime()})`
						)
					)
			: [];
	const usageRows =
		userIds.length > 0 && promotionIds.length > 0
			? await tx
					.select({
						promotionId: promotionUsage.promotionId,
						userId: promotionUsage.userId,
						total: count()
					})
					.from(promotionUsage)
					.where(
						and(
							inArray(promotionUsage.promotionId, promotionIds),
							inArray(promotionUsage.userId, userIds)
						)
					)
					.groupBy(promotionUsage.promotionId, promotionUsage.userId)
			: [];
	const grantKeys = new Set(grantRows.map((row) => promotionUserKey(row.promotionId, row.userId)));
	const usageByPromotionUser = new Map(
		usageRows.flatMap((row) =>
			row.userId
				? [[promotionUserKey(row.promotionId, row.userId), Number(row.total)] as const]
				: []
		)
	);

	const states = new Map<string, StoredPromotionBagState>();
	for (const item of items) {
		let presentation: StoredPromotionBagPresentation | null = null;
		try {
			if (item.promoCodeId) {
				const joined = codeById.get(item.promoCodeId);
				if (!joined || (item.promotionId && joined.promotion.id !== item.promotionId)) {
					states.set(item.key, { presentation: null, result: null });
					continue;
				}
				presentation = toStoredPromotionPresentation(joined.promotion, joined.code);
				const codeIsRedeemable =
					joined.code.isActive &&
					['storefront', 'both'].includes(joined.code.redemptionChannel) &&
					joined.promotion.applicationMode === 'code' &&
					(joined.code.usageLimit === null || joined.code.usedCount < joined.code.usageLimit);
				states.set(item.key, {
					presentation,
					result: codeIsRedeemable
						? validatePromotionFromSnapshot(joined.promotion, joined.code, item, {
								now,
								grantKeys,
								usageByPromotionUser
							})
						: null
				});
				continue;
			}

			if (item.promotionId) {
				const row = promotionById.get(item.promotionId);
				if (!row) {
					states.set(item.key, { presentation: null, result: null });
					continue;
				}
				presentation = toStoredPromotionPresentation(row, null);
				states.set(item.key, {
					presentation,
					result:
						row.applicationMode === 'automatic'
							? validatePromotionFromSnapshot(row, null, item, {
									now,
									grantKeys,
									usageByPromotionUser
								})
							: null
				});
				continue;
			}

			let best: PromoValidationResult | null = null;
			let bestPriority = -1;
			for (const row of automaticPromotions) {
				try {
					const result = validatePromotionFromSnapshot(row, null, item, {
						now,
						grantKeys,
						usageByPromotionUser
					});
					if (
						!best ||
						result.discountAmount > best.discountAmount ||
						(result.discountAmount === best.discountAmount && row.priority > bestPriority)
					) {
						best = result;
						bestPriority = row.priority;
					}
				} catch (error) {
					if (!isAppError(error) || error.statusCode >= 500) throw error;
				}
			}
			states.set(item.key, { presentation: null, result: best });
		} catch (error) {
			if (!isAppError(error) || error.statusCode >= 500) throw error;
			states.set(item.key, { presentation, result: null });
		}
	}
	return states;
}

export async function resolveBestAutomaticPromotionForBagTx(
	tx: QueryExecutor,
	input: Omit<ResolvePromotionForBagInput, 'code'>
): Promise<PromoValidationResult | null> {
	const subtotal = normalizeMoney(input.subtotal, 'subtotal');
	const userId = normalizeNullableId(input.userId, 'userId') ?? null;
	const now = input.now ?? new Date();
	const candidates = await loadAutomaticPromotionCandidatesTx(tx, now);

	let best: PromoValidationResult | null = null;
	let bestPriority = -1;
	for (const row of candidates) {
		try {
			const result = await validatePromotionRowForBagTx(tx, row, null, { subtotal, userId, now });
			if (
				!best ||
				result.discountAmount > best.discountAmount ||
				(result.discountAmount === best.discountAmount && row.priority > bestPriority)
			) {
				best = result;
				bestPriority = row.priority;
			}
		} catch (error) {
			if (!isAppError(error) || error.statusCode >= 500) throw error;
		}
	}
	return best;
}

export function createPromotionSnapshot(input: {
	promotion: PromotionDTO;
	code?: string | null;
}): PromotionSnapshot {
	return {
		promotionId: input.promotion.id,
		name: input.promotion.name,
		code: input.code ?? null,
		discountType: input.promotion.discountType,
		discountValue: input.promotion.discountValue
	};
}

/** Compatibility snapshot helper. */
export function createPromoCodeSnapshot(input: { promoCode: PromoCodeDTO }): PromotionSnapshot {
	return {
		promotionId: input.promoCode.promotionId,
		name: input.promoCode.description ?? input.promoCode.code,
		code: input.promoCode.code,
		discountType: input.promoCode.discountType,
		discountValue: input.promoCode.discountValue
	};
}

export function preparePromotionUsageBatch(
	db: Db,
	input: RecordPromoUsageInput & { promotionId: string }
): [PromotionsBatchItem, ...PromotionsBatchItem[]] {
	const data = parseRecordUsageInput(input);
	const nowMs = data.now.getTime();
	const userLimitCondition = data.userId
		? sql`(SELECT count(*) FROM ${promotionUsage} WHERE ${promotionUsage.promotionId} = ${data.promotionId} AND ${promotionUsage.userId} = ${data.userId}) < ${promotion.perUserLimit}`
		: sql`1 = 1`;
	const promotionUpdate = db
		.update(promotion)
		.set({ usedCount: sql`${promotion.usedCount} + 1`, updatedAt: data.now })
		.where(
			and(
				eq(promotion.id, data.promotionId),
				eq(promotion.isActive, true),
				sql`(${promotion.startsAt} IS NULL OR ${promotion.startsAt} <= ${nowMs})`,
				sql`(${promotion.expiresAt} IS NULL OR ${promotion.expiresAt} > ${nowMs})`,
				sql`(${promotion.usageLimit} IS NULL OR ${promotion.usedCount} < ${promotion.usageLimit})`,
				userLimitCondition
			)
		);
	const statements: [PromotionsBatchItem, ...PromotionsBatchItem[]] = [
		promotionUpdate,
		...guardPreviousBatchChanges(db)
	];
	if (data.promoCodeId) {
		statements.push(
			db
				.update(promoCode)
				.set({ usedCount: sql`${promoCode.usedCount} + 1`, updatedAt: data.now })
				.where(
					and(
						eq(promoCode.id, data.promoCodeId),
						eq(promoCode.promotionId, data.promotionId),
						eq(promoCode.isActive, true),
						sql`(${promoCode.usageLimit} IS NULL OR ${promoCode.usedCount} < ${promoCode.usageLimit})`
					)
				),
			...guardPreviousBatchChanges(db)
		);
	}
	statements.push(
		db.insert(promotionUsage).values({
			promotionId: data.promotionId,
			promoCodeId: data.promoCodeId,
			userId: data.userId,
			orderId: data.orderId,
			discountAmount: data.discountAmount,
			usedAt: data.now
		})
	);
	return statements;
}

/** Existing order code imports this name. */
export function preparePromoUsageBatch(
	db: Db,
	input: RecordPromoUsageInput
): [PromotionsBatchItem, ...PromotionsBatchItem[]] {
	if (!input.promotionId)
		throw new PromotionError('promotionId is required.', ErrorCode.VALIDATION_ERROR);
	return preparePromotionUsageBatch(db, { ...input, promotionId: input.promotionId });
}

export async function recordPromoUsage(
	ctx: ServiceContext,
	input: RecordPromoUsageInput
): Promise<PromoCodeUsageDTO> {
	requireAdmin(ctx.actor);
	try {
		const db = getDb();
		const validated = await validateUsageRecordTx(db, input);
		const statements = preparePromotionUsageBatch(db, validated);
		const row = await withTransientD1WriteReconciliation<PromotionUsage>(
			async () => {
				await db.batch(statements);
				const [created] = await db
					.select()
					.from(promotionUsage)
					.where(eq(promotionUsage.orderId, validated.orderId))
					.limit(1);
				if (!created) {
					throw new PromotionError('Promotion usage was not recorded.', ErrorCode.INTERNAL_ERROR);
				}
				return created;
			},
			async () => {
				const [created] = await db
					.select()
					.from(promotionUsage)
					.where(eq(promotionUsage.orderId, validated.orderId))
					.limit(1);
				return created ? { committed: true, value: created } : { committed: false };
			}
		);
		return toUsageDTO(row, validated.code ? toCodeSummary(validated.code) : null);
	} catch (error) {
		if (isD1BatchGuardError(error))
			throw new PromotionError(
				'Promotion is no longer redeemable.',
				ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED
			);
		throw mapPromotionPersistenceError(error);
	}
}

// ---------------------------------------------------------------------------
// Compatibility admin APIs for the previous code-only surface
// ---------------------------------------------------------------------------

export async function createPromoCode(
	ctx: ServiceContext,
	input: CreatePromoCodeInput
): Promise<PromoCodeDTO> {
	const promotionDto = await createPromotion(ctx, {
		name: normalizePromoCode(input.code),
		internalDescription: input.description ?? null,
		publicTitle: null,
		publicDescription: null,
		discountType: input.discountType,
		discountValue: input.discountValue,
		minOrderAmount: input.minOrderAmount ?? null,
		maxDiscountAmount: input.maxDiscountAmount ?? null,
		usageLimit: input.usageLimit ?? null,
		perUserLimit: input.perUserLimit ?? 1,
		applicationMode: 'code',
		eligibilityScope: 'all',
		visibility: 'internal',
		priority: 0,
		startsAt: input.startsAt ?? null,
		expiresAt: input.expiresAt ?? null,
		code: {
			code: input.code,
			distribution: 'private',
			isDiscoverable: false,
			redemptionChannel: 'storefront',
			usageLimit: input.usageLimit ?? null
		}
	});
	return promotionDto.codes[0]!;
}

export async function getPromoCode(
	ctx: ServiceContext,
	input: { lookup: PromoCodeLookup }
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const joined = await withTransientD1ReadRetry(() =>
		loadJoinedCodeByLookupTx(getDb(), input.lookup)
	);
	if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
	return toPromoCodeDTO(joined.code, joined.promotion, resolveNow(ctx));
}

export async function listPromoCodes(
	ctx: ServiceContext,
	options: ListPromoCodesOptions = {}
): Promise<PromoCodeListResult> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const conditions: SQL[] = [];
	if (typeof options.isActive === 'boolean')
		conditions.push(eq(promotion.isActive, options.isActive));
	else if (options.includeInactive === false) conditions.push(eq(promotion.isActive, true));
	const query = normalizeOptionalText(options.query, 120);
	if (query)
		conditions.push(
			or(
				like(promoCode.code, `%${sanitizeLikeTerm(query.toUpperCase())}%`),
				like(promotion.name, `%${sanitizeLikeTerm(query)}%`)
			)!
		);
	const where = conditions.length ? and(...conditions) : undefined;
	const db = getDb();
	const baseCount = db
		.select({ total: count() })
		.from(promoCode)
		.innerJoin(promotion, eq(promoCode.promotionId, promotion.id));
	const baseList = db
		.select({ code: promoCode, promotion })
		.from(promoCode)
		.innerJoin(promotion, eq(promoCode.promotionId, promotion.id))
		.orderBy(desc(promotion.updatedAt), asc(promoCode.code))
		.limit(limit)
		.offset(offset);
	const totals = await withTransientD1ReadRetry(() => (where ? baseCount.where(where) : baseCount));
	const rows = await withTransientD1ReadRetry(() => (where ? baseList.where(where) : baseList));
	return {
		items: rows.map((row) => toPromoCodeDTO(row.code, row.promotion, now)),
		total: Number(totals[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function updatePromoCode(
	ctx: ServiceContext,
	input: { lookup: PromoCodeLookup; data: UpdatePromoCodeInput }
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const db = getDb();
	const joined = await loadJoinedCodeByLookupTx(db, input.lookup);
	if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
	const now = resolveNow(ctx);
	const { code, description, usageLimit, ...ruleData } = input.data;
	const promotionInput = removeUndefinedValues({
		...ruleData,
		internalDescription: description,
		usageLimit
	});
	const parsedPromotion = updatePromotionSchema.safeParse(promotionInput);
	if (!parsedPromotion.success) {
		validationError('Invalid promotion data.', parsedPromotion.error.issues);
	}
	validateResolvedWindow(joined.promotion, parsedPromotion.data, now);
	const promotionValues = removeUndefinedValues({
		...parsedPromotion.data,
		startsAt: timestampMsToDate(parsedPromotion.data.startsAt),
		expiresAt: timestampMsToDate(parsedPromotion.data.expiresAt),
		updatedAt: now
	});
	const parsedCode = updatePromoCodeSchema.safeParse(
		removeUndefinedValues({
			code: code === undefined ? undefined : normalizePromoCode(code),
			usageLimit
		})
	);
	if (!parsedCode.success) validationError('Invalid promo code data.', parsedCode.error.issues);
	const codeValues = removeUndefinedValues({ ...parsedCode.data, updatedAt: now });
	const statements: PromotionsBatchItem[] = [];
	if (Object.keys(promotionValues).length > 1) {
		statements.push(
			db
				.update(promotion)
				.set(promotionValues)
				.where(
					and(
						eq(promotion.id, joined.promotion.id),
						eq(promotion.updatedAt, joined.promotion.updatedAt)
					)
				),
			...guardPreviousBatchChanges(db)
		);
	}
	if (Object.keys(codeValues).length > 1) {
		statements.push(
			db
				.update(promoCode)
				.set(codeValues)
				.where(
					and(eq(promoCode.id, joined.code.id), eq(promoCode.updatedAt, joined.code.updatedAt))
				),
			...guardPreviousBatchChanges(db)
		);
	}
	const [first, ...rest] = statements;
	if (first) {
		await withTransientD1WriteReconciliation(
			async () => {
				await db.batch([first, ...rest]);
			},
			async () => {
				const current = await loadJoinedCodeByIdTx(db, joined.code.id);
				if (!current) return { committed: false };
				const promotionCommitted =
					Object.keys(promotionValues).length <= 1 ||
					current.promotion.updatedAt.getTime() === now.getTime();
				const codeCommitted =
					Object.keys(codeValues).length <= 1 || current.code.updatedAt.getTime() === now.getTime();
				return promotionCommitted && codeCommitted
					? { committed: true, value: undefined }
					: { committed: false };
			}
		);
	}
	return getPromoCode(ctx, { lookup: { id: joined.code.id } });
}

export async function setPromoCodeActive(
	ctx: ServiceContext,
	input: SetPromoCodeActiveInput
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const db = getDb();
	const joined = await loadJoinedCodeByLookupTx(db, input.lookup);
	if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
	const now = resolveNow(ctx);
	const parentActiveValue = input.isActive
		? true
		: sql<boolean>`EXISTS (
				SELECT 1 FROM ${promoCode}
				WHERE ${promoCode.promotionId} = ${joined.promotion.id}
					AND ${promoCode.id} <> ${joined.code.id}
					AND ${promoCode.isActive} = 1
			)`;
	const statements: [PromotionsBatchItem, ...PromotionsBatchItem[]] = [
		db
			.update(promoCode)
			.set({ isActive: input.isActive, updatedAt: now })
			.where(and(eq(promoCode.id, joined.code.id), eq(promoCode.updatedAt, joined.code.updatedAt))),
		...guardPreviousBatchChanges(db),
		db
			.update(promotion)
			.set({ isActive: parentActiveValue, updatedAt: now })
			.where(
				and(
					eq(promotion.id, joined.promotion.id),
					eq(promotion.updatedAt, joined.promotion.updatedAt)
				)
			),
		...guardPreviousBatchChanges(db)
	];
	await withTransientD1WriteReconciliation(
		async () => {
			await db.batch(statements);
		},
		async () => {
			const current = await loadJoinedCodeByIdTx(db, joined.code.id);
			if (!current || current.code.isActive !== input.isActive) {
				return { committed: false };
			}
			const [otherActive] = await db
				.select({ id: promoCode.id })
				.from(promoCode)
				.where(and(eq(promoCode.promotionId, joined.promotion.id), eq(promoCode.isActive, true)))
				.limit(1);
			const expectedParentActive = Boolean(otherActive);
			return current.promotion.isActive === expectedParentActive
				? { committed: true, value: undefined }
				: { committed: false };
		}
	);
	return getPromoCode(ctx, { lookup: { id: joined.code.id } });
}

export async function listPromoCodeUsages(
	ctx: ServiceContext,
	options: ListPromoCodeUsagesOptions = {}
): Promise<PromoCodeUsageListResult> {
	requireAdmin(ctx.actor);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildUsageWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(promotionUsage);
	const listQuery = db
		.select()
		.from(promotionUsage)
		.orderBy(desc(promotionUsage.usedAt))
		.limit(limit)
		.offset(offset);
	const totals = await withTransientD1ReadRetry(() =>
		where ? countQuery.where(where) : countQuery
	);
	const rows = await withTransientD1ReadRetry(() => (where ? listQuery.where(where) : listQuery));
	const codes = await withTransientD1ReadRetry(() =>
		loadCodeSummariesByIdsTx(
			db,
			rows.flatMap((row) => (row.promoCodeId ? [row.promoCodeId] : []))
		)
	);
	return {
		items: rows.map((row) =>
			toUsageDTO(row, row.promoCodeId ? (codes.get(row.promoCodeId) ?? null) : null)
		),
		total: Number(totals[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function reconcilePromoCodeUsageCount(
	ctx: ServiceContext,
	input: ReconcilePromoCodeUsageCountInput
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const joined = await loadJoinedCodeByLookupTx(getDb(), input.lookup);
	if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
	return reconcileCodeUsageCountTx(getDb(), joined, input.now ?? resolveNow(ctx)).then(
		(item) => item.promoCode
	);
}

export async function reconcilePromoCodeUsageCountTx(
	tx: PromotionsTx,
	input: ReconcilePromoCodeUsageCountInput
): Promise<PromoCodeDTO> {
	const joined = await loadJoinedCodeByLookupTx(tx, input.lookup);
	if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
	return reconcileCodeUsageCountTx(tx, joined, input.now ?? new Date()).then(
		(item) => item.promoCode
	);
}

export async function reconcilePromoCodeUsageCounts(
	ctx: ServiceContext,
	input: ReconcilePromoCodeUsageCountsInput = {}
): Promise<PromoUsageReconciliationResult> {
	requireAdmin(ctx.actor);
	const limit = normalizeLimit(input.limit, 100, 500);
	const offset = normalizeOffset(input.offset);
	const now = resolveNow(ctx);
	const db = getDb();
	const rows = await db
		.select({ code: promoCode, promotion })
		.from(promoCode)
		.innerJoin(promotion, eq(promoCode.promotionId, promotion.id))
		.orderBy(asc(promoCode.code), asc(promoCode.id))
		.limit(limit)
		.offset(offset);
	const [totalRow] = await db.select({ total: count() }).from(promoCode);
	const items: PromoUsageReconciliationItem[] = [];
	const failedItems: PromoUsageReconciliationFailure[] = [];
	for (const row of rows) {
		try {
			items.push(await reconcileCodeUsageCountTx(db, row, now));
		} catch (error) {
			failedItems.push({
				promoCodeId: row.code.id,
				code: row.code.code,
				error: toErrorResponseBody(error).message
			});
		}
	}
	const changedCount = items.filter((item) => item.changed).length;
	const total = Number(totalRow?.total ?? 0);
	return {
		items,
		failedItems,
		checkedCount: rows.length,
		changedCount,
		unchangedCount: items.length - changedCount,
		failedCount: failedItems.length,
		limit,
		offset,
		hasMore: offset + rows.length < total
	};
}

// ---------------------------------------------------------------------------
// Internal validation/load/mapping helpers
// ---------------------------------------------------------------------------

async function loadAutomaticPromotionCandidatesTx(
	tx: QueryExecutor,
	now: Date
): Promise<Promotion[]> {
	return tx
		.select()
		.from(promotion)
		.where(
			and(
				eq(promotion.applicationMode, 'automatic'),
				eq(promotion.isActive, true),
				sql`(${promotion.startsAt} IS NULL OR ${promotion.startsAt} <= ${now.getTime()})`,
				sql`(${promotion.expiresAt} IS NULL OR ${promotion.expiresAt} > ${now.getTime()})`,
				sql`(${promotion.usageLimit} IS NULL OR ${promotion.usedCount} < ${promotion.usageLimit})`
			)
		)
		.orderBy(desc(promotion.priority), asc(promotion.id));
}

function toStoredPromotionPresentation(
	row: Promotion,
	codeRow: PromoCode | null
): StoredPromotionBagPresentation {
	return {
		promotionId: row.id,
		promotionName: row.name,
		applicationMode: row.applicationMode,
		promoCodeId: codeRow?.id ?? null,
		code: codeRow?.code ?? null,
		minOrderAmount: row.minOrderAmount
	};
}

function promotionUserKey(promotionId: string, userId: string): string {
	return JSON.stringify([promotionId, userId]);
}

function validatePromotionFromSnapshot(
	row: Promotion,
	codeRow: PromoCode | null,
	input: { subtotal: number; userId: string | null },
	state: {
		now: Date;
		grantKeys: Set<string>;
		usageByPromotionUser: Map<string, number>;
	}
): PromoValidationResult {
	if (codeRow && codeRow.usageLimit !== null && codeRow.usedCount >= codeRow.usageLimit) {
		throw new PromotionError(
			'Promo code usage limit reached.',
			ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED
		);
	}
	assertPromotionRedeemable(row, { subtotal: input.subtotal, now: state.now });
	if (row.eligibilityScope !== 'all') {
		if (!input.userId) {
			throw new PromotionError('Sign in to use this promotion.', ErrorCode.UNAUTHORIZED);
		}
		if (
			row.eligibilityScope === 'customer_grant' &&
			!state.grantKeys.has(promotionUserKey(row.id, input.userId))
		) {
			throw new PromotionError(
				'Promotion is not available for this customer.',
				ErrorCode.PROMO_NOT_APPLICABLE
			);
		}
	}
	if (
		input.userId &&
		(state.usageByPromotionUser.get(promotionUserKey(row.id, input.userId)) ?? 0) >=
			row.perUserLimit
	) {
		throw new PromotionError('Promotion already used.', ErrorCode.PROMO_ALREADY_USED);
	}
	return createPromoValidationResult(row, codeRow, input.subtotal);
}

async function validateJoinedPromotionForBagTx(
	tx: QueryExecutor,
	joined: JoinedCode,
	input: { subtotal: number; userId: string | null; now: Date }
) {
	if (joined.code.usageLimit !== null && joined.code.usedCount >= joined.code.usageLimit) {
		throw new PromotionError(
			'Promo code usage limit reached.',
			ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED
		);
	}
	return validatePromotionRowForBagTx(tx, joined.promotion, joined.code, input);
}

async function validatePromotionRowForBagTx(
	tx: QueryExecutor,
	row: Promotion,
	codeRow: PromoCode | null,
	input: { subtotal: number; userId: string | null; now: Date }
): Promise<PromoValidationResult> {
	assertPromotionRedeemable(row, input);
	await assertPromotionEligibilityTx(tx, row, input.userId, input.now);
	if (input.userId) {
		const [usage] = await tx
			.select({ total: count() })
			.from(promotionUsage)
			.where(and(eq(promotionUsage.promotionId, row.id), eq(promotionUsage.userId, input.userId)));
		if (Number(usage?.total ?? 0) >= row.perUserLimit)
			throw new PromotionError('Promotion already used.', ErrorCode.PROMO_ALREADY_USED);
	}
	return createPromoValidationResult(row, codeRow, input.subtotal);
}

function createPromoValidationResult(
	row: Promotion,
	codeRow: PromoCode | null,
	subtotal: number
): PromoValidationResult {
	const discountAmount = calculateDiscountAmount(row, subtotal);
	if (discountAmount <= 0)
		throw new PromotionError(
			'Promotion cannot be applied to this bag.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
	return {
		promotionId: row.id,
		promoCodeId: codeRow?.id ?? null,
		code: codeRow?.code ?? null,
		promotionName: row.name,
		applicationMode: row.applicationMode,
		discountAmount,
		subtotal,
		totalAfterDiscount: Math.max(subtotal - discountAmount, 0),
		snapshot: {
			promotionId: row.id,
			name: row.name,
			code: codeRow?.code ?? null,
			discountType: row.discountType,
			discountValue: row.discountValue
		}
	};
}

function assertPromotionRedeemable(row: Promotion, input: { subtotal: number; now: Date }) {
	if (!row.isActive)
		throw new PromotionError('Invalid or inactive promotion.', ErrorCode.PROMO_NOT_FOUND);
	if (row.startsAt && row.startsAt > input.now)
		throw new PromotionError('Promotion is not active yet.', ErrorCode.PROMO_NOT_APPLICABLE);
	if (row.expiresAt && row.expiresAt <= input.now)
		throw new PromotionError('Promotion has expired.', ErrorCode.PROMO_EXPIRED);
	if (row.usageLimit !== null && row.usedCount >= row.usageLimit)
		throw new PromotionError(
			'Promotion usage limit reached.',
			ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED
		);
	if (row.minOrderAmount !== null && input.subtotal < row.minOrderAmount) {
		throw new PromotionError(
			`Promotion requires min. LKR ${row.minOrderAmount.toLocaleString()}`,
			ErrorCode.MINIMUM_ORDER_VALUE_NOT_MET
		);
	}
}

async function assertPromotionEligibilityTx(
	tx: QueryExecutor,
	row: Promotion,
	userId: string | null,
	now: Date
) {
	if (row.eligibilityScope === 'all') return;
	if (!userId) throw new PromotionError('Sign in to use this promotion.', ErrorCode.UNAUTHORIZED);
	if (row.eligibilityScope === 'authenticated') return;
	const [grant] = await tx
		.select({ id: promotionCustomerGrant.id })
		.from(promotionCustomerGrant)
		.where(
			and(
				eq(promotionCustomerGrant.promotionId, row.id),
				eq(promotionCustomerGrant.userId, userId),
				sql`(${promotionCustomerGrant.startsAt} IS NULL OR ${promotionCustomerGrant.startsAt} <= ${now.getTime()})`,
				sql`(${promotionCustomerGrant.expiresAt} IS NULL OR ${promotionCustomerGrant.expiresAt} > ${now.getTime()})`
			)
		)
		.limit(1);
	if (!grant)
		throw new PromotionError(
			'Promotion is not available for this customer.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
}

async function validateUsageRecordTx(tx: PromotionsTx, input: RecordPromoUsageInput) {
	const orderId = normalizeId(input.orderId, 'orderId');
	const [existingUsage] = await tx
		.select({ id: promotionUsage.id })
		.from(promotionUsage)
		.where(eq(promotionUsage.orderId, orderId))
		.limit(1);
	if (existingUsage) {
		throw new PromotionError(
			'Promotion usage was already recorded for this order.',
			ErrorCode.PROMO_ALREADY_USED,
			{ orderId }
		);
	}
	const [orderRow] = await tx.select().from(orderTable).where(eq(orderTable.id, orderId)).limit(1);
	if (!orderRow) throw new PromotionError('Order not found.', ErrorCode.ORDER_NOT_FOUND);
	let promotionId = input.promotionId ?? orderRow.promotionId ?? undefined;
	let code: PromoCode | null = null;
	if (input.promoCodeId) {
		const joined = await loadJoinedCodeByIdTx(tx, normalizeId(input.promoCodeId, 'promoCodeId'));
		if (!joined) throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
		code = joined.code;
		promotionId ??= joined.promotion.id;
	}
	if (!promotionId)
		throw new PromotionError('promotionId is required.', ErrorCode.VALIDATION_ERROR);
	promotionId = normalizeId(promotionId, 'promotionId');
	if (
		orderRow.promotionId !== promotionId ||
		(orderRow.promoCodeId ?? null) !== (code?.id ?? input.promoCodeId ?? null)
	) {
		throw new PromotionError('Promotion does not match the order.', ErrorCode.PROMO_NOT_APPLICABLE);
	}
	const discountAmount = normalizeMoney(input.discountAmount, 'discountAmount');
	if (orderRow.discountAmount !== discountAmount)
		throw new PromotionError(
			'Promotion discount does not match the order.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
	const promotionRow = await loadPromotionByIdTx(tx, promotionId);
	if (!promotionRow) throw new PromotionError('Promotion not found.', ErrorCode.PROMO_NOT_FOUND);
	const now = input.now ?? new Date();
	const validation = await validatePromotionRowForBagTx(tx, promotionRow, code, {
		subtotal: orderRow.subtotal,
		userId: normalizeNullableId(input.userId, 'userId') ?? orderRow.userId,
		now
	});
	if (validation.discountAmount !== discountAmount)
		throw new PromotionError(
			'Promotion discount does not match current rules.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
	return {
		promotionId,
		promoCodeId: code?.id ?? null,
		orderId,
		userId: normalizeNullableId(input.userId, 'userId') ?? orderRow.userId,
		discountAmount,
		now,
		code
	};
}

function parseRecordUsageInput(input: RecordPromoUsageInput & { promotionId: string }) {
	return {
		promotionId: normalizeId(input.promotionId, 'promotionId'),
		promoCodeId: normalizeNullableId(input.promoCodeId, 'promoCodeId') ?? null,
		orderId: normalizeId(input.orderId, 'orderId'),
		userId: normalizeNullableId(input.userId, 'userId') ?? null,
		discountAmount: normalizeMoney(input.discountAmount, 'discountAmount'),
		now: input.now ?? new Date()
	};
}

async function loadPromotionByIdTx(tx: QueryExecutor, id: string): Promise<Promotion | null> {
	const [row] = await tx.select().from(promotion).where(eq(promotion.id, id)).limit(1);
	return row ?? null;
}

async function loadPromotionWithCodesByIdTx(
	tx: QueryExecutor,
	id: string
): Promise<PromotionWithCodes | null> {
	const promotionRow = await loadPromotionByIdTx(tx, id);
	if (!promotionRow) return null;
	const codes = await tx
		.select()
		.from(promoCode)
		.where(eq(promoCode.promotionId, id))
		.orderBy(asc(promoCode.code));
	return { promotion: promotionRow, codes };
}

async function loadJoinedCodeByCodeTx(tx: QueryExecutor, code: string): Promise<JoinedCode | null> {
	const [row] = await tx
		.select({ code: promoCode, promotion })
		.from(promoCode)
		.innerJoin(promotion, eq(promoCode.promotionId, promotion.id))
		.where(eq(promoCode.code, code))
		.limit(1);
	return row ?? null;
}

async function loadJoinedCodeByIdTx(tx: QueryExecutor, id: string): Promise<JoinedCode | null> {
	const [row] = await tx
		.select({ code: promoCode, promotion })
		.from(promoCode)
		.innerJoin(promotion, eq(promoCode.promotionId, promotion.id))
		.where(eq(promoCode.id, id))
		.limit(1);
	return row ?? null;
}

async function loadJoinedCodeByLookupTx(
	tx: QueryExecutor,
	lookup: PromoCodeLookup
): Promise<JoinedCode | null> {
	return 'id' in lookup
		? loadJoinedCodeByIdTx(tx, normalizeId(lookup.id, 'promoCodeId'))
		: loadJoinedCodeByCodeTx(tx, normalizePromoCode(lookup.code));
}

async function loadCodesByPromotionIdsTx(
	tx: QueryExecutor,
	ids: string[]
): Promise<Map<string, PromoCode[]>> {
	const uniqueIds = uniqueStrings(ids);
	if (!uniqueIds.length) return new Map();
	const rows = await tx
		.select()
		.from(promoCode)
		.where(inArray(promoCode.promotionId, uniqueIds))
		.orderBy(asc(promoCode.code));
	const result = new Map<string, PromoCode[]>();
	for (const row of rows)
		result.set(row.promotionId, [...(result.get(row.promotionId) ?? []), row]);
	return result;
}

async function loadCodeSummariesByIdsTx(
	tx: QueryExecutor,
	ids: string[]
): Promise<Map<string, PromoCodeSummaryDTO>> {
	const uniqueIds = uniqueStrings(ids);
	if (!uniqueIds.length) return new Map();
	const rows = await tx
		.select({ id: promoCode.id, promotionId: promoCode.promotionId, code: promoCode.code })
		.from(promoCode)
		.where(inArray(promoCode.id, uniqueIds));
	return new Map(rows.map((row) => [row.id, row]));
}

function recordMatchesPatch(row: object, patch: Record<string, unknown>): boolean {
	const record = row as Record<string, unknown>;
	return Object.entries(patch).every(([key, expected]) => {
		const actual = record[key];
		if (actual instanceof Date && expected instanceof Date) {
			return actual.getTime() === expected.getTime();
		}
		return actual === expected;
	});
}

async function reconcileCodeUsageCountTx(
	tx: PromotionsTx,
	joined: JoinedCode,
	now: Date
): Promise<PromoUsageReconciliationItem> {
	const [codeCountRow] = await tx
		.select({ total: count() })
		.from(promotionUsage)
		.where(eq(promotionUsage.promoCodeId, joined.code.id));
	const [promotionCountRow] = await tx
		.select({ total: count() })
		.from(promotionUsage)
		.where(eq(promotionUsage.promotionId, joined.promotion.id));
	const actualUsedCount = Number(codeCountRow?.total ?? 0);
	const actualPromotionUsedCount = Number(promotionCountRow?.total ?? 0);
	const codeChanged = actualUsedCount !== joined.code.usedCount;
	const promotionChanged = actualPromotionUsedCount !== joined.promotion.usedCount;
	let current = joined;

	if (codeChanged || promotionChanged) {
		const statements: PromotionsBatchItem[] = [];
		if (codeChanged) {
			statements.push(
				tx
					.update(promoCode)
					.set({ usedCount: actualUsedCount, updatedAt: now })
					.where(
						and(eq(promoCode.id, joined.code.id), eq(promoCode.updatedAt, joined.code.updatedAt))
					),
				...guardPreviousBatchChanges(tx)
			);
		}
		if (promotionChanged) {
			statements.push(
				tx
					.update(promotion)
					.set({ usedCount: actualPromotionUsedCount, updatedAt: now })
					.where(
						and(
							eq(promotion.id, joined.promotion.id),
							eq(promotion.updatedAt, joined.promotion.updatedAt)
						)
					),
				...guardPreviousBatchChanges(tx)
			);
		}
		const [first, ...rest] = statements;
		if (first) {
			current = await withTransientD1WriteReconciliation<JoinedCode>(
				async () => {
					await tx.batch([first, ...rest]);
					const row = await loadJoinedCodeByIdTx(tx, joined.code.id);
					if (!row) {
						throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND);
					}
					return row;
				},
				async () => {
					const row = await loadJoinedCodeByIdTx(tx, joined.code.id);
					return row &&
						row.code.usedCount === actualUsedCount &&
						row.promotion.usedCount === actualPromotionUsedCount
						? { committed: true, value: row }
						: { committed: false };
				}
			);
		}
	}

	return {
		promoCodeId: current.code.id,
		code: current.code.code,
		previousUsedCount: joined.code.usedCount,
		actualUsedCount,
		changed: codeChanged || promotionChanged,
		promoCode: toPromoCodeDTO(current.code, current.promotion, now)
	};
}

function toNewPromotionValues(id: string, data: InsertPromotion, now: Date): NewPromotion {
	return {
		id,
		name: data.name,
		publicTitle: data.publicTitle ?? null,
		internalDescription: data.internalDescription ?? null,
		publicDescription: data.publicDescription ?? null,
		discountType: data.discountType,
		discountValue: data.discountValue,
		minOrderAmount: data.minOrderAmount ?? null,
		maxDiscountAmount: data.maxDiscountAmount ?? null,
		usageLimit: data.usageLimit ?? null,
		usedCount: 0,
		perUserLimit: data.perUserLimit ?? 1,
		applicationMode: data.applicationMode,
		eligibilityScope: data.eligibilityScope ?? 'all',
		visibility: data.visibility ?? 'internal',
		priority: data.priority ?? 0,
		isActive: false,
		startsAt: timestampMsToDate(data.startsAt) ?? null,
		expiresAt: timestampMsToDate(data.expiresAt) ?? null,
		createdAt: now,
		updatedAt: now
	};
}

function toPromotionDTO(row: PromotionWithCodes, now: Date): PromotionDTO {
	const p = row.promotion;
	return {
		id: p.id,
		name: p.name,
		publicTitle: p.publicTitle,
		internalDescription: p.internalDescription,
		publicDescription: p.publicDescription,
		discountType: p.discountType,
		discountValue: p.discountValue,
		minOrderAmount: p.minOrderAmount,
		maxDiscountAmount: p.maxDiscountAmount,
		usageLimit: p.usageLimit,
		usedCount: p.usedCount,
		remainingUses: p.usageLimit === null ? null : Math.max(p.usageLimit - p.usedCount, 0),
		perUserLimit: p.perUserLimit,
		applicationMode: p.applicationMode,
		eligibilityScope: p.eligibilityScope,
		visibility: p.visibility,
		priority: p.priority,
		isActive: p.isActive,
		startsAt: p.startsAt,
		expiresAt: p.expiresAt,
		status: promotionStatus(p, now),
		codes: row.codes.map((code) => toPromoCodeDTO(code, p, now)),
		createdAt: p.createdAt,
		updatedAt: p.updatedAt
	};
}

function toPromoCodeDTO(code: PromoCode, p: Promotion, now: Date): PromoCodeDTO {
	return {
		id: code.id,
		promotionId: p.id,
		code: code.code,
		distribution: code.distribution,
		isDiscoverable: code.isDiscoverable,
		redemptionChannel: code.redemptionChannel,
		partnerReference: code.partnerReference,
		usageLimit: code.usageLimit,
		usedCount: code.usedCount,
		remainingUses: code.usageLimit === null ? null : Math.max(code.usageLimit - code.usedCount, 0),
		codeIsActive: code.isActive,
		isActive: code.isActive && p.isActive,
		createdAt: code.createdAt,
		updatedAt: code.updatedAt,
		description: p.internalDescription,
		discountType: p.discountType,
		discountValue: p.discountValue,
		minOrderAmount: p.minOrderAmount,
		maxDiscountAmount: p.maxDiscountAmount,
		perUserLimit: p.perUserLimit,
		startsAt: p.startsAt,
		expiresAt: p.expiresAt,
		status: code.isActive ? promotionStatus(p, now) : 'inactive'
	};
}

function toUsageDTO(row: PromotionUsage, code: PromoCodeSummaryDTO | null): PromoCodeUsageDTO {
	return {
		id: row.id,
		promotionId: row.promotionId,
		promoCodeId: row.promoCodeId,
		promoCode: code,
		userId: row.userId,
		orderId: row.orderId,
		discountAmount: row.discountAmount,
		usedAt: row.usedAt
	};
}
function toCodeSummary(row: PromoCode): PromoCodeSummaryDTO {
	return { id: row.id, promotionId: row.promotionId, code: row.code };
}

function promotionStatus(row: Promotion, now: Date): PromotionStatus {
	if (!row.isActive) return 'inactive';
	if (row.startsAt && row.startsAt > now) return 'scheduled';
	if (row.expiresAt && row.expiresAt <= now) return 'expired';
	if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return 'exhausted';
	return 'active';
}

function calculateDiscountAmount(row: Promotion, subtotal: number) {
	const raw =
		row.discountType === 'percentage'
			? Math.floor((subtotal * row.discountValue) / 100)
			: row.discountValue;
	return Math.min(
		row.maxDiscountAmount === null ? raw : Math.min(raw, row.maxDiscountAmount),
		subtotal
	);
}

function buildPromotionListWhere(options: ListPromotionsOptions): SQL | undefined {
	const conditions: SQL[] = [];
	if (typeof options.isActive === 'boolean')
		conditions.push(eq(promotion.isActive, options.isActive));
	else if (options.includeInactive === false) conditions.push(eq(promotion.isActive, true));
	if (options.applicationMode)
		conditions.push(eq(promotion.applicationMode, options.applicationMode));
	if (options.visibility) conditions.push(eq(promotion.visibility, options.visibility));
	const query = normalizeOptionalText(options.query, 120);
	if (query)
		conditions.push(
			or(
				like(promotion.name, `%${sanitizeLikeTerm(query)}%`),
				like(promotion.publicTitle, `%${sanitizeLikeTerm(query)}%`)
			)!
		);
	return conditions.length ? and(...conditions) : undefined;
}

function buildUsageWhere(options: ListPromoCodeUsagesOptions): SQL | undefined {
	const conditions: SQL[] = [];
	if (options.promotionId)
		conditions.push(
			eq(promotionUsage.promotionId, normalizeId(options.promotionId, 'promotionId'))
		);
	if (options.promoCodeId)
		conditions.push(
			eq(promotionUsage.promoCodeId, normalizeId(options.promoCodeId, 'promoCodeId'))
		);
	if (options.userId === null) conditions.push(isNull(promotionUsage.userId));
	else if (options.userId)
		conditions.push(eq(promotionUsage.userId, normalizeId(options.userId, 'userId')));
	if (options.orderId)
		conditions.push(eq(promotionUsage.orderId, normalizeId(options.orderId, 'orderId')));
	return conditions.length ? and(...conditions) : undefined;
}

function validateResolvedWindow(existing: Promotion, data: UpdatePromotionInput, now: Date) {
	const startsAt =
		data.startsAt === undefined ? existing.startsAt : (timestampMsToDate(data.startsAt) ?? null);
	const expiresAt =
		data.expiresAt === undefined ? existing.expiresAt : (timestampMsToDate(data.expiresAt) ?? null);
	if (startsAt && expiresAt && expiresAt <= startsAt)
		throw new PromotionError('expiresAt must be after startsAt.', ErrorCode.VALIDATION_ERROR);
	if (
		data.startsAt !== undefined &&
		existing.startsAt &&
		existing.startsAt < now &&
		startsAt?.getTime() !== existing.startsAt.getTime()
	) {
		throw new PromotionError(
			'Cannot modify start date after a promotion starts.',
			ErrorCode.VALIDATION_ERROR
		);
	}
	assertStartNotPast(data.startsAt, now);
}

function assertStartNotPast(value: number | null | undefined, now: Date) {
	if (value && value < now.getTime() - 60_000)
		throw new PromotionError('Start date cannot be in the past.', ErrorCode.VALIDATION_ERROR);
}

function validationError(message: string, issues: unknown): never {
	throw new PromotionError(message, ErrorCode.VALIDATION_ERROR, { issues });
}
function normalizePromoCode(value: string) {
	return value.trim().toUpperCase();
}
function normalizeId(value: string, field: string) {
	const normalized = value.trim();
	if (!normalized || normalized.length > 255)
		throw new PromotionError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR);
	return normalized;
}
function normalizeNullableId(value: string | null | undefined, field: string) {
	return value == null ? value : normalizeId(value, field);
}
function normalizeMoney(value: number, field: string) {
	if (!Number.isInteger(value) || value < 0)
		throw new PromotionError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR);
	return value;
}
function normalizeOptionalText(value: string | null | undefined, max: number) {
	if (value == null) return null;
	const text = value.trim().replace(/\s+/g, ' ');
	if (!text) return null;
	if (text.length > max) throw new PromotionError('Query is too long.', ErrorCode.VALIDATION_ERROR);
	return text;
}
function timestampMsToDate(value: number | null | undefined): Date | null | undefined {
	return value === undefined ? undefined : value === null ? null : new Date(value);
}
function sanitizeLikeTerm(value: string) {
	return value.replace(/[%_]/g, '');
}

function mapPromotionPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	rethrowTransientD1Error(error);
	const message = getErrorMessage(error);
	if (isUniqueConstraintError(message)) {
		if (/promo(?:tion|_code)_usage\.order_id/i.test(message))
			throw new PromotionError(
				'Promotion already used for this order.',
				ErrorCode.PROMO_ALREADY_USED
			);
		if (message.toLowerCase().includes('promotion_customer_grant'))
			throw new PromotionError('Customer already has this promotion grant.', ErrorCode.CONFLICT);
		throw new PromotionError('Promo code already exists.', ErrorCode.CONFLICT);
	}
	if (isForeignKeyConstraintError(message))
		throw new PromotionError(
			'Referenced promotion data was not found.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
	if (isCheckConstraintError(message))
		throw new PromotionError('Invalid promotion data.', ErrorCode.VALIDATION_ERROR);
	throw error;
}
