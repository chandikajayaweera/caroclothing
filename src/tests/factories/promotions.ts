import { nanoid } from 'nanoid';
import {
	promoCode,
	promoCodeUsage,
	type PromoCode,
	type PromoCodeUsage
} from '$lib/server/modules/promotions/promotions.drizzle';
import type { CreatePromoCodeInput } from '$lib/server/modules/promotions/promotions.types';
import type { TestDatabase } from '../db';

export function promoCodeInput(
	overrides: Partial<CreatePromoCodeInput> = {}
): CreatePromoCodeInput {
	const id = nanoid(6).toUpperCase();

	return {
		code: `SAVE${id}`,
		description: 'Test promo',
		discountType: 'fixed',
		discountValue: 500,
		minOrderAmount: null,
		maxDiscountAmount: null,
		usageLimit: null,
		perUserLimit: 1,
		startsAt: null,
		expiresAt: null,
		...overrides
	};
}

export async function seedPromoCode(
	db: TestDatabase,
	overrides: Partial<typeof promoCode.$inferInsert> = {}
): Promise<PromoCode> {
	const id = overrides.id ?? nanoid();

	const [created] = await db
		.insert(promoCode)
		.values({
			id,
			code: overrides.code ?? `SAVE${nanoid(6).toUpperCase()}`,
			description: overrides.description ?? 'Seeded promo',
			discountType: overrides.discountType ?? 'fixed',
			discountValue: overrides.discountValue ?? 500,
			minOrderAmount: overrides.minOrderAmount ?? null,
			maxDiscountAmount: overrides.maxDiscountAmount ?? null,
			usageLimit: overrides.usageLimit ?? null,
			usedCount: overrides.usedCount ?? 0,
			perUserLimit: overrides.perUserLimit ?? 1,
			isActive: overrides.isActive ?? true,
			startsAt: overrides.startsAt ?? null,
			expiresAt: overrides.expiresAt ?? null
		})
		.returning();

	return created;
}

export async function seedPromoCodeUsage(
	db: TestDatabase,
	promoCodeId: string,
	overrides: Partial<Omit<typeof promoCodeUsage.$inferInsert, 'promoCodeId'>> = {}
): Promise<PromoCodeUsage> {
	const [created] = await db
		.insert(promoCodeUsage)
		.values({
			id: overrides.id ?? nanoid(),
			promoCodeId,
			userId: overrides.userId ?? null,
			orderId: overrides.orderId ?? `order-${nanoid(8)}`,
			discountAmount: overrides.discountAmount ?? 500,
			usedAt: overrides.usedAt ?? new Date()
		})
		.returning();

	return created;
}
