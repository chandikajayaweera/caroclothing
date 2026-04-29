import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json';
import cloudflareAppendScheduled from './scripts/cloudflare-append-scheduled';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), cloudflareAppendScheduled()],
	define: { __APP_VERSION__: JSON.stringify(pkg.version) }
});
