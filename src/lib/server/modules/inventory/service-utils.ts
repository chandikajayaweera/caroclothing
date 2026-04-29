import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	ErrorCode,
	InventoryError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';

export type InventoryServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type InventoryAction = 'create' | 'read' | 'update' | 'delete';

export function assertInventoryPermission(
	actor: InventoryServiceActor | null | undefined,
	action: InventoryAction
): void {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ inventory: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource: 'inventory', action }
		);
	}
}

export function parseInventoryInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new InventoryError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new InventoryError(
		`No ${entity} fields were provided for update.`,
		ErrorCode.VALIDATION_ERROR,
		{
			entity
		}
	);
}

export function assertPositiveQuantity(quantity: number, entity = 'quantity'): void {
	if (Number.isInteger(quantity) && quantity > 0) return;

	throw new InventoryError(`${entity} must be a positive integer.`, ErrorCode.VALIDATION_ERROR, {
		quantity
	});
}

export function inventoryNotFound(details?: Record<string, unknown>): never {
	throw new InventoryError('Inventory record not found.', ErrorCode.INVENTORY_NOT_FOUND, details);
}

export function inventoryMovementNotFound(details?: Record<string, unknown>): never {
	throw new InventoryError(
		'Inventory movement not found.',
		ErrorCode.INVENTORY_MOVEMENT_NOT_FOUND,
		details
	);
}

export function variantNotFound(details?: Record<string, unknown>): never {
	throw new InventoryError('Product variant not found.', ErrorCode.VARIANT_NOT_FOUND, details);
}

export function insufficientStock(details?: Record<string, unknown>): never {
	throw new InventoryError('Insufficient stock.', ErrorCode.INSUFFICIENT_STOCK, details);
}

export function conflict(message: string, details?: Record<string, unknown>): never {
	throw new InventoryError(message, ErrorCode.CONFLICT, details);
}

export function wrapInventoryPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new InventoryError(message, ErrorCode.CONFLICT, { cause: getErrorMessage(error) });
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
