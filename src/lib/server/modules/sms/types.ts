import { z } from 'zod';

// ── Core primitives ──────────────────────────────────────────────────────────

export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface SmsSendInput {
	/** Digits only, E.164-style (e.g. "94771234567"). No leading +. */
	to: string;
	message: string;
}

// ── text.lk API response shapes (validated with Zod) ─────────────────────────

const TextLkSuccessDataSchema = z
	.object({
		uid: z.string().optional()
	})
	.passthrough(); // text.lk may add more fields in future

const TextLkSuccessResponseSchema = z.object({
	status: z.literal('success'),
	data: TextLkSuccessDataSchema.optional()
});

const TextLkErrorResponseSchema = z.object({
	status: z.literal('error'),
	message: z.string()
});

export const TextLkSendResponseSchema = z.discriminatedUnion('status', [
	TextLkSuccessResponseSchema,
	TextLkErrorResponseSchema
]);

export type TextLkSendResponse = z.infer<typeof TextLkSendResponseSchema>;
