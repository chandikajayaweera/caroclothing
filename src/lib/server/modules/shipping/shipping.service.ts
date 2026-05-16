import { and, asc, count, desc, eq, inArray, like, type SQL } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { requireAdmin } from '$lib/server/foundation/guards';
import {
	ErrorCode,
	ShippingError,
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
import { SRI_LANKA_DISTRICTS, type SriLankaDistrict } from '../addresses/addresses.drizzle';
import {
	insertShippingMethodSchema,
	insertShippingZoneSchema,
	shippingMethod,
	shippingZone,
	updateShippingMethodSchema,
	type InsertShippingMethod,
	type InsertShippingZone,
	type ShippingMethod,
	type ShippingZone,
	type UpdateShippingMethod
} from './shipping.drizzle';
import type {
	CalculateShippingQuoteInput,
	CreateShippingMethodInput,
	ListShippingMethodsOptions,
	ListShippingQuotesInput,
	ListShippingZonesOptions,
	SetShippingZoneInput,
	ShippingDistrictOption,
	ShippingMethodDTO,
	ShippingMethodListResult,
	ShippingMethodSnapshot,
	ShippingQuoteDTO,
	ShippingZoneDTO,
	ShippingZoneListResult,
	UpdateShippingMethodInput
} from './shipping.types';

type Db = ReturnType<typeof getDb>;
export type ShippingTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type QueryExecutor = Db | ShippingTx;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function listShippingDistrictOptions(): ShippingDistrictOption[] {
	return SRI_LANKA_DISTRICTS.map((district) => ({
		value: district,
		label: district
	}));
}

export async function listShippingQuotes(
	input: ListShippingQuotesInput = {}
): Promise<ShippingQuoteDTO[]> {
	const subtotal = normalizeMoney(input.subtotal ?? 0, 'subtotal');
	const district = input.district ?? null;
	const db = getDb();

	const rows = await db
		.select()
		.from(shippingMethod)
		.where(eq(shippingMethod.isActive, true))
		.orderBy(asc(shippingMethod.sortOrder), asc(shippingMethod.name));
	const zonesByMethodId = district
		? await loadZonesByMethodIdForDistrictTx(
				db,
				rows.map((row) => row.id),
				district
			)
		: new Map<string, ShippingZone>();

	return rows.map((row) =>
		toShippingQuoteDTO(row, zonesByMethodId.get(row.id) ?? null, district, subtotal)
	);
}

export async function calculateShippingQuote(
	input: CalculateShippingQuoteInput
): Promise<ShippingQuoteDTO> {
	return calculateShippingQuoteTx(getDb(), input);
}

export async function createShippingMethod(
	ctx: ServiceContext,
	input: CreateShippingMethodInput
): Promise<ShippingMethodDTO> {
	requireAdmin(ctx.actor);
	const data = parseInsertShippingMethod(input);

	try {
		const [row] = await getDb().insert(shippingMethod).values(data).returning();

		if (!row) {
			throw new ShippingError('Shipping method was not created.', ErrorCode.INTERNAL_ERROR);
		}

		return toShippingMethodDTO(row);
	} catch (error) {
		throw mapShippingPersistenceError(error);
	}
}

export async function updateShippingMethod(
	ctx: ServiceContext,
	input: UpdateShippingMethodInput & { shippingMethodId: string }
): Promise<ShippingMethodDTO> {
	requireAdmin(ctx.actor);
	const shippingMethodId = normalizeId(input.shippingMethodId, 'shippingMethodId');
	const existing = await loadShippingMethodByIdTx(getDb(), shippingMethodId);
	const { shippingMethodId: ignoredShippingMethodId, ...rawData } = input;
	void ignoredShippingMethodId;
	const data = parseUpdateShippingMethod(rawData, existing);
	const updateValues = removeUndefinedValues(data);

	if (Object.keys(updateValues).length === 0) {
		return toShippingMethodDTO(existing);
	}

	try {
		const [row] = await getDb()
			.update(shippingMethod)
			.set(updateValues)
			.where(eq(shippingMethod.id, shippingMethodId))
			.returning();

		if (!row) {
			throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
				shippingMethodId
			});
		}

		return toShippingMethodDTO(row);
	} catch (error) {
		throw mapShippingPersistenceError(error);
	}
}

export async function getShippingMethod(
	ctx: ServiceContext,
	input: { shippingMethodId: string; includeZones?: boolean }
): Promise<ShippingMethodDTO> {
	requireAdmin(ctx.actor);
	const row = await loadShippingMethodByIdTx(getDb(), input.shippingMethodId);

	if (!input.includeZones) {
		return toShippingMethodDTO(row);
	}

	const zones = await loadZonesForMethodTx(getDb(), row.id);
	return toShippingMethodDTO(row, zones.map(toShippingZoneDTO));
}

