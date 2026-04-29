/**
 * Vite plugin to append scheduled handler to SvelteKit-generated Cloudflare Worker
 *
 * Workaround for @sveltejs/adapter-cloudflare limitation:
 * The adapter doesn't automatically wire custom handlers (like scheduled) into _worker.js
 *
 * This plugin runs after build and inlines the scheduled handler code directly
 * into the auto-generated worker file.
 *
 * @see https://github.com/sveltejs/kit/issues/13692
 * @see https://github.com/sveltejs/kit/pull/13739 (native support coming)
 * @see https://github.com/zekele-win/zekele-fed (reference implementation)
 */

import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(pluginDir, '..');
const workerPath = path.join(rootDir, '.svelte-kit', 'cloudflare', '_worker.js');
const marker = '// caro:scheduled-handler';

export default function cloudflareAppendScheduled(): Plugin {
	return {
		name: 'cloudflare-append-scheduled',
		closeBundle(error) {
			if (error) return;

			if (!fs.existsSync(workerPath)) {
				throw new Error(`[cloudflare-append-scheduled] Missing Worker entry: ${workerPath}`);
			}

			let content = fs.readFileSync(workerPath, 'utf8');
			if (content.includes(marker)) return;
			if (!content.includes('worker_default')) {
				throw new Error('[cloudflare-append-scheduled] Expected worker_default in _worker.js.');
			}

			content += `
${marker}
import { scheduled } from "../output/server/entries/hooks.server.js";
worker_default.scheduled = scheduled;
`;

			fs.writeFileSync(workerPath, content, 'utf8');
		}
	};
}
