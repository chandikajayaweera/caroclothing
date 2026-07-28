import { runWithPlatformEnv } from '$lib/server/infrastructure/cloudflare/runtime-context';
import { getAuth } from './index';

// Better Auth's generate command only inspects the configured adapter and
// plugins. It does not execute database queries, but the production auth
// factory still requires a request-scoped D1 binding while it is constructed.
const schemaOnlyDatabase = {} as D1Database;

export const auth = runWithPlatformEnv({ DB: schemaOnlyDatabase } as App.Platform['env'], () =>
	getAuth()
);
