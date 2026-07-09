import { and, asc, count, desc, eq, inArray, isNull, like, sql, type SQL } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { requireAdmin } from '$lib/server/foundation/guards';
import {
	ErrorCode,
	PromotionError,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import type { ServiceContext } from '$lib/server/foundation/context';
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
import { order as orderTable, type Order } from '../orders/orders.drizzle';
import {
	insertPromoCodeSchema,
	insertPromoCodeUsageSchema,
	promoCode,
	promoCodeUsage,
	updatePromoCodeSchema,
	type InsertPromoCode,
	type NewPromoCode,
	type PromoCode,
	type PromoCodeUsage,
	type UpdatePromoCode
} from './promotions.drizzle';
import type {
	CreatePromoCodeInput,
	ListPromoCodeUsagesOptions,
	ListPromoCodesOptions,
	PromoCodeDTO,
	PromoCodeListResult,
	PromoCodeLookup,
	PromoCodeSnapshot,
	PromoCodeStatus,
	PromoCodeSummaryDTO,
	PromoCodeUsageDTO,
	PromoCodeUsageListResult,
	PromoUsageReconciliationFailure,
	PromoUsageReconciliationItem,
	PromoUsageReconciliationResult,
	PromoValidationResult,
	ReconcilePromoCodeUsageCountInput,
	ReconcilePromoCodeUsageCountsInput,
	RecordPromoUsageInput,
	SetPromoCodeActiveInput,
	UpdatePromoCodeInput,
	ValidatePromoCodeForBagInput
} from './promotions.types';

type Db = ReturnType<typeof getDb>;
export type PromotionsTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | PromotionsTx;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const RECONCILE_DEFAULT_LIMIT = 100;
const RECONCILE_MAX_LIMIT = 500;

export async function createPromoCode(
	ctx: ServiceContext,
	input: CreatePromoCodeInput
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const data = parseCreatePromoCode(input, now);

	try {
		const [row] = await getDb().insert(promoCode).values(toNewPromoCodeValues(data)).returning();

		if (!row) {
			throw new PromotionError('Promo code was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return toPromoCodeDTO(row, now);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function getPromoCode(
	ctx: ServiceContext,
	input: { lookup: PromoCodeLookup }
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const row = await loadPromoCodeByLookupTx(getDb(), input.lookup);

	if (!row) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			lookup: input.lookup
		});
	}

	return toPromoCodeDTO(row, now);
}

export async function listPromoCodes(
	ctx: ServiceContext,
	options: ListPromoCodesOptions = {}
): Promise<PromoCodeListResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildPromoCodeListWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(promoCode);
	const listQuery = db
		.select()
		.from(promoCode)
		.orderBy(desc(promoCode.updatedAt), asc(promoCode.code))
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		where ? countQuery.where(where) : countQuery,
		where ? listQuery.where(where) : listQuery
	]);

	return {
		items: rows.map((row) => toPromoCodeDTO(row, now)),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function updatePromoCode(
	ctx: ServiceContext,
	input: { lookup: PromoCodeLookup; data: UpdatePromoCodeInput }
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const existing = await loadPromoCodeByLookupTx(getDb(), input.lookup);

	if (!existing) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			lookup: input.lookup
		});
	}

	const data = parseUpdatePromoCode(input.data, existing, now);
	const updateValues = toPromoCodeUpdateValues(data, now);

	if (Object.keys(updateValues).length === 0) {
		return toPromoCodeDTO(existing, now);
	}

	try {
		const [row] = await getDb()
			.update(promoCode)
			.set(updateValues)
			.where(eq(promoCode.id, existing.id))
			.returning();

		if (!row) {
			throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
				promoCodeId: existing.id
			});
		}

		return toPromoCodeDTO(row, now);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function setPromoCodeActive(
	ctx: ServiceContext,
	input: SetPromoCodeActiveInput
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx);
	const existing = await loadPromoCodeByLookupTx(getDb(), input.lookup);

	if (!existing) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			lookup: input.lookup
		});
	}

	if (existing.isActive === input.isActive) {
		return toPromoCodeDTO(existing, now);
	}

	try {
		const [row] = await getDb()
			.update(promoCode)
			.set({ isActive: input.isActive, updatedAt: now })
			.where(eq(promoCode.id, existing.id))
			.returning();

		if (!row) {
			throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
				promoCodeId: existing.id
			});
		}

		return toPromoCodeDTO(row, now);
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function validatePromoCodeForBag(
	input: ValidatePromoCodeForBagInput
): Promise<PromoValidationResult> {
	return validatePromoCodeForBagTx(getDb(), input);
}

