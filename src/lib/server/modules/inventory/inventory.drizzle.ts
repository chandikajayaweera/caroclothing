import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { productVariant } from '../products/products.drizzle';

// ---------------------------------------------------------------------------
// INVENTORY
//
// One row per variant. Tracks total stock and how much is currently reserved
// by active carts / pending orders.
//
// available stock (at query time) = quantity - reservedQuantity
//
// IMPORTANT: update both `quantity` and `reservedQuantity` in a transaction
// and always log a matching `inventoryMovement` row for auditability.
//
// BACKORDER BEHAVIOUR — reservedQuantity contract:
//   reservedQuantity tracks physical stock held for in-progress carts/orders.
//   It is ONLY incremented when actual stock exists to reserve against.
//
//   When allowBackorder = true and quantity = 0:
//     - The application layer permits the order without incrementing reservedQuantity
//       (there is nothing physical to reserve).
//     - The CHECK constraint intentionally prevents reservedQuantity > quantity,
//       so do NOT attempt to reserve backorder stock — skip the reservation step.
//     - To track pending backorder demand, use the order rows themselves
//       (status = 'pending' | 'confirmed' with items for this variantId).
// ---------------------------------------------------------------------------

export const inventory = sqliteTable(
	'inventory',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		variantId: text('variant_id')
			.notNull()
			.unique()
			.references(() => productVariant.id, { onDelete: 'cascade' }),
		quantity: integer('quantity').default(0).notNull(),
		// Items currently held in active carts or pending orders.
		// Decrement on cart expiry / order cancellation; increment on add-to-cart.
		// Never incremented for backorder items (see note above).
		reservedQuantity: integer('reserved_quantity').default(0).notNull(),
		// Alert threshold — surface low-stock warnings in the admin panel
		lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
		// false = always show as available (useful for made-to-order drops)
		trackInventory: integer('track_inventory', { mode: 'boolean' }).default(true).notNull(),
		// Allow orders even when stock hits 0 (e.g. pre-order campaigns).
		// When true, the application bypasses the reservedQuantity step entirely —
		// the CHECK constraint below still holds; it is not relaxed for backorders.
		allowBackorder: integer('allow_backorder', { mode: 'boolean' }).default(false).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		// Cover index for low-stock dashboard queries
		index('inventory_low_stock_idx').on(
			table.trackInventory,
			table.quantity,
			table.lowStockThreshold
		),
		// Prevent reserved stock from exceeding total stock.
		// This constraint is always enforced regardless of allowBackorder — the
		// application must not attempt to increment reservedQuantity when quantity = 0.
		check(
			'reserved_not_exceed_quantity',
			sql`${table.reservedQuantity} >= 0 AND ${table.reservedQuantity} <= ${table.quantity}`
		)
	]
);

// ---------------------------------------------------------------------------
// INVENTORY MOVEMENTS  (append-only audit log — never delete rows)
//
// Every change to stock quantity MUST produce a movement row.
// This gives a complete history for reconciliation and dispute resolution.
// ---------------------------------------------------------------------------

export const inventoryMovement = sqliteTable(
	'inventory_movement',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		variantId: text('variant_id')
			.notNull()
			.references(() => productVariant.id, { onDelete: 'cascade' }),
		type: text('type', {
			enum: [
				'restock', // admin top-up
				'sale', // order confirmed → stock decremented
				'return', // refund/return → stock restored
				'adjustment', // manual admin correction
				'reserved', // added to active cart → reservedQuantity ++
				'released', // cart expired/item removed → reservedQuantity --
				'cancelled' // order cancelled → stock released back
			]
		}).notNull(),
		// Signed delta: positive = stock in, negative = stock out
		quantityDelta: integer('quantity_delta').notNull(),
		// Snapshot of quantity AFTER this movement applied (for reconciliation)
		quantityAfter: integer('quantity_after').notNull(),
		// Causal reference: orderId, cartItemId, etc.
		referenceId: text('reference_id'),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		index('inv_movement_variant_idx').on(table.variantId),
		index('inv_movement_type_idx').on(table.type),
		index('inv_movement_ref_idx').on(table.referenceId),
		index('inv_movement_created_idx').on(table.createdAt)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
	variant: one(productVariant, {
		fields: [inventory.variantId],
		references: [productVariant.id]
	}),
	movements: many(inventoryMovement)
}));

export const inventoryMovementRelations = relations(inventoryMovement, ({ one }) => ({
	variant: one(productVariant, {
		fields: [inventoryMovement.variantId],
		references: [productVariant.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

export const insertInventorySchema = createInsertSchema(inventory, {
	quantity: z.number().int().min(0),
	reservedQuantity: z.number().int().min(0),
	lowStockThreshold: z.number().int().min(0).optional()
});
export const selectInventorySchema = createSelectSchema(inventory);

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovement, {
	quantityDelta: z
		.number()
		.int()
		.refine((v) => v !== 0, {
			message: 'quantityDelta cannot be zero'
		}),
	quantityAfter: z.number().int().min(0),
	referenceId: z.string().min(1).optional().nullable(),
	note: z.string().max(500).optional().nullable()
});
export const selectInventoryMovementSchema = createSelectSchema(inventoryMovement);

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;
export type InventoryMovement = typeof inventoryMovement.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovement.$inferInsert;
