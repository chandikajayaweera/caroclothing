import type { UserRole } from '$lib/shared/auth/access-control';

export type AuthRedirectPath =
	| '/'
	| '/account'
	| '/account/addresses'
	| '/account/orders'
	| '/account/reviews'
	| '/account/security'
	| '/account/wishlist'
	| '/app'
	| '/bag'
	| '/checkout'
	| '/shop'
	| '/wishlist';

export type GetSafeAuthRedirectInput = {
	value: string | null | undefined;
	defaultPath?: AuthRedirectPath;
};

export type AuthMethodType = 'anonymous' | 'google' | 'password' | 'phone' | 'provider' | 'unknown';

export type AuthMethodDTO = {
	id: string;
	type: AuthMethodType;
	providerId: string;
	label: string;
	linkedAt: Date | null;
	verified: boolean | null;
};

export type AccountProfileDTO = {
	id: string;
	name: string;
	needsNameCompletion: boolean;
	email: string | null;
	hasInternalEmail: boolean;
	phoneNumber: string | null;
	phoneNumberVerified: boolean;
	image: string | null;
	role: UserRole | string | null;
	isAnonymous: boolean;
	isBanned: boolean;
	banReason: string | null;
	banExpires: Date | null;
	createdAt: Date;
	updatedAt: Date;
	authMethods: AuthMethodDTO[];
};

export type CheckoutCustomerDTO = {
	id: string;
	name: string;
	email: string | null;
	phoneNumber: string | null;
	isAnonymous: boolean;
};

export type SessionDTO = {
	id: string;
	userId: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	impersonatedBy: string | null;
	isCurrent: boolean;
};

export type PaginatedResult<T> = {
	items: T[];
	total: number;
	limit: number;
	offset: number;
};

export type ListSessionsOptions = {
	currentSessionId?: string | null;
	limit?: number;
	offset?: number;
};

export type SessionListResult = PaginatedResult<SessionDTO>;

export type UserAdminDTO = {
	id: string;
	name: string;
	email: string | null;
	hasInternalEmail: boolean;
	phoneNumber: string | null;
	phoneNumberVerified: boolean;
	image: string | null;
	role: UserRole | string | null;
	isAnonymous: boolean;
	isBanned: boolean;
	banReason: string | null;
	banExpires: Date | null;
	createdAt: Date;
	updatedAt: Date;
	authMethodCount: number;
	sessionCount: number;
	lastActiveAt?: Date | null;
	lastActiveIp?: string | null;
	lastActiveUserAgent?: string | null;
	authMethods?: AuthMethodDTO[];
};

export type ListUsersOptions = {
	query?: string | null;
	role?: UserRole | null;
	banned?: boolean | null;
	provider?: string | null;
	createdAfter?: Date | null;
	createdBefore?: Date | null;
	limit?: number;
	offset?: number;
};

export type UserListResult = PaginatedResult<UserAdminDTO>;

export type SetUserRoleInput = {
	userId: string;
	role: UserRole;
};

export type BanUserInput = {
	userId: string;
	reason?: string | null;
	expiresAt?: Date | null;
	revokeSessions?: boolean;
};

export type RevokeUserSessionsInput = {
	userId: string;
	sessionIds?: string[];
};

export type SessionRevokeResult = {
	revokedCount: number;
};

export type AccountDeletionPreparation = {
	reviewMediaKeys: string[];
	anonymizedOrderCount: number;
};
