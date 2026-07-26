import { and, asc, count, desc, eq, isNotNull, isNull, like, sql, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import { guardPreviousBatchChanges, isD1BatchGuardError } from '$lib/server/db/batch';
import {
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation
} from '$lib/server/db/retry';
import { requireActor, requireAdmin, requireOwnerOrAdmin } from '$lib/server/foundation/guards';
import {
	AddressError,
	ErrorCode,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError,
	normalizeLimit,
	normalizeOffset,
	removeUndefinedValues
} from '$lib/server/foundation/utils';
import {
	address,
	insertAddressSchema,
	SRI_LANKA_DISTRICTS,
	updateAddressSchema,
	type Address,
	type InsertAddress,
	type UpdateAddress
} from './addresses.drizzle';
import type {
	AddressDTO,
	AddressListResult,
	AddressSnapshot,
	AddressSnapshotInput,
	CheckoutAddressDTO,
	CheckoutAddressInput,
	CreateAddressInput,
	ListAddressesOptions,
	ListMyAddressesOptions,
	SriLankaDistrictOption,
	UpdateAddressInput
} from './addresses.types';

type Db = ReturnType<typeof getDb>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function listSriLankaDistrictOptions(): SriLankaDistrictOption[] {
	return SRI_LANKA_DISTRICTS.map((district) => ({
		value: district,
		label: district
	}));
}

export async function createAddress(
	ctx: ServiceContext,
	input: CreateAddressInput
): Promise<AddressDTO> {
	const actor = requireActor(ctx.actor);
	const data = parseInsertAddress({
		...input,
		userId: actor.id
	});

	try {
		const db = getDb();
		const existingCount = await countAddressesForUser(db, actor.id);
		const shouldBeDefault = data.isDefault === true || existingCount === 0;
		const addressId = nanoid();
		const values = {
			id: addressId,
			...data,
			userId: actor.id,
			isDefault: shouldBeDefault
		};
		const insertQuery = db.insert(address).values(values).returning();
		const created = await withTransientD1WriteReconciliation<Address>(
			async () => {
				const createdRows = shouldBeDefault
					? (await db.batch([clearDefaultAddress(db, actor.id), insertQuery]))[1]
					: await insertQuery;
				const [row] = createdRows;
				if (!row) {
					throw new AddressError('Address was not created.', ErrorCode.INTERNAL_ERROR);
				}
				return row;
			},
			async () => {
				const [row] = await db.select().from(address).where(eq(address.id, addressId)).limit(1);
				return row ? { committed: true, value: row } : { committed: false };
			}
		);

		return toAddressDTO(created);
	} catch (error) {
		throw mapAddressPersistenceError(error);
	}
}

export async function listMyAddresses(
	ctx: ServiceContext,
	options: ListMyAddressesOptions = {}
): Promise<AddressListResult> {
	const actor = requireActor(ctx.actor);
	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = eq(address.userId, actor.id);
	const db = getDb();

	const [totalRow] = await withTransientD1ReadRetry(() =>
		db.select({ total: count() }).from(address).where(where)
	);
	const rows = await withTransientD1ReadRetry(() =>
		db
			.select()
			.from(address)
			.where(where)
			.orderBy(desc(address.isDefault), desc(address.updatedAt), asc(address.label))
			.limit(limit)
			.offset(offset)
	);

	return toAddressListResult(rows, totalRow?.total ?? 0, limit, offset);
}

export async function getMyDefaultAddress(ctx: ServiceContext): Promise<AddressDTO | null> {
	const actor = requireActor(ctx.actor);
	const [row] = await withTransientD1ReadRetry(() =>
		getDb()
			.select()
			.from(address)
			.where(and(eq(address.userId, actor.id), eq(address.isDefault, true)))
			.limit(1)
	);

	return row ? toAddressDTO(row) : null;
}

export async function getAddress(
	ctx: ServiceContext,
	input: { addressId: string }
): Promise<AddressDTO> {
	const row = await loadAddressById(getDb(), input.addressId);
	requireOwnerOrAdmin(ctx.actor, row.userId);

	return toAddressDTO(row);
}

export async function updateAddress(
	ctx: ServiceContext,
	input: UpdateAddressInput & { addressId: string }
): Promise<AddressDTO> {
	const actor = requireActor(ctx.actor);
	const addressId = normalizeId(input.addressId, 'addressId');
	const existing = await loadAddressById(getDb(), addressId);

	assertAddressOwner(actor.id, existing);

	const data = parseUpdateAddress(input);
	const updateValues = removeUndefinedValues(data);
	if (existing.isDefault && data.isDefault === false) {
		throw new AddressError(
			'Set another address as default before unsetting this one.',
			ErrorCode.INVALID_ADDRESS,
			{ addressId }
		);
	}

	if (Object.keys(updateValues).length === 0) {
		return toAddressDTO(existing);
	}

	try {
		const db = getDb();
		const updatedAt = new Date();
		const stableUpdateValues = { ...updateValues, updatedAt };
		const updateQuery = db
			.update(address)
			.set(stableUpdateValues)
			.where(
				and(
					eq(address.id, addressId),
					eq(address.userId, actor.id),
					eq(address.updatedAt, existing.updatedAt)
				)
			)
			.returning();
		const updated = await withTransientD1WriteReconciliation<Address>(
			async () => {
				const updatedRows =
					data.isDefault === true
						? (
								await db.batch([
									clearDefaultAddress(db, actor.id),
									updateQuery,
									...guardPreviousBatchChanges(db)
								])
							)[1]
						: await updateQuery;
				const [row] = updatedRows;
				if (!row) {
					throw new AddressError(
						'Address changed while it was being updated.',
						ErrorCode.CONFLICT,
						{ addressId }
					);
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(address)
					.where(and(eq(address.id, addressId), eq(address.userId, actor.id)))
					.limit(1);
				return row && recordMatchesPatch(row, stableUpdateValues)
					? { committed: true, value: row }
					: { committed: false };
			}
		);

		return toAddressDTO(updated);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new AddressError(
				'Address changed while the default address was being updated.',
				ErrorCode.CONFLICT,
				{ addressId }
			);
		}
		throw mapAddressPersistenceError(error);
	}
}

export async function deleteAddress(
	ctx: ServiceContext,
	input: { addressId: string }
): Promise<void> {
	const actor = requireActor(ctx.actor);
	const addressId = normalizeId(input.addressId, 'addressId');
	const db = getDb();
	const existing = await loadOwnedAddress(db, actor.id, addressId);
	const deleteQuery = db
		.delete(address)
		.where(and(eq(address.id, addressId), eq(address.userId, actor.id)))
		.returning({ id: address.id });
	const guard = guardPreviousBatchChanges(db);

	try {
		const statements = existing.isDefault
			? ([
					deleteQuery,
					...guard,
					db
						.update(address)
						.set({ isDefault: true })
						.where(
							eq(
								address.id,
								sql`(SELECT ${address.id} FROM ${address} WHERE ${address.userId} = ${actor.id} ORDER BY ${address.updatedAt} DESC, ${address.createdAt} ASC LIMIT 1)`
							)
						)
				] as Parameters<Db['batch']>[0])
			: ([deleteQuery, ...guard] as Parameters<Db['batch']>[0]);
		await withTransientD1WriteReconciliation(
			async () => {
				await db.batch(statements);
			},
			async () => {
				const [row] = await db
					.select({ id: address.id })
					.from(address)
					.where(eq(address.id, addressId))
					.limit(1);
				return row ? { committed: false } : { committed: true, value: undefined };
			}
		);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new AddressError('Address not found.', ErrorCode.ADDRESS_NOT_FOUND, { addressId });
		}
		throw mapAddressPersistenceError(error);
	}
}

