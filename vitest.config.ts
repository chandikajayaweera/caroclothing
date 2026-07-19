import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(async () => {
	const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle-d1'));

	return {
		plugins: [
			cloudflareTest({
				miniflare: {
					compatibilityDate: '2026-04-15',
					compatibilityFlags: ['nodejs_compat', 'nodejs_als'],
					d1Databases: ['DB'],
					bindings: { TEST_MIGRATIONS: migrations }
				}
			})
		],
		resolve: {
			alias: {
				$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
			},
			dedupe: ['svelte']
		},
		define: {
			__APP_VERSION__: JSON.stringify('test')
		},
		test: {
			exclude: [...configDefaults.exclude, 'scripts/**/*.test.mjs'],
			setupFiles: ['./src/tests/setup.ts'],
			clearMocks: true,
			restoreMocks: true,
			fileParallelism: false
		}
	};
});
