import type { DBAdapter, DBAdapterInstance } from 'better-auth';
import { withTransientD1WriteReconciliation } from '$lib/server/db/retry';

const VERIFICATION_MODEL = 'verification';

type AdapterCreateInput = {
	model: string;
	data: Record<string, unknown>;
	select?: string[];
	forceAllowId?: boolean;
};

/**
 * Better Auth verification rows carry OAuth state and other short-lived
 * challenges. A D1 timeout can make their insert result ambiguous, so give
 * each attempt one stable ID and reconcile that row before retrying.
 */
export function withVerificationWriteRecovery(
	adapterFactory: DBAdapterInstance
): DBAdapterInstance {
	return (options) => {
		const adapter = adapterFactory(options);
		const create = async (input: AdapterCreateInput): Promise<unknown> => {
			if (input.model !== VERIFICATION_MODEL) {
				return adapter.create<Record<string, unknown>, unknown>(input);
			}

			const suppliedId = Reflect.get(input.data, 'id');
			const stableId =
				typeof suppliedId === 'string' && suppliedId.length > 0 ? suppliedId : crypto.randomUUID();
			const stableInput = {
				...input,
				data: { ...input.data, id: stableId },
				forceAllowId: true
			};

			return withTransientD1WriteReconciliation<unknown>(
				() => adapter.create<Record<string, unknown>, unknown>(stableInput),
				async () => {
					const persisted = await adapter.findOne<unknown>({
						model: VERIFICATION_MODEL,
						where: [{ field: 'id', value: stableId }]
					});

					return persisted !== null
						? { committed: true as const, value: persisted }
						: { committed: false as const };
				}
			);
		};

		return { ...adapter, create: create as DBAdapter['create'] };
	};
}
