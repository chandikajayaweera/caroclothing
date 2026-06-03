import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	like,
	ne,
	or,
	exists,
	isNotNull,
	gte,
	lte,
	type SQL
} from 'drizzle-orm';

import { getDb } from '$lib/server/db';
import { AuthError, ErrorCode } from '$lib/server/infrastructure/errors';
import { getEnv } from '$lib/server/infrastructure/env';
import type { ServiceContext } from '$lib/server/foundation/context';
import type { UserRole } from '$lib/shared/modules/access-control';

import {
	account as accountTable,
	session as sessionTable,
	user as userTable
} from './auth.drizzle';
import { repairTempUserEmailFromLinkedGoogleAccount } from './database-hook';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import type {
	AccountProfileDTO,
	AuthMethodDTO,
	AuthMethodType,
	AuthRedirectPath,
	BanUserInput,
	CheckoutCustomerDTO,
	GetSafeAuthRedirectInput,
	ListSessionsOptions,
	ListUsersOptions,
	RevokeUserSessionsInput,
	SessionDTO,
	SessionListResult,
	SessionRevokeResult,
	SetUserRoleInput,
	UserAdminDTO,
	UserListResult
} from './auth.types';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | Tx;
type UserRow = typeof userTable.$inferSelect;

type SafeAccountRow = {
	id: string;
	userId: string;
	providerId: string;
	createdAt: Date;
};

type SafeSessionRow = {
	id: string;
	userId: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	impersonatedBy: string | null;
};

const ADMIN_ROLE = 'adminUser' satisfies UserRole;
const CUSTOMER_ROLE = 'customerUser' satisfies UserRole;
const ALLOWED_ROLES = new Set<UserRole>([ADMIN_ROLE, CUSTOMER_ROLE]);

const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
const ANONYMOUS_EMAIL_DOMAIN = '@anon.caroclothing.lk';
const DEFAULT_AUTH_REDIRECT = '/account' satisfies AuthRedirectPath;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_BAN_REASON_LENGTH = 500;

const ALLOWED_REDIRECT_PATHS = new Set<AuthRedirectPath>([
	'/',
	'/account',
	'/account/addresses',
	'/account/orders',
	'/app',
	'/bag',
	'/checkout',
	'/drops',
	'/shop',
	'/wishlist'
]);

export function getSafeAuthRedirectTo(input: GetSafeAuthRedirectInput): string {
	const defaultPath = input.defaultPath ?? DEFAULT_AUTH_REDIRECT;

	if (!input.value || !input.value.startsWith('/') || input.value.startsWith('//')) {
		return defaultPath;
	}

	let redirectUrl: URL;

	try {
		redirectUrl = new URL(input.value, getEnv().PUBLIC_APP_URL);
	} catch {
		return defaultPath;
	}

	if (!ALLOWED_REDIRECT_PATHS.has(redirectUrl.pathname as AuthRedirectPath)) {
		return defaultPath;
	}

	return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
}

export async function getMyAccountProfile(ctx: ServiceContext): Promise<AccountProfileDTO> {
	const actor = requireActor(ctx.actor);

	return loadAccountProfile(getDb(), actor.id, ctx);
}

export async function getAccountProfile(
	ctx: ServiceContext,
	input: { userId: string }
): Promise<AccountProfileDTO> {
	const userId = normalizeId(input.userId, 'userId');
	requireOwnerOrAdmin(ctx.actor, userId);

	return loadAccountProfile(getDb(), userId, ctx);
}

export async function getCheckoutCustomer(ctx: ServiceContext): Promise<CheckoutCustomerDTO> {
	const actor = requireActor(ctx.actor);
	const user = await loadUserById(getDb(), actor.id);

	if (isUserBanned(user, getNow(ctx))) {
		throw new AuthError('Account is suspended.', ErrorCode.ACCOUNT_SUSPENDED);
	}

	return {
		id: user.id,
		name: user.name,
		email: resolvePublicEmail(user.email),
		phoneNumber: user.phoneNumber,
		isAnonymous: user.isAnonymous === true
	};
}

export async function updateMyDisplayName(
	ctx: ServiceContext,
	input: { name: string }
): Promise<AccountProfileDTO> {
	const actor = requireActor(ctx.actor);
	const name = normalizeDisplayName(input.name);

	const [updated] = await getDb()
		.update(userTable)
		.set({ name, updatedAt: getNow(ctx) })
		.where(eq(userTable.id, actor.id))
		.returning({ id: userTable.id });

	if (!updated) {
		throw new AuthError('User not found.', ErrorCode.NOT_FOUND);
	}

	return loadAccountProfile(getDb(), actor.id, ctx);
}

