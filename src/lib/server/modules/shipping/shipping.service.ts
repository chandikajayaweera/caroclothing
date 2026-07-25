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
	carrier,
	shippingMethod,
	shippingZone,
	insertCarrierSchema,
	updateCarrierSchema,
	insertShippingMethodSchema,
	updateShippingMethodSchema,
	insertShippingZoneSchema,
	type Carrier,
	type ShippingMethod,
	type ShippingZone,
	type InsertCarrier,
	type UpdateCarrier,
	type InsertShippingMethod,
	type InsertShippingZone,
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
	UpdateShippingMethodInput,
	CreateCarrierInput,
	UpdateCarrierInput,
	CarrierDTO
} from './shipping.types';

type Db = ReturnType<typeof getDb>;
export type ShippingTx = Db;
type QueryExecutor = Db;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// DISTRICT HELPERS
// ---------------------------------------------------------------------------

export function listShippingDistrictOptions(): ShippingDistrictOption[] {
	return SRI_LANKA_DISTRICTS.map((district) => ({
		value: district,
		label: district
	}));
}

// ---------------------------------------------------------------------------
// CARRIER CRUD
// ---------------------------------------------------------------------------

export async function listCarriers(ctx: ServiceContext): Promise<CarrierDTO[]> {
	requireAdmin(ctx.actor);
	const rows = await getDb().select().from(carrier).orderBy(asc(carrier.name));
	return rows.map(toCarrierDTO);
}

export async function createCarrier(
	ctx: ServiceContext,
	input: CreateCarrierInput
): Promise<CarrierDTO> {
	requireAdmin(ctx.actor);
	const data = parseInsertCarrier(input);

	try {
		const [row] = await getDb().insert(carrier).values(data).returning();
		if (!row) {
			throw new ShippingError('Carrier was not created.', ErrorCode.INTERNAL_ERROR);
		}
		return toCarrierDTO(row);
	} catch (error) {
		throw mapShippingPersistenceError(error);
	}
}

export async function updateCarrier(
	ctx: ServiceContext,
	input: UpdateCarrierInput & { carrierId: string }
): Promise<CarrierDTO> {
	requireAdmin(ctx.actor);
	const carrierId = normalizeId(input.carrierId, 'carrierId');
	const existing = await loadCarrierByIdTx(getDb(), carrierId);
	const { carrierId: ignoredId, ...rawData } = input;
	void ignoredId;
	const data = parseUpdateCarrier(rawData);
	const updateValues = removeUndefinedValues(data);

	if (Object.keys(updateValues).length === 0) {
		return toCarrierDTO(existing);
	}

	try {
		const [row] = await getDb()
			.update(carrier)
			.set(updateValues)
			.where(eq(carrier.id, carrierId))
			.returning();

		if (!row) {
			throw new ShippingError('Carrier not found.', ErrorCode.NOT_FOUND, { carrierId });
		}
		return toCarrierDTO(row);
	} catch (error) {
		throw mapShippingPersistenceError(error);
	}
}

export async function deleteCarrier(
	ctx: ServiceContext,
	input: { carrierId: string }
): Promise<void> {
	requireAdmin(ctx.actor);
	const carrierId = normalizeId(input.carrierId, 'carrierId');
	const db = getDb();

	// Pre-delete safety check:
	// Verify if any active shipping methods or zones override point directly to this carrier.
	const [methodRef] = await db
		.select({ id: shippingMethod.id, name: shippingMethod.name })
		.from(shippingMethod)
		.where(eq(shippingMethod.carrierId, carrierId))
		.limit(1);

	if (methodRef) {
		throw new ShippingError(
			`Cannot delete carrier. It is referenced by shipping method "${methodRef.name}".`,
			ErrorCode.CONFLICT
		);
	}

	const [zoneRef] = await db
		.select({ id: shippingZone.id, district: shippingZone.district })
		.from(shippingZone)
		.where(eq(shippingZone.carrierIdOverride, carrierId))
		.limit(1);

	if (zoneRef) {
		throw new ShippingError(
			`Cannot delete carrier. It is referenced by zone override for district "${zoneRef.district}".`,
			ErrorCode.CONFLICT
		);
	}

	const [deleted] = await db.delete(carrier).where(eq(carrier.id, carrierId)).returning();

	if (!deleted) {
		throw new ShippingError('Carrier not found.', ErrorCode.NOT_FOUND, { carrierId });
	}
}

// ---------------------------------------------------------------------------
// QUOTES & SNAPSHOTS
// ---------------------------------------------------------------------------

