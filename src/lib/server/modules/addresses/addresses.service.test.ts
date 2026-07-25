import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { makeCustomerCtx } from '../../../../tests/context';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import {
	createAddress,
	deleteAddress,
	getMyDefaultAddress,
	listMyAddresses,
	updateAddress
} from './addresses.service';

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

function addressInput(label: string, isDefault = false) {
	return {
		label,
		recipientName: 'Caro Buyer',
		phone: '+94770000000',
		addressLine1: `${label} Street`,
		addressLine2: null,
		city: 'Colombo',
		district: 'Colombo' as const,
		postalCode: '00100',
		isDefault
	};
}

describe('addresses service integration', () => {
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

	it('keeps one default while addresses remain', async () => {
		const buyer = await seedUser(db(), { id: 'address-default-buyer' });
		const ctx = makeCustomerCtx(buyer.id);
		const first = await createAddress(ctx, addressInput('Home'));
		const second = await createAddress(ctx, addressInput('Work'));
		expect(first.isDefault).toBe(true);
		expect(second.isDefault).toBe(false);

		await expect(
			updateAddress(ctx, { addressId: first.id, isDefault: false })
		).rejects.toMatchObject({ code: ErrorCode.INVALID_ADDRESS });

		await deleteAddress(ctx, { addressId: first.id });
		await expect(getMyDefaultAddress(ctx)).resolves.toMatchObject({
			id: second.id,
			isDefault: true
		});
		await expect(listMyAddresses(ctx)).resolves.toMatchObject({
			total: 1,
			items: [{ id: second.id, isDefault: true }]
		});
	});
});