export async function repairMyTempEmailFromLinkedGoogle(
	ctx: ServiceContext
): Promise<AccountProfileDTO> {
	const actor = requireActor(ctx.actor);

	await repairTempUserEmailFromLinkedGoogleAccount(actor.id);

	return loadAccountProfile(getDb(), actor.id, ctx);
}

export async function listMyAuthMethods(ctx: ServiceContext): Promise<AuthMethodDTO[]> {
	const actor = requireActor(ctx.actor);
	const user = await loadUserById(getDb(), actor.id);
	const accountsByUserId = await loadSafeAccountsByUserIds(getDb(), [actor.id]);

	return buildAuthMethods(user, accountsByUserId.get(actor.id) ?? []);
}

export async function listMySessions(
	ctx: ServiceContext,
	options: ListSessionsOptions = {}
): Promise<SessionListResult> {
	const actor = requireActor(ctx.actor);

	return listSessionsForUser(getDb(), actor.id, options);
}

export async function revokeMySession(
	ctx: ServiceContext,
	input: { sessionId: string }
): Promise<SessionRevokeResult> {
	const actor = requireActor(ctx.actor);
	const sessionId = normalizeId(input.sessionId, 'sessionId');

	const deleted = await getDb()
		.delete(sessionTable)
		.where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, actor.id)))
		.returning({ id: sessionTable.id });

	return { revokedCount: deleted.length };
}

export async function listUsers(
	ctx: ServiceContext,
	options: ListUsersOptions = {}
): Promise<UserListResult> {
	requireAdmin(ctx.actor);

	const db = getDb();
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const where = buildUserListWhere(options);

	const [totalRow] = await db.select({ total: count() }).from(userTable).where(where);
	const rows = await db
		.select()
		.from(userTable)
		.where(where)
		.orderBy(desc(userTable.createdAt))
		.limit(limit)
		.offset(offset);

	return {
		items: await hydrateUserAdminDTOs(db, rows, ctx, { includeAuthMethods: true }),
		total: totalRow?.total ?? 0,
		limit,
		offset
	};
}

export async function getUserAdminProfile(
	ctx: ServiceContext,
	input: { userId: string }
): Promise<UserAdminDTO> {
	requireAdmin(ctx.actor);

	return loadUserAdminDTO(getDb(), normalizeId(input.userId, 'userId'), ctx, {
		includeAuthMethods: true
	});
}

export async function setUserRole(
	ctx: ServiceContext,
	input: SetUserRoleInput
): Promise<UserAdminDTO> {
	const actor = requireAdmin(ctx.actor);
	const userId = normalizeId(input.userId, 'userId');
	const role = normalizeUserRole(input.role);

	if (actor.id === userId) {
		throw new AuthError('You cannot change your own role.', ErrorCode.FORBIDDEN);
	}

	await getDb().transaction(async (tx) => {
		const target = await loadUserById(tx, userId);

		if (isActiveAdmin(target, getNow(ctx)) && role !== ADMIN_ROLE) {
			await assertAnotherActiveAdminExists(tx, userId, ctx);
		}

		await tx
			.update(userTable)
			.set({ role, updatedAt: getNow(ctx) })
			.where(eq(userTable.id, userId));
	});

	return loadUserAdminDTO(getDb(), userId, ctx, { includeAuthMethods: true });
}

export async function banUser(ctx: ServiceContext, input: BanUserInput): Promise<UserAdminDTO> {
	const actor = requireAdmin(ctx.actor);
	const userId = normalizeId(input.userId, 'userId');
	const reason = normalizeOptionalText(input.reason, 'reason', MAX_BAN_REASON_LENGTH);
	const expiresAt = normalizeBanExpires(input.expiresAt, ctx);

	if (actor.id === userId) {
		throw new AuthError('You cannot ban your own account.', ErrorCode.FORBIDDEN);
	}

	await getDb().transaction(async (tx) => {
		const target = await loadUserById(tx, userId);

		if (isActiveAdmin(target, getNow(ctx))) {
			await assertAnotherActiveAdminExists(tx, userId, ctx);
		}

		await tx
			.update(userTable)
			.set({
				banned: true,
				banReason: reason,
				banExpires: expiresAt,
				updatedAt: getNow(ctx)
			})
			.where(eq(userTable.id, userId));

		if (input.revokeSessions ?? true) {
			await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));
		}
	});

	return loadUserAdminDTO(getDb(), userId, ctx, { includeAuthMethods: true });
}

