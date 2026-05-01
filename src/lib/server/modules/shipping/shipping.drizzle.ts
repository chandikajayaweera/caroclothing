import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { SRI_LANKA_DISTRICTS } from '../addresses/addresses.drizzle';

// ---------------------------------------------------------------------------
// SHIPPING METHODS
//
// Flat-rate carrier config surfaced to the customer at checkout.
// District-level overrides live in shippingZone.
//
// Example carriers for Sri Lanka: PickMe Flash, Kapruka, DHL, priv. courier.
// ---------------------------------------------------------------------------

export const shippingMethod = sqliteTable(
	'shipping_method',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text('name').notNull(), // "Standard", "Express", "Free"
		description: text('description'), // shown to customer at checkout
		carrier: text('carrier'), // "PickMe Flash", "Kapruka", etc.
		// Default price applies when no shippingZone override exists for the district
		price: integer('price').notNull(), // whole-LKR flat rate
		// When order subtotal >= this value the method becomes free (null = never free)
		freeShippingThreshold: integer('free_shipping_threshold'),
		estimatedDaysMin: integer('estimated_days_min').notNull(),
		estimatedDaysMax: integer('estimated_days_max').notNull(),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('shipping_method_active_idx').on(table.isActive, table.sortOrder),
		check('shipping_method_price_nonnegative', sql`${table.price} >= 0`),
		check(
			'shipping_method_free_threshold_nonnegative',
			sql`${table.freeShippingThreshold} IS NULL OR ${table.freeShippingThreshold} >= 0`
		),
		check(
			'shipping_method_days_valid',
			sql`${table.estimatedDaysMin} >= 0 AND ${table.estimatedDaysMax} >= ${table.estimatedDaysMin}`
		),
		check('shipping_method_sort_nonnegative', sql`${table.sortOrder} >= 0`)
	]
);

// ---------------------------------------------------------------------------
// SHIPPING ZONES  (per-district price overrides)
//
// If a zone row exists for the customer's district + method combination,
// use priceOverride and the zone's estimated days instead of the method defaults.
// Remote districts (Mannar, Mullaitivu, Vavuniya, etc.) can be priced higher.
// ---------------------------------------------------------------------------

