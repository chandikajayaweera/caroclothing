import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const waitlist = sqliteTable('waitlist', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => nanoid()),
	phone: text('phone').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
});
