import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { order, type Order } from '$lib/server/modules/orders/orders.drizzle';
import { promoCode } from '$lib/server/modules/promotions/promotions.drizzle';
import type { TestDatabase } from '../db';

export async function seedOrder(
	db: TestDatabase,
	overrides: Partial<typeof order.$inferInsert> = {}
): Promise<Order> {
	const id = overrides.id ?? nanoid();
	const subtotal = overrides.subtotal ?? 5000;
	const discountAmount = overrides.discountAmount ?? 0;
	const shippingAmount = overrides.shippingAmount ?? 0;
	let promotionId = overrides.promotionId ?? null;
	if (!promotionId && overrides.promoCodeId) {
		const [code] = await db
			.select({ promotionId: promoCode.promotionId })
			.from(promoCode)
			.where(eq(promoCode.id, overrides.promoCodeId))
			.limit(1);
		promotionId = code?.promotionId ?? null;
	}

	const [created] = await db
		.insert(order)
		.values({
			id,
			orderNumber: overrides.orderNumber ?? `CARO-TEST-${nanoid(8)}`,
			userId: overrides.userId ?? null,
			status: overrides.status ?? 'pending',
			paymentExpiresAt: overrides.paymentExpiresAt ?? null,
			subtotal,
			discountAmount,
			shippingAmount,
			totalAmount: overrides.totalAmount ?? subtotal - discountAmount + shippingAmount,
			promotionId,
			promoCodeId: overrides.promoCodeId ?? null,
			promoCodeSnapshot: overrides.promoCodeSnapshot ?? null,
			shippingMethodId: overrides.shippingMethodId ?? null,
			shippingAddressId: overrides.shippingAddressId ?? null,
			shippingMethodSnapshot: overrides.shippingMethodSnapshot ?? null,
			shippingAddressSnapshot: overrides.shippingAddressSnapshot ?? null,
			trackingNumber: overrides.trackingNumber ?? null,
			trackingCarrier: overrides.trackingCarrier ?? null,
			trackingUrl: overrides.trackingUrl ?? null,
			customerNote: overrides.customerNote ?? null,
			adminNote: overrides.adminNote ?? null,
			confirmedAt: overrides.confirmedAt ?? null,
			shippedAt: overrides.shippedAt ?? null,
			deliveredAt: overrides.deliveredAt ?? null,
			cancelledAt: overrides.cancelledAt ?? null,
			refundedAt: overrides.refundedAt ?? null
		})
		.returning();

	return created;
}
