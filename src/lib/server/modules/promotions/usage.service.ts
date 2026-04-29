import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { ErrorCode, PromotionError } from '$lib/server/modules/errors';
import {
	insertPromoCodeUsageSchema,
	promoCode,
	promoCodeUsage,
	type PromoCode,
	type PromoCodeUsage
} from './promotions.drizzle';
import {
	assertPromoCodeApplicable,
	calculatePromoDiscount,
	getPromoCodeById,
	getPromoCodeByCode
} from './code.service';
import {
	assertPromotionPermission,
	normalizeLimit,
	normalizeOffset,
	parsePromotionInput,
	promoUsageNotFound,
	wrapPromotionPersistenceError,
	type PromotionServiceActor
} from './service-utils';

const createPromoCodeUsageInputSchema = insertPromoCodeUsageSchema.omit({
	id: true,
	usedAt: true
});

const redeemPromoCodeInputSchema = z.object({
	code: z.string().min(1),
	subtotal: z.number().min(0),
	orderId: z.string().min(1),
	userId: z.string().min(1).optional().nullable(),
	now: z.number().int().positive().optional()
});

export type CreatePromoCodeUsageInput = z.infer<typeof createPromoCodeUsageInputSchema>;
export type RedeemPromoCodeInput = z.infer<typeof redeemPromoCodeInputSchema>;

export type PromoCodeUsageMutationOptions = {
	actor: PromotionServiceActor;
};

export type ListPromoCodeUsagesOptions = {
	actor: PromotionServiceActor;
	promoCodeId?: string;
	userId?: string | null;
	orderId?: string;
	limit?: number;
	offset?: number;
};

export type PromoCodeRedemption = {
	promoCode: PromoCode;
	usage: PromoCodeUsage;
	discountAmount: number;
};

export async function listPromoCodeUsages(
	options: ListPromoCodeUsagesOptions
): Promise<PromoCodeUsage[]> {
	assertPromotionPermission(options.actor, 'read');

	const filters = buildUsageFilters(options);

	return getDb()
		.select()
		.from(promoCodeUsage)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(promoCodeUsage.usedAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getPromoCodeUsageById(
	id: string,
	options: PromoCodeUsageMutationOptions
): Promise<PromoCodeUsage> {
	assertPromotionPermission(options.actor, 'read');

	const [row] = await getDb()
		.select()
		.from(promoCodeUsage)
		.where(eq(promoCodeUsage.id, id))
		.limit(1);

	if (!row) promoUsageNotFound({ id });
	return row;
}

export async function createPromoCodeUsage(
	input: CreatePromoCodeUsageInput,
	options: PromoCodeUsageMutationOptions
): Promise<PromoCodeUsage> {
	assertPromotionPermission(options.actor, 'create');

	const parsed = parsePromotionInput(createPromoCodeUsageInputSchema, input, 'promo code usage');
	const code = await getPromoCodeById(parsed.promoCodeId, options);

	try {
		return getDb().transaction(async (tx) => {
			const [created] = await tx.insert(promoCodeUsage).values(parsed).returning();

			await tx
				.update(promoCode)
				.set({ usedCount: code.usedCount + 1 })
				.where(eq(promoCode.id, code.id));

			return created;
		});
	} catch (error) {
		wrapPromotionPersistenceError(error, 'Unable to create promo usage.');
	}
}

export async function redeemPromoCode(input: RedeemPromoCodeInput): Promise<PromoCodeRedemption> {
	const parsed = parsePromotionInput(redeemPromoCodeInputSchema, input, 'promo redemption');
	const code = await getPromoCodeByCode(parsed.code);
	const now = parsed.now ?? Date.now();

	await assertPromoCodeApplicable(code, {
		subtotal: parsed.subtotal,
		userId: parsed.userId,
		now
	});

	const discountAmount = calculatePromoDiscount(code, parsed.subtotal);

	try {
		return getDb().transaction(async (tx) => {
			const [freshCode] = await tx
				.select()
				.from(promoCode)
				.where(eq(promoCode.id, code.id))
				.limit(1);

			if (!freshCode) {
				throw new PromotionError('Promo code not found.', ErrorCode.PROMO_NOT_FOUND, {
					code: parsed.code
				});
			}

			const [existingOrderUsage] = await tx
				.select({ id: promoCodeUsage.id })
				.from(promoCodeUsage)
				.where(eq(promoCodeUsage.orderId, parsed.orderId))
				.limit(1);

			if (existingOrderUsage) {
				throw new PromotionError(
					'Promo code already used for this order.',
					ErrorCode.PROMO_ALREADY_USED,
					{
						orderId: parsed.orderId
					}
				);
			}

			await assertPromoCodeApplicable(freshCode, {
				subtotal: parsed.subtotal,
				userId: parsed.userId,
				now
			});

			const [usage] = await tx
				.insert(promoCodeUsage)
				.values({
					promoCodeId: freshCode.id,
					userId: parsed.userId ?? null,
					orderId: parsed.orderId,
					discountAmount
				})
				.returning();

			const [updatedCode] = await tx
				.update(promoCode)
				.set({ usedCount: freshCode.usedCount + 1 })
				.where(eq(promoCode.id, freshCode.id))
				.returning();

			return {
				promoCode: updatedCode ?? freshCode,
				usage,
				discountAmount
			};
		});
	} catch (error) {
		wrapPromotionPersistenceError(error, 'Unable to redeem promo code.');
	}
}

export async function deletePromoCodeUsage(
	id: string,
	options: PromoCodeUsageMutationOptions & { decrementUsedCount?: boolean }
): Promise<PromoCodeUsage> {
	assertPromotionPermission(options.actor, 'delete');

	const existing = await getPromoCodeUsageById(id, options);

	return getDb().transaction(async (tx) => {
		const [deleted] = await tx.delete(promoCodeUsage).where(eq(promoCodeUsage.id, id)).returning();
		if (!deleted) promoUsageNotFound({ id });

		if (options.decrementUsedCount !== false) {
			const [code] = await tx
				.select()
				.from(promoCode)
				.where(eq(promoCode.id, existing.promoCodeId))
				.limit(1);

			if (code) {
				await tx
					.update(promoCode)
					.set({ usedCount: Math.max(code.usedCount - 1, 0) })
					.where(eq(promoCode.id, code.id));
			}
		}

		return deleted;
	});
}

export async function getPromoCodeUsageCount(
	promoCodeId: string,
	options: PromoCodeUsageMutationOptions
): Promise<number> {
	assertPromotionPermission(options.actor, 'read');

	const rows = await getDb()
		.select({ id: promoCodeUsage.id })
		.from(promoCodeUsage)
		.where(eq(promoCodeUsage.promoCodeId, promoCodeId));

	return rows.length;
}

function buildUsageFilters(options: ListPromoCodeUsagesOptions): SQL[] {
	const filters: SQL[] = [];

	if (options.promoCodeId) filters.push(eq(promoCodeUsage.promoCodeId, options.promoCodeId));
	if (options.userId === null) filters.push(sql`${promoCodeUsage.userId} IS NULL`);
	if (typeof options.userId === 'string') filters.push(eq(promoCodeUsage.userId, options.userId));
	if (options.orderId) filters.push(eq(promoCodeUsage.orderId, options.orderId));

	return filters;
}
