import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
		environment: 'node',
		setupFiles: ['./src/tests/setup.ts'],
		clearMocks: true,
		restoreMocks: true,
		fileParallelism: false,
		deps: {
			optimizer: {
				ssr: {
					exclude: ['@libsql/client', '@libsql/hrana-client']
				}
			}
		}
	}
});