export async function listShippingQuotes(
	input: ListShippingQuotesInput = {}
): Promise<ShippingQuoteDTO[]> {
	const subtotal = normalizeMoney(input.subtotal ?? 0, 'subtotal');
	const district = input.district ?? null;
	const db = getDb();

	// Select active shipping methods and their default carrier details
	const methodsWithCarrier = await db
		.select({
			method: shippingMethod,
			methodCarrier: carrier
		})
		.from(shippingMethod)
		.leftJoin(carrier, eq(shippingMethod.carrierId, carrier.id))
		.where(eq(shippingMethod.isActive, true))
		.orderBy(asc(shippingMethod.sortOrder), asc(shippingMethod.name));

	if (methodsWithCarrier.length === 0) return [];

	const methodIds = methodsWithCarrier.map((row) => row.method.id);

	// Load zones with overrides for the target district
	const zonesWithCarrier = district
		? await db
				.select({
					zone: shippingZone,
					zoneCarrier: carrier
				})
				.from(shippingZone)
				.leftJoin(carrier, eq(shippingZone.carrierIdOverride, carrier.id))
				.where(
					and(
						inArray(shippingZone.shippingMethodId, methodIds),
						eq(shippingZone.district, district)
					)
				)
		: [];

	const zonesMap = new Map<string, { zone: ShippingZone; zoneCarrier: Carrier | null }>();
	for (const row of zonesWithCarrier) {
		zonesMap.set(row.zone.shippingMethodId, {
			zone: row.zone,
			zoneCarrier: row.zoneCarrier
		});
	}

	const quotes: ShippingQuoteDTO[] = [];

	for (const { method, methodCarrier } of methodsWithCarrier) {
		const zoneOverride = zonesMap.get(method.id);

		// Availability Check: If zone exists and isAvailable = false, completely hide it
		if (zoneOverride && !zoneOverride.zone.isAvailable) {
			continue;
		}

		// Active Carrier Check: If carrier is deactivated (isActive = false), exclude this quote
		if (methodCarrier && !methodCarrier.isActive) {
			continue;
		}
		if (zoneOverride && zoneOverride.zoneCarrier && !zoneOverride.zoneCarrier.isActive) {
			continue;
		}

		const resolvedCarrierName = zoneOverride?.zoneCarrier?.name ?? methodCarrier?.name ?? null;

		quotes.push(
			toShippingQuoteDTO(
				method,
				zoneOverride?.zone ?? null,
				district,
				subtotal,
				resolvedCarrierName
			)
		);
	}

	return quotes;
}

export async function calculateShippingQuote(
	input: CalculateShippingQuoteInput
): Promise<ShippingQuoteDTO> {
	return calculateShippingQuoteTx(getDb(), input);
}

export async function calculateShippingQuoteTx(
	tx: QueryExecutor,
	input: CalculateShippingQuoteInput & { activeOnly?: boolean }
): Promise<ShippingQuoteDTO> {
	const shippingMethodId = normalizeId(input.shippingMethodId, 'shippingMethodId');
	const subtotal = normalizeMoney(input.subtotal, 'subtotal');

	const [methodWithCarrier] = await tx
		.select({
			method: shippingMethod,
			methodCarrier: carrier
		})
		.from(shippingMethod)
		.leftJoin(carrier, eq(shippingMethod.carrierId, carrier.id))
		.where(eq(shippingMethod.id, shippingMethodId))
		.limit(1);

	if (!methodWithCarrier) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId
		});
	}

	if (input.activeOnly !== false && !methodWithCarrier.method.isActive) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId
		});
	}
	if (input.activeOnly !== false && methodWithCarrier.methodCarrier?.isActive === false) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId
		});
	}

	const zone = await loadShippingZoneByMethodDistrictTx(tx, shippingMethodId, input.district);
	if (input.activeOnly !== false && zone?.isAvailable === false) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId,
			district: input.district
		});
	}

	let resolvedCarrierName = methodWithCarrier.methodCarrier?.name ?? null;
	if (zone?.carrierIdOverride) {
		const [zoneCarrierRow] = await tx
			.select()
			.from(carrier)
			.where(eq(carrier.id, zone.carrierIdOverride))
			.limit(1);
		if (input.activeOnly !== false && zoneCarrierRow?.isActive === false) {
			throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
				shippingMethodId,
				district: input.district
			});
		}
		if (zoneCarrierRow) resolvedCarrierName = zoneCarrierRow.name;
	}

	return toShippingQuoteDTO(
		methodWithCarrier.method,
		zone,
		input.district,
		subtotal,
		resolvedCarrierName
	);
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

