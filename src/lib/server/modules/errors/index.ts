/**
 * Centralized error handling system for CaroClothing.
 *
 * All custom errors extend AppError with structured error codes and HTTP status codes.
 * This enables consistent error handling across SvelteKit server actions, API routes,
 * and service modules.
 *
 * Note: BetterAuth surface errors (OTP send failures, OAuth callbacks) are handled
 * internally by BetterAuth and should NOT be mapped here. Only application-level
 * errors that originate in CaroClothing's own modules belong in this file.
 */

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const ErrorCode = {
	// General
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	NOT_FOUND: 'NOT_FOUND',
	UNAUTHORIZED: 'UNAUTHORIZED',
	FORBIDDEN: 'FORBIDDEN',
	CONFLICT: 'CONFLICT',

	// Products & Variants
	PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
	VARIANT_NOT_FOUND: 'VARIANT_NOT_FOUND',
	VARIANT_UNAVAILABLE: 'VARIANT_UNAVAILABLE',
	INVALID_SIZE: 'INVALID_SIZE',
	INVALID_COLOUR: 'INVALID_COLOUR',
	PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',

	// Cart & Wishlist
	CART_NOT_FOUND: 'CART_NOT_FOUND',
	CART_ITEM_NOT_FOUND: 'CART_ITEM_NOT_FOUND',
	CART_ITEM_ALREADY_EXISTS: 'CART_ITEM_ALREADY_EXISTS',
	CART_MIGRATION_FAILED: 'CART_MIGRATION_FAILED',
	WISHLIST_ITEM_ALREADY_EXISTS: 'WISHLIST_ITEM_ALREADY_EXISTS',
	WISHLIST_ITEM_NOT_FOUND: 'WISHLIST_ITEM_NOT_FOUND',

	// Orders & Checkout
	ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
	INVALID_ORDER_STATUS: 'INVALID_ORDER_STATUS',
	CANNOT_MODIFY_ORDER: 'CANNOT_MODIFY_ORDER',
	CHECKOUT_SESSION_EXPIRED: 'CHECKOUT_SESSION_EXPIRED',
	INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
	EMPTY_CART: 'EMPTY_CART',

	// Payments
	PAYMENT_FAILED: 'PAYMENT_FAILED',
	PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
	INVALID_PAYMENT_METHOD: 'INVALID_PAYMENT_METHOD',
	PAYMENT_ALREADY_PROCESSED: 'PAYMENT_ALREADY_PROCESSED',
	REFUND_FAILED: 'REFUND_FAILED',

	// Shipping & Delivery
	SHIPPING_METHOD_NOT_FOUND: 'SHIPPING_METHOD_NOT_FOUND',
	INVALID_SHIPPING_ADDRESS: 'INVALID_SHIPPING_ADDRESS',
	DELIVERY_UNAVAILABLE_FOR_REGION: 'DELIVERY_UNAVAILABLE_FOR_REGION',

	// Promotions & Discount Codes
	PROMO_NOT_FOUND: 'PROMO_NOT_FOUND',
	PROMO_EXPIRED: 'PROMO_EXPIRED',
	PROMO_ALREADY_USED: 'PROMO_ALREADY_USED',
	PROMO_NOT_APPLICABLE: 'PROMO_NOT_APPLICABLE',
	PROMO_USAGE_LIMIT_EXCEEDED: 'PROMO_USAGE_LIMIT_EXCEEDED',
	MINIMUM_ORDER_VALUE_NOT_MET: 'MINIMUM_ORDER_VALUE_NOT_MET',

	// Returns & Refunds
	RETURN_NOT_ELIGIBLE: 'RETURN_NOT_ELIGIBLE',
	RETURN_WINDOW_EXPIRED: 'RETURN_WINDOW_EXPIRED',
	RETURN_ALREADY_PROCESSED: 'RETURN_ALREADY_PROCESSED',
	INVALID_RETURN_QUANTITY: 'INVALID_RETURN_QUANTITY',

	// Users & Auth (application-level only — BetterAuth owns OTP/OAuth surface errors)
	SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
	ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
	ANONYMOUS_MIGRATION_FAILED: 'ANONYMOUS_MIGRATION_FAILED',
	INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
	OTP_RATE_LIMITED: 'OTP_RATE_LIMITED'
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// Base Error
// ---------------------------------------------------------------------------

/**
 * Base application error class with structured error information.
 *
 * All domain-specific errors extend this class.
 *
 * @example
 * ```ts
 * throw new ProductError(
 *   'Requested size is no longer available',
 *   ErrorCode.VARIANT_UNAVAILABLE,
 *   { productId: 'prod_abc123', size: 'M', colour: 'Midnight Black' }
 * );
 * ```
 */
export class AppError extends Error {
	/**
	 * @param message    - Human-readable error message
	 * @param code       - Machine-readable error code from ErrorCode
	 * @param statusCode - HTTP status code (default: 500)
	 * @param details    - Additional context for debugging or client display
	 */
	constructor(
		message: string,
		public readonly code: ErrorCode,
		public readonly statusCode: number = 500,
		public readonly details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'AppError';
		Object.setPrototypeOf(this, AppError.prototype);
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			statusCode: this.statusCode,
			details: this.details
		};
	}
}

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

