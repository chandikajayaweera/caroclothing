import { z } from 'zod';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AuthError,
	ErrorCode,
	MediaError,
	ReviewError,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';

export type ReviewServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type ReviewResource = 'review' | 'reviewMedia';
export type ReviewAction = 'create' | 'read' | 'update' | 'delete';

export function assertReviewPermission(
	actor: ReviewServiceActor | null | undefined,
	resource: ReviewResource,
	action: ReviewAction
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

export function parseReviewInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new ReviewError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

export function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new ReviewError(
		`No ${entity} fields were provided for update.`,
		ErrorCode.VALIDATION_ERROR,
		{
			entity
		}
	);
}

export function reviewNotFound(details?: Record<string, unknown>): never {
	throw new ReviewError('Review not found.', ErrorCode.REVIEW_NOT_FOUND, details);
}

export function reviewMediaNotFound(details?: Record<string, unknown>): never {
	throw new ReviewError('Review media not found.', ErrorCode.REVIEW_MEDIA_NOT_FOUND, details);
}

export function reviewNotEligible(details?: Record<string, unknown>): never {
	throw new ReviewError('Review is not eligible.', ErrorCode.REVIEW_NOT_ELIGIBLE, details);
}

export function conflict(message: string, details?: Record<string, unknown>): never {
	throw new ReviewError(message, ErrorCode.CONFLICT, details);
}

export function wrapReviewPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new ReviewError(message, ErrorCode.REVIEW_ALREADY_EXISTS, {
			cause: getErrorMessage(error)
		});
	}

	throw error;
}

export function wrapMediaError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	throw new MediaError(message, ErrorCode.MEDIA_UPLOAD_FAILED, {
		cause: getErrorMessage(error)
	});
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

export function isAdmin(actor: ReviewServiceActor | null | undefined): boolean {
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
