import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, vi } from 'vitest';

const testEnv = env as Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] };
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);

afterEach(() => {
	vi.clearAllMocks();
});