export async function listPromoCodeUsages(
	ctx: ServiceContext,
	options: ListPromoCodeUsagesOptions = {}
): Promise<PromoCodeUsageListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildPromoCodeUsageListWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(promoCodeUsage);
	const listQuery = db
		.select()
		.from(promoCodeUsage)
		.orderBy(desc(promoCodeUsage.usedAt))
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		where ? countQuery.where(where) : countQuery,
		where ? listQuery.where(where) : listQuery
	]);
	const promoCodesById = await loadPromoCodeSummariesByIdTx(
		db,
		rows.map((row) => row.promoCodeId)
	);

	return {
		items: rows.map((row) => toPromoCodeUsageDTO(row, promoCodesById.get(row.promoCodeId) ?? null)),
		total: Number(totalRows[0]?.total ?? 0),
		limit,
		offset
	};
}

export async function recordPromoUsage(
	ctx: ServiceContext,
	input: RecordPromoUsageInput
): Promise<PromoCodeUsageDTO> {
	requireAdmin(ctx.actor);

	try {
		return await getDb().transaction(async (tx) => recordPromoUsageTx(tx, input));
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function reconcilePromoCodeUsageCount(
	ctx: ServiceContext,
	input: ReconcilePromoCodeUsageCountInput
): Promise<PromoCodeDTO> {
	requireAdmin(ctx.actor);
	const now = resolveNow(ctx, input.now);

	try {
		return await getDb().transaction((tx) => reconcilePromoCodeUsageCountTx(tx, { ...input, now }));
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export async function reconcilePromoCodeUsageCounts(
	ctx: ServiceContext,
	input: ReconcilePromoCodeUsageCountsInput = {}
): Promise<PromoUsageReconciliationResult> {
	requireAdmin(ctx.actor);

	const now = resolveNow(ctx);
	const limit = normalizeLimit(input.limit, RECONCILE_DEFAULT_LIMIT, RECONCILE_MAX_LIMIT);
	const offset = normalizeOffset(input.offset);

	try {
		const db = getDb();
		const rows = await db
			.select()
			.from(promoCode)
			.orderBy(asc(promoCode.code), asc(promoCode.id))
			.limit(limit)
			.offset(offset);
		const totalRows = await db.select({ total: count() }).from(promoCode);
		const items: PromoUsageReconciliationItem[] = [];
		const failedItems: PromoUsageReconciliationFailure[] = [];

		for (const row of rows) {
			try {
				items.push(
					await db.transaction(async (tx) => reconcilePromoCodeUsageCountByIdTx(tx, row.id, now))
				);
			} catch (error) {
				failedItems.push({
					promoCodeId: row.id,
					code: row.code,
					error: getErrorMessage(error)
				});
				console.error(`[promotions] Failed to reconcile promo code ${row.id}:`, error);
			}
		}

		const changedCount = items.filter((item) => item.changed).length;
		const total = Number(totalRows[0]?.total ?? 0);

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
	} catch (error) {
		throw mapPromotionPersistenceError(error);
	}
}

export function createPromoCodeSnapshot(input: { promoCode: PromoCodeDTO }): PromoCodeSnapshot {
	return {
		code: input.promoCode.code,
		discountType: input.promoCode.discountType,
		discountValue: input.promoCode.discountValue
	};
}

export async function validatePromoCodeForBagTx(
	tx: QueryExecutor,
	input: ValidatePromoCodeForBagInput
): Promise<PromoValidationResult> {
	const code = normalizePromoCode(input.code);
	const subtotal = normalizeMoney(input.subtotal, 'subtotal');
	const userId = normalizeNullableId(input.userId, 'userId');
	const now = input.now ?? new Date();
	const row = await loadPromoCodeByCodeTx(tx, code);

	if (!row || !row.isActive) {
		throw new PromotionError('Invalid or inactive promo code.', ErrorCode.PROMO_NOT_FOUND, {
			code
		});
	}

	return validatePromoCodeRowForBagTx(tx, row, { subtotal, userId, now });
}

export async function recordPromoUsageTx(
	tx: PromotionsTx,
	input: RecordPromoUsageInput
): Promise<PromoCodeUsageDTO> {
	const data = parseRecordPromoUsageInput(input);
	const orderRow = await loadOrderByIdTx(tx, data.orderId);

	if (!orderRow) {
		throw new PromotionError('Order not found.', ErrorCode.ORDER_NOT_FOUND, {
			orderId: data.orderId
		});
	}

	if (orderRow.promoCodeId !== data.promoCodeId) {
		throw new PromotionError(
			'Promo code does not match the order.',
			ErrorCode.PROMO_NOT_APPLICABLE,
			{
				orderId: data.orderId,
				promoCodeId: data.promoCodeId,
				orderPromoCodeId: orderRow.promoCodeId
			}
		);
	}

	if (orderRow.discountAmount !== data.discountAmount) {
		throw new PromotionError(
			'Promo discount does not match the order.',
			ErrorCode.PROMO_NOT_APPLICABLE,
			{
				orderId: data.orderId,
				discountAmount: data.discountAmount,
				orderDiscountAmount: orderRow.discountAmount
			}
		);
	}

	const promoRow = await loadPromoCodeByIdTx(tx, data.promoCodeId);
	if (!promoRow) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			promoCodeId: data.promoCodeId
		});
	}

	const validation = await validatePromoCodeRowForBagTx(tx, promoRow, {
		subtotal: orderRow.subtotal,
		userId: data.userId ?? orderRow.userId,
		now: data.now
	});

	if (validation.discountAmount !== data.discountAmount) {
		throw new PromotionError(
			'Promo discount does not match current promo rules.',
			ErrorCode.PROMO_NOT_APPLICABLE,
			{
				promoCodeId: data.promoCodeId,
				discountAmount: data.discountAmount,
				expectedDiscountAmount: validation.discountAmount
			}
		);
	}

	const updatedPromo = await incrementPromoUsedCountTx(tx, promoRow, data.now);
	const [created] = await tx
		.insert(promoCodeUsage)
		.values({
			promoCodeId: data.promoCodeId,
			userId: data.userId ?? orderRow.userId,
			orderId: data.orderId,
			discountAmount: data.discountAmount,
			usedAt: data.now
		})
		.returning();

	if (!created) {
		throw new PromotionError('Promo usage was not recorded.', ErrorCode.INTERNAL_ERROR);
	}

	return toPromoCodeUsageDTO(created, {
		id: updatedPromo.id,
		code: updatedPromo.code
	});
}

export async function reconcilePromoCodeUsageCountTx(
	tx: PromotionsTx,
	input: ReconcilePromoCodeUsageCountInput
): Promise<PromoCodeDTO> {
	const now = input.now ?? new Date();
	const row = await loadPromoCodeByLookupTx(tx, input.lookup);

	if (!row) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			lookup: input.lookup
		});
	}

	const result = await reconcilePromoCodeUsageCountForRowTx(tx, row, now);
	return result.promoCode;
}

