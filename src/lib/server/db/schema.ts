/**
 * Central barrel that re-exports every Drizzle table and relation.
 * This is the single file passed to `drizzle()` and `drizzle-kit`.
 *
 * Import order matters for cross-module relations — tables that are
 * referenced by others must be exported before their dependants.
 *
 * Dependency graph (simplified):
 *   auth ← address, wishlist, cart, order, coupon_usage, review
 *   category ← product
 *   product ← product_variant ← product_image
 *   coupon ← cart, order, coupon_usage
 *   order ← order_item, payment, coupon_usage, review
 */

// ── Auth (BetterAuth managed — do not edit) ────────────────────────────────
export * from '$lib/server/modules/auth/auth.drizzle';

// ── Catalog ────────────────────────────────────────────────────────────────
export * from '$lib/server/modules/catalog/category/category.drizzle';
export * from '$lib/server/modules/catalog/product/product.drizzle';
export * from '$lib/server/modules/catalog/product/product-variant.drizzle';
export * from '$lib/server/modules/catalog/product/product-image.drizzle';

// ── Customers ─────────────────────────────────────────────────────────────
export * from '$lib/server/modules/customers/address/address.drizzle';
export * from '$lib/server/modules/customers/wishlist/wishlist.drizzle';

// ── Commerce ──────────────────────────────────────────────────────────────
export * from '$lib/server/modules/commerce/coupon/coupon.drizzle';
export * from '$lib/server/modules/commerce/cart/cart.drizzle';
export * from '$lib/server/modules/commerce/order/order.drizzle';
export * from '$lib/server/modules/commerce/payment/payment.drizzle';

// Must come after both coupon and order to avoid circular imports
export * from '$lib/server/modules/commerce/coupon/coupon-usage.drizzle';

// ── Reviews ───────────────────────────────────────────────────────────────
export * from '$lib/server/modules/reviews/review.drizzle';

// ── Cross-module relations ────────────────────────────────────────────────
// Must come last — imports from every module above.
export * from '$lib/server/db/relations';
