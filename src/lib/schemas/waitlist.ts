import { z } from 'zod';

/**
 * Client schema — used by superforms for typing only.
 * Digit-level validation is handled locally in SubscribeForm.
 */
export const waitlistSchema = z.object({
	phone: z.string().min(1, { message: 'Number is required' })
});

/**
 * Server schema — validates the fully assembled +94XXXXXXXXX value.
 *
 * Sri Lankan numbers after +94 are exactly 9 digits.
 * First digit must be 1–9 (never 0 — that's the trunk prefix we strip).
 * Covers:
 *   Mobile  — 70–78
 *   Colombo — 11
 *   All other area codes — 21–91 range
 */
export const serverWaitlistSchema = z.object({
	phone: z.string().regex(/^\+94[1-9]\d{8}$/, 'Invalid Sri Lankan phone number')
});

export type WaitlistSchema = typeof waitlistSchema;