export async function setDefaultAddress(
	ctx: ServiceContext,
	input: { addressId: string }
): Promise<AddressDTO> {
	const actor = requireActor(ctx.actor);
	const addressId = normalizeId(input.addressId, 'addressId');

	try {
		const db = getDb();
		const existing = await loadOwnedAddress(db, actor.id, addressId);
		if (existing.isDefault) return toAddressDTO(existing);
		const updatedAt = new Date();
		const updateQuery = db
			.update(address)
			.set({ isDefault: true, updatedAt })
			.where(
				and(
					eq(address.id, addressId),
					eq(address.userId, actor.id),
					eq(address.updatedAt, existing.updatedAt)
				)
			)
			.returning();
		const updated = await withTransientD1WriteReconciliation<Address>(
			async () => {
				const [, updatedRows] = await db.batch([
					clearDefaultAddress(db, actor.id),
					updateQuery,
					...guardPreviousBatchChanges(db)
				]);
				const [row] = updatedRows;
				if (!row) {
					throw new AddressError('Address not found.', ErrorCode.ADDRESS_NOT_FOUND, {
						addressId
					});
				}
				return row;
			},
			async () => {
				const [row] = await db
					.select()
					.from(address)
					.where(and(eq(address.id, addressId), eq(address.userId, actor.id)))
					.limit(1);
				return row?.isDefault && row.updatedAt.getTime() === updatedAt.getTime()
					? { committed: true, value: row }
					: { committed: false };
			}
		);

		return toAddressDTO(updated);
	} catch (error) {
		throw mapAddressPersistenceError(error);
	}
}

