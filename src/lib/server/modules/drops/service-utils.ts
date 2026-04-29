import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	DropError,
	ErrorCode,
	MediaError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';

export type DropServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type DropAction = 'create' | 'read' | 'update' | 'delete';

export function assertDropPermission(
	actor: DropServiceActor | null | undefined,
	action: DropAction
): void {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ drop: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource: 'drop', action }
		);
	}
}

export function parseDropInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new DropError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new DropError(`No ${entity} fields were provided for update.`, ErrorCode.VALIDATION_ERROR, {
		entity
	});
}

export function dropNotFound(details?: Record<string, unknown>): never {
	throw new DropError('Drop not found.', ErrorCode.DROP_NOT_FOUND, details);
}

export function dropProductNotFound(details?: Record<string, unknown>): never {
	throw new DropError('Drop product not found.', ErrorCode.DROP_PRODUCT_NOT_FOUND, details);
}

export function dropWaitlistNotFound(details?: Record<string, unknown>): never {
	throw new DropError(
		'Drop waitlist entry not found.',
		ErrorCode.DROP_WAITLIST_ENTRY_NOT_FOUND,
		details
	);
}

export function conflict(message: string, details?: Record<string, unknown>): never {
	throw new DropError(message, ErrorCode.CONFLICT, details);
}

export function wrapDropPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new DropError(message, ErrorCode.CONFLICT, { cause: getErrorMessage(error) });
	}

	throw error;
}

export function wrapDropWaitlistPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new DropError(message, ErrorCode.DROP_WAITLIST_ENTRY_ALREADY_EXISTS, {
			cause: getErrorMessage(error)
		});
	}

	throw error;
}

export function wrapMediaError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	throw new MediaError(message, ErrorCode.MEDIA_UPLOAD_FAILED, { cause: getErrorMessage(error) });
}

export function requireMediaBucket(bucket: R2Bucket | null | undefined): R2Bucket {
	if (bucket) return bucket;

	throw new MediaError('R2 media bucket is required.', ErrorCode.MEDIA_UPLOAD_FAILED);
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

export function sanitizeMediaVariant(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function normalizeContact(contact: string): string {
	const trimmed = contact.trim();
	return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed.replace(/\s+/g, '');
}

export function isActiveDropStatus(status: string): boolean {
	return status === 'teaser' || status === 'live' || status === 'sold_out';
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
