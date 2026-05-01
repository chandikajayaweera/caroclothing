import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { user } from '../auth/auth.drizzle';
import { product, r2KeySchema, slugSchema } from '../products/products.drizzle';

// ---------------------------------------------------------------------------
// DROP STATUS ENUM
//
// Lifecycle:
//   teaser   → visible with countdown + notify-me CTA, products not yet purchasable
//   live     → products purchasable, inventory actively consumed
//   sold_out → all drop products are OOS (set by admin or automated job)
//   archived → historical drops, read-only display only
// ---------------------------------------------------------------------------

export const DROP_STATUSES = ['teaser', 'live', 'sold_out', 'archived'] as const;
export type DropStatus = (typeof DROP_STATUSES)[number];

// ---------------------------------------------------------------------------
// DROPS
//
// A Drop is a named, dated, limited-release event — the cultural engine of the
// Caro business model. Each drop has its own page (/drops/[slug]), a countdown,
// a notify-me waitlist, and a curated set of products.
//
// heroImageR2Key — the full-bleed background image for the drop page and homepage
// hero. Stored as an R2 key; resolve via mediaUrl(heroImageR2Key).
//
// launchAt — the exact timestamp the drop goes live. Used to:
//   1. Drive the CountdownTimer component
//   2. Auto-transition status from teaser → live (via cron job or webhook)
//
// endAt — optional hard close time. Useful for flash drops with a defined window.
//   null = drop closes only when sold out or manually archived.
// ---------------------------------------------------------------------------

export const drop = sqliteTable(
	'drop',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		// URL-safe slug — the source of truth for /drops/[slug] routing
		slug: text('slug').notNull().unique(),
		// Display name: "DROP 001", "SUMMER EDIT", etc.
		name: text('name').notNull(),
		// Short teaser line shown on the drop page and homepage teaser section
		tagline: text('tagline'),
		// Longer description (markdown). Shown on the live drop page below the hero.
		description: text('description'),
		status: text('status', { enum: DROP_STATUSES }).default('teaser').notNull(),
		// When the drop goes live. Null = to be confirmed (show "Coming Soon" not a timer).
		launchAt: integer('launch_at', { mode: 'timestamp_ms' }),
		// Optional hard close. Null = no fixed end (closes on sell-out or admin archive).
		endAt: integer('end_at', { mode: 'timestamp_ms' }),
		// R2 key for the full-bleed hero/background image. NOT a URL.
		// Resolve via: mediaUrl(heroImageR2Key) from media/utils.ts
		heroImageR2Key: text('hero_image_r2_key'),
		// Lower number = shown first on the /drops listing page
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
		// Homepage: find the current live drop or next upcoming teaser
		index('drop_status_launch_idx').on(table.status, table.launchAt),
		// Drops listing page: ordered display
		index('drop_sort_idx').on(table.sortOrder, table.createdAt),
		check('drop_sort_nonnegative', sql`${table.sortOrder} >= 0`),
		check(
			'drop_end_after_launch',
			sql`${table.launchAt} IS NULL OR ${table.endAt} IS NULL OR ${table.endAt} > ${table.launchAt}`
		)
	]
);

// ---------------------------------------------------------------------------
// DROP PRODUCTS  (junction table — products in a drop)
//
// A drop contains one or more products (all with tier = 'drop').
// Products can only appear in one active drop at a time — enforce this at
// the application layer when transitioning a drop to 'live'.
//
// isHero = true → this product's primary image is the drop hero visual.
//   At most one hero per drop (enforced by partial unique index).
//
// sortOrder controls the display sequence within the drop's product grid.
// ---------------------------------------------------------------------------

export const dropProduct = sqliteTable(
	'drop_product',
	{
		dropId: text('drop_id')
			.notNull()
			.references(() => drop.id, { onDelete: 'cascade' }),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		// The featured/hero product of the drop — whose image anchors the drop page.
		// Max one per drop (application layer enforces this).
		isHero: integer('is_hero', { mode: 'boolean' }).default(false).notNull(),
		// Display order within the drop product grid
		sortOrder: integer('sort_order').default(0).notNull()
	},
	(table) => [
		// A product appears in a given drop exactly once
		uniqueIndex('drop_product_unique_idx').on(table.dropId, table.productId),
		uniqueIndex('drop_product_one_hero_per_drop')
			.on(table.dropId)
			.where(sql`${table.isHero} = 1`),
		index('drop_product_drop_idx').on(table.dropId),
		index('drop_product_product_idx').on(table.productId),
		check('drop_product_sort_nonnegative', sql`${table.sortOrder} >= 0`)
	]
);

