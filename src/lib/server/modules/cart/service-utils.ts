import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	CartError,
	ErrorCode,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';

export type CartServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type CartAccessContext = {
	actor?: CartServiceActor | null;
	sessionToken?: string | null;
};

export type CartAction = 'create' | 'read' | 'update' | 'delete';

export function assertCartPermission(
	actor: CartServiceActor | null | undefined,
	action: CartAction
): void {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ cart: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource: 'cart', action }
		);
	}
}

export function parseCartInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new CartError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new CartError(`No ${entity} fields were provided for update.`, ErrorCode.VALIDATION_ERROR, {
		entity
	});
}

export function cartNotFound(details?: Record<string, unknown>): never {
	throw new CartError('Cart not found.', ErrorCode.CART_NOT_FOUND, details);
}

export function cartItemNotFound(details?: Record<string, unknown>): never {
	throw new CartError('Cart item not found.', ErrorCode.CART_ITEM_NOT_FOUND, details);
}

export function emptyCart(details?: Record<string, unknown>): never {
	throw new CartError('Cart is empty.', ErrorCode.EMPTY_CART, details);
}

export function wrapCartPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new CartError(message, ErrorCode.CART_ITEM_ALREADY_EXISTS, {
			cause: getErrorMessage(error)
		});
	}

	throw error;
}

export function normalizeLimit(
	limit: number | undefined,
	defaultLimit = 50,
	maxLimit = 100
): number {
	if (limit === undefined) return defaultLimit;
	if (!Number.isFinite(limit)) return defaultLimit;
	return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

export function normalizeOffset(offset: number | undefined): number {
	if (offset === undefined || !Number.isFinite(offset)) return 0;
	return Math.max(Math.trunc(offset), 0);
}

export function isAdmin(actor: CartServiceActor | null | undefined): boolean {
	return actor?.role === 'adminUser';
}

export function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

function getAuthorizedRole(roleId: string): {
	authorize(request: Record<string, string[]>): { success: boolean };
} {
	if (roleId === 'adminUser') return adminUser as unknown as ReturnType<typeof getAuthorizedRole>;
	if (roleId === 'customerUser')
		return customerUser as unknown as ReturnType<typeof getAuthorizedRole>;

	throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
}

function isConstraintError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return message.includes('unique') || message.includes('constraint failed');
}
