import { and, asc, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { adminUser, customerUser, type UserRole } from '$lib/client/modules/auth/access-control';
import {
	AddressError,
	AuthError,
	ErrorCode,
	getErrorMessage,
	isAppError
} from '$lib/server/modules/errors';
import {
	address,
	insertAddressSchema,
	updateAddressSchema,
	type Address
} from './addresses.drizzle';

export type AddressServiceActor = {
	id: string;
	role?: UserRole | string | null;
};

export type AddressSnapshot = Pick<
	Address,
	'recipientName' | 'phone' | 'addressLine1' | 'addressLine2' | 'city' | 'district' | 'postalCode'
>;

const createAddressInputSchema = insertAddressSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true
});

const updateAddressInputSchema = updateAddressSchema.omit({
	id: true,
	userId: true,
	createdAt: true,
	updatedAt: true
});

const createGuestAddressInputSchema = createAddressInputSchema.omit({
	userId: true,
	isDefault: true
});

export type CreateAddressInput = z.infer<typeof createAddressInputSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressInputSchema>;
export type CreateGuestAddressInput = z.infer<typeof createGuestAddressInputSchema>;

export type ListAddressesOptions = {
	actor: AddressServiceActor;
	userId?: string | null;
	includeGuests?: boolean;
	limit?: number;
	offset?: number;
};

export type AddressMutationOptions = {
	actor: AddressServiceActor;
};