// ---------------------------------------------------------------------------
// SHIPPING METHODS CRUD
// ---------------------------------------------------------------------------

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

		let carrierName: string | null = null;
		if (row.carrierId) {
			const [res] = await getDb()
				.select({ name: carrier.name })
				.from(carrier)
				.where(eq(carrier.id, row.carrierId))
				.limit(1);
			if (res) carrierName = res.name;
		}

		return toShippingMethodDTO(row, carrierName);
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
		let carrierName: string | null = null;
		if (existing.carrierId) {
			const [res] = await getDb()
				.select({ name: carrier.name })
				.from(carrier)
				.where(eq(carrier.id, existing.carrierId))
				.limit(1);
			if (res) carrierName = res.name;
		}
		return toShippingMethodDTO(existing, carrierName);
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

		let carrierName: string | null = null;
		if (row.carrierId) {
			const [res] = await getDb()
				.select({ name: carrier.name })
				.from(carrier)
				.where(eq(carrier.id, row.carrierId))
				.limit(1);
			if (res) carrierName = res.name;
		}

		return toShippingMethodDTO(row, carrierName);
	} catch (error) {
		throw mapShippingPersistenceError(error);
	}
}

export async function getShippingMethod(
	ctx: ServiceContext,
	input: { shippingMethodId: string; includeZones?: boolean }
): Promise<ShippingMethodDTO> {
	requireAdmin(ctx.actor);
	const shippingMethodId = normalizeId(input.shippingMethodId, 'shippingMethodId');
	const db = getDb();

	const [res] = await db
		.select({
			method: shippingMethod,
			carrierName: carrier.name
		})
		.from(shippingMethod)
		.leftJoin(carrier, eq(shippingMethod.carrierId, carrier.id))
		.where(eq(shippingMethod.id, shippingMethodId))
		.limit(1);

	if (!res) {
		throw new ShippingError('Shipping method not found.', ErrorCode.SHIPPING_METHOD_NOT_FOUND, {
			shippingMethodId
		});
	}

	if (!input.includeZones) {
		return toShippingMethodDTO(res.method, res.carrierName);
	}

	const zones = await loadZonesForMethodTx(db, res.method.id);
	return toShippingMethodDTO(res.method, res.carrierName, zones.map(toShippingZoneDTO));
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
		.select({
			method: shippingMethod,
			carrierName: carrier.name
		})
		.from(shippingMethod)
		.leftJoin(carrier, eq(shippingMethod.carrierId, carrier.id))
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

	const methodIds = rows.map((r) => r.method.id);
	const zonesByMethodId =
		options.includeZones && methodIds.length > 0
			? await loadZonesByMethodIdsTx(db, methodIds)
			: new Map<string, ShippingZoneDTO[]>();

	return {
		items: rows.map((r) =>
			toShippingMethodDTO(r.method, r.carrierName, zonesByMethodId.get(r.method.id))
		),
		total: totalRows[0]?.total ?? 0,
		limit,
		offset
	};
}

// ---------------------------------------------------------------------------
// SHIPPING ZONES CRUD
// ---------------------------------------------------------------------------

