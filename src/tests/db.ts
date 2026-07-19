import { env } from 'cloudflare:workers';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export type TestDatabaseHarness = {
	d1: D1Database;
	db: TestDatabase;
	reset: () => Promise<void>;
	close: () => void;
};

export async function createTestDatabase(): Promise<TestDatabaseHarness> {
	const testEnv = env as Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] };
	const d1 = testEnv.DB;
	const db = drizzle(d1, { schema });

	return {
		d1,
		db,
		reset: async () => {
			await reset();
			await applyD1Migrations(d1, testEnv.TEST_MIGRATIONS);
		},
		close: () => undefined
	};
}