// ---------------------------------------------------------------------------
// DROP WAITLIST  (notify-me captures before a drop goes live)
//
// Visitors and authenticated users can register interest in a teaser-status drop.
// On drop launch, the application sends SMS/email to all unnotified contacts.
//
// contact — phone number (E.164, e.g. "+94771234567") or email address.
// contactType — used to route notification via SMS (text.lk) or email (Resend).
//
// userId — null for guests; populated when an authenticated user signs up.
//   This allows deduplication on login: if a guest waitlist entry matches
//   the user's phone/email, merge and set userId.
//
// notifiedAt — null = not yet notified. Set to NOW when the launch notification
//   is dispatched. Enables idempotent "notify all unnotified" batch jobs.
//
// Uniqueness on (dropId, contact) prevents double-signup for the same drop.
// ---------------------------------------------------------------------------

export const dropWaitlist = sqliteTable(
	'drop_waitlist',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		dropId: text('drop_id')
			.notNull()
			.references(() => drop.id, { onDelete: 'cascade' }),
		// Phone in E.164 format (+94771234567) or email address
		contact: text('contact').notNull(),
		contactType: text('contact_type', { enum: ['phone', 'email'] }).notNull(),
		// null for guests; populated if/when the contact logs in
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		// Null = pending notification. Set when the launch notification is sent.
		notifiedAt: integer('notified_at', { mode: 'timestamp_ms' }),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(table) => [
		// Prevent the same contact from appearing twice on the same drop's waitlist
		uniqueIndex('drop_waitlist_drop_contact_idx').on(table.dropId, table.contact),
		index('drop_waitlist_drop_idx').on(table.dropId),
		// Merge guest entries on login: find all waitlist entries for a phone/email
		index('drop_waitlist_contact_idx').on(table.contact),
		index('drop_waitlist_user_idx').on(table.userId),
		// Batch notification job: find all unnotified contacts for a given drop
		index('drop_waitlist_notify_idx').on(table.dropId, table.notifiedAt)
	]
);

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------

export const dropRelations = relations(drop, ({ many }) => ({
	products: many(dropProduct),
	waitlist: many(dropWaitlist)
}));

export const dropProductRelations = relations(dropProduct, ({ one }) => ({
	drop: one(drop, {
		fields: [dropProduct.dropId],
		references: [drop.id]
	}),
	product: one(product, {
		fields: [dropProduct.productId],
		references: [product.id]
	})
}));

export const dropWaitlistRelations = relations(dropWaitlist, ({ one }) => ({
	drop: one(drop, {
		fields: [dropWaitlist.dropId],
		references: [drop.id]
	}),
	user: one(user, {
		fields: [dropWaitlist.userId],
		references: [user.id]
	})
}));

// ---------------------------------------------------------------------------
// ZOD SCHEMAS
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1).max(64);
const sortOrderSchema = z.number().int().min(0);
const timestampMsSchema = z.number().int().positive();

function validateDropWindow(
	data: { launchAt?: number | null; endAt?: number | null },
	ctx: z.RefinementCtx
) {
	if (data.launchAt && data.endAt && data.endAt <= data.launchAt) {
		ctx.addIssue({
			code: 'custom',
			message: 'endAt must be after launchAt',
			path: ['endAt']
		});
	}
}

