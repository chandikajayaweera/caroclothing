import { APIError } from 'better-auth/api';
import { isTransientD1Error } from '../../db/errors';
import { collectErrorMessages, removeUndefinedValues } from '../../foundation/utils';

/**
 * Centralized application error handling for CaroClothing.
 *
 * All CaroClothing domain errors extend AppError and carry a stable code plus an
 * HTTP status. Framework-specific adapters, such as Better Auth's APIError, are
 * created at module boundaries from these AppError values.
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
	DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',

	// Addresses
	ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
	ADDRESS_ALREADY_EXISTS: 'ADDRESS_ALREADY_EXISTS',
	DEFAULT_ADDRESS_NOT_FOUND: 'DEFAULT_ADDRESS_NOT_FOUND',
	INVALID_ADDRESS: 'INVALID_ADDRESS',

	// Products & Variants
	PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
	CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
	TAG_NOT_FOUND: 'TAG_NOT_FOUND',
	VARIANT_NOT_FOUND: 'VARIANT_NOT_FOUND',
	VARIANT_UNAVAILABLE: 'VARIANT_UNAVAILABLE',
	INVALID_SIZE: 'INVALID_SIZE',
	INVALID_COLOUR: 'INVALID_COLOUR',
	PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',

	// Bag & Wishlist
	BAG_NOT_FOUND: 'BAG_NOT_FOUND',
	BAG_ITEM_NOT_FOUND: 'BAG_ITEM_NOT_FOUND',
	BAG_ITEM_ALREADY_EXISTS: 'BAG_ITEM_ALREADY_EXISTS',
	BAG_MIGRATION_FAILED: 'BAG_MIGRATION_FAILED',
	WISHLIST_ITEM_ALREADY_EXISTS: 'WISHLIST_ITEM_ALREADY_EXISTS',
	WISHLIST_ITEM_NOT_FOUND: 'WISHLIST_ITEM_NOT_FOUND',

	// Inventory
	INVENTORY_NOT_FOUND: 'INVENTORY_NOT_FOUND',
	INVENTORY_MOVEMENT_NOT_FOUND: 'INVENTORY_MOVEMENT_NOT_FOUND',
	INVALID_INVENTORY_MOVEMENT: 'INVALID_INVENTORY_MOVEMENT',
	INVENTORY_TRACKING_DISABLED: 'INVENTORY_TRACKING_DISABLED',

	// Orders & Checkout
	ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
	ORDER_ITEM_NOT_FOUND: 'ORDER_ITEM_NOT_FOUND',
	INVALID_ORDER_STATUS: 'INVALID_ORDER_STATUS',
	CANNOT_MODIFY_ORDER: 'CANNOT_MODIFY_ORDER',
	CHECKOUT_SESSION_EXPIRED: 'CHECKOUT_SESSION_EXPIRED',
	INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
	EMPTY_BAG: 'EMPTY_BAG',

	// Payments
	PAYMENT_FAILED: 'PAYMENT_FAILED',
	PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
	INVALID_PAYMENT_METHOD: 'INVALID_PAYMENT_METHOD',
	PAYMENT_ALREADY_PROCESSED: 'PAYMENT_ALREADY_PROCESSED',
	REFUND_FAILED: 'REFUND_FAILED',

	// Shipping & Delivery
	SHIPPING_METHOD_NOT_FOUND: 'SHIPPING_METHOD_NOT_FOUND',
	SHIPPING_ZONE_NOT_FOUND: 'SHIPPING_ZONE_NOT_FOUND',
	INVALID_SHIPPING_ADDRESS: 'INVALID_SHIPPING_ADDRESS',
	DELIVERY_UNAVAILABLE_FOR_REGION: 'DELIVERY_UNAVAILABLE_FOR_REGION',

	// Promotions & Discount Codes
	PROMO_NOT_FOUND: 'PROMO_NOT_FOUND',
	PROMO_EXPIRED: 'PROMO_EXPIRED',
	PROMO_ALREADY_USED: 'PROMO_ALREADY_USED',
	PROMO_NOT_APPLICABLE: 'PROMO_NOT_APPLICABLE',
	PROMO_USAGE_LIMIT_EXCEEDED: 'PROMO_USAGE_LIMIT_EXCEEDED',
	PROMO_USAGE_NOT_FOUND: 'PROMO_USAGE_NOT_FOUND',
	MINIMUM_ORDER_VALUE_NOT_MET: 'MINIMUM_ORDER_VALUE_NOT_MET',

	// Storefront content
	STOREFRONT_SECTION_NOT_FOUND: 'STOREFRONT_SECTION_NOT_FOUND',

	// Reviews
	REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
	REVIEW_ALREADY_EXISTS: 'REVIEW_ALREADY_EXISTS',
	REVIEW_NOT_ELIGIBLE: 'REVIEW_NOT_ELIGIBLE',
	REVIEW_MEDIA_NOT_FOUND: 'REVIEW_MEDIA_NOT_FOUND',

	// Returns & Refunds
	RETURN_NOT_ELIGIBLE: 'RETURN_NOT_ELIGIBLE',
	RETURN_WINDOW_EXPIRED: 'RETURN_WINDOW_EXPIRED',
	RETURN_ALREADY_PROCESSED: 'RETURN_ALREADY_PROCESSED',
	INVALID_RETURN_QUANTITY: 'INVALID_RETURN_QUANTITY',

	// Media
	MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',
	INVALID_MEDIA_KEY: 'INVALID_MEDIA_KEY',
	INVALID_MEDIA_TYPE: 'INVALID_MEDIA_TYPE',
	MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
	MEDIA_DELETE_FAILED: 'MEDIA_DELETE_FAILED',

	// Notifications
	EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
	SMS_SEND_FAILED: 'SMS_SEND_FAILED',

	// Users & Auth
	AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
	SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
	ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
	ANONYMOUS_MIGRATION_FAILED: 'ANONYMOUS_MIGRATION_FAILED',
	INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
	INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
	PHONE_NUMBER_ALREADY_LINKED: 'PHONE_NUMBER_ALREADY_LINKED',
	GOOGLE_ACCOUNT_ALREADY_LINKED: 'GOOGLE_ACCOUNT_ALREADY_LINKED',
	GOOGLE_ACCOUNT_ALREADY_LINKED_TO_USER: 'GOOGLE_ACCOUNT_ALREADY_LINKED_TO_USER',
	LAST_AUTH_METHOD_REQUIRED: 'LAST_AUTH_METHOD_REQUIRED',
	OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
	OTP_SEND_FAILED: 'OTP_SEND_FAILED',
	OTP_COOLDOWN_NOT_CONFIGURED: 'OTP_COOLDOWN_NOT_CONFIGURED'
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorResponseBody = {
	code: ErrorCode;
	message: string;
	details?: Record<string, unknown>;
};

type BetterAuthStatus = ConstructorParameters<typeof APIError>[0];

const defaultStatusByCode = {
	INTERNAL_ERROR: 500,
	VALIDATION_ERROR: 400,
	NOT_FOUND: 404,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	CONFLICT: 409,
	DATABASE_UNAVAILABLE: 503,

	ADDRESS_NOT_FOUND: 404,
	ADDRESS_ALREADY_EXISTS: 409,
	DEFAULT_ADDRESS_NOT_FOUND: 404,
	INVALID_ADDRESS: 400,

	PRODUCT_NOT_FOUND: 404,
	CATEGORY_NOT_FOUND: 404,
	TAG_NOT_FOUND: 404,
	VARIANT_NOT_FOUND: 404,
	VARIANT_UNAVAILABLE: 409,
	INVALID_SIZE: 400,
	INVALID_COLOUR: 400,
	PRODUCT_UNAVAILABLE: 409,

	BAG_NOT_FOUND: 404,
	BAG_ITEM_NOT_FOUND: 404,
	BAG_ITEM_ALREADY_EXISTS: 409,
	BAG_MIGRATION_FAILED: 500,
	WISHLIST_ITEM_ALREADY_EXISTS: 409,
	WISHLIST_ITEM_NOT_FOUND: 404,

	INVENTORY_NOT_FOUND: 404,
	INVENTORY_MOVEMENT_NOT_FOUND: 404,
	INVALID_INVENTORY_MOVEMENT: 400,
	INVENTORY_TRACKING_DISABLED: 409,

	ORDER_NOT_FOUND: 404,
	ORDER_ITEM_NOT_FOUND: 404,
	INVALID_ORDER_STATUS: 400,
	CANNOT_MODIFY_ORDER: 409,
	CHECKOUT_SESSION_EXPIRED: 410,
	INSUFFICIENT_STOCK: 409,
	EMPTY_BAG: 400,

	PAYMENT_FAILED: 402,
	PAYMENT_NOT_FOUND: 404,
	INVALID_PAYMENT_METHOD: 400,
	PAYMENT_ALREADY_PROCESSED: 409,
	REFUND_FAILED: 400,

	SHIPPING_METHOD_NOT_FOUND: 404,
	SHIPPING_ZONE_NOT_FOUND: 404,
	INVALID_SHIPPING_ADDRESS: 400,
	DELIVERY_UNAVAILABLE_FOR_REGION: 409,

	PROMO_NOT_FOUND: 404,
	PROMO_EXPIRED: 410,
	PROMO_ALREADY_USED: 409,
	PROMO_NOT_APPLICABLE: 400,
	PROMO_USAGE_LIMIT_EXCEEDED: 409,
	PROMO_USAGE_NOT_FOUND: 404,
	MINIMUM_ORDER_VALUE_NOT_MET: 400,
	STOREFRONT_SECTION_NOT_FOUND: 404,

	REVIEW_NOT_FOUND: 404,
	REVIEW_ALREADY_EXISTS: 409,
	REVIEW_NOT_ELIGIBLE: 403,
	REVIEW_MEDIA_NOT_FOUND: 404,

	RETURN_NOT_ELIGIBLE: 403,
	RETURN_WINDOW_EXPIRED: 410,
	RETURN_ALREADY_PROCESSED: 409,
	INVALID_RETURN_QUANTITY: 400,

	MEDIA_NOT_FOUND: 404,
	INVALID_MEDIA_KEY: 400,
	INVALID_MEDIA_TYPE: 400,
	MEDIA_UPLOAD_FAILED: 500,
	MEDIA_DELETE_FAILED: 500,

	EMAIL_SEND_FAILED: 500,
	SMS_SEND_FAILED: 500,

	AUTHENTICATION_REQUIRED: 401,
	SESSION_NOT_FOUND: 401,
	ACCOUNT_SUSPENDED: 403,
	ANONYMOUS_MIGRATION_FAILED: 500,
	INSUFFICIENT_PERMISSIONS: 403,
	INVALID_PHONE_NUMBER: 400,
	PHONE_NUMBER_ALREADY_LINKED: 409,
	GOOGLE_ACCOUNT_ALREADY_LINKED: 409,
	GOOGLE_ACCOUNT_ALREADY_LINKED_TO_USER: 409,
	LAST_AUTH_METHOD_REQUIRED: 400,
	OTP_RATE_LIMITED: 429,
	OTP_SEND_FAILED: 500,
	OTP_COOLDOWN_NOT_CONFIGURED: 500
} satisfies Record<ErrorCode, number>;

const betterAuthStatusByHttpStatus: Partial<Record<number, BetterAuthStatus>> = {
	400: 'BAD_REQUEST',
	401: 'UNAUTHORIZED',
	402: 'PAYMENT_REQUIRED',
	403: 'FORBIDDEN',
	404: 'NOT_FOUND',
	409: 'CONFLICT',
	410: 'GONE',
	429: 'TOO_MANY_REQUESTS',
	500: 'INTERNAL_SERVER_ERROR',
	503: 'SERVICE_UNAVAILABLE'
};

// ---------------------------------------------------------------------------
// Base Error
// ---------------------------------------------------------------------------

export class AppError extends Error {
	constructor(
		message: string,
		public readonly code: ErrorCode,
		public readonly statusCode: number = 500,
		public readonly details?: Record<string, unknown>
	) {
		super(message);

		this.name = new.target.name;
		Object.setPrototypeOf(this, new.target.prototype);
		Error.captureStackTrace?.(this, new.target);
	}

	toJSON(): ErrorResponseBody & { name: string; statusCode: number } {
		return removeUndefinedValues({
			name: this.name,
			message: this.message,
			code: this.code,
			statusCode: this.statusCode,
			details: this.details
		});
	}
}

export class DatabaseUnavailableError extends AppError {
	constructor(cause?: unknown) {
		super(
			'The database is temporarily unavailable. Please try again.',
			ErrorCode.DATABASE_UNAVAILABLE,
			503
		);
		this.cause = cause;
	}
}

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

export class ProductError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class BagError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class WishlistError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class AddressError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class InventoryError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class OrderError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class PaymentError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class ShippingError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class PromotionError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class StorefrontError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class ReviewError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class ReturnError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class MediaError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class NotificationError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		details?: Record<string, unknown>,
		statusCode?: number
	) {
		super(message, code, statusCode ?? getDefaultStatusCode(code), details);
	}
}

export class AuthError extends AppError {
	constructor(
		message: string,
		code: ErrorCode,
		statusCode = getDefaultStatusCode(code),
		details?: Record<string, unknown>
	) {
		super(message, code, statusCode, details);
	}
}

export class OtpRateLimitError extends AuthError {
	constructor(details?: Record<string, unknown>) {
		super(
			'Please wait before requesting another OTP code.',
			ErrorCode.OTP_RATE_LIMITED,
			429,
			details
		);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}

export function normalizeServerError(error: unknown): unknown {
	if (isAppError(error)) return error;
	return isTransientD1Error(error) ? new DatabaseUnavailableError(error) : error;
}

export function getErrorMessage(error: unknown): string {
	const messages = collectErrorMessages(error);
	return messages.length > 0 ? messages.join(' | ') : 'An unknown error occurred';
}

export function getErrorCode(error: unknown): ErrorCode {
	const normalizedError = normalizeServerError(error);
	if (isAppError(normalizedError)) return normalizedError.code;
	return ErrorCode.INTERNAL_ERROR;
}

export function getErrorStatusCode(error: unknown): number {
	const normalizedError = normalizeServerError(error);
	if (isAppError(normalizedError)) return normalizedError.statusCode;
	return 500;
}

export function getDefaultStatusCode(code: ErrorCode): number {
	return defaultStatusByCode[code];
}

export function toErrorResponseBody(
	error: unknown,
	options: { includeDetails?: boolean } = {}
): ErrorResponseBody {
	const normalizedError = normalizeServerError(error);
	if (isAppError(normalizedError)) {
		return removeUndefinedValues({
			code: normalizedError.code,
			message:
				normalizedError.statusCode >= 500
					? 'Something went wrong on our end. Please try again later.'
					: normalizedError.message,
			details: options.includeDetails ? normalizedError.details : undefined
		});
	}

	return {
		code: ErrorCode.INTERNAL_ERROR,
		message: 'An unexpected error occurred.'
	};
}

export function toBetterAuthApiError(error: unknown): APIError {
	const statusCode = getErrorStatusCode(error);
	const body = toErrorResponseBody(error, { includeDetails: statusCode < 500 });
	const status = betterAuthStatusByHttpStatus[statusCode] ?? 'INTERNAL_SERVER_ERROR';

	return new APIError(status, body);
}