export async function setShippingZone(
	ctx: ServiceContext,
	input: SetShippingZoneInput
): Promise<ShippingZoneDTO> {
	return saveShippingZone(ctx, input);
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

// ---------------------------------------------------------------------------
// SERVICE INTERNAL HELPERS
// ---------------------------------------------------------------------------

async function saveShippingZone(
	ctx: ServiceContext,
	input: SetShippingZoneInput
): Promise<ShippingZoneDTO> {
	requireAdmin(ctx.actor);
	const data = parseInsertShippingZone(input);

	try {
		const db = getDb();
		await loadShippingMethodByIdTx(db, data.shippingMethodId);
		const [row] = await db
			.insert(shippingZone)
			.values(data)
			.onConflictDoUpdate({
				target: [shippingZone.district, shippingZone.shippingMethodId],
				set: {
					priceOverride: data.priceOverride,
					estimatedDaysMin: data.estimatedDaysMin,
					estimatedDaysMax: data.estimatedDaysMax,
					isAvailable: data.isAvailable,
					carrierIdOverride: data.carrierIdOverride
				}
			})
			.returning();

		if (!row) {
			throw new ShippingError('Shipping zone was not saved.', ErrorCode.INTERNAL_ERROR);
		}

		return toShippingZoneDTO(row);
	} catch (error) {
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

async function loadCarrierByIdTx(tx: QueryExecutor, carrierId: string): Promise<Carrier> {
	const normalizedId = normalizeId(carrierId, 'carrierId');
	const [row] = await tx.select().from(carrier).where(eq(carrier.id, normalizedId)).limit(1);

	if (!row) {
		throw new ShippingError('Carrier not found.', ErrorCode.NOT_FOUND, { carrierId: normalizedId });
	}

	return row;
}

// ---------------------------------------------------------------------------
// PARSERS
// ---------------------------------------------------------------------------

function parseInsertCarrier(input: InsertCarrier): InsertCarrier {
	const result = insertCarrierSchema.safeParse(input);
	if (!result.success) {
		throw new ShippingError('Invalid carrier data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}
	return result.data;
}

function parseUpdateCarrier(input: UpdateCarrier): UpdateCarrier {
	const result = updateCarrierSchema.safeParse(input);
	if (!result.success) {
		throw new ShippingError('Invalid carrier data.', ErrorCode.VALIDATION_ERROR, {
			issues: result.error.issues
		});
	}
	return result.data;
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
		freeShippingThreshold: result.data.freeShippingThreshold ?? null,
		carrierId: result.data.carrierId ?? null
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

// ---------------------------------------------------------------------------
// DTO CONVERTERS
// ---------------------------------------------------------------------------

function toCarrierDTO(row: Carrier): CarrierDTO {
	return {
		id: row.id,
		name: row.name,
		code: row.code,
		urlTemplate: row.urlTemplate ?? null,
		notes: row.notes ?? null,
		isActive: row.isActive,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt)
	};
}

function toShippingMethodDTO(
	row: ShippingMethod,
	carrierName: string | null,
	zones?: ShippingZoneDTO[]
): ShippingMethodDTO {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		carrier: carrierName,
		price: row.price,
		freeShippingThreshold: row.freeShippingThreshold,
		estimatedDaysMin: row.estimatedDaysMin,
		estimatedDaysMax: row.estimatedDaysMax,
		etaText: formatEtaText(row.estimatedDaysMin, row.estimatedDaysMax),
		isActive: row.isActive,
		sortOrder: row.sortOrder,
		carrierId: row.carrierId,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
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
		isAvailable: row.isAvailable,
		carrierIdOverride: row.carrierIdOverride,
		etaText: formatEtaText(row.estimatedDaysMin, row.estimatedDaysMax)
	};
}

function toShippingQuoteDTO(
	method: ShippingMethod,
	zone: ShippingZone | null,
	district: SriLankaDistrict | null,
	subtotal: number,
	resolvedCarrierName: string | null
): ShippingQuoteDTO {
	const priceBeforeFreeShipping = zone?.priceOverride ?? method.price;
	const hasFreeShipping =
		method.freeShippingThreshold !== null && method.freeShippingThreshold !== 0;
	const freeShippingThresholdMet =
		hasFreeShipping && subtotal >= (method.freeShippingThreshold as number);
	const price = freeShippingThresholdMet ? 0 : priceBeforeFreeShipping;
	const estimatedDaysMin = zone?.estimatedDaysMin ?? method.estimatedDaysMin;
	const estimatedDaysMax = zone?.estimatedDaysMax ?? method.estimatedDaysMax;

	return {
		shippingMethodId: method.id,
		name: method.name,
		description: method.description,
		carrier: resolvedCarrierName,
		district,
		basePrice: method.price,
		zonePriceOverride: zone?.priceOverride ?? null,
		priceBeforeFreeShipping,
		price,
		freeShippingThreshold: hasFreeShipping ? method.freeShippingThreshold : null,
		freeShippingThresholdMet,
		isFreeShipping: price === 0,
		amountToFreeShipping: hasFreeShipping
			? Math.max((method.freeShippingThreshold as number) - subtotal, 0)
			: null,
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

// Moneys are standard LKR
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
		throw new ShippingError('Unique constraint violation.', ErrorCode.CONFLICT);
	}

	if (isForeignKeyConstraintError(message)) {
		throw new ShippingError('Foreign key constraint violation.', ErrorCode.VALIDATION_ERROR);
	}

	if (isCheckConstraintError(message)) {
		throw new ShippingError('Invalid data constraint check.', ErrorCode.VALIDATION_ERROR);
	}

	throw error;
}
