import { integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Spread into any table that needs both createdAt and updatedAt.
 * updatedAt is automatically refreshed via .$onUpdate().
 */
export const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull()
};

/**
 * Spread into immutable tables (e.g. order_item, coupon_usage) that
 * are never updated after insert.
 */
export const createdAt = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull()
};
