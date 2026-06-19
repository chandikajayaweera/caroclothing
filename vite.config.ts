import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { defineConfig } from 'vite';
import pkg from './package.json';
import cloudflareAppendWorkerHandlers from './scripts/cloudflare-append-worker-handlers';

const releaseName = `caroclothing@${pkg.version}`;
const shouldUploadSentrySourceMaps = Boolean(
	process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default defineConfig({
	plugins: [
		tailwindcss(),
		sentrySvelteKit({
			org: process.env.SENTRY_ORG,
			project: process.env.SENTRY_PROJECT,
			authToken: process.env.SENTRY_AUTH_TOKEN,
			adapter: 'cloudflare',
			release: {
				name: releaseName,
				inject: true
			},
			autoUploadSourceMaps: shouldUploadSentrySourceMaps
		}),
		sveltekit(),
		cloudflareAppendWorkerHandlers()
	],
	define: { __APP_VERSION__: JSON.stringify(pkg.version) }
});