export async function unbanUser(
	ctx: ServiceContext,
	input: { userId: string }
): Promise<UserAdminDTO> {
	requireAdmin(ctx.actor);
	const userId = normalizeId(input.userId, 'userId');

	const [updated] = await getDb()
		.update(userTable)
		.set({
			banned: false,
			banReason: null,
			banExpires: null,
			updatedAt: getNow(ctx)
		})
		.where(eq(userTable.id, userId))
		.returning({ id: userTable.id });

	if (!updated) {
		throw new AuthError('User not found.', ErrorCode.NOT_FOUND);
	}

	return loadUserAdminDTO(getDb(), userId, ctx, { includeAuthMethods: true });
}

export async function listUserSessions(
	ctx: ServiceContext,
	input: { userId: string } & ListSessionsOptions
): Promise<SessionListResult> {
	requireAdmin(ctx.actor);

	const userId = normalizeId(input.userId, 'userId');
	await loadUserById(getDb(), userId);

	return listSessionsForUser(getDb(), userId, input);
}

export async function revokeUserSessions(
	ctx: ServiceContext,
	input: RevokeUserSessionsInput
): Promise<SessionRevokeResult> {
	requireAdmin(ctx.actor);

	const userId = normalizeId(input.userId, 'userId');
	const sessionIds = input.sessionIds ? uniqueStrings(input.sessionIds) : undefined;

	if (sessionIds && sessionIds.length === 0) {
		return { revokedCount: 0 };
	}

	const revokedCount = await getDb().transaction(async (tx) => {
		await loadUserById(tx, userId);

		const where = sessionIds
			? and(eq(sessionTable.userId, userId), inArray(sessionTable.id, sessionIds))
			: eq(sessionTable.userId, userId);
		const deleted = await tx.delete(sessionTable).where(where).returning({ id: sessionTable.id });

		return deleted.length;
	});

	return { revokedCount };
}

export async function repairUserTempEmailFromLinkedGoogle(
	ctx: ServiceContext,
	input: { userId: string }
): Promise<UserAdminDTO> {
	requireAdmin(ctx.actor);

	const userId = normalizeId(input.userId, 'userId');
	await repairTempUserEmailFromLinkedGoogleAccount(userId);

	return loadUserAdminDTO(getDb(), userId, ctx, { includeAuthMethods: true });
}

async function loadAccountProfile(
	db: QueryExecutor,
	userId: string,
	ctx: ServiceContext
): Promise<AccountProfileDTO> {
	const user = await loadUserById(db, userId);
	const accountsByUserId = await loadSafeAccountsByUserIds(db, [user.id]);

	return toAccountProfileDTO(user, accountsByUserId.get(user.id) ?? [], ctx);
}

async function loadUserAdminDTO(
	db: QueryExecutor,
	userId: string,
	ctx: ServiceContext,
	options: { includeAuthMethods: boolean }
): Promise<UserAdminDTO> {
	const user = await loadUserById(db, userId);
	const [dto] = await hydrateUserAdminDTOs(db, [user], ctx, options);

	if (!dto) {
		throw new AuthError('User not found.', ErrorCode.NOT_FOUND);
	}

	return dto;
}

async function hydrateUserAdminDTOs(
	db: QueryExecutor,
	users: UserRow[],
	ctx: ServiceContext,
	options: { includeAuthMethods: boolean }
): Promise<UserAdminDTO[]> {
	if (users.length === 0) return [];

	const userIds = users.map((row) => row.id);
	const [accountsByUserId, sessionCountByUserId, latestSessionByUserId] = await Promise.all([
		loadSafeAccountsByUserIds(db, userIds),
		countSessionsForUserIds(db, userIds),
		loadLatestSessionsForUserIds(db, userIds)
	]);

	return users.map((row) => {
		const authMethods = buildAuthMethods(row, accountsByUserId.get(row.id) ?? []);
		const latestSession = latestSessionByUserId.get(row.id);
		const dto: UserAdminDTO = {
			id: row.id,
			name: row.name,
			email: resolvePublicEmail(row.email),
			hasInternalEmail: isInternalTempEmail(row.email),
			phoneNumber: row.phoneNumber,
			phoneNumberVerified: row.phoneNumberVerified === true,
			image: row.image,
			role: resolveUserRole(row.role),
			isAnonymous: row.isAnonymous === true,
			isBanned: isUserBanned(row, getNow(ctx)),
			banReason: row.banReason,
			banExpires: row.banExpires,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			authMethodCount: authMethods.length,
			sessionCount: sessionCountByUserId.get(row.id) ?? 0,
			lastActiveAt: latestSession?.updatedAt ?? null,
			lastActiveIp: latestSession?.ipAddress ?? null,
			lastActiveUserAgent: latestSession?.userAgent ?? null
		};

		if (options.includeAuthMethods) {
			dto.authMethods = authMethods;
		}

		return dto;
	});
}