/** Product catalogue and variant errors. */
export class ProductError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 400, details);
		this.name = 'ProductError';
		Object.setPrototypeOf(this, ProductError.prototype);
	}
}

/**
 * Cart and wishlist errors.
 *
 * Also covers anonymous → authenticated cart migration failures that originate
 * in CaroClothing's own migration logic (not BetterAuth's onLinkAccount hook).
 */
export class CartError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 400, details);
		this.name = 'CartError';
		Object.setPrototypeOf(this, CartError.prototype);
	}
}

/** Order creation, status transitions, and checkout session errors. */
export class OrderError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 400, details);
		this.name = 'OrderError';
		Object.setPrototypeOf(this, OrderError.prototype);
	}
}

/** Payment processing and refund errors. */
export class PaymentError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 402, details);
		this.name = 'PaymentError';
		Object.setPrototypeOf(this, PaymentError.prototype);
	}
}

/** Shipping method lookup and address validation errors. */
export class ShippingError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 400, details);
		this.name = 'ShippingError';
		Object.setPrototypeOf(this, ShippingError.prototype);
	}
}

/** Promo code and discount rule errors. */
export class PromotionError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 400, details);
		this.name = 'PromotionError';
		Object.setPrototypeOf(this, PromotionError.prototype);
	}
}

/** Return eligibility and processing errors. */
export class ReturnError extends AppError {
	constructor(message: string, code: ErrorCode, details?: Record<string, unknown>) {
		super(message, code, 400, details);
		this.name = 'ReturnError';
		Object.setPrototypeOf(this, ReturnError.prototype);
	}
}

/**
 * Application-level auth errors.
 *
 * Use these for CaroClothing business rules (e.g. suspended accounts, role checks,
 * anonymous cart migration). Do NOT use for errors that BetterAuth already surfaces
 * through its own response format (OTP failures, OAuth errors, session validation).
 */
export class AuthError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		statusCode = 401,
		details?: Record<string, unknown>
	) {
		super(message, code, statusCode, details);
		this.name = 'AuthError';
		Object.setPrototypeOf(this, AuthError.prototype);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrows an unknown value to AppError. */
export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}

/** Safely extracts a human-readable message from any thrown value. */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'An unknown error occurred';
}

/** Returns the ErrorCode from an AppError, or INTERNAL_ERROR as a fallback. */
export function getErrorCode(error: unknown): ErrorCode {
	if (isAppError(error)) return error.code;
	return ErrorCode.INTERNAL_ERROR;
}

/**
 * OTP rate limiting error.
 *
 * This is an application-level constraint (not BetterAuth internal),
 * used to prevent abuse of OTP sending.
 */
export class OtpRateLimitError extends AuthError {
	constructor(details?: Record<string, unknown>) {
		super(
			'Please wait before requesting another OTP code.',
			ErrorCode.OTP_RATE_LIMITED,
			429, // HTTP Too Many Requests
			details
		);
		this.name = 'OtpRateLimitError';
		Object.setPrototypeOf(this, OtpRateLimitError.prototype);
	}
}
