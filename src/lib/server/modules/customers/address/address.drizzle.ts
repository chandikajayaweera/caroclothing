import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';
import { user } from '$lib/server/modules/auth/auth.drizzle';

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * All 25 Sri Lanka districts.
 * Used to power a dropdown on the checkout form.
 */
export const SL_DISTRICTS = [
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

export type SLDistrict = (typeof SL_DISTRICTS)[number];

export const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

// ── Table ──────────────────────────────────────────────────────────────────

export const address = sqliteTable(
	'address',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),

		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		/** Optional friendly label shown in the address book. */
		label: text('label', { enum: ADDRESS_LABELS }),

		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),

		/** Local phone number used by the delivery rider. */
		phone: text('phone').notNull(),

		addressLine1: text('address_line_1').notNull(),
		addressLine2: text('address_line_2'),
		city: text('city').notNull(),
		district: text('district').notNull(),
		postalCode: text('postal_code'),

		/** ISO 3166-1 alpha-2 country code. Defaults to Sri Lanka. */
		country: text('country').default('LK').notNull(),

		/** Only one address per user can be the default. Enforced at service layer. */
		isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),

		...timestamps
	},
	(table) => [index('address_user_idx').on(table.userId)]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const addressRelations = relations(address, ({ one }) => ({
	user: one(user, {
		fields: [address.userId],
		references: [user.id]
	})
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertAddressSchema = createInsertSchema(address, {
	phone: (s) => s.regex(/^\+?[0-9\s\-()]{7,20}$/, 'Must be a valid phone number'),
	country: (s) => s.length(2).toUpperCase()
}).omit({ id: true });

export const selectAddressSchema = createSelectSchema(address);
export const updateAddressSchema = createUpdateSchema(address).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type Address = z.infer<typeof selectAddressSchema>;
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type UpdateAddress = z.infer<typeof updateAddressSchema>;
