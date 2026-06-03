import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { SRI_LANKA_DISTRICTS } from '../addresses/addresses.drizzle';

// ---------------------------------------------------------------------------
// CARRIERS
// ---------------------------------------------------------------------------

export const carrier = sqliteTable(
	'carrier',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text('name').notNull().unique(), // e.g. "PickMe Flash"
		code: text('code').notNull().unique(), // e.g. "PICKME"
		urlTemplate: text('url_template'), // Nullable if no online tracking link is supported
		notes: text('notes'),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('carrier_active_idx').on(table.isActive)]
);

// ---------------------------------------------------------------------------
// SHIPPING METHODS
// ---------------------------------------------------------------------------

export const shippingMethod = sqliteTable(
	'shipping_method',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text('name').notNull().unique(), // "Standard", "Express", "Free"
		description: text('description'), // shown to customer at checkout
		price: integer('price').notNull(), // whole-LKR flat rate
		freeShippingThreshold: integer('free_shipping_threshold'),
		estimatedDaysMin: integer('estimated_days_min').notNull(),
		estimatedDaysMax: integer('estimated_days_max').notNull(),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		carrierId: text('carrier_id').references(() => carrier.id, { onDelete: 'set null' }),
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
// SHIPPING ZONES (per-district rate overrides & blockings)
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
		district: text('district', { enum: SRI_LANKA_DISTRICTS }).notNull(),
		priceOverride: integer('price_override').notNull(),
		estimatedDaysMin: integer('estimated_days_min').notNull(),
		estimatedDaysMax: integer('estimated_days_max').notNull(),
		isAvailable: integer('is_available', { mode: 'boolean' }).default(true).notNull(),
		carrierIdOverride: text('carrier_id_override').references(() => carrier.id, {
			onDelete: 'set null'
		})
	},
	(table) => [
		index('shipping_zone_method_idx').on(table.shippingMethodId),
		uniqueIndex('shipping_zone_lookup_idx').on(table.district, table.shippingMethodId),
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

export const carrierRelations = relations(carrier, ({ many }) => ({
	shippingMethods: many(shippingMethod),
	shippingZones: many(shippingZone)
}));

export const shippingMethodRelations = relations(shippingMethod, ({ one, many }) => ({
	carrier: one(carrier, {
		fields: [shippingMethod.carrierId],
		references: [carrier.id]
	}),
	zones: many(shippingZone)
}));

export const shippingZoneRelations = relations(shippingZone, ({ one }) => ({
	method: one(shippingMethod, {
		fields: [shippingZone.shippingMethodId],
		references: [shippingMethod.id]
	}),
	carrierOverride: one(carrier, {
		fields: [shippingZone.carrierIdOverride],
		references: [carrier.id]
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

// CARRIER
const carrierCodeSchema = z
	.preprocess((val) => (typeof val === 'string' ? val.trim().toUpperCase() : val), z.string())
	.pipe(
		z
			.string()
			.min(1, { message: 'Carrier Code is required' })
			.max(50, { message: 'Carrier Code cannot exceed 50 characters' })
			.regex(/^[A-Z0-9]+$/, {
				message: 'Carrier Code must contain only uppercase letters and numbers, with no spaces'
			})
	);

const carrierCodeOptionalSchema = z
	.preprocess(
		(val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
		z.string().optional()
	)
	.pipe(
		z
			.string()
			.min(1, { message: 'Carrier Code cannot be empty' })
			.max(50, { message: 'Carrier Code cannot exceed 50 characters' })
			.regex(/^[A-Z0-9]+$/, {
				message: 'Carrier Code must contain only uppercase letters and numbers, with no spaces'
			})
			.optional()
	);

const urlTemplateSchema = z
	.string()
	.max(500, { message: 'Tracking URL cannot exceed 500 characters' })
	.refine(
		(v) => !v || v.toLowerCase().startsWith('http://') || v.toLowerCase().startsWith('https://'),
		{ message: 'Tracking URL must start with http:// or https://' }
	)
	.refine((v) => !v || v.includes('{trackingNumber}'), {
		message: "Tracking URL must contain the '{trackingNumber}' placeholder"
	})
	.or(z.literal(''))
	.optional()
	.nullable();

export const insertCarrierSchema = createInsertSchema(carrier, {
	name: z
		.string()
		.min(1, { message: 'Carrier Name is required' })
		.max(100, { message: 'Carrier Name cannot exceed 100 characters' }),
	code: carrierCodeSchema,
	urlTemplate: urlTemplateSchema,
	notes: z
		.string()
		.max(500, { message: 'Notes cannot exceed 500 characters' })
		.optional()
		.nullable(),
	isActive: z.boolean().optional()
}).omit({ id: true, createdAt: true, updatedAt: true });

export const selectCarrierSchema = createSelectSchema(carrier);

export const updateCarrierSchema = createUpdateSchema(carrier, {
	name: z
		.string()
		.min(1, { message: 'Carrier Name is required' })
		.max(100, { message: 'Carrier Name cannot exceed 100 characters' })
		.optional(),
	code: carrierCodeOptionalSchema,
	urlTemplate: urlTemplateSchema,
	notes: z
		.string()
		.max(500, { message: 'Notes cannot exceed 500 characters' })
		.optional()
		.nullable(),
	isActive: z.boolean().optional()
}).omit({ id: true, createdAt: true, updatedAt: true });

// SHIPPING METHOD
const insertShippingMethodBaseSchema = createInsertSchema(shippingMethod, {
	name: z
		.string()
		.min(1, { message: 'Method Name is required' })
		.max(100, { message: 'Method Name cannot exceed 100 characters' }),
	description: z
		.string()
		.max(500, { message: 'Description cannot exceed 500 characters' })
		.optional()
		.nullable(),
	price: z
		.number()
		.int({ message: 'Price must be an integer' })
		.min(0, { message: 'Price cannot be negative' }),
	freeShippingThreshold: z
		.number()
		.int({ message: 'Free shipping threshold must be an integer' })
		.min(0, { message: 'Free shipping threshold cannot be negative' })
		.optional()
		.nullable(),
	estimatedDaysMin: z
		.number()
		.int({ message: 'Minimum delivery days must be an integer' })
		.min(0, { message: 'Minimum delivery days cannot be negative' }),
	estimatedDaysMax: z
		.number()
		.int({ message: 'Maximum delivery days must be an integer' })
		.min(0, { message: 'Maximum delivery days cannot be negative' }),
	isActive: z.boolean().optional(),
	sortOrder: z
		.number()
		.int({ message: 'Sort order must be an integer' })
		.min(0, { message: 'Sort order cannot be negative' })
		.optional(),
	carrierId: idSchema.optional().nullable()
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertShippingMethodSchema =
	insertShippingMethodBaseSchema.superRefine(validateDeliveryEstimate);

export const selectShippingMethodSchema = createSelectSchema(shippingMethod);

export const updateShippingMethodSchema = createUpdateSchema(shippingMethod, {
	name: z
		.string()
		.min(1, { message: 'Method Name is required' })
		.max(100, { message: 'Method Name cannot exceed 100 characters' })
		.optional(),
	description: z
		.string()
		.max(500, { message: 'Description cannot exceed 500 characters' })
		.optional()
		.nullable(),
	price: z
		.number()
		.int({ message: 'Price must be an integer' })
		.min(0, { message: 'Price cannot be negative' })
		.optional(),
	freeShippingThreshold: z
		.number()
		.int({ message: 'Free shipping threshold must be an integer' })
		.min(0, { message: 'Free shipping threshold cannot be negative' })
		.optional()
		.nullable(),
	estimatedDaysMin: z
		.number()
		.int({ message: 'Minimum delivery days must be an integer' })
		.min(0, { message: 'Minimum delivery days cannot be negative' })
		.optional(),
	estimatedDaysMax: z
		.number()
		.int({ message: 'Maximum delivery days must be an integer' })
		.min(0, { message: 'Maximum delivery days cannot be negative' })
		.optional(),
	isActive: z.boolean().optional(),
	sortOrder: z
		.number()
		.int({ message: 'Sort order must be an integer' })
		.min(0, { message: 'Sort order cannot be negative' })
		.optional(),
	carrierId: idSchema.optional().nullable()
})
	.omit({ id: true, createdAt: true, updatedAt: true })
	.superRefine(validateDeliveryEstimate);

// SHIPPING ZONE
const insertShippingZoneBaseSchema = createInsertSchema(shippingZone, {
	shippingMethodId: idSchema,
	district: z.enum(SRI_LANKA_DISTRICTS),
	priceOverride: z
		.number()
		.int({ message: 'Price override must be an integer' })
		.min(0, { message: 'Price override cannot be negative' }),
	estimatedDaysMin: z
		.number()
		.int({ message: 'Minimum delivery days must be an integer' })
		.min(0, { message: 'Minimum delivery days cannot be negative' }),
	estimatedDaysMax: z
		.number()
		.int({ message: 'Maximum delivery days must be an integer' })
		.min(0, { message: 'Maximum delivery days cannot be negative' }),
	isAvailable: z.boolean().optional(),
	carrierIdOverride: idSchema.optional().nullable()
}).omit({ id: true });

export const insertShippingZoneSchema =
	insertShippingZoneBaseSchema.superRefine(validateDeliveryEstimate);

export const selectShippingZoneSchema = createSelectSchema(shippingZone);

export const updateShippingZoneSchema = createUpdateSchema(shippingZone, {
	priceOverride: z
		.number()
		.int({ message: 'Price override must be an integer' })
		.min(0, { message: 'Price override cannot be negative' })
		.optional(),
	estimatedDaysMin: z
		.number()
		.int({ message: 'Minimum delivery days must be an integer' })
		.min(0, { message: 'Minimum delivery days cannot be negative' })
		.optional(),
	estimatedDaysMax: z
		.number()
		.int({ message: 'Maximum delivery days must be an integer' })
		.min(0, { message: 'Maximum delivery days cannot be negative' })
		.optional(),
	isAvailable: z.boolean().optional(),
	carrierIdOverride: idSchema.optional().nullable()
})
	.omit({ id: true, shippingMethodId: true, district: true })
	.superRefine(validateDeliveryEstimate);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Carrier = typeof carrier.$inferSelect;
export type NewCarrier = typeof carrier.$inferInsert;
export type InsertCarrier = z.infer<typeof insertCarrierSchema>;
export type SelectCarrier = z.infer<typeof selectCarrierSchema>;
export type UpdateCarrier = z.infer<typeof updateCarrierSchema>;

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
