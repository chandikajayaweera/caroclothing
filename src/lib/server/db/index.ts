import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { getEnv } from '$lib/server/modules/env';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDb | undefined;

export function getDb(): DrizzleDb {
	if (_db) return _db;

	const env = getEnv();
	const client = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
	_db = drizzle(client, { schema });
	return _db;
}
