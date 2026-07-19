import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['src/worker-configuration.d.ts'] },
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['src/routes/**/*.{js,ts,svelte}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/server/db',
								'$lib/server/db/**',
								'drizzle-orm',
								'drizzle-orm/**',
								'$lib/server/modules/**/*.drizzle'
							],
							message: 'Routes must call service APIs instead of importing database primitives.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/routes/**/*.{js,ts,svelte}'],
		ignores: ['src/routes/media/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/server/db',
								'$lib/server/db/**',
								'drizzle-orm',
								'drizzle-orm/**',
								'$lib/server/modules/**/*.drizzle'
							],
							message: 'Routes must call service APIs instead of importing database primitives.'
						},
						{
							group: [
								'$lib/server/infrastructure/media/r2',
								'$lib/server/infrastructure/media/r2/**'
							],
							message: 'Only the media delivery endpoint may import R2 primitives directly.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/lib/server/**/*.{js,ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/client', '$lib/client/**', '$lib/components', '$lib/components/**'],
							message: 'Server code must not import browser state or Svelte components.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/lib/shared/**/*.{js,ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/server',
								'$lib/server/**',
								'$lib/client',
								'$lib/client/**',
								'$lib/components',
								'$lib/components/**'
							],
							message: 'Shared code must remain environment-neutral.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/lib/server/orchestration/**/*.{js,ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/server/infrastructure/cloudflare',
								'$lib/server/infrastructure/cloudflare/**'
							],
							message: 'Runtime-neutral orchestration must not depend on Cloudflare event adapters.'
						}
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
