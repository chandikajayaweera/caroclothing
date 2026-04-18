import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timestamps } from '$lib/server/db/helpers';

// ── Table ──────────────────────────────────────────────────────────────────

export const category = sqliteTable(
	'category',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => nanoid()),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		description: text('description'),

		/** Enables tree-structured categories (e.g. Tops > T-Shirts). */
		parentId: text('parent_id').references((): any => category.id, { onDelete: 'set null' }),

		/** Display order among siblings. */
		sortOrder: integer('sort_order').default(0).notNull(),

		/** Whether this category appears in navigation/storefront. */
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),

		// ── Media ────────────────────────────────────────────────────────────
		imageR2Key: text('image_r2_key'),
		imageAlt: text('image_alt'),

		// ── SEO ──────────────────────────────────────────────────────────────
		metaTitle: text('meta_title'),
		metaDescription: text('meta_description'),
		metaKeywords: text('meta_keywords'),
		canonicalUrl: text('canonical_url'),

		...timestamps
	},
	(table) => [index('category_parent_idx').on(table.parentId)]
);

// ── Relations ──────────────────────────────────────────────────────────────

export const categoryRelations = relations(category, ({ one, many }) => ({
	parent: one(category, {
		fields: [category.parentId],
		references: [category.id],
		relationName: 'categoryParent'
	}),
	children: many(category, { relationName: 'categoryParent' })
}));

// ── Zod schemas ────────────────────────────────────────────────────────────

export const insertCategorySchema = createInsertSchema(category, {
	slug: (s) => s.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a valid slug'),
	sortOrder: (s) => s.min(0)
}).omit({ id: true });

export const selectCategorySchema = createSelectSchema(category);
export const updateCategorySchema = createUpdateSchema(category).omit({ id: true });

// ── Types ──────────────────────────────────────────────────────────────────

export type Category = z.infer<typeof selectCategorySchema>;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