export async function listShippingMethods(
	ctx: ServiceContext,
	options: ListShippingMethodsOptions = {}
): Promise<ShippingMethodListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildShippingMethodListWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(shippingMethod);
	const listQuery = db
		.select()
		.from(shippingMethod)
		.orderBy(
			asc(shippingMethod.sortOrder),
			asc(shippingMethod.name),
			desc(shippingMethod.updatedAt)
		)
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		where ? countQuery.where(where) : countQuery,
		where ? listQuery.where(where) : listQuery
	]);
	const zonesByMethodId = options.includeZones
		? await loadZonesByMethodIdsTx(
				db,
				rows.map((row) => row.id)
			)
		: new Map<string, ShippingZoneDTO[]>();

	return {
		items: rows.map((row) => toShippingMethodDTO(row, zonesByMethodId.get(row.id))),
		total: totalRows[0]?.total ?? 0,
		limit,
		offset
	};
}

export async function setShippingZone(
	ctx: ServiceContext,
	input: SetShippingZoneInput
): Promise<ShippingZoneDTO> {
	return setShippingZoneWithRetry(ctx, input, true);
}

export async function removeShippingZone(
	ctx: ServiceContext,
	input: { shippingMethodId: string; district: SriLankaDistrict }
): Promise<void> {
	requireAdmin(ctx.actor);
	const shippingMethodId = normalizeId(input.shippingMethodId, 'shippingMethodId');

	const [deleted] = await getDb()
		.delete(shippingZone)
		.where(
			and(
				eq(shippingZone.shippingMethodId, shippingMethodId),
				eq(shippingZone.district, input.district)
			)
		)
		.returning({ id: shippingZone.id });

	if (!deleted) {
		throw new ShippingError('Shipping zone not found.', ErrorCode.SHIPPING_ZONE_NOT_FOUND, {
			shippingMethodId,
			district: input.district
		});
	}
}

export async function listShippingZones(
	ctx: ServiceContext,
	options: ListShippingZonesOptions = {}
): Promise<ShippingZoneListResult> {
	requireAdmin(ctx.actor);

	const limit = normalizeLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
	const offset = normalizeOffset(options.offset);
	const where = buildShippingZoneListWhere(options);
	const db = getDb();
	const countQuery = db.select({ total: count() }).from(shippingZone);
	const listQuery = db
		.select()
		.from(shippingZone)
		.orderBy(asc(shippingZone.district))
		.limit(limit)
		.offset(offset);
	const [totalRows, rows] = await Promise.all([
		where ? countQuery.where(where) : countQuery,
		where ? listQuery.where(where) : listQuery
	]);

	return {
		items: rows.map(toShippingZoneDTO),
		total: totalRows[0]?.total ?? 0,
		limit,
		offset
	};
}

export function createShippingMethodSnapshot(quote: ShippingQuoteDTO): ShippingMethodSnapshot {
	return {
		id: quote.shippingMethodId,
		name: quote.name,
		description: quote.description,
		carrier: quote.carrier,
		price: quote.price,
		estimatedDaysMin: quote.estimatedDaysMin,
		estimatedDaysMax: quote.estimatedDaysMax,
		etaText: quote.etaText
	};
}

export async function calculateShippingQuoteTx(
	tx: QueryExecutor,
	input: CalculateShippingQuoteInput & { activeOnly?: boolean }
): Promise<ShippingQuoteDTO> {
	const shippingMethodId = normalizeId(input.shippingMethodId, 'shippingMethodId');
	const subtotal = normalizeMoney(input.subtotal, 'subtotal');
	const method = await loadShippingMethodByIdTx(tx, shippingMethodId);

	if (input.activeOnly !== false && !method.isActive) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId
		});
	}

	const zone = await loadShippingZoneByMethodDistrictTx(tx, shippingMethodId, input.district);
	return toShippingQuoteDTO(method, zone, input.district, subtotal);
}

async function setShippingZoneWithRetry(
	ctx: ServiceContext,
	input: SetShippingZoneInput,
	retryOnConflict: boolean
): Promise<ShippingZoneDTO> {
	requireAdmin(ctx.actor);
	const data = parseInsertShippingZone(input);

	try {
		const row = await getDb().transaction(async (tx) => {
			await loadShippingMethodByIdTx(tx, data.shippingMethodId);
			const existing = await loadShippingZoneByMethodDistrictTx(
				tx,
				data.shippingMethodId,
				data.district
			);

			if (existing) {
				const [updated] = await tx
					.update(shippingZone)
					.set({
						priceOverride: data.priceOverride,
						estimatedDaysMin: data.estimatedDaysMin,
						estimatedDaysMax: data.estimatedDaysMax
					})
					.where(eq(shippingZone.id, existing.id))
					.returning();

				if (!updated) {
					throw new ShippingError('Shipping zone not found.', ErrorCode.SHIPPING_ZONE_NOT_FOUND, {
						shippingMethodId: data.shippingMethodId,
						district: data.district
					});
				}

				return updated;
			}

			const [created] = await tx.insert(shippingZone).values(data).returning();

			if (!created) {
				throw new ShippingError('Shipping zone was not created.', ErrorCode.INTERNAL_ERROR);
			}

			return created;
		});

		return toShippingZoneDTO(row);
	} catch (error) {
		if (retryOnConflict && isUniqueConstraintError(getErrorMessage(error))) {
			return setShippingZoneWithRetry(ctx, input, false);
		}

		throw mapShippingPersistenceError(error);
	}
}

