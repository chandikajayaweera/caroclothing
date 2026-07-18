import { AuthError, ErrorCode } from '$lib/server/infrastructure/errors';
import type { ServiceActor, SystemActor } from '$lib/server/foundation/context';
import type { UserRole } from '$lib/shared/auth/access-control';

type AnyActor = ServiceActor | SystemActor;

const ADMIN_ROLE = 'adminUser' satisfies UserRole;

export function requireActor(actor: AnyActor | null | undefined): AnyActor {
	if (!actor) {
		throw new AuthError('Sign in to continue.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	if ('isAnonymous' in actor && actor.isAnonymous) {
		throw new AuthError('A full account is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	return actor;
}

export function requireAdmin(actor: AnyActor | null | undefined): AnyActor {
	const resolved = requireActor(actor);

	if (resolved.role !== ADMIN_ROLE) {
		throw new AuthError('Admin access required.', ErrorCode.INSUFFICIENT_PERMISSIONS);
	}

	return resolved;
}

export function requireOwnerOrAdmin(
	actor: AnyActor | null | undefined,
	ownerUserId: string | null | undefined
): AnyActor {
	const resolved = requireActor(actor);

	if (resolved.role === ADMIN_ROLE) return resolved;
	if (ownerUserId && resolved.id === ownerUserId) return resolved;

	throw new AuthError('You do not have permission to access this resource.', ErrorCode.FORBIDDEN);
}
