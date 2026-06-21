import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRON_SCHEDULES } from './schedules';

describe('cron schedules', () => {
	it('keeps orchestration schedules aligned with wrangler.jsonc', () => {
		const wranglerConfig = readFileSync(
			new URL('../../../../../wrangler.jsonc', import.meta.url),
			'utf8'
		);

		for (const cron of Object.values(CRON_SCHEDULES)) {
			expect(wranglerConfig).toContain(`"${cron}"`);
		}
	});
});