async function listSessionsForUser(
	db: QueryExecutor,
	userId: string,
	options: ListSessionsOptions
): Promise<SessionListResult> {
	const normalizedUserId = normalizeId(userId, 'userId');
	const limit = normalizeLimit(options.limit);
	const offset = normalizeOffset(options.offset);
	const [totalRow] = await db
		.select({ total: count() })
		.from(sessionTable)
		.where(eq(sessionTable.userId, normalizedUserId));
	const rows = await db
		.select({
			id: sessionTable.id,
			userId: sessionTable.userId,
			expiresAt: sessionTable.expiresAt,
			createdAt: sessionTable.createdAt,
			updatedAt: sessionTable.updatedAt,
			ipAddress: sessionTable.ipAddress,
			userAgent: sessionTable.userAgent,
			impersonatedBy: sessionTable.impersonatedBy
		})
		.from(sessionTable)
		.where(eq(sessionTable.userId, normalizedUserId))
		.orderBy(desc(sessionTable.updatedAt))
		.limit(limit)
		.offset(offset);

	return {
		items: rows.map((row) => toSessionDTO(row, options.currentSessionId)),
		total: totalRow?.total ?? 0,
		limit,
		offset
	};
}

async function loadUserById(db: QueryExecutor, userId: string): Promise<UserRow> {
	const [row] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.id, normalizeId(userId, 'userId')))
		.limit(1);

	if (!row) {
		throw new AuthError('User not found.', ErrorCode.NOT_FOUND);
	}

	return row;
}

async function loadSafeAccountsByUserIds(
	db: QueryExecutor,
	userIds: string[]
): Promise<Map<string, SafeAccountRow[]>> {
	const ids = uniqueStrings(userIds);
	if (ids.length === 0) return new Map();

	const rows = await db
		.select({
			id: accountTable.id,
			userId: accountTable.userId,
			providerId: accountTable.providerId,
			createdAt: accountTable.createdAt
		})
		.from(accountTable)
		.where(inArray(accountTable.userId, ids))
		.orderBy(asc(accountTable.createdAt));

	return groupAccountsByUserId(rows);
}

async function countSessionsForUserIds(
	db: QueryExecutor,
	userIds: string[]
): Promise<Map<string, number>> {
	const ids = uniqueStrings(userIds);
	if (ids.length === 0) return new Map();

	const rows = await db
		.select({
			userId: sessionTable.userId,
			total: count()
		})
		.from(sessionTable)
		.where(inArray(sessionTable.userId, ids))
		.groupBy(sessionTable.userId);

	return new Map(rows.map((row) => [row.userId, row.total]));
}

async function loadLatestSessionsForUserIds(
	db: QueryExecutor,
	userIds: string[]
): Promise<
	Map<
		string,
		{
			updatedAt: Date;
			ipAddress: string | null;
			userAgent: string | null;
		}
	>
> {
	const ids = uniqueStrings(userIds);
	if (ids.length === 0) return new Map();

	const rows = await db
		.select({
			userId: sessionTable.userId,
			updatedAt: sessionTable.updatedAt,
			ipAddress: sessionTable.ipAddress,
			userAgent: sessionTable.userAgent
		})
		.from(sessionTable)
		.where(inArray(sessionTable.userId, ids));

	const latestMap = new Map<
		string,
		{
			updatedAt: Date;
			ipAddress: string | null;
			userAgent: string | null;
		}
	>();

	for (const row of rows) {
		const existing = latestMap.get(row.userId);
		if (!existing || row.updatedAt > existing.updatedAt) {
			latestMap.set(row.userId, {
				updatedAt: row.updatedAt,
				ipAddress: row.ipAddress,
				userAgent: row.userAgent
			});
		}
	}

	return latestMap;
}

