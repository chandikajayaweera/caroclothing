import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json';
import cloudflareAppendWorkerHandlers from './scripts/cloudflare-append-worker-handlers';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), cloudflareAppendWorkerHandlers()],
	define: { __APP_VERSION__: JSON.stringify(pkg.version) }
});