async function validatePromoCodeRowForBagTx(
	tx: QueryExecutor,
	row: PromoCode,
	input: { subtotal: number; userId: string | null | undefined; now: Date }
): Promise<PromoValidationResult> {
	assertPromoCodeRedeemable(row, input);

	if (input.userId) {
		const userUsageCount = await countPromoCodeUsagesForUserTx(tx, row.id, input.userId);
		if (userUsageCount >= row.perUserLimit) {
			throw new PromotionError(
				`You have already used promo ${row.code}.`,
				ErrorCode.PROMO_ALREADY_USED,
				{
					promoCodeId: row.id,
					userId: input.userId,
					perUserLimit: row.perUserLimit
				}
			);
		}
	}

	const discountAmount = calculateDiscountAmount(row, input.subtotal);
	if (discountAmount <= 0) {
		throw new PromotionError(
			`Promo ${row.code} cannot be applied to this bag.`,
			ErrorCode.PROMO_NOT_APPLICABLE,
			{
				promoCodeId: row.id,
				subtotal: input.subtotal
			}
		);
	}

	const dto = toPromoCodeDTO(row, input.now);

	return {
		promoCodeId: row.id,
		code: row.code,
		discountAmount,
		subtotal: input.subtotal,
		totalAfterDiscount: Math.max(input.subtotal - discountAmount, 0),
		snapshot: createPromoCodeSnapshot({ promoCode: dto })
	};
}