export async function listAddresses(options: ListAddressesOptions): Promise<Address[]> {
	assertAddressPermission(options.actor, 'read');

	const filters = buildListFilters(options);

	return getDb()
		.select()
		.from(address)
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(address.isDefault), asc(address.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function listUserAddresses(
	userId: string,
	options: AddressMutationOptions & { limit?: number; offset?: number }
): Promise<Address[]> {
	assertCanAccessUserAddresses(options.actor, userId, 'read');

	return getDb()
		.select()
		.from(address)
		.where(eq(address.userId, userId))
		.orderBy(desc(address.isDefault), asc(address.createdAt))
		.limit(normalizeLimit(options.limit))
		.offset(normalizeOffset(options.offset));
}

export async function getAddressById(
	id: string,
	options: AddressMutationOptions
): Promise<Address> {
	assertAddressPermission(options.actor, 'read');

	const row = await findAddressById(id);
	if (!row) notFound('Address not found.', { id });

	assertCanAccessAddress(options.actor, row, 'read');
	return row;
}

export async function getDefaultAddress(
	userId: string,
	options: AddressMutationOptions
): Promise<Address> {
	assertCanAccessUserAddresses(options.actor, userId, 'read');

	const [row] = await getDb()
		.select()
		.from(address)
		.where(and(eq(address.userId, userId), eq(address.isDefault, true)))
		.limit(1);

	if (!row) {
		throw new AddressError('Default address not found.', ErrorCode.DEFAULT_ADDRESS_NOT_FOUND, {
			userId
		});
	}

	return row;
}

export async function createAddress(
	input: CreateAddressInput,
	options: AddressMutationOptions
): Promise<Address> {
	assertAddressPermission(options.actor, 'create');

	const parsed = parseAddressInput(createAddressInputSchema, input, 'address');
	const userId = resolveSavedAddressUserId(options.actor, parsed.userId);
	const isDefault = await shouldMakeDefault(userId, parsed.isDefault);

	try {
		return getDb().transaction(async (tx) => {
			if (isDefault) {
				await tx.update(address).set({ isDefault: false }).where(eq(address.userId, userId));
			}

			const [created] = await tx
				.insert(address)
				.values({ ...parsed, userId, isDefault })
				.returning();

			return created;
		});
	} catch (error) {
		wrapAddressPersistenceError(error, 'Address already exists.');
	}
}

export async function createGuestAddress(input: CreateGuestAddressInput): Promise<Address> {
	const parsed = parseAddressInput(createGuestAddressInputSchema, input, 'guest address');

	try {
		const [created] = await getDb()
			.insert(address)
			.values({ ...parsed, userId: null, isDefault: false })
			.returning();

		return created;
	} catch (error) {
		wrapAddressPersistenceError(error, 'Unable to create guest address.');
	}
}

export async function updateAddress(
	id: string,
	input: UpdateAddressInput,
	options: AddressMutationOptions
): Promise<Address> {
	assertAddressPermission(options.actor, 'update');

	const existing = await getAddressById(id, options);
	assertCanAccessAddress(options.actor, existing, 'update');

	const parsed = parseAddressInput(updateAddressInputSchema, input, 'address');
	assertNonEmptyUpdate(parsed, 'address');

	if (parsed.isDefault && !existing.userId) {
		throw new AddressError('Guest address cannot be default.', ErrorCode.INVALID_ADDRESS, { id });
	}

	try {
		return getDb().transaction(async (tx) => {
			if (parsed.isDefault && existing.userId) {
				await tx
					.update(address)
					.set({ isDefault: false })
					.where(eq(address.userId, existing.userId));
			}

			const [updated] = await tx.update(address).set(parsed).where(eq(address.id, id)).returning();

			if (!updated) notFound('Address not found.', { id });
			return updated;
		});
	} catch (error) {
		wrapAddressPersistenceError(error, 'Unable to update address.');
	}
}

export async function setDefaultAddress(
	id: string,
	options: AddressMutationOptions
): Promise<Address> {
	assertAddressPermission(options.actor, 'update');

	const existing = await getAddressById(id, options);
	assertCanAccessAddress(options.actor, existing, 'update');

	if (!existing.userId) {
		throw new AddressError('Guest address cannot be default.', ErrorCode.INVALID_ADDRESS, { id });
	}

	const userId = existing.userId;

	return getDb().transaction(async (tx) => {
		await tx.update(address).set({ isDefault: false }).where(eq(address.userId, userId));

		const [updated] = await tx
			.update(address)
			.set({ isDefault: true })
			.where(eq(address.id, id))
			.returning();

		if (!updated) notFound('Address not found.', { id });
		return updated;
	});
}

export async function clearDefaultAddress(
	id: string,
	options: AddressMutationOptions
): Promise<Address> {
	return updateAddress(id, { isDefault: false }, options);
}

export async function deleteAddress(id: string, options: AddressMutationOptions): Promise<Address> {
	assertAddressPermission(options.actor, 'delete');

	const existing = await getAddressById(id, options);
	assertCanAccessAddress(options.actor, existing, 'delete');

	return getDb().transaction(async (tx) => {
		const [deleted] = await tx.delete(address).where(eq(address.id, id)).returning();
		if (!deleted) notFound('Address not found.', { id });

		if (existing.userId && existing.isDefault) {
			const [nextDefault] = await tx
				.select()
				.from(address)
				.where(eq(address.userId, existing.userId))
				.orderBy(asc(address.createdAt))
				.limit(1);

			if (nextDefault) {
				await tx.update(address).set({ isDefault: true }).where(eq(address.id, nextDefault.id));
			}
		}

		return deleted;
	});
}

export async function deleteUserAddresses(
	userId: string,
	options: AddressMutationOptions
): Promise<Address[]> {
	assertCanAccessUserAddresses(options.actor, userId, 'delete');

	const deleted = await getDb().delete(address).where(eq(address.userId, userId)).returning();
	return deleted;
}

export async function createAddressSnapshotFromId(
	id: string,
	options: AddressMutationOptions
): Promise<AddressSnapshot> {
	const row = await getAddressById(id, options);
	return toAddressSnapshot(row);
}

export function toAddressSnapshot(row: Address): AddressSnapshot {
	return {
		recipientName: row.recipientName,
		phone: row.phone,
		addressLine1: row.addressLine1,
		addressLine2: row.addressLine2,
		city: row.city,
		district: row.district,
		postalCode: row.postalCode
	};
}

async function findAddressById(id: string): Promise<Address | null> {
	const [row] = await getDb().select().from(address).where(eq(address.id, id)).limit(1);
	return row ?? null;
}

async function shouldMakeDefault(userId: string, requestedDefault: boolean | undefined) {
	if (requestedDefault === true) return true;
	if (requestedDefault === false) return false;

	const [existingDefault] = await getDb()
		.select({ id: address.id })
		.from(address)
		.where(and(eq(address.userId, userId), eq(address.isDefault, true)))
		.limit(1);

	return !existingDefault;
}

function buildListFilters(options: ListAddressesOptions): SQL[] {
	const filters: SQL[] = [];

	if (isAdmin(options.actor)) {
		if (options.userId === null) filters.push(isNull(address.userId));
		if (typeof options.userId === 'string') filters.push(eq(address.userId, options.userId));
		if (!options.includeGuests && options.userId === undefined)
			filters.push(isNotNull(address.userId));
		return filters;
	}

	if (options.userId && options.userId !== options.actor.id) {
		throw new AuthError(
			'You do not have permission to access addresses for this user.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ userId: options.userId, action: 'read' }
		);
	}

	filters.push(eq(address.userId, options.actor.id));
	return filters;
}

function resolveSavedAddressUserId(
	actor: AddressServiceActor,
	inputUserId: string | null | undefined
): string {
	if (isAdmin(actor)) {
		if (!inputUserId) {
			throw new AddressError('Saved address requires a user.', ErrorCode.INVALID_ADDRESS);
		}
		return inputUserId;
	}

	if (inputUserId && inputUserId !== actor.id) {
		throw new AuthError(
			'You do not have permission to create addresses for this user.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ userId: inputUserId }
		);
	}

	return actor.id;
}

function assertCanAccessUserAddresses(
	actor: AddressServiceActor,
	userId: string,
	action: AddressAction
): void {
	assertAddressPermission(actor, action);

	if (isAdmin(actor) || actor.id === userId) return;

	throw new AuthError(
		'You do not have permission to access addresses for this user.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		undefined,
		{ userId, action }
	);
}

function assertCanAccessAddress(
	actor: AddressServiceActor,
	row: Address,
	action: AddressAction
): void {
	assertAddressPermission(actor, action);

	if (isAdmin(actor)) return;
	if (row.userId && row.userId === actor.id) return;

	throw new AuthError(
		'You do not have permission to access this address.',
		ErrorCode.INSUFFICIENT_PERMISSIONS,
		undefined,
		{ addressId: row.id, action }
	);
}

type AddressAction = 'create' | 'read' | 'update' | 'delete';

function assertAddressPermission(
	actor: AddressServiceActor | null | undefined,
	action: AddressAction
) {
	const roleId = actor?.role;
	if (!roleId) {
		throw new AuthError('Authentication is required.', ErrorCode.AUTHENTICATION_REQUIRED);
	}

	const role = getAuthorizedRole(roleId);
	const result = role.authorize({ address: [action] });

	if (!result.success) {
		throw new AuthError(
			'You do not have permission to perform this action.',
			ErrorCode.INSUFFICIENT_PERMISSIONS,
			undefined,
			{ resource: 'address', action }
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

function isAdmin(actor: AddressServiceActor): boolean {
	return actor.role === 'adminUser';
}

function parseAddressInput<T>(schema: z.ZodType<T>, input: unknown, entity: string): T {
	const result = schema.safeParse(input);
	if (result.success) return result.data;

	throw new AddressError(`Invalid ${entity} input.`, ErrorCode.VALIDATION_ERROR, {
		entity,
		issues: result.error.issues
	});
}

function assertNonEmptyUpdate(input: Record<string, unknown>, entity: string): void {
	if (Object.values(input).some((value) => value !== undefined)) return;

	throw new AddressError(
		`No ${entity} fields were provided for update.`,
		ErrorCode.VALIDATION_ERROR,
		{
			entity
		}
	);
}

function notFound(message: string, details?: Record<string, unknown>): never {
	throw new AddressError(message, ErrorCode.ADDRESS_NOT_FOUND, details);
}

function wrapAddressPersistenceError(error: unknown, message: string): never {
	if (isAppError(error)) throw error;

	if (isConstraintError(error)) {
		throw new AddressError(message, ErrorCode.ADDRESS_ALREADY_EXISTS, {
			cause: getErrorMessage(error)
		});
	}

	throw error;
}

function isConstraintError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	return message.includes('unique') || message.includes('constraint failed');
}

function normalizeLimit(limit: number | undefined, defaultLimit = 50, maxLimit = 100): number {
	if (limit === undefined) return defaultLimit;
	if (!Number.isFinite(limit)) return defaultLimit;
	return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
}

function normalizeOffset(offset: number | undefined): number {
	if (offset === undefined || !Number.isFinite(offset)) return 0;
	return Math.max(Math.trunc(offset), 0);
}
