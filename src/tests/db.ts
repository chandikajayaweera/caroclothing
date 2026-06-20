import { execSync } from 'node:child_process';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '$lib/server/db/schema';

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

export type TestDatabaseHarness = {
	client: Client;
	db: TestDatabase;
	reset: () => Promise<void>;
	close: () => void;
};

let schemaSql: string | undefined;

function getSchemaSql(): string {
	if (schemaSql) return schemaSql;

	const command =
		process.platform === 'win32'
			? 'pnpm.cmd exec drizzle-kit export --dialect sqlite --schema ./src/lib/server/db/schema.ts'
			: 'pnpm exec drizzle-kit export --dialect sqlite --schema ./src/lib/server/db/schema.ts';

	schemaSql = execSync(command, { encoding: 'utf8' });
	return schemaSql;
}

function splitSqlStatements(sql: string): string[] {
	return sql
		.split(/;\s*(?:\r?\n|$)/)
		.map((statement) => statement.trim())
		.filter(Boolean);
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

async function applySchema(client: Client): Promise<void> {
	await client.execute('PRAGMA foreign_keys=ON');

	for (const statement of splitSqlStatements(getSchemaSql())) {
		await client.execute(statement);
	}

	const tableNames = new Set(await listUserTables(client));
	for (const tableName of [
		'product',
		'drop',
		'drop_product',
		'drop_waitlist',
		'inventory',
		'inventory_movement',
		'promo_code',
		'promo_code_usage',
		'orders'
	]) {
		if (!tableNames.has(tableName)) {
			throw new Error(`Test database schema bootstrap failed: ${tableName} table was not created.`);
		}
	}
}

async function listUserTables(client: Client): Promise<string[]> {
	const result = await client.execute(
		"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name"
	);

	return result.rows.map((row) => String(row.name));
}

export async function createTestDatabase(): Promise<TestDatabaseHarness> {
	const client = createClient({ url: 'file::memory:?cache=shared' });
	await applySchema(client);
	const db = drizzle(client, { schema });

	return {
		client,
		db,
		reset: async () => {
			await client.execute('PRAGMA foreign_keys=OFF');
			for (const tableName of await listUserTables(client)) {
				await client.execute(`DELETE FROM ${quoteIdentifier(tableName)}`);
			}
			await client.execute('PRAGMA foreign_keys=ON');
		},
		close: () => {
			client.close();
		}
	};
}