async function assertAnotherActiveAdminExists(
	tx: Tx,
	excludedUserId: string,
	ctx: ServiceContext
): Promise<void> {
	const [row] = await tx
		.select({ id: userTable.id })
		.from(userTable)
		.where(
			and(
				ne(userTable.id, excludedUserId),
				eq(userTable.role, ADMIN_ROLE),
				or(eq(userTable.banned, false), isNull(userTable.banned)),
				or(isNull(userTable.banExpires), gt(userTable.banExpires, getNow(ctx)))
			)
		)
		.limit(1);

	if (!row) {
		throw new AuthError('At least one active admin is required.', ErrorCode.FORBIDDEN);
	}
}

function buildUserListWhere(options: ListUsersOptions): SQL | undefined {
	const conditions: SQL[] = [];
	const query = normalizeOptionalText(options.query, 'query', 120);

	if (query) {
		const pattern = `%${sanitizeLikeTerm(query)}%`;
		const searchCondition = or(
			like(userTable.name, pattern),
			like(userTable.email, pattern),
			like(userTable.phoneNumber, pattern)
		);

		if (searchCondition) conditions.push(searchCondition);
	}

	if (options.role) {
		conditions.push(eq(userTable.role, normalizeUserRole(options.role)));
	}

	if (typeof options.banned === 'boolean') {
		conditions.push(eq(userTable.banned, options.banned));
	}

	if (options.provider) {
		if (options.provider === 'anonymous') {
			conditions.push(eq(userTable.isAnonymous, true));
		} else if (options.provider === 'phone') {
			conditions.push(isNotNull(userTable.phoneNumber));
		} else if (options.provider === 'google') {
			conditions.push(
				exists(
					getDb()
						.select()
						.from(accountTable)
						.where(
							and(eq(accountTable.userId, userTable.id), eq(accountTable.providerId, 'google'))
						)
				)
			);
		}
	}

	if (options.createdAfter) {
		conditions.push(gte(userTable.createdAt, options.createdAfter));
	}

	if (options.createdBefore) {
		conditions.push(lte(userTable.createdAt, options.createdBefore));
	}

	if (conditions.length === 0) return undefined;

	return and(...conditions);
}

function toAccountProfileDTO(
	user: UserRow,
	accounts: SafeAccountRow[],
	ctx: ServiceContext
): AccountProfileDTO {
	return {
		id: user.id,
		name: user.name,
		email: resolvePublicEmail(user.email),
		hasInternalEmail: isInternalTempEmail(user.email),
		phoneNumber: user.phoneNumber,
		phoneNumberVerified: user.phoneNumberVerified === true,
		image: user.image,
		role: resolveUserRole(user.role),
		isAnonymous: user.isAnonymous === true,
		isBanned: isUserBanned(user, getNow(ctx)),
		banReason: user.banReason,
		banExpires: user.banExpires,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		authMethods: buildAuthMethods(user, accounts)
	};
}

function buildAuthMethods(user: UserRow, accounts: SafeAccountRow[]): AuthMethodDTO[] {
	const methods: AuthMethodDTO[] = [];

	if (user.phoneNumber) {
		methods.push({
			id: `phone:${user.id}`,
			type: 'phone',
			providerId: 'phone',
			label: 'Phone number',
			linkedAt: user.updatedAt,
			verified: user.phoneNumberVerified === true
		});
	}

	for (const account of accounts) {
		const type = providerToAuthMethodType(account.providerId);

		methods.push({
			id: account.id,
			type,
			providerId: account.providerId,
			label: authMethodLabel(type, account.providerId),
			linkedAt: account.createdAt,
			verified: type === 'google' ? true : null
		});
	}

	if (user.isAnonymous) {
		methods.push({
			id: `anonymous:${user.id}`,
			type: 'anonymous',
			providerId: 'anonymous',
			label: 'Guest session',
			linkedAt: user.createdAt,
			verified: null
		});
	}

	return methods;
}

function toSessionDTO(row: SafeSessionRow, currentSessionId?: string | null): SessionDTO {
	return {
		id: row.id,
		userId: row.userId,
		expiresAt: row.expiresAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		ipAddress: row.ipAddress,
		userAgent: row.userAgent,
		impersonatedBy: row.impersonatedBy,
		isCurrent: Boolean(currentSessionId && row.id === currentSessionId)
	};
}

function providerToAuthMethodType(providerId: string): AuthMethodType {
	if (providerId === 'google') return 'google';
	if (providerId === 'credential') return 'password';
	if (providerId === 'phone') return 'phone';
	if (providerId === 'anonymous') return 'anonymous';

	return 'provider';
}

