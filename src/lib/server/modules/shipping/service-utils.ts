import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	ErrorCode,
	ShippingError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';

export type ShippingServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type ShippingAction = 'create' | 'read' | 'update' | 'delete';

export function assertShippingPermission(
	actor: ShippingServiceActor | null | undefined,
	action: ShippingAction
): void {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ shipping: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource: 'shipping', action }
		);
	}
}

export function parseShippingInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new ShippingError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new ShippingError(
		`No ${entity} fields were provided for update.`,
		ErrorCode.VALIDATION_ERROR,
		{ entity }
	);
}

export function assertDeliveryEstimate(daysMin: number, daysMax: number, entity: string): void {
	if (daysMax >= daysMin) return;

	throw new ShippingError(
		'estimatedDaysMax must be greater than or equal to estimatedDaysMin.',
		ErrorCode.VALIDATION_ERROR,
		{ entity, estimatedDaysMin: daysMin, estimatedDaysMax: daysMax }
	);
}

export function methodNotFound(details?: Record<string, unknown>): never {
	throw new ShippingError(
		'Shipping method not found.',
		ErrorCode.SHIPPING_METHOD_NOT_FOUND,
		details
	);
}

export function zoneNotFound(details?: Record<string, unknown>): never {
	throw new ShippingError('Shipping zone not found.', ErrorCode.SHIPPING_ZONE_NOT_FOUND, details);
}

export function deliveryUnavailable(details?: Record<string, unknown>): never {
	throw new ShippingError(
		'Delivery is unavailable for this region.',
		ErrorCode.DELIVERY_UNAVAILABLE_FOR_REGION,
		details
	);
}

export function wrapShippingPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new ShippingError(message, ErrorCode.CONFLICT, { cause: getErrorMessage(error) });
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

export function isAdmin(actor: ShippingServiceActor | null | undefined): boolean {
	return actor?.role === 'adminUser';
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
