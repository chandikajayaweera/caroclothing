import { and, asc, desc, eq, gt, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode, PromotionError } from '$lib/server/modules/errors';
import {
	insertPromoCodeBaseSchema,
	promoCode,
	promoCodeUsage,
	updatePromoCodeSchema,
	type PromoCode
} from './promotions.drizzle';
import {
	assertNonEmptyUpdate,
	assertPromotionPermission,
	normalizeLimit,
	normalizeOffset,
	normalizePromoCode,
	parsePromotionInput,
	promoNotFound,
	wrapPromotionPersistenceError,
	type PromotionServiceActor
} from './service-utils';

const createPromoCodeInputSchema = insertPromoCodeBaseSchema.omit({
	id: true,
	usedCount: true,
	createdAt: true,
	updatedAt: true
});

const updatePromoCodeInputSchema = updatePromoCodeSchema.omit({
	id: true,
	usedCount: true,
	createdAt: true,
	updatedAt: true
});

const validatePromoCodeInputSchema = z.object({
	code: z.string().min(1),
	subtotal: z.number().min(0),
	userId: z.string().min(1).optional().nullable(),
	now: z.number().int().positive().optional()
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeInputSchema>;
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeInputSchema>;
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeInputSchema>;

export type PromoCodeMutationOptions = {
	actor: PromotionServiceActor;
};

export type ListPromoCodesOptions = {
	actor: PromotionServiceActor;
	includeInactive?: boolean;
	status?: 'active' | 'scheduled' | 'expired';
	search?: string;
	limit?: number;
	offset?: number;
};

export type PromoCodeValidation = {
	promoCode: PromoCode;
	discountAmount: number;
	subtotalAfterDiscount: number;
};

export type PromoCodeSnapshot = Pick<
	PromoCode,
	'code' | 'discountType' | 'discountValue' | 'maxDiscountAmount'
>;

export async function listPromoCodes(options: ListPromoCodesOptions): Promise<PromoCode[]> {
	assertPromotionPermission(options.actor, 'read');

	const filters = buildPromoCodeFilters(options);

	return getDb()
		.select()
		.from(promoCode)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(promoCode.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getPromoCodeById(
	id: string,
	options?: PromoCodeMutationOptions
): Promise<PromoCode> {
	if (options) assertPromotionPermission(options.actor, 'read');

	const [row] = await getDb().select().from(promoCode).where(eq(promoCode.id, id)).limit(1);
	if (!row) promoNotFound({ id });
	return row;
}

export async function getPromoCodeByCode(
	code: string,
	options?: PromoCodeMutationOptions
): Promise<PromoCode> {
	if (options) assertPromotionPermission(options.actor, 'read');

	const normalizedCode = normalizePromoCode(code);
	const [row] = await getDb()
		.select()
		.from(promoCode)
		.where(eq(promoCode.code, normalizedCode))
		.limit(1);

	if (!row) promoNotFound({ code: normalizedCode });
	return row;
}

export async function getPromoCodeDetailsById(id: string, options: PromoCodeMutationOptions) {
	assertPromotionPermission(options.actor, 'read');

	const row = await getDb().query.promoCode.findFirst({
		where: (codes, { eq }) => eq(codes.id, id),
		with: {
			usages: {
				orderBy: (usages, { desc }) => [desc(usages.usedAt)]
			}
		}
	});

	if (!row) promoNotFound({ id });
	return row;
}

export async function createPromoCode(
	input: CreatePromoCodeInput,
	options: PromoCodeMutationOptions
): Promise<PromoCode> {
	assertPromotionPermission(options.actor, 'create');

	const normalizedInput = { ...input, code: normalizePromoCode(input.code) };
	const parsed = parsePromotionInput(createPromoCodeInputSchema, normalizedInput, 'promo code');
	assertPromoCodeBusinessRules(parsed);
	const dbInput = normalizePromoCodeDateFields(parsed);

	try {
		const [created] = await getDb().insert(promoCode).values(dbInput).returning();
		return created;
	} catch (error) {
		wrapPromotionPersistenceError(error, 'Promo code already exists.');
	}
}

export async function updatePromoCode(
	id: string,
	input: UpdatePromoCodeInput,
	options: PromoCodeMutationOptions
): Promise<PromoCode> {
	assertPromotionPermission(options.actor, 'update');

	const current = await getPromoCodeById(id, options);
	const normalizedInput = input.code ? { ...input, code: normalizePromoCode(input.code) } : input;
	const parsed = parsePromotionInput(updatePromoCodeInputSchema, normalizedInput, 'promo code');
	assertNonEmptyUpdate(parsed, 'promo code');
	assertPromoCodeBusinessRules({ ...current, ...parsed });
	const dbInput = normalizePromoCodeDateFields(parsed);

	try {
		const [updated] = await getDb()
			.update(promoCode)
			.set(dbInput)
			.where(eq(promoCode.id, id))
			.returning();

		if (!updated) promoNotFound({ id });
		return updated;
	} catch (error) {
		wrapPromotionPersistenceError(error, 'Promo code already exists.');
	}
}

export async function activatePromoCode(
	id: string,
	options: PromoCodeMutationOptions
): Promise<PromoCode> {
	return updatePromoCode(id, { isActive: true }, options);
}

export async function deactivatePromoCode(
	id: string,
	options: PromoCodeMutationOptions
): Promise<PromoCode> {
	return updatePromoCode(id, { isActive: false }, options);
}

export async function deletePromoCode(
	id: string,
	options: PromoCodeMutationOptions
): Promise<PromoCode> {
	assertPromotionPermission(options.actor, 'delete');

	const existing = await getPromoCodeById(id, options);
	const [deleted] = await getDb().delete(promoCode).where(eq(promoCode.id, id)).returning();
	return deleted ?? existing;
}

export async function validatePromoCode(
	input: ValidatePromoCodeInput
): Promise<PromoCodeValidation> {
	const parsed = parsePromotionInput(validatePromoCodeInputSchema, input, 'promo code validation');
	const code = await getPromoCodeByCode(parsed.code);
	const now = parsed.now ?? Date.now();

	await assertPromoCodeApplicable(code, {
		subtotal: parsed.subtotal,
		userId: parsed.userId,
		now
	});

	const discountAmount = calculatePromoDiscount(code, parsed.subtotal);

	return {
		promoCode: code,
		discountAmount,
		subtotalAfterDiscount: Math.max(parsed.subtotal - discountAmount, 0)
	};
}

export async function reconcilePromoCodeUsageCount(
	id: string,
	options: PromoCodeMutationOptions
): Promise<PromoCode> {
	assertPromotionPermission(options.actor, 'update');
	await getPromoCodeById(id, options);

	const rows = await getDb()
		.select({ usageId: promoCodeUsage.id })
		.from(promoCodeUsage)
		.where(eq(promoCodeUsage.promoCodeId, id));

	const [updated] = await getDb()
		.update(promoCode)
		.set({ usedCount: rows.length })
		.where(eq(promoCode.id, id))
		.returning();

	if (!updated) promoNotFound({ id });
	return updated;
}

export function calculatePromoDiscount(code: PromoCode, subtotal: number): number {
	const rawDiscount =
		code.discountType === 'percentage' ? subtotal * (code.discountValue / 100) : code.discountValue;
	const cappedDiscount =
		code.discountType === 'percentage' && code.maxDiscountAmount != null
			? Math.min(rawDiscount, code.maxDiscountAmount)
			: rawDiscount;

	return roundMoney(Math.min(cappedDiscount, subtotal));
}

export function toPromoCodeSnapshot(code: PromoCode): PromoCodeSnapshot {
	return {
		code: code.code,
		discountType: code.discountType,
		discountValue: code.discountValue,
		maxDiscountAmount: code.maxDiscountAmount
	};
}

export async function assertPromoCodeApplicable(
	code: PromoCode,
	input: { subtotal: number; userId?: string | null; now?: number }
): Promise<void> {
	const now = input.now ?? Date.now();

	if (!code.isActive) {
		throw new PromotionError('Promo code is not active.', ErrorCode.PROMO_NOT_APPLICABLE, {
			code: code.code
		});
	}

	if (code.startsAt && code.startsAt.getTime() > now) {
		throw new PromotionError('Promo code is not active yet.', ErrorCode.PROMO_NOT_APPLICABLE, {
			code: code.code,
			startsAt: code.startsAt
		});
	}

	if (code.expiresAt && code.expiresAt.getTime() <= now) {
		throw new PromotionError('Promo code has expired.', ErrorCode.PROMO_EXPIRED, {
			code: code.code,
			expiresAt: code.expiresAt
		});
	}

	if (code.minOrderAmount != null && input.subtotal < code.minOrderAmount) {
		throw new PromotionError(
			'Order subtotal does not meet the promo minimum.',
			ErrorCode.MINIMUM_ORDER_VALUE_NOT_MET,
			{ code: code.code, minOrderAmount: code.minOrderAmount, subtotal: input.subtotal }
		);
	}

	if (code.usageLimit != null && code.usedCount >= code.usageLimit) {
		throw new PromotionError(
			'Promo usage limit has been reached.',
			ErrorCode.PROMO_USAGE_LIMIT_EXCEEDED,
			{
				code: code.code,
				usageLimit: code.usageLimit
			}
		);
	}

	if (input.userId) {
		const userUsageCount = await countPromoCodeUsageForUser(code.id, input.userId);
		if (userUsageCount >= code.perUserLimit) {
			throw new PromotionError('Promo code already used.', ErrorCode.PROMO_ALREADY_USED, {
				code: code.code,
				userId: input.userId,
				perUserLimit: code.perUserLimit
			});
		}
	}

	const discountAmount = calculatePromoDiscount(code, input.subtotal);
	if (discountAmount <= 0) {
		throw new PromotionError('Promo code is not applicable.', ErrorCode.PROMO_NOT_APPLICABLE, {
			code: code.code,
			subtotal: input.subtotal
		});
	}
}

async function countPromoCodeUsageForUser(promoCodeId: string, userId: string): Promise<number> {
	const rows = await getDb()
		.select({ id: promoCodeUsage.id })
		.from(promoCodeUsage)
		.where(and(eq(promoCodeUsage.promoCodeId, promoCodeId), eq(promoCodeUsage.userId, userId)));

	return rows.length;
}

function assertPromoCodeBusinessRules(input: {
	discountType: PromoCode['discountType'];
	discountValue: number;
	startsAt?: Date | number | null;
	expiresAt?: Date | number | null;
}): void {
	if (
		input.discountType === 'percentage' &&
		(input.discountValue <= 0 || input.discountValue > 100)
	) {
		throw new PromotionError(
			'Percentage discount must be between 1 and 100.',
			ErrorCode.VALIDATION_ERROR,
			{ discountValue: input.discountValue }
		);
	}

	const startsAt = input.startsAt instanceof Date ? input.startsAt.getTime() : input.startsAt;
	const expiresAt = input.expiresAt instanceof Date ? input.expiresAt.getTime() : input.expiresAt;

	if (startsAt && expiresAt && expiresAt <= startsAt) {
		throw new PromotionError('expiresAt must be after startsAt.', ErrorCode.VALIDATION_ERROR, {
			startsAt,
			expiresAt
		});
	}
}

function normalizePromoCodeDateFields<
	T extends { startsAt?: number | Date | null; expiresAt?: number | Date | null }
>(input: T) {
	return {
		...input,
		startsAt: normalizeTimestampValue(input.startsAt),
		expiresAt: normalizeTimestampValue(input.expiresAt)
	};
}

function normalizeTimestampValue(value: number | Date | null | undefined) {
	if (typeof value === 'number') return new Date(value);
	return value;
}

function buildPromoCodeFilters(options: ListPromoCodesOptions): SQL[] {
	const filters: SQL[] = [];
	const now = new Date();

	if (!options.includeInactive) filters.push(eq(promoCode.isActive, true));
	if (options.search) filters.push(like(promoCode.code, `%${normalizePromoCode(options.search)}%`));

	if (options.status === 'active') {
		filters.push(eq(promoCode.isActive, true));
		filters.push(or(sql`${promoCode.startsAt} IS NULL`, lt(promoCode.startsAt, now))!);
		filters.push(or(sql`${promoCode.expiresAt} IS NULL`, gt(promoCode.expiresAt, now))!);
	}

	if (options.status === 'scheduled') {
		filters.push(gt(promoCode.startsAt, now));
	}

	if (options.status === 'expired') {
		filters.push(lt(promoCode.expiresAt, now));
	}

	return filters;
}

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}
