import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { carrier, shippingMethod, shippingZone } from './shipping.drizzle';
import { calculateShippingQuote, listShippingQuotes } from './shipping.service';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

let harness: TestDatabaseHarness;

function db() {
	return harness.db;
}

async function seedMethod(input: {
	methodId: string;
	carrierId?: string | null;
	carrierActive?: boolean;
}) {
	if (input.carrierId) {
		await db()
			.insert(carrier)
			.values({
				id: input.carrierId,
				name: `Carrier ${input.carrierId}`,
				code: input.carrierId.toUpperCase().replaceAll('-', ''),
				isActive: input.carrierActive ?? true
			});
	}

	await db()
		.insert(shippingMethod)
		.values({
			id: input.methodId,
			name: `Method ${input.methodId}`,
			description: null,
			price: 500,
			freeShippingThreshold: null,
			estimatedDaysMin: 2,
			estimatedDaysMax: 4,
			isActive: true,
			sortOrder: 0,
			carrierId: input.carrierId ?? null
		});
}

describe('shipping service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	it('rejects a direct quote for a district marked unavailable', async () => {
		await seedMethod({ methodId: 'blocked-zone-method' });
		await db().insert(shippingZone).values({
			id: 'blocked-zone',
			shippingMethodId: 'blocked-zone-method',
			district: 'Colombo',
			priceOverride: 750,
			estimatedDaysMin: 3,
			estimatedDaysMax: 5,
			isAvailable: false,
			carrierIdOverride: null
		});

		await expect(
			calculateShippingQuote({
				shippingMethodId: 'blocked-zone-method',
				district: 'Colombo',
				subtotal: 5000
			})
		).rejects.toMatchObject({ code: ErrorCode.SHIPPING_METHOD_NOT_FOUND });
		await expect(listShippingQuotes({ district: 'Colombo', subtotal: 5000 })).resolves.toEqual([]);
	});

	it('rejects direct quotes backed by inactive default or override carriers', async () => {
		await seedMethod({
			methodId: 'inactive-default-method',
			carrierId: 'inactive-default-carrier',
			carrierActive: false
		});
		await seedMethod({ methodId: 'inactive-override-method' });
		await db().insert(carrier).values({
			id: 'inactive-override-carrier',
			name: 'Inactive Override Carrier',
			code: 'INACTIVEOVERRIDE',
			isActive: false
		});
		await db().insert(shippingZone).values({
			id: 'inactive-override-zone',
			shippingMethodId: 'inactive-override-method',
			district: 'Colombo',
			priceOverride: 600,
			estimatedDaysMin: 1,
			estimatedDaysMax: 2,
			isAvailable: true,
			carrierIdOverride: 'inactive-override-carrier'
		});

		for (const shippingMethodId of ['inactive-default-method', 'inactive-override-method']) {
			await expect(
				calculateShippingQuote({ shippingMethodId, district: 'Colombo', subtotal: 5000 })
			).rejects.toMatchObject({ code: ErrorCode.SHIPPING_METHOD_NOT_FOUND });
		}
	});
});