export async function listAddresses(
	ctx: ServiceContext,
	options: ListAddressesOptions = {}
): Promise<AddressListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildAddressListWhere(options);
	const db = getDb();

	const countQuery = db.select({ total: count() }).from(address);
	const listQuery = db
		.select()
		.from(address)
		.orderBy(desc(address.updatedAt), asc(address.city))
		.limit(limit)
		.offset(offset);
	const totalRows = await withTransientD1ReadRetry(() =>
		where ? countQuery.where(where) : countQuery
	);
	const rows = await withTransientD1ReadRetry(() => (where ? listQuery.where(where) : listQuery));

	return toAddressListResult(rows, totalRows[0]?.total ?? 0, limit, offset);
}

export function validateCheckoutAddress(input: CheckoutAddressInput): CheckoutAddressDTO {
	const data = parseInsertAddress({
		...input,
		userId: null,
		isDefault: false
	});

	return {
		recipientName: data.recipientName,
		phone: data.phone,
		addressLine1: data.addressLine1,
		addressLine2: data.addressLine2 ?? null,
		city: data.city,
		district: data.district,
		postalCode: data.postalCode ?? null,
		formattedLines: formatAddressLines(data),
		singleLine: formatAddressLines(data).join(', ')
	};
}

export function createAddressSnapshot(input: AddressSnapshotInput): AddressSnapshot {
	return {
		addressId: 'id' in input ? input.id : null,
		recipientName: input.recipientName,
		phone: input.phone,
		addressLine1: input.addressLine1,
		addressLine2: input.addressLine2 ?? null,
		city: input.city,
		district: input.district,
		postalCode: input.postalCode ?? null,
		country: 'Sri Lanka'
	};
}

export function formatAddressSnapshot(input: AddressSnapshot): string {
	return formatAddressLines(input).join(', ');
}

async function loadAddressById(db: Db, addressId: string): Promise<Address> {
	const normalizedId = normalizeId(addressId, 'addressId');
	const [row] = await withTransientD1ReadRetry(() =>
		db.select().from(address).where(eq(address.id, normalizedId)).limit(1)
	);

	if (!row) {
		throw new AddressError('Address not found.', ErrorCode.ADDRESS_NOT_FOUND, {
			addressId: normalizedId
		});
	}

	return row;
}

async function loadOwnedAddress(db: Db, userId: string, addressId: string): Promise<Address> {
	const [row] = await withTransientD1ReadRetry(() =>
		db
			.select()
			.from(address)
			.where(and(eq(address.id, addressId), eq(address.userId, userId)))
			.limit(1)
	);

	if (!row) {
		throw new AddressError('Address not found.', ErrorCode.ADDRESS_NOT_FOUND, { addressId });
	}

	return row;
}

async function countAddressesForUser(db: Db, userId: string): Promise<number> {
	const [row] = await withTransientD1ReadRetry(() =>
		db.select({ total: count() }).from(address).where(eq(address.userId, userId))
	);

	return row?.total ?? 0;
}

function clearDefaultAddress(db: Db, userId: string) {
	return db.update(address).set({ isDefault: false }).where(eq(address.userId, userId));
}

