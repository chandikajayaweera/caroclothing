import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIGURED_CRON_SCHEDULES } from './schedules';

describe('cron schedules', () => {
	it('keeps production and staging cron arrays exactly aligned with orchestration schedules', () => {
		const config = readWranglerConfig();

		expect(config.triggers.crons).toEqual([...CONFIGURED_CRON_SCHEDULES]);
		expect(config.env.staging.triggers.crons).toEqual([...CONFIGURED_CRON_SCHEDULES]);
	});
});

type WranglerConfig = {
	triggers: { crons: string[] };
	env: { staging: { triggers: { crons: string[] } } };
};

function readWranglerConfig(): WranglerConfig {
	const wranglerConfig = readFileSync(
		new URL('../../../../../wrangler.jsonc', import.meta.url),
		'utf8'
	);

	return JSON.parse(stripJsonComments(wranglerConfig)) as WranglerConfig;
}

function stripJsonComments(input: string): string {
	let output = '';
	let inString = false;
	let escaped = false;

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		const next = input[index + 1];

		if (inString) {
			output += char;
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === '"') inString = false;
			continue;
		}

		if (char === '"') {
			inString = true;
			output += char;
			continue;
		}

		if (char === '/' && next === '/') {
			while (index < input.length && input[index] !== '\n') index += 1;
			output += '\n';
			continue;
		}

		if (char === '/' && next === '*') {
			index += 2;
			while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
				index += 1;
			}
			index += 1;
			continue;
		}

		output += char;
	}

	return output;
}