function assertPromoCodeRedeemable(row: PromoCode, input: { subtotal: number; now: Date }): void {
	if (!row.isActive) {
		throw new PromotionError('Invalid or inactive promo code.', ErrorCode.PROMO_NOT_FOUND, {
			promoCodeId: row.id
		});
	}

	if (row.startsAt && row.startsAt > input.now) {
		throw new PromotionError(
			`Promo ${row.code} is not active yet.`,
			ErrorCode.PROMO_NOT_APPLICABLE,
			{
				promoCodeId: row.id,
				startsAt: row.startsAt,
				now: input.now
			}
		);
	}

	if (row.expiresAt && row.expiresAt <= input.now) {
		throw new PromotionError(`Promo ${row.code} has expired.`, ErrorCode.PROMO_EXPIRED, {
			promoCodeId: row.id,
			expiresAt: row.expiresAt,
			now: input.now
		});
	}

	if (row.usageLimit !== null && row.usedCount >= row.usageLimit) {
		throw new PromotionError(
			`Promo ${row.code} usage limit reached.`,
			ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED,
			{
				promoCodeId: row.id,
				usageLimit: row.usageLimit,
				usedCount: row.usedCount
			}
		);
	}

	if (row.minOrderAmount !== null && input.subtotal < row.minOrderAmount) {
		throw new PromotionError(
			`Promo ${row.code} requires min. LKR ${row.minOrderAmount.toLocaleString()}`,
			ErrorCode.MINIMUM_ORDER_VALUE_NOT_MET,
			{
				promoCodeId: row.id,
				subtotal: input.subtotal,
				minOrderAmount: row.minOrderAmount
			}
		);
	}
}

async function incrementPromoUsedCountTx(
	tx: PromotionsTx,
	row: PromoCode,
	now: Date
): Promise<PromoCode> {
	const conditions = [eq(promoCode.id, row.id)];

	if (row.usageLimit !== null) {
		conditions.push(sql`${promoCode.usedCount} < ${row.usageLimit}`);
	}

	const [updated] = await tx
		.update(promoCode)
		.set({
			usedCount: sql<number>`${promoCode.usedCount} + 1`,
			updatedAt: now
		})
		.where(and(...conditions))
		.returning();

	if (!updated) {
		throw new PromotionError(
			'Promo code usage limit exceeded.',
			ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED,
			{
				promoCodeId: row.id,
				usageLimit: row.usageLimit
			}
		);
	}

	return updated;
}

async function reconcilePromoCodeUsageCountForRowTx(
	tx: PromotionsTx,
	row: PromoCode,
	now: Date
): Promise<PromoUsageReconciliationItem> {
	const actualUsedCount = await countPromoCodeUsagesTx(tx, row.id);
	const changed = actualUsedCount !== row.usedCount;
	const promoCodeRow = changed
		? await updatePromoCodeUsedCountTx(tx, row, actualUsedCount, now)
		: row;

	return {
		promoCodeId: row.id,
		code: row.code,
		previousUsedCount: row.usedCount,
		actualUsedCount,
		changed,
		promoCode: toPromoCodeDTO(promoCodeRow, now)
	};
}

async function reconcilePromoCodeUsageCountByIdTx(
	tx: PromotionsTx,
	promoCodeId: string,
	now: Date
): Promise<PromoUsageReconciliationItem> {
	const row = await loadPromoCodeByLookupTx(tx, { id: promoCodeId });
	if (!row) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			promoCodeId
		});
	}

	return reconcilePromoCodeUsageCountForRowTx(tx, row, now);
}

async function updatePromoCodeUsedCountTx(
	tx: PromotionsTx,
	row: PromoCode,
	usedCount: number,
	now: Date
): Promise<PromoCode> {
	const [updated] = await tx
		.update(promoCode)
		.set({ usedCount, updatedAt: now })
		.where(eq(promoCode.id, row.id))
		.returning();

	if (!updated) {
		throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
			promoCodeId: row.id
		});
	}

	return updated;
}

