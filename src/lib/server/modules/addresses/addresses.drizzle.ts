import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';

// ---------------------------------------------------------------------------
// SRI LANKA DISTRICTS  (all 25 — used for shipping zone lookups)
// ---------------------------------------------------------------------------

export const SRI_LANKA_DISTRICTS = [
	'Ampara',
	'Anuradhapura',
	'Badulla',
	'Batticaloa',
	'Colombo',
	'Galle',
	'Gampaha',
	'Hambantota',
	'Jaffna',
	'Kalutara',
	'Kandy',
	'Kegalle',
	'Kilinochchi',
	'Kurunegala',
	'Mannar',
	'Matale',
	'Matara',
	'Monaragala',
	'Mullaitivu',
	'Nuwara Eliya',
	'Polonnaruwa',
	'Puttalam',
	'Ratnapura',
	'Trincomalee',
	'Vavuniya'
] as const;

export type SriLankaDistrict = (typeof SRI_LANKA_DISTRICTS)[number];

// ---------------------------------------------------------------------------
// ADDRESSES
//
// userId is nullable to support guest checkout.
// Guests supply address inline at checkout; authenticated users can save
// multiple addresses and pick one. isDefault is only meaningful for
// authenticated users (userId not null).
//
// When an order is placed the full address is snapshot-copied into
// order.shippingAddressSnapshot (JSON) so historical orders are never
// affected by address edits or deletions.
// ---------------------------------------------------------------------------

export const address = sqliteTable(
	'address',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		// null for guest checkout addresses attached to an order snapshot
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		label: text('label'), // "Home", "Work", "Mom's place"
		recipientName: text('recipient_name').notNull(),
		phone: text('phone').notNull(),
		addressLine1: text('address_line1').notNull(),
		addressLine2: text('address_line2'),
		city: text('city').notNull(),
		district: text('district', { enum: SRI_LANKA_DISTRICTS }).notNull(),
		postalCode: text('postal_code'),
		isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('address_user_idx').on(table.userId),
		// Fast lookup for "get my default address"
		index('address_user_default_idx').on(table.userId, table.isDefault),
		// isDefault is only meaningful for authenticated users
		check('default_requires_user', sql`${table.userId} IS NOT NULL OR ${table.isDefault} = 0`)
		// NOTE: uniqueness of isDefault=true per user cannot be expressed as a Drizzle
		// schema index (requires a partial index). Add this to your migration SQL:
		//
		//   CREATE UNIQUE INDEX address_one_default_per_user
		//     ON address(user_id) WHERE is_default = 1;
		//
		// This prevents a user from having multiple default addresses while still
		// allowing multiple non-default ones.
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const addressRelations = relations(address, ({ one }) => ({
	user: one(user, {
		fields: [address.userId],
		references: [user.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

// Reusable SL phone validator: +94 7X XXXXXXX or local 07X XXXXXXX
const sriLankaPhoneSchema = z
	.string()
	.regex(
		/^(?:\+94|0)7[0-9]{8}$/,
		'Must be a valid Sri Lankan mobile number (e.g. 0771234567 or +94771234567)'
	);

const districtSchema = z.enum(SRI_LANKA_DISTRICTS);

export const insertAddressSchema = createInsertSchema(address, {
	recipientName: z.string().min(1).max(150),
	phone: sriLankaPhoneSchema,
	addressLine1: z.string().min(1).max(255),
	addressLine2: z.string().max(255).optional().nullable(),
	city: z.string().min(1).max(100),
	district: districtSchema,
	postalCode: z.string().max(10).optional().nullable(),
	label: z.string().max(50).optional().nullable()
});
export const selectAddressSchema = createSelectSchema(address);
export const updateAddressSchema = createUpdateSchema(address, {
	recipientName: z.string().min(1).max(150).optional(),
	phone: sriLankaPhoneSchema.optional(),
	addressLine1: z.string().min(1).max(255).optional(),
	addressLine2: z.string().max(255).optional().nullable(),
	city: z.string().min(1).max(100).optional(),
	district: districtSchema.optional(),
	postalCode: z.string().max(10).optional().nullable(),
	label: z.string().max(50).optional().nullable()
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Address = typeof address.$inferSelect;
export type NewAddress = typeof address.$inferInsert;
