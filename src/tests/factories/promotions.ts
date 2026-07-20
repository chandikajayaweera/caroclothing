import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import {
	promoCode,
	promoCodeUsage,
	promotion,
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
	overrides: Partial<{
		id: string;
		promotionId: string;
		code: string;
		description: string | null;
		discountType: 'percentage' | 'fixed';
		discountValue: number;
		minOrderAmount: number | null;
		maxDiscountAmount: number | null;
		usageLimit: number | null;
		usedCount: number;
		perUserLimit: number;
		isActive: boolean;
		startsAt: Date | null;
		expiresAt: Date | null;
	}> = {}
): Promise<PromoCode> {
	const id = overrides.id ?? nanoid();
	const promotionId = overrides.promotionId ?? nanoid();
	const now = new Date();
	await db.insert(promotion).values({
		id: promotionId,
		name: overrides.code ?? `SAVE${nanoid(6).toUpperCase()}`,
		internalDescription: overrides.description ?? 'Seeded promo',
		discountType: overrides.discountType ?? 'fixed',
		discountValue: overrides.discountValue ?? 500,
		minOrderAmount: overrides.minOrderAmount ?? null,
		maxDiscountAmount: overrides.maxDiscountAmount ?? null,
		usageLimit: overrides.usageLimit ?? null,
		usedCount: overrides.usedCount ?? 0,
		perUserLimit: overrides.perUserLimit ?? 1,
		applicationMode: 'code',
		eligibilityScope: 'all',
		visibility: 'internal',
		priority: 0,
		isActive: overrides.isActive ?? true,
		startsAt: overrides.startsAt ?? null,
		expiresAt: overrides.expiresAt ?? null,
		createdAt: now,
		updatedAt: now
	});

	const [created] = await db
		.insert(promoCode)
		.values({
			id,
			promotionId,
			code: overrides.code ?? `SAVE${nanoid(6).toUpperCase()}`,
			usageLimit: overrides.usageLimit ?? null,
			usedCount: overrides.usedCount ?? 0,
			isActive: overrides.isActive ?? true,
			distribution: 'private',
			isDiscoverable: false,
			redemptionChannel: 'storefront',
			createdAt: now,
			updatedAt: now
		})
		.returning();

	return created;
}

export async function seedPromoCodeUsage(
	db: TestDatabase,
	promoCodeId: string,
	overrides: Partial<Omit<typeof promoCodeUsage.$inferInsert, 'promoCodeId'>> = {}
): Promise<PromoCodeUsage> {
	const [code] = await db.select().from(promoCode).where(eq(promoCode.id, promoCodeId)).limit(1);
	if (!code) throw new Error(`Promo code ${promoCodeId} not found`);
	const [created] = await db
		.insert(promoCodeUsage)
		.values({
			id: overrides.id ?? nanoid(),
			promotionId: overrides.promotionId ?? code.promotionId,
			promoCodeId,
			userId: overrides.userId ?? null,
			orderId: overrides.orderId ?? `order-${nanoid(8)}`,
			discountAmount: overrides.discountAmount ?? 500,
			usedAt: overrides.usedAt ?? new Date()
		})
		.returning();

	return created;
}
