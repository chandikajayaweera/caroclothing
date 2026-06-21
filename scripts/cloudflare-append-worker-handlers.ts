/**
 * Vite plugin to append custom handlers to SvelteKit-generated Cloudflare Worker.
 *
 * Workaround for @sveltejs/adapter-cloudflare limitation:
 * the adapter does not automatically wire custom handlers such as queue/scheduled into _worker.js.
 *
 * @see https://github.com/sveltejs/kit/issues/13692
 * @see https://github.com/sveltejs/kit/pull/13739
 * @see https://github.com/zekele-win/zekele-fed
 */

import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(pluginDir, '..');
const workerPath = path.join(rootDir, '.svelte-kit', 'cloudflare', '_worker.js');
const marker = '// caro:cloudflare-worker-handlers';
const hooksEntryPath = '../output/server/entries/hooks.server.js';

const queueAssignment = 'worker_default.queue = queue;';
const scheduledAssignment = 'worker_default.scheduled = scheduled;';

export default function cloudflareAppendWorkerHandlers(): Plugin {
	return {
		name: 'cloudflare-append-worker-handlers',
		closeBundle(error) {
			if (error) return;

			if (!fs.existsSync(workerPath)) {
				throw new Error(`[cloudflare-append-worker-handlers] Missing Worker entry: ${workerPath}`);
			}

			let content = fs.readFileSync(workerPath, 'utf8');
			if (!content.includes('worker_default')) {
				throw new Error(
					'[cloudflare-append-worker-handlers] Expected worker_default in _worker.js.'
				);
			}

			const appendLines = buildAppendLines(content);
			if (appendLines.length === 0) return;

			content += `\n${marker}\n${appendLines.join('\n')}\n`;
			fs.writeFileSync(workerPath, content, 'utf8');
		}
	};
}

function buildAppendLines(content: string): string[] {
	const lines: string[] = [];

	if (!content.includes(queueAssignment)) {
		lines.push(`import { queue } from "${hooksEntryPath}";`);
		lines.push(queueAssignment);
	}

	if (!content.includes(scheduledAssignment)) {
		lines.push(`import { scheduled } from "${hooksEntryPath}";`);
		lines.push(scheduledAssignment);
	}

	return lines;
}