async function loadShippingMethodByIdTx(
	tx: QueryExecutor,
	shippingMethodId: string
): Promise<ShippingMethod> {
	const normalizedId = normalizeId(shippingMethodId, 'shippingMethodId');
	const [row] = await tx
		.select()
		.from(shippingMethod)
		.where(eq(shippingMethod.id, normalizedId))
		.limit(1);

	if (!row) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId: normalizedId
		});
	}

	return row;
}

async function loadShippingZoneByMethodDistrictTx(
	tx: QueryExecutor,
	shippingMethodId: string,
	district: SriLankaDistrict
): Promise<ShippingZone | null> {
	const [row] = await tx
		.select()
		.from(shippingZone)
		.where(
			and(eq(shippingZone.shippingMethodId, shippingMethodId), eq(shippingZone.district, district))
		)
		.limit(1);

	return row ?? null;
}

async function loadZonesForMethodTx(
	tx: QueryExecutor,
	shippingMethodId: string
): Promise<ShippingZone[]> {
	return tx
		.select()
		.from(shippingZone)
		.where(eq(shippingZone.shippingMethodId, shippingMethodId))
		.orderBy(asc(shippingZone.district));
}

async function loadZonesByMethodIdsTx(
	tx: QueryExecutor,
	shippingMethodIds: string[]
): Promise<Map<string, ShippingZoneDTO[]>> {
	if (shippingMethodIds.length === 0) return new Map();

	const rows = await tx
		.select()
		.from(shippingZone)
		.where(inArray(shippingZone.shippingMethodId, shippingMethodIds))
		.orderBy(asc(shippingZone.district));
	const groups = new Map<string, ShippingZoneDTO[]>();

	for (const row of rows) {
		const current = groups.get(row.shippingMethodId) ?? [];
		current.push(toShippingZoneDTO(row));
		groups.set(row.shippingMethodId, current);
	}

	return groups;
}

async function loadZonesByMethodIdForDistrictTx(
	tx: QueryExecutor,
	shippingMethodIds: string[],
	district: SriLankaDistrict
): Promise<Map<string, ShippingZone>> {
	if (shippingMethodIds.length === 0) return new Map();

	const rows = await tx
		.select()
		.from(shippingZone)
		.where(
			and(
				inArray(shippingZone.shippingMethodId, shippingMethodIds),
				eq(shippingZone.district, district)
			)
		);

	return new Map(rows.map((row) => [row.shippingMethodId, row]));
}

