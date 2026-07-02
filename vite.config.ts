import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json';
import cloudflareAppendWorkerHandlers from './scripts/cloudflare-append-worker-handlers';
import { analyzer } from 'vite-bundle-analyzer';

const releaseName = `caroclothing@${pkg.version}`;

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const shouldUploadSentrySourceMaps = Boolean(
		env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
	);

	return {
		plugins: [
			tailwindcss(),
			sentrySvelteKit({
				org: env.SENTRY_ORG,
				project: env.SENTRY_PROJECT,
				authToken: env.SENTRY_AUTH_TOKEN,
				adapter: 'cloudflare',
				release: {
					name: releaseName,
					inject: true
				},
				autoUploadSourceMaps: shouldUploadSentrySourceMaps
			}),
			sveltekit(),
			// analyzer(), // Uncomment this when needed
			cloudflareAppendWorkerHandlers()
		],
		resolve: {
			dedupe: ['svelte']
		},
		define: { __APP_VERSION__: JSON.stringify(pkg.version) }
	};
});
