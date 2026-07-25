import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const localD1Directory = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

function getLocalD1Path() {
	const configuredPath = process.env.LOCAL_D1_DB_PATH?.trim();
	if (configuredPath) {
		const resolvedPath = resolve(configuredPath);
		if (!existsSync(resolvedPath)) {
			throw new Error(`LOCAL_D1_DB_PATH does not exist: ${resolvedPath}`);
		}
		return resolvedPath;
	}

	if (!existsSync(localD1Directory)) {
		throw new Error('Local D1 state was not found. Run `pnpm db:migrate` first.');
	}

	const databaseFiles = readdirSync(localD1Directory, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() && entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite'
		)
		.map((entry) => resolve(localD1Directory, entry.name))
		.sort();

	if (databaseFiles.length !== 1) {
		throw new Error(
			`Expected one local D1 database, found ${databaseFiles.length}. Set LOCAL_D1_DB_PATH to the intended .sqlite file.`
		);
	}

	return databaseFiles[0];
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: getLocalD1Path()
	},
	verbose: true,
	strict: true
});
