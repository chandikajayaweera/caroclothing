import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	ErrorCode,
	MediaError,
	ProductError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';

export type ProductServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type ProductPermissionResource =
	| 'category'
	| 'product'
	| 'productVariant'
	| 'productImage'
	| 'tag';

export type CrudAction = 'create' | 'read' | 'update' | 'delete';

export function assertProductPermission(
	actor: ProductServiceActor | null | undefined,
	resource: ProductPermissionResource,
	action: CrudAction
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

function getAuthorizedRole(roleId: string): {
	authorize(request: Record<string, string[]>): { success: boolean };
} {
	if (roleId === 'adminUser') return adminUser as unknown as ReturnType<typeof getAuthorizedRole>;
	if (roleId === 'customerUser')
		return customerUser as unknown as ReturnType<typeof getAuthorizedRole>;

	throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
}

export function parseProductServiceInput<T>(
	schema: z.ZodType<T>,
	input: unknown,
	entity: string
): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new ProductError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new ProductError(
		`No ${entity} fields were provided for update.`,
		ErrorCode.VALIDATION_ERROR,
		{
			entity
		}
	);
}

export function notFound(
	message: string,
	code: ErrorCode,
	details?: Record<string, unknown>
): never {
	throw new ProductError(message, code, details);
}

export function conflict(message: string, details?: Record<string, unknown>): never {
	throw new ProductError(message, ErrorCode.CONFLICT, details);
}

export function wrapProductPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isUniqueConstraintError(error)) {
		throw new ProductError(message, ErrorCode.CONFLICT, { cause: getErrorMessage(error) });
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

function isUniqueConstraintError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return message.includes('unique') || message.includes('constraint failed');
}
