import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	ErrorCode,
	OrderError,
	PaymentError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';
import {
	ONLINE_PAYMENT_METHODS,
	type Order,
	type OrderStatus,
	type PaymentMethod
} from './orders.drizzle';

export type OrderServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type OrderAction = 'create' | 'read' | 'update' | 'delete';
export type OrderResource = 'order' | 'payment';

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending: ['confirmed', 'cancelled'],
	confirmed: ['processing', 'cancelled'],
	processing: ['shipped', 'cancelled'],
	shipped: ['delivered'],
	delivered: ['refunded'],
	cancelled: [],
	refunded: []
};

export const DEFAULT_ONLINE_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

export type ResolvePaymentExpiryInput = {
	paymentMethod?: PaymentMethod | null;
	paymentExpiresAt?: Date | number | null;
	now?: Date;
};

export function isOnlinePaymentMethod(method: PaymentMethod | null | undefined): boolean {
	return !!method && (ONLINE_PAYMENT_METHODS as readonly PaymentMethod[]).includes(method);
}

export function resolvePaymentExpiresAt(input: ResolvePaymentExpiryInput): Date | null {
	if (input.paymentExpiresAt !== undefined) {
		return normalizePaymentExpiry(input.paymentExpiresAt);
	}

	if (!isOnlinePaymentMethod(input.paymentMethod)) return null;
	return new Date((input.now ?? new Date()).getTime() + DEFAULT_ONLINE_PAYMENT_TIMEOUT_MS);
}

function normalizePaymentExpiry(value: Date | number | null): Date | null {
	if (value === null) return null;

	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isNaN(date.getTime())) return date;

	throw new OrderError('Invalid payment expiry timestamp.', ErrorCode.VALIDATION_ERROR, {
		paymentExpiresAt: value
	});
}

export function assertOrderPermission(
	actor: OrderServiceActor | null | undefined,
	resource: OrderResource,
	action: OrderAction
): void {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ [resource]: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource, action }
		);
	}
}

export function assertCanCreateOrderForUser(
	userId: string | null | undefined,
	actor: OrderServiceActor | null | undefined
): void {
	if (!actor) {
		if (!userId) return;
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	assertOrderPermission(actor, 'order', 'create');
	if (isAdmin(actor) || !userId || actor.id === userId) return;

	throw new OrderError(
		'You cannot create an order for another user.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			userId
		}
	);
}

export function assertCanAccessOrder(
	targetOrder: Order,
	actor: OrderServiceActor,
	action: Exclude<OrderAction, 'create'>
): void {
	assertOrderPermission(actor, 'order', action);
	if (isAdmin(actor) || targetOrder.userId === actor.id) return;

	throw new OrderError(
		'You do not have permission to access this order.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		{
			orderId: targetOrder.id,
			action
		}
	);
}

export function parseOrderInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new OrderError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function parsePaymentInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new PaymentError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new OrderError(
		`No ${entity} fields were provided for update.`,
		ErrorCode.VALIDATION_ERROR,
		{
			entity
		}
	);
}

export function orderNotFound(details?: Record<string, unknown>): never {
	throw new OrderError('Order not found.', ErrorCode.ORDER_NOT_FOUND, details);
}

export function orderItemNotFound(details?: Record<string, unknown>): never {
	throw new OrderError('Order item not found.', ErrorCode.ORDER_ITEM_NOT_FOUND, details);
}

export function paymentNotFound(details?: Record<string, unknown>): never {
	throw new PaymentError('Payment not found.', ErrorCode.PAYMENT_NOT_FOUND, details);
}

export function invalidPayment(details?: Record<string, unknown>): never {
	throw new PaymentError('Invalid payment method.', ErrorCode.INVALID_PAYMENT_METHOD, details);
}

export function statusHistoryNotFound(details?: Record<string, unknown>): never {
	throw new OrderError('Order status history not found.', ErrorCode.NOT_FOUND, details);
}

export function assertOrderMutable(order: Order): void {
	if (order.status === 'pending') return;

	throw new OrderError('Only pending orders can be modified.', ErrorCode.CANNOT_MODIFY_ORDER, {
		orderId: order.id,
		status: order.status
	});
}

export function assertValidStatusTransition(fromStatus: OrderStatus, toStatus: OrderStatus): void {
	if (fromStatus === toStatus) return;
	if (ORDER_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) return;

	throw new OrderError('Invalid order status transition.', ErrorCode.INVALID_ORDER_STATUS, {
		fromStatus,
		toStatus
	});
}

export function getStatusTimestampPatch(status: OrderStatus, now = new Date()) {
	switch (status) {
		case 'confirmed':
			return { confirmedAt: now };
		case 'shipped':
			return { shippedAt: now };
		case 'delivered':
			return { deliveredAt: now };
		case 'cancelled':
			return { cancelledAt: now };
		case 'refunded':
			return { refundedAt: now };
		default:
			return {};
	}
}

export function wrapOrderPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new OrderError(message, ErrorCode.CONFLICT, { cause: getErrorMessage(error) });
	}

	throw error;
}

export function wrapPaymentPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new PaymentError(message, ErrorCode.CONFLICT, { cause: getErrorMessage(error) });
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

export function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

export function toJsonSnapshot(value: Record<string, unknown> | null | undefined): string | null {
	if (!value) return null;
	return JSON.stringify(value);
}

export function isAdmin(actor: OrderServiceActor | null | undefined): boolean {
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
