import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '$lib/server/infrastructure/media/r2';
import { DROP_STATUSES, insertDropBaseSchema, updateDropBaseSchema } from './drops.drizzle';

const idSchema = z.string().min(1).max(64);
const dropWaitlistContactTypeSchema = z.enum(['phone', 'email']);
const dropPhoneSchema = z.e164({ error: 'Invalid phone number format' });
const dropEmailSchema = z.email({ error: 'Invalid email address' });
const dropContactSchema = z.union([dropPhoneSchema, dropEmailSchema]);

function emptyFileToUndefined(value: unknown): unknown {
	if (value instanceof File && value.size === 0) return undefined;
	return value;
}

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

function validateDropWaitlistContact(
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

export const dropHeroImageFileSchema = z
	.instanceof(File)
	.refine((file) => file.size > 0, 'Image is empty.')
	.refine((file) => file.size <= MAX_IMAGE_BYTES, 'Image must be 5MB or less.')
	.refine((file) => ALLOWED_IMAGE_TYPES.has(file.type), 'Unsupported image type.');

export const optionalDropHeroImageFileSchema = z.preprocess(
	emptyFileToUndefined,
	dropHeroImageFileSchema.optional()
);

export const createDropFormSchema = insertDropBaseSchema
	.omit({ heroImageR2Key: true, status: true })
	.extend({
		heroImage: optionalDropHeroImageFileSchema
	})
	.superRefine(validateDropWindow);

export const updateDropFormSchema = updateDropBaseSchema
	.omit({ heroImageR2Key: true, status: true })
	.extend({
		heroImage: optionalDropHeroImageFileSchema,
		removeHeroImage: z.boolean().optional()
	})
	.superRefine(validateDropWindow);

export const setDropProductsFormSchema = z.object({
	dropId: idSchema,
	productIds: z.array(idSchema).min(1)
});

export const setDropHeroProductFormSchema = z.object({
	dropId: idSchema,
	productId: idSchema
});

export const transitionDropStatusFormSchema = z.object({
	dropId: idSchema,
	toStatus: z.enum(DROP_STATUSES)
});

export const joinDropWaitlistFormSchema = z
	.object({
		dropId: idSchema,
		contact: dropContactSchema,
		contactType: dropWaitlistContactTypeSchema
	})
	.superRefine(validateDropWaitlistContact);
