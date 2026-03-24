import { z } from 'zod';

export const waitlistSchema = z.object({
	phone: z.string().min(1, { message: 'Number is required' })
});

export const serverWaitlistSchema = z.object({
	phone: z.string().regex(/^\+94[1-9]\d{8}$/, 'Invalid Sri Lankan phone number')
});

export type WaitlistSchema = typeof waitlistSchema;
