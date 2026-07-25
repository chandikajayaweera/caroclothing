import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Private infrastructure used to make failed D1 batch preconditions abort the
// entire atomic batch. No service should expose this table as domain data.
export const d1BatchGuard = sqliteTable(
	'_d1_batch_guard',
	{
		nonce: text('nonce').primaryKey(),
		passed: integer('passed').notNull()
	},
	(table) => [check('d1_batch_guard_passed', sql`${table.passed} = 1`)]
);
