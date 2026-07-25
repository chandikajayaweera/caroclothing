import type { ServiceContext } from '$lib/server/foundation/context';

export function makeServiceEvent(
	env: Record<string, unknown> = {}
): NonNullable<ServiceContext['event']> {
	return {
		platform: {
			env
		}
	} as unknown as NonNullable<ServiceContext['event']>;
}

export function makeAdminCtx(overrides: Partial<ServiceContext> = {}): ServiceContext {
	return {
		actor: { id: 'admin-user', role: 'adminUser' },
		event: makeServiceEvent(),
		...overrides
	};
}

export function makeCustomerCtx(
	userId = 'customer-user',
	overrides: Partial<ServiceContext> = {}
): ServiceContext {
	return {
		actor: { id: userId, role: 'customerUser' },
		event: makeServiceEvent(),
		...overrides
	};
}

export function makeAnonymousCtx(overrides: Partial<ServiceContext> = {}): ServiceContext {
	return {
		actor: null,
		event: makeServiceEvent(),
		...overrides
	};
}

export function withServiceEnv(ctx: ServiceContext, env: Record<string, unknown>): ServiceContext {
	return {
		...ctx,
		event: makeServiceEvent(env)
	};
}