function parseInsertShippingMethod(input: InsertShippingMethod): InsertShippingMethod {
	const result = insertShippingMethodSchema.safeParse(input);

	if (!result.success) {
		throw new ShippingError('Invalid shipping method data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return {
		...result.data,
		description: result.data.description ?? null,
		carrier: result.data.carrier ?? null,
		freeShippingThreshold: result.data.freeShippingThreshold ?? null
	};
}

function parseUpdateShippingMethod(
	input: UpdateShippingMethod,
	existing: ShippingMethod
): UpdateShippingMethod {
	const result = updateShippingMethodSchema.safeParse(input);

	if (!result.success) {
		throw new ShippingError('Invalid shipping method data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	validateDeliveryEstimateRange({
		estimatedDaysMin: result.data.estimatedDaysMin ?? existing.estimatedDaysMin,
		estimatedDaysMax: result.data.estimatedDaysMax ?? existing.estimatedDaysMax
	});

	return result.data;
}

function parseInsertShippingZone(input: InsertShippingZone): InsertShippingZone {
	const result = insertShippingZoneSchema.safeParse(input);

	if (!result.success) {
		throw new ShippingError('Invalid shipping zone data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}

	return result.data;
}

function validateDeliveryEstimateRange(input: {
	estimatedDaysMin: number;
	estimatedDaysMax: number;
}): void {
	if (input.estimatedDaysMax < input.estimatedDaysMin) {
		throw new ShippingError(
			'estimatedDaysMax must be >= estimatedDaysMin.',
			ErrorCode.VALIDATION_ERROR,
			{
				estimatedDaysMin: input.estimatedDaysMin,
				estimatedDaysMax: input.estimatedDaysMax
			}
		);
	}
}

function toShippingMethodDTO(row: ShippingMethod, zones?: ShippingZoneDTO[]): ShippingMethodDTO {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		carrier: row.carrier,
		price: row.price,
		freeShippingThreshold: row.freeShippingThreshold,
		estimatedDaysMin: row.estimatedDaysMin,
		estimatedDaysMax: row.estimatedDaysMax,
		etaText: formatEtaText(row.estimatedDaysMin, row.estimatedDaysMax),
		isActive: row.isActive,
		sortOrder: row.sortOrder,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		...(zones ? { zones } : {})
	};
}

function toShippingZoneDTO(row: ShippingZone): ShippingZoneDTO {
	return {
		id: row.id,
		shippingMethodId: row.shippingMethodId,
		district: row.district,
		priceOverride: row.priceOverride,
		estimatedDaysMin: row.estimatedDaysMin,
		estimatedDaysMax: row.estimatedDaysMax,
		etaText: formatEtaText(row.estimatedDaysMin, row.estimatedDaysMax)
	};
}

function toShippingQuoteDTO(
	method: ShippingMethod,
	zone: ShippingZone | null,
	district: SriLankaDistrict | null,
	subtotal: number
): ShippingQuoteDTO {
	const priceBeforeFreeShipping = zone?.priceOverride ?? method.price;
	const freeShippingThresholdMet =
		method.freeShippingThreshold !== null && subtotal >= method.freeShippingThreshold;
	const price = freeShippingThresholdMet ? 0 : priceBeforeFreeShipping;
	const estimatedDaysMin = zone?.estimatedDaysMin ?? method.estimatedDaysMin;
	const estimatedDaysMax = zone?.estimatedDaysMax ?? method.estimatedDaysMax;

	return {
		shippingMethodId: method.id,
		name: method.name,
		description: method.description,
		carrier: method.carrier,
		district,
		basePrice: method.price,
		zonePriceOverride: zone?.priceOverride ?? null,
		priceBeforeFreeShipping,
		price,
		freeShippingThreshold: method.freeShippingThreshold,
		freeShippingThresholdMet,
		isFreeShipping: price === 0,
		amountToFreeShipping:
			method.freeShippingThreshold === null
				? null
				: Math.max(method.freeShippingThreshold - subtotal, 0),
		estimatedDaysMin,
		estimatedDaysMax,
		etaText: formatEtaText(estimatedDaysMin, estimatedDaysMax),
		isActive: method.isActive,
		sortOrder: method.sortOrder
	};
}

function buildShippingMethodListWhere(options: ListShippingMethodsOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (typeof options.isActive === 'boolean') {
		conditions.push(eq(shippingMethod.isActive, options.isActive));
	}

	const query = normalizeOptionalText(options.query, 'query', 120);
	if (query) {
		conditions.push(like(shippingMethod.name, `%${sanitizeLikeTerm(query)}%`));
	}

	if (conditions.length === 0) return undefined;
	return and(...conditions);
}

function buildShippingZoneListWhere(options: ListShippingZonesOptions): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.shippingMethodId) {
		conditions.push(
			eq(shippingZone.shippingMethodId, normalizeId(options.shippingMethodId, 'shippingMethodId'))
		);
	}
	if (options.district) {
		conditions.push(eq(shippingZone.district, options.district));
	}

	if (conditions.length === 0) return undefined;
	return and(...conditions);
}

function formatEtaText(estimatedDaysMin: number, estimatedDaysMax: number): string {
	if (estimatedDaysMin === 0 && estimatedDaysMax === 0) return 'Same day';
	if (estimatedDaysMin === estimatedDaysMax) {
		return `${estimatedDaysMin} business day${estimatedDaysMin === 1 ? '' : 's'}`;
	}
	if (estimatedDaysMin === 0) {
		return `Same day-${estimatedDaysMax} business days`;
	}

	return `${estimatedDaysMin}-${estimatedDaysMax} business days`;
}

function normalizeId(value: string, field: string): string {
	const normalized = value.trim();

	if (!normalized || normalized.length > 64) {
		throw new ShippingError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return normalized;
}

function normalizeMoney(value: number, field: string): number {
	if (!Number.isInteger(value) || value < 0) {
		throw new ShippingError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, { [field]: value });
	}

	return value;
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
		throw new ShippingError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, {
			field,
			maxLength
		});
	}

	return normalized;
}

function sanitizeLikeTerm(value: string): string {
	return value.replace(/[%_]/g, '');
}

function mapShippingPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;

	const message = getErrorMessage(error);

	if (isUniqueConstraintError(message)) {
		throw new ShippingError('Shipping zone already exists.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND);
	}

	if (isCheckConstraintError(message)) {
		throw new ShippingError('Invalid shipping data.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}