export const insertDropBaseSchema = createInsertSchema(drop, {
	slug: slugSchema,
	name: z.string().min(1).max(100),
	tagline: z.string().max(300).optional().nullable(),
	description: z.string().max(5000).optional().nullable(),
	status: z.enum(DROP_STATUSES).optional(),
	launchAt: timestampMsSchema.optional().nullable(),
	endAt: timestampMsSchema.optional().nullable(),
	heroImageR2Key: r2KeySchema.optional().nullable(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const insertDropSchema = insertDropBaseSchema.superRefine(validateDropWindow);
export const selectDropSchema = createSelectSchema(drop);
export const updateDropBaseSchema = createUpdateSchema(drop, {
	slug: slugSchema.optional(),
	name: z.string().min(1).max(100).optional(),
	tagline: z.string().max(300).optional().nullable(),
	description: z.string().max(5000).optional().nullable(),
	status: z.enum(DROP_STATUSES).optional(),
	launchAt: timestampMsSchema.optional().nullable(),
	endAt: timestampMsSchema.optional().nullable(),
	heroImageR2Key: r2KeySchema.optional().nullable(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	id: true,
	createdAt: true,
	updatedAt: true
});
export const updateDropSchema = updateDropBaseSchema.superRefine(validateDropWindow);

export const insertDropProductSchema = createInsertSchema(dropProduct, {
	dropId: idSchema,
	productId: idSchema,
	sortOrder: sortOrderSchema.optional(),
	isHero: z.boolean().optional()
});
export const selectDropProductSchema = createSelectSchema(dropProduct);
export const updateDropProductSchema = createUpdateSchema(dropProduct, {
	isHero: z.boolean().optional(),
	sortOrder: sortOrderSchema.optional()
}).omit({
	dropId: true,
	productId: true
});

// Phone E.164 or email — same dual-format as used in DropTeaser.svelte
const dropPhoneSchema = z.e164({ error: 'Invalid phone number format' });
const dropEmailSchema = z.email({ error: 'Invalid email address' });
const dropContactSchema = z.union([dropPhoneSchema, dropEmailSchema]);

function validateDropContact(
	data: { contact?: string; contactType?: 'phone' | 'email' },
	ctx: z.RefinementCtx
) {
	if (!data.contact || !data.contactType) return;

	const result =
		data.contactType === 'phone'
			? dropPhoneSchema.safeParse(data.contact)
			: dropEmailSchema.safeParse(data.contact);

	if (!result.success) {
		ctx.addIssue({
			code: 'custom',
			message: `contact must match contactType ${data.contactType}`,
			path: ['contact']
		});
	}
}

export const insertDropWaitlistBaseSchema = createInsertSchema(dropWaitlist, {
	dropId: idSchema,
	contact: dropContactSchema,
	contactType: z.enum(['phone', 'email']),
	userId: idSchema.optional().nullable()
}).omit({
	id: true,
	notifiedAt: true,
	createdAt: true
});
export const insertDropWaitlistSchema =
	insertDropWaitlistBaseSchema.superRefine(validateDropContact);
export const selectDropWaitlistSchema = createSelectSchema(dropWaitlist);
export const updateDropWaitlistSchema = createUpdateSchema(dropWaitlist, {
	userId: idSchema.optional().nullable(),
	notifiedAt: timestampMsSchema.optional().nullable()
}).omit({
	id: true,
	dropId: true,
	contact: true,
	contactType: true,
	createdAt: true
});

// ---------------------------------------------------------------------------
// INFERRED TYPES
// ---------------------------------------------------------------------------

export type Drop = typeof drop.$inferSelect;
export type NewDrop = typeof drop.$inferInsert;
export type InsertDrop = z.infer<typeof insertDropSchema>;
export type SelectDrop = z.infer<typeof selectDropSchema>;
export type UpdateDrop = z.infer<typeof updateDropSchema>;
export type DropProduct = typeof dropProduct.$inferSelect;
export type NewDropProduct = typeof dropProduct.$inferInsert;
export type InsertDropProduct = z.infer<typeof insertDropProductSchema>;
export type SelectDropProduct = z.infer<typeof selectDropProductSchema>;
export type UpdateDropProduct = z.infer<typeof updateDropProductSchema>;
export type DropWaitlist = typeof dropWaitlist.$inferSelect;
export type NewDropWaitlist = typeof dropWaitlist.$inferInsert;
export type InsertDropWaitlist = z.infer<typeof insertDropWaitlistSchema>;
export type SelectDropWaitlist = z.infer<typeof selectDropWaitlistSchema>;
export type UpdateDropWaitlist = z.infer<typeof updateDropWaitlistSchema>;
