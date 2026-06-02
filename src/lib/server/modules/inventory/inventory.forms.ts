import { z } from 'zod';
import { inventoryMovement } from './inventory.drizzle';

const emptyStringToUndefined = (value: unknown): unknown =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

const idSchema = z.string().min(1).max(255);
const querySchema = z.preprocess(emptyStringToUndefined, z.string().trim().max(120).optional());
const optionalIdSchema = z.preprocess(emptyStringToUndefined, idSchema.optional());
const optionalNullableIdSchema = z.preprocess(
	emptyStringToUndefined,
	idSchema.optional().nullable()
);
const limitSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(1).max(100).default(50)
);
const offsetSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(0).default(0)
);
const optionalBooleanSchema = z.preprocess((value) => {
	if (value === undefined || value === null || value === '') return undefined;
	if (value === true || value === 'true' || value === '1' || value === 'on') return true;
	if (value === false || value === 'false' || value === '0' || value === 'off') return false;
	return value;
}, z.boolean().optional());

export const inventoryStockStatusFilterSchema = z.enum([
	'missing',
	'low',
	'out',
	'available',
	'untracked'
]);

export const listInventoryFormSchema = z.object({
	query: querySchema,
	productId: optionalIdSchema,
	variantId: optionalIdSchema,
	stockStatus: z.preprocess(emptyStringToUndefined, inventoryStockStatusFilterSchema.optional()),
	trackInventory: optionalBooleanSchema,
	allowBackorder: optionalBooleanSchema,
	limit: limitSchema,
	offset: offsetSchema
});

export const listInventoryMovementsFormSchema = z.object({
	variantId: optionalIdSchema,
	type: z.preprocess(emptyStringToUndefined, z.enum(inventoryMovement.type.enumValues).optional()),
	referenceId: optionalNullableIdSchema,
	limit: limitSchema,
	offset: offsetSchema
});

export const initializeInventoryFormSchema = z.object({
	variantId: z.string().min(1).max(64),
	quantity: z.coerce.number().int().min(0).max(1_000_000),
	lowStockThreshold: z.preprocess(
		emptyStringToUndefined,
		z.coerce.number().int().min(0).max(1_000_000).optional()
	),
	trackInventory: optionalBooleanSchema,
	allowBackorder: optionalBooleanSchema,
	note: z.preprocess(emptyStringToUndefined, z.string().trim().max(500).optional().nullable())
});

export const updateInventorySettingsFormSchema = z.object({
	variantId: idSchema,
	lowStockThreshold: z.preprocess(
		emptyStringToUndefined,
		z.coerce.number().int().min(0).max(1_000_000).optional()
	),
	trackInventory: optionalBooleanSchema,
	allowBackorder: optionalBooleanSchema
});

export const restockInventoryFormSchema = z.object({
	variantId: idSchema,
	quantity: z.coerce.number().int().min(1).max(1_000_000),
	note: z.preprocess(emptyStringToUndefined, z.string().trim().max(500).optional().nullable())
});

export const adjustInventoryFormSchema = z.object({
	variantId: idSchema,
	quantityDelta: z.coerce
		.number()
		.int()
		.min(-1_000_000)
		.max(1_000_000)
		.refine((value) => value !== 0, 'Adjustment cannot be zero.'),
	note: z.preprocess(emptyStringToUndefined, z.string().trim().max(500).optional().nullable())
});
