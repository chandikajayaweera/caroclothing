/**
 * Drizzle allows multiple `relations()` calls for the same table — they are
 * merged at query time. This file holds every "many" relation that cannot live
 * in the individual module file without creating a circular import.
 *
 * Import chain that makes these circular:
 *   product  ←  product-variant  (variant imports product)
 *   product  ←  product-image    (image imports product + variant)
 *   product  ←  review           (review imports product + order)
 *   product-variant ← product-image
 *   coupon   ←  coupon-usage     (usage imports coupon + order)
 *   order    ←  payment          (payment imports order)
 *   order    ←  coupon-usage
 */

import { relations } from 'drizzle-orm';

import { product } from '$lib/server/modules/catalog/product/product.drizzle';
import { productVariant } from '$lib/server/modules/catalog/product/product-variant.drizzle';
import { productImage } from '$lib/server/modules/catalog/product/product-image.drizzle';
import { coupon } from '$lib/server/modules/commerce/coupon/coupon.drizzle';
import { couponUsage } from '$lib/server/modules/commerce/coupon/coupon-usage.drizzle';
import { order } from '$lib/server/modules/commerce/order/order.drizzle';
import { payment } from '$lib/server/modules/commerce/payment/payment.drizzle';
import { review } from '$lib/server/modules/reviews/review.drizzle';

// ── Product ────────────────────────────────────────────────────────────────

export const productManyRelations = relations(product, ({ many }) => ({
	variants: many(productVariant),
	images: many(productImage),
	reviews: many(review)
}));

// ── Product variant ────────────────────────────────────────────────────────

export const productVariantManyRelations = relations(productVariant, ({ many }) => ({
	images: many(productImage)
}));

// ── Coupon ─────────────────────────────────────────────────────────────────

export const couponManyRelations = relations(coupon, ({ many }) => ({
	usages: many(couponUsage)
}));

// ── Order ──────────────────────────────────────────────────────────────────

export const orderManyRelations = relations(order, ({ many }) => ({
	payments: many(payment),
	couponUsages: many(couponUsage)
}));
