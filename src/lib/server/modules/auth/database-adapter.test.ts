import type { DBAdapter, DBAdapterInstance } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';
import { withVerificationWriteRecovery } from './database-adapter';

function createFakeAdapter() {
	const create = vi.fn();
	const findOne = vi.fn();
	const adapter = {
		id: 'test-adapter',
		create,
		findOne,
		findMany: vi.fn(),
		count: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
		delete: vi.fn(),
		deleteMany: vi.fn(),
		transaction: vi.fn()
	} as unknown as DBAdapter;

	return { adapter, create, findOne };
}

describe('Better Auth verification write recovery', () => {
	it('reconciles an ambiguously committed verification insert by its stable ID', async () => {
		const transientError = new Error(
			'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
		);
		const persisted = {
			id: 'persisted-verification',
			identifier: 'oauth-state',
			value: 'encrypted-state'
		};
		const { adapter, create, findOne } = createFakeAdapter();
		create.mockRejectedValueOnce(transientError);
		findOne.mockResolvedValueOnce(persisted);
		const factory = vi.fn(() => adapter) as unknown as DBAdapterInstance;
		const resilientAdapter = withVerificationWriteRecovery(factory)({});

		await expect(
			resilientAdapter.create({
				model: 'verification',
				data: {
					identifier: persisted.identifier,
					value: persisted.value,
					expiresAt: new Date()
				}
			})
		).resolves.toBe(persisted);

		const writeInput = create.mock.calls[0]?.[0];
		const stableId = writeInput?.data?.id;
		expect(stableId).toEqual(expect.any(String));
		expect(writeInput?.forceAllowId).toBe(true);
		expect(findOne).toHaveBeenCalledWith({
			model: 'verification',
			where: [{ field: 'id', value: stableId }]
		});
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('leaves non-verification creates unchanged', async () => {
		const created = { id: 'user-1', name: 'Customer' };
		const { adapter, create, findOne } = createFakeAdapter();
		create.mockResolvedValueOnce(created);
		const factory = vi.fn(() => adapter) as unknown as DBAdapterInstance;
		const resilientAdapter = withVerificationWriteRecovery(factory)({});
		const input = {
			model: 'user',
			data: { name: 'Customer' }
		};

		await expect(resilientAdapter.create(input)).resolves.toBe(created);
		expect(create).toHaveBeenCalledWith(input);
		expect(findOne).not.toHaveBeenCalled();
	});

	it('retries an uncommitted verification insert with the same ID', async () => {
		const transientError = new Error(
			'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
		);
		const created = {
			id: 'created-verification',
			identifier: 'oauth-state',
			value: 'encrypted-state'
		};
		const { adapter, create, findOne } = createFakeAdapter();
		create.mockRejectedValueOnce(transientError).mockResolvedValueOnce(created);
		findOne.mockResolvedValueOnce(null);
		const factory = vi.fn(() => adapter) as unknown as DBAdapterInstance;
		const resilientAdapter = withVerificationWriteRecovery(factory)({});

		await expect(
			resilientAdapter.create({
				model: 'verification',
				data: {
					identifier: created.identifier,
					value: created.value,
					expiresAt: new Date()
				}
			})
		).resolves.toBe(created);

		expect(create).toHaveBeenCalledTimes(2);
		expect(create.mock.calls[0]?.[0]?.data?.id).toBe(create.mock.calls[1]?.[0]?.data?.id);
	});
});
