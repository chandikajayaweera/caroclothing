import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import {
	getPlatformEnv,
	getRuntimeSingleton
} from '$lib/server/infrastructure/cloudflare/runtime-context';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
const DATABASE_KEY = Symbol('database');

export function getD1Database(): D1Database {
	return getPlatformEnv().DB;
}

export function getDb(): DrizzleDb {
	return getRuntimeSingleton(DATABASE_KEY, () => drizzle(getD1Database(), { schema }));
}