function authMethodLabel(type: AuthMethodType, providerId: string): string {
	if (type === 'google') return 'Google';
	if (type === 'password') return 'Password';
	if (type === 'phone') return 'Phone number';
	if (type === 'anonymous') return 'Guest session';

	return providerId;
}

function resolveUserRole(role: string | null): UserRole | string | null {
	return role ?? CUSTOMER_ROLE;
}

function normalizeUserRole(role: UserRole): UserRole {
	if (!ALLOWED_ROLES.has(role)) {
		throw new AuthError('Invalid user role.', ErrorCode.VALIDATION_ERROR, undefined, { role });
	}

	return role;
}

function normalizeDisplayName(value: string): string {
	const normalized = normalizeText(value, 'displayName', MAX_DISPLAY_NAME_LENGTH);

	if (!normalized) {
		throw new AuthError('Display name is required.', ErrorCode.VALIDATION_ERROR);
	}

	return normalized;
}

function normalizeBanExpires(value: Date | null | undefined, ctx: ServiceContext): Date | null {
	if (!value) return null;

	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		throw new AuthError('Ban expiration must be a valid date.', ErrorCode.VALIDATION_ERROR);
	}

	if (value <= getNow(ctx)) {
		throw new AuthError('Ban expiration must be in the future.', ErrorCode.VALIDATION_ERROR);
	}

	return value;
}

function normalizeOptionalText(
	value: string | null | undefined,
	field: string,
	maxLength: number
): string | null {
	if (value == null) return null;
	if (typeof value !== 'string') {
		throw new AuthError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, undefined, { field });
	}

	const normalized = value.trim().replace(/\s+/g, ' ');
	if (!normalized) return null;

	if (normalized.length > maxLength) {
		throw new AuthError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, undefined, {
			field,
			maxLength
		});
	}

	return normalized;
}

function normalizeId(value: string, field: string): string {
	return normalizeText(value, field, 255);
}

function normalizeText(value: string, field: string, maxLength: number): string {
	if (typeof value !== 'string') {
		throw new AuthError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, undefined, { field });
	}

	const normalized = value.trim().replace(/\s+/g, ' ');

	if (!normalized || normalized.length > maxLength) {
		throw new AuthError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, undefined, {
			field,
			maxLength
		});
	}

	return normalized;
}

function normalizeLimit(limit: number | undefined): number {
	if (limit === undefined) return DEFAULT_LIMIT;
	if (!Number.isInteger(limit) || limit < 1) {
		throw new AuthError('Invalid limit.', ErrorCode.VALIDATION_ERROR);
	}

	return Math.min(limit, MAX_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
	if (offset === undefined) return 0;
	if (!Number.isInteger(offset) || offset < 0) {
		throw new AuthError('Invalid offset.', ErrorCode.VALIDATION_ERROR);
	}

	return offset;
}

function isActiveAdmin(user: UserRow, now: Date): boolean {
	return resolveUserRole(user.role) === ADMIN_ROLE && !isUserBanned(user, now);
}

function isUserBanned(row: Pick<UserRow, 'banned' | 'banExpires'>, now: Date): boolean {
	if (row.banned !== true) return false;

	return !row.banExpires || row.banExpires > now;
}

function isInternalTempEmail(email: string | null): boolean {
	if (!email) return false;

	const normalizedEmail = email.trim().toLowerCase();
	return (
		normalizedEmail.endsWith(PHONE_EMAIL_DOMAIN) || normalizedEmail.endsWith(ANONYMOUS_EMAIL_DOMAIN)
	);
}

function resolvePublicEmail(email: string | null): string | null {
	if (!email || isInternalTempEmail(email)) return null;

	return email;
}

function sanitizeLikeTerm(value: string): string {
	return value.replace(/[%_]/g, '');
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(
			values
				.filter((value): value is string => typeof value === 'string')
				.map((value) => value.trim())
				.filter(Boolean)
		)
	);
}

function groupAccountsByUserId(rows: SafeAccountRow[]): Map<string, SafeAccountRow[]> {
	const groups = new Map<string, SafeAccountRow[]>();

	for (const row of rows) {
		const current = groups.get(row.userId) ?? [];
		current.push(row);
		groups.set(row.userId, current);
	}

	return groups;
}

function getNow(ctx: ServiceContext): Date {
	return ctx.now ?? new Date();
}