function parseInsertAddress(input: InsertAddress): InsertAddress {
	const result = insertAddressSchema.safeParse(input);

	if (!result.success) {
		throw new AddressError('Invalid address data.', ErrorCode.INVALID_ADDRESS, {
			issues: result.error.issues
		});
	}

	return {
		...result.data,
		addressLine2: result.data.addressLine2 ?? null,
		postalCode: result.data.postalCode ?? null,
		label: result.data.label ?? null,
		isDefault: result.data.isDefault ?? false
	};
}

function parseUpdateAddress(input: UpdateAddress): UpdateAddress {
	const result = updateAddressSchema.safeParse(input);

	if (!result.success) {
		throw new AddressError('Invalid address data.', ErrorCode.INVALID_ADDRESS, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function toAddressListResult(
	rows: Address[],
	total: number,
	limit: number,
	offset: number
): AddressListResult {
	return {
		items: rows.map(toAddressDTO),
		total,
		limit,
		offset
	};
}

function toAddressDTO(row: Address): AddressDTO {
	const formattedLines = formatAddressLines(row);

	return {
		id: row.id,
		userId: row.userId,
		label: row.label,
		recipientName: row.recipientName,
		phone: row.phone,
		addressLine1: row.addressLine1,
		addressLine2: row.addressLine2,
		city: row.city,
		district: row.district,
		postalCode: row.postalCode,
		isDefault: row.isDefault,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		formattedLines,
		singleLine: formattedLines.join(', ')
	};
}

function formatAddressLines(input: {
	recipientName: string;
	addressLine1: string;
	addressLine2?: string | null;
	city: string;
	district: string;
	postalCode?: string | null;
}): string[] {
	return [
		input.recipientName,
		input.addressLine1,
		input.addressLine2,
		[input.city, input.district].filter(Boolean).join(', '),
		input.postalCode
	].filter((line): line is string => Boolean(line));
}

function buildAddressListWhere(options: ListAddressesOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.userId) conditions.push(eq(address.userId, normalizeId(options.userId, 'userId')));
	if (options.district) conditions.push(eq(address.district, options.district));
	if (typeof options.isDefault === 'boolean') {
		conditions.push(eq(address.isDefault, options.isDefault));
	}
	if (typeof options.hasUser === 'boolean') {
		conditions.push(options.hasUser ? isNotNull(address.userId) : isNull(address.userId));
	}

	const query = normalizeOptionalText(options.query, 'query', 120);
	if (query) {
		const pattern = `%${sanitizeLikeTerm(query)}%`;
		const search = like(address.recipientName, pattern);
		conditions.push(search);
	}

	if (conditions.length === 0) return undefined;
	return and(...conditions);
}

function assertAddressOwner(actorId: string, row: Address): void {
	if (row.userId === actorId) return;

	throw new AddressError('Address not found.', ErrorCode.ADDRESS_NOT_FOUND, { addressId: row.id });
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 255) {
		throw new AddressError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { field });
	}

	return normalized;
}

function normalizeOptionalText(
	value: string | null | undefined,
	field: string,
	maxLength: number
): string | null {
	if (value == null) return null;

	const normalized = value.trim().replace(/\s+/g, ' ');
	if (!normalized) return null;

	if (normalized.length > maxLength) {
		throw new AddressError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			field,
			maxLength
		});
	}

	return normalized;
}

function sanitizeLikeTerm(value: string): string {
	return value.replace(/[%_]/g, '');
}

function recordMatchesPatch(row: object, patch: Record<string, unknown>): boolean {
	const record = row as Record<string, unknown>;
	return Object.entries(patch).every(([key, expected]) => {
		const actual = record[key];
		if (actual instanceof Date && expected instanceof Date) {
			return actual.getTime() === expected.getTime();
		}
		return actual === expected;
	});
}

function mapAddressPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	rethrowTransientD1Error(error);

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new AddressError('Default address already exists.', ErrorCode.ADDRESS_ALREADY_EXISTS);
	}

	if (isCheckConstraintError(message)) {
		throw new AddressError('Invalid address data.', ErrorCode.INVALID_ADDRESS);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new AddressError('Address owner not found.', ErrorCode.NOT_FOUND);
	}

	throw error;
}