async function loadPromoCodeByLookupTx(
	tx: QueryExecutor,
	lookup: PromoCodeLookup
): Promise<PromoCode | null> {
	const [row] = await tx.select().from(promoCode).where(promoCodeLookupPredicate(lookup)).limit(1);

	return row ?? null;
}

async function loadPromoCodeByIdTx(
	tx: QueryExecutor,
	promoCodeId: string
): Promise<PromoCode | null> {
	const [row] = await tx
		.select()
		.from(promoCode)
		.where(eq(promoCode.id, normalizeId(promoCodeId, 'promoCodeId')))
		.limit(1);

	return row ?? null;
}

async function loadPromoCodeByCodeTx(tx: QueryExecutor, code: string): Promise<PromoCode | null> {
	const [row] = await tx.select().from(promoCode).where(eq(promoCode.code, code)).limit(1);

	return row ?? null;
}

async function loadOrderByIdTx(tx: QueryExecutor, orderId: string): Promise<Order | null> {
	const [row] = await tx.select().from(orderTable).where(eq(orderTable.id, orderId)).limit(1);

	return row ?? null;
}

async function loadPromoCodeSummariesByIdTx(
	tx: QueryExecutor,
	promoCodeIds: string[]
): Promise<Map<string, PromoCodeSummaryDTO>> {
	const uniqueIds = uniqueStrings(promoCodeIds);
	if (uniqueIds.length === 0) return new Map();

	const rows = await tx
		.select({ id: promoCode.id, code: promoCode.code })
		.from(promoCode)
		.where(inArray(promoCode.id, uniqueIds));

	return new Map(rows.map((row) => [row.id, row]));
}

async function countPromoCodeUsagesTx(tx: QueryExecutor, promoCodeId: string): Promise<number> {
	const [row] = await tx
		.select({ total: count() })
		.from(promoCodeUsage)
		.where(eq(promoCodeUsage.promoCodeId, promoCodeId));

	return Number(row?.total ?? 0);
}

async function countPromoCodeUsagesForUserTx(
	tx: QueryExecutor,
	promoCodeId: string,
	userId: string
): Promise<number> {
	const [row] = await tx
		.select({ total: count() })
		.from(promoCodeUsage)
		.where(and(eq(promoCodeUsage.promoCodeId, promoCodeId), eq(promoCodeUsage.userId, userId)));

	return Number(row?.total ?? 0);
}