export const shippingZone = sqliteTable(
	'shipping_zone',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		shippingMethodId: text('shipping_method_id')
			.notNull()
			.references(() => shippingMethod.id, { onDelete: 'cascade' }),
		// FIX: added { enum: SRI_LANKA_DISTRICTS } to align with address.district.
		// This gives district the correct SriLankaDistrict union type in TypeScript,
		// ensuring type-safety on reads (selectShippingZoneSchema, $inferSelect) and
		// preventing silent string widening when assigning zone.district elsewhere.
		// Note: Drizzle SQLite enums are TypeScript-only — no CHECK is added to DDL.
		// Application-layer validation (Zod) remains the enforcement mechanism for writes.
		district: text('district', { enum: SRI_LANKA_DISTRICTS }).notNull(),
		priceOverride: integer('price_override').notNull(),
		estimatedDaysMin: integer('estimated_days_min').notNull(),
		estimatedDaysMax: integer('estimated_days_max').notNull()
	},
	(table) => [
		index('shipping_zone_method_idx').on(table.shippingMethodId),
		// Unique: only one price override per method+district combination
		uniqueIndex('shipping_zone_lookup_idx').on(table.shippingMethodId, table.district),
		check('shipping_zone_price_nonnegative', sql`${table.priceOverride} >= 0`),
		check(
			'shipping_zone_days_valid',
			sql`${table.estimatedDaysMin} >= 0 AND ${table.estimatedDaysMax} >= ${table.estimatedDaysMin}`
		)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const shippingMethodRelations = relations(shippingMethod, ({ many }) => ({
	zones: many(shippingZone)
}));

export const shippingZoneRelations = relations(shippingZone, ({ one }) => ({
	method: one(shippingMethod, {
		fields: [shippingZone.shippingMethodId],
		references: [shippingMethod.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1).max(64);

function validateDeliveryEstimate(
	data: { estimatedDaysMin?: number; estimatedDaysMax?: number },
	ctx: z.RefinementCtx
) {
	if (
		data.estimatedDaysMin !== undefined &&
		data.estimatedDaysMax !== undefined &&
		data.estimatedDaysMax < data.estimatedDaysMin
	) {
		ctx.addIssue({
			code: 'custom',
			message: 'estimatedDaysMax must be >= estimatedDaysMin',
			path: ['estimatedDaysMax']
		});
	}
}

export const insertShippingMethodBaseSchema = createInsertSchema(shippingMethod, {
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional().nullable(),
	carrier: z.string().max(100).optional().nullable(),
	price: z.number().int().min(0),
	freeShippingThreshold: z.number().int().min(0).optional().nullable(),
	estimatedDaysMin: z.number().int().min(0),
	estimatedDaysMax: z.number().int().min(1),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().min(0).optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const insertShippingMethodSchema =
	insertShippingMethodBaseSchema.superRefine(validateDeliveryEstimate);
export const selectShippingMethodSchema = createSelectSchema(shippingMethod);
export const updateShippingMethodSchema = createUpdateSchema(shippingMethod, {
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional().nullable(),
	carrier: z.string().max(100).optional().nullable(),
	price: z.number().int().min(0).optional(),
	freeShippingThreshold: z.number().int().min(0).optional().nullable(),
	estimatedDaysMin: z.number().int().min(0).optional(),
	estimatedDaysMax: z.number().int().min(1).optional(),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().min(0).optional()
})
	.omit({
		id: true,
		createdAt: true,
		updatedAt: true
	})
	.superRefine(validateDeliveryEstimate);

export const insertShippingZoneBaseSchema = createInsertSchema(shippingZone, {
	shippingMethodId: idSchema,
	district: z.enum(SRI_LANKA_DISTRICTS),
	priceOverride: z.number().int().min(0),
	estimatedDaysMin: z.number().int().min(0),
	estimatedDaysMax: z.number().int().min(1)
}).omit({
	id: true
});
export const insertShippingZoneSchema =
	insertShippingZoneBaseSchema.superRefine(validateDeliveryEstimate);
export const selectShippingZoneSchema = createSelectSchema(shippingZone);
export const updateShippingZoneSchema = createUpdateSchema(shippingZone, {
	shippingMethodId: idSchema.optional(),
	priceOverride: z.number().int().min(0).optional(),
	// FIX: district was previously unvalidated in updates. Because the column was
	// plain text(), createUpdateSchema inferred it as z.string().optional(), meaning
	// any string bypassed validation. Explicitly enforce the enum here to match
	// the insert schema.
	district: z.enum(SRI_LANKA_DISTRICTS).optional(),
	estimatedDaysMin: z.number().int().min(0).optional(),
	estimatedDaysMax: z.number().int().min(1).optional()
})
	.omit({
		id: true
	})
	.superRefine(validateDeliveryEstimate);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type ShippingMethod = typeof shippingMethod.$inferSelect;
export type NewShippingMethod = typeof shippingMethod.$inferInsert;
export type InsertShippingMethod = z.infer<typeof insertShippingMethodSchema>;
export type SelectShippingMethod = z.infer<typeof selectShippingMethodSchema>;
export type UpdateShippingMethod = z.infer<typeof updateShippingMethodSchema>;
export type ShippingZone = typeof shippingZone.$inferSelect;
export type NewShippingZone = typeof shippingZone.$inferInsert;
export type InsertShippingZone = z.infer<typeof insertShippingZoneSchema>;
export type SelectShippingZone = z.infer<typeof selectShippingZoneSchema>;
export type UpdateShippingZone = z.infer<typeof updateShippingZoneSchema>;