function parseCreatePromoCode(input: CreatePromoCodeInput, now: Date): InsertPromoCode {
	const result = insertPromoCodeSchema.safeParse({
		...input,
		code: normalizePromoCode(input.code),
		isActive: false,
		usedCount: 0
	});

	if (!result.success) {
		throw new PromotionError('Invalid promo code data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	if (result.data.startsAt && result.data.startsAt < now.getTime() - 60000) {
		throw new PromotionError('Start date cannot be in the past.', ErrorCode.VALIDATION_ERROR, {
			startsAt: result.data.startsAt
		});
	}

	return result.data;
}

function parseUpdatePromoCode(
	input: UpdatePromoCodeInput,
	existing: PromoCode,
	now: Date
): UpdatePromoCode {
	const {
		isActive: ignoredIsActive,
		usedCount: ignoredUsedCount,
		...rawData
	} = input as UpdatePromoCode & {
		isActive?: unknown;
		usedCount?: unknown;
	};
	void ignoredIsActive;
	void ignoredUsedCount;

	const candidate = {
		...rawData,
		...(typeof rawData.code === 'string' ? { code: normalizePromoCode(rawData.code) } : {})
	};
	const result = updatePromoCodeSchema.safeParse(candidate);

	if (!result.success) {
		throw new PromotionError('Invalid promo code data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	validateResolvedPromoCodeWindow(existing, result.data, now);

	return result.data;
}

function parseRecordPromoUsageInput(input: RecordPromoUsageInput): {
	promoCodeId: string;
	orderId: string;
	userId: string | null;
	discountAmount: number;
	now: Date;
} {
	const candidate = {
		promoCodeId: normalizeId(input.promoCodeId, 'promoCodeId'),
		orderId: normalizeId(input.orderId, 'orderId'),
		userId: normalizeNullableId(input.userId, 'userId'),
		discountAmount: input.discountAmount
	};
	const result = insertPromoCodeUsageSchema.safeParse(candidate);

	if (!result.success) {
		throw new PromotionError('Invalid promo usage data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		...result.data,
		userId: result.data.userId ?? null,
		now: input.now ?? new Date()
	};
}

function toNewPromoCodeValues(data: InsertPromoCode): NewPromoCode {
	return removeUndefinedValues({
		code: data.code,
		description: data.description ?? null,
		discountType: data.discountType,
		discountValue: data.discountValue,
		minOrderAmount: data.minOrderAmount ?? null,
		maxDiscountAmount: data.maxDiscountAmount ?? null,
		usageLimit: data.usageLimit ?? null,
		usedCount: data.usedCount ?? 0,
		perUserLimit: data.perUserLimit,
		isActive: false,
		startsAt: timestampMsToDate(data.startsAt),
		expiresAt: timestampMsToDate(data.expiresAt)
	}) as NewPromoCode;
}

function toPromoCodeUpdateValues(data: UpdatePromoCode, now: Date): Partial<NewPromoCode> {
	return removeUndefinedValues({
		code: data.code,
		description: data.description,
		discountType: data.discountType,
		discountValue: data.discountValue,
		minOrderAmount: data.minOrderAmount,
		maxDiscountAmount: data.maxDiscountAmount,
		usageLimit: data.usageLimit,
		perUserLimit: data.perUserLimit,
		startsAt: timestampMsToDate(data.startsAt),
		expiresAt: timestampMsToDate(data.expiresAt),
		updatedAt: now
	}) as Partial<NewPromoCode>;
}

function validateResolvedPromoCodeWindow(
	existing: PromoCode,
	data: UpdatePromoCode,
	now: Date
): void {
	const startsAt =
		data.startsAt === undefined ? existing.startsAt : (timestampMsToDate(data.startsAt) ?? null);
	const expiresAt =
		data.expiresAt === undefined ? existing.expiresAt : (timestampMsToDate(data.expiresAt) ?? null);

	if (startsAt && expiresAt && expiresAt <= startsAt) {
		throw new PromotionError('expiresAt must be after startsAt.', ErrorCode.VALIDATION_ERROR, {
			startsAt,
			expiresAt
		});
	}

	if (data.startsAt !== undefined) {
		const newStartsAt = timestampMsToDate(data.startsAt);
		const existingTime = existing.startsAt?.getTime();
		const newTime = newStartsAt?.getTime();

		if (newTime !== existingTime) {
			if (existing.startsAt && existing.startsAt.getTime() < now.getTime()) {
				throw new PromotionError(
					'Cannot modify start date of a promotion that has already started.',
					ErrorCode.VALIDATION_ERROR,
					{
						existingStartsAt: existing.startsAt,
						requestedStartsAt: newStartsAt
					}
				);
			}
			if (newTime && newTime < now.getTime() - 60000) {
				throw new PromotionError(
					'Start date cannot be set in the past.',
					ErrorCode.VALIDATION_ERROR,
					{
						requestedStartsAt: newStartsAt
					}
				);
			}
		}
	}
}

function toPromoCodeDTO(row: PromoCode, now: Date): PromoCodeDTO {
	return {
		id: row.id,
		code: row.code,
		description: row.description,
		discountType: row.discountType,
		discountValue: row.discountValue,
		minOrderAmount: row.minOrderAmount,
		maxDiscountAmount: row.maxDiscountAmount,
		usageLimit: row.usageLimit,
		usedCount: row.usedCount,
		remainingUses: row.usageLimit === null ? null : Math.max(row.usageLimit - row.usedCount, 0),
		perUserLimit: row.perUserLimit,
		isActive: row.isActive,
		startsAt: row.startsAt,
		expiresAt: row.expiresAt,
		status: promoCodeStatus(row, now),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function toPromoCodeUsageDTO(
	row: PromoCodeUsage,
	promoCodeSummary: PromoCodeSummaryDTO | null
): PromoCodeUsageDTO {
	return {
		id: row.id,
		promoCodeId: row.promoCodeId,
		promoCode: promoCodeSummary,
		userId: row.userId,
		orderId: row.orderId,
		discountAmount: row.discountAmount,
		usedAt: row.usedAt
	};
}

function promoCodeStatus(row: PromoCode, now: Date): PromoCodeStatus {
	if (!row.isActive) return 'inactive';
	if (row.startsAt && row.startsAt > now) return 'scheduled';
	if (row.expiresAt && row.expiresAt <= now) return 'expired';
	if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return 'exhausted';
	return 'active';
}

function calculateDiscountAmount(row: PromoCode, subtotal: number): number {
	const rawDiscount =
		row.discountType === 'percentage'
			? Math.floor((subtotal * row.discountValue) / 100)
			: row.discountValue;
	const cappedByMaxDiscount =
		row.maxDiscountAmount === null ? rawDiscount : Math.min(rawDiscount, row.maxDiscountAmount);

	return Math.min(cappedByMaxDiscount, subtotal);
}

function buildPromoCodeListWhere(options: ListPromoCodesOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (typeof options.isActive === 'boolean') {
		conditions.push(eq(promoCode.isActive, options.isActive));
	} else if (options.includeInactive === false) {
		conditions.push(eq(promoCode.isActive, true));
	}

	const query = normalizeOptionalText(options.query, 'query', 120);
	if (query) {
		conditions.push(like(promoCode.code, `%${sanitizeLikeTerm(query.toUpperCase())}%`));
	}

	if (conditions.length === 0) return undefined;
	return and(...conditions);
}

function buildPromoCodeUsageListWhere(options: ListPromoCodeUsagesOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.promoCodeId) {
		conditions.push(
			eq(promoCodeUsage.promoCodeId, normalizeId(options.promoCodeId, 'promoCodeId'))
		);
	}

	if (options.userId !== undefined) {
		if (options.userId === null) {
			conditions.push(isNull(promoCodeUsage.userId));
		} else {
			conditions.push(eq(promoCodeUsage.userId, normalizeId(options.userId, 'userId')));
		}
	}

	if (options.orderId) {
		conditions.push(eq(promoCodeUsage.orderId, normalizeId(options.orderId, 'orderId')));
	}

	if (conditions.length === 0) return undefined;
	return and(...conditions);
}

function promoCodeLookupPredicate(lookup: PromoCodeLookup): SQL {
	const entries = [
		'id' in lookup && lookup.id ? ['id', normalizeId(lookup.id, 'promoCodeId')] : null,
		'code' in lookup && lookup.code ? ['code', normalizePromoCode(lookup.code)] : null
	].filter((entry): entry is ['id' | 'code', string] => entry !== null);

	if (entries.length !== 1) {
		throw new PromotionError(
			'Provide exactly one promo code lookup field.',
			ErrorCode.VALIDATION_ERROR,
			{ lookup }
		);
	}

	const [field, value] = entries[0];

	if (field === 'id') return eq(promoCode.id, value);
	return eq(promoCode.code, value);
}

function normalizePromoCode(value: string): string {
	return value.trim().toUpperCase();
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new PromotionError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function normalizeNullableId(
	value: string | null | undefined,
	field: string
): string | null | undefined {
	if (value === undefined || value === null) return value;
	return normalizeId(value, field);
}

function normalizeMoney(value: number, field: string): number {
	if (!Number.isInteger(value) || value < 0) {
		throw new PromotionError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return value;
}

function normalizeOptionalText(
	value: string | null | undefined,
	field: string,
	maxLength: number
): string | null {
	if (value == null) return null;

	const normalized = value.trim().replace(/\s+/g, ' ');
	if (!normalized) return null;

	if (normalized.length > maxLength) {
		throw new PromotionError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			field,
			maxLength
		});
	}

	return normalized;
}

function timestampMsToDate(value: number | null | undefined): Date | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return new Date(value);
}

function sanitizeLikeTerm(value: string): string {
	return value.replace(/[%_]/g, '');
}

function mapPromotionPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		if (message.toLowerCase().includes('promo_code_usage.order_id')) {
			throw new PromotionError(
				'Promo code already used for this order.',
				ErrorCode.PROMO_ALREADY_USED
			);
		}

		throw new PromotionError('Promo code already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new PromotionError(
			'Referenced promo data was not found.',
			ErrorCode.PROMO_NOT_APPLICABLE
		);
	}

	if (isCheckConstraintError(message)) {
		throw new PromotionError('Invalid promo data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}
