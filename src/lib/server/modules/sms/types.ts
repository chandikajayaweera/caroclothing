import { z } from 'zod';

// ── Core primitives ──
export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };

// ── Send SMS ──

export interface SmsSendInput {
	/** E.164 format recommended, e.g. "94771234567" */
	to: string;
	message: string;
}

export const SmsSendInputSchema = z.object({
	to: z.string().regex(/^\+?[0-9]+$/, 'Invalid phone number format'),
	message: z.string().min(1, 'Message cannot be empty')
});

// ── text.lk API shapes ──

export interface TextLkSendPayload {
	recipient: string;
	sender_id: string;
	type: 'plain';
	message: string;
}

export interface TextLkSuccessResponse {
	status: 'success';
	data: unknown;
}

export interface TextLkErrorResponse {
	status: 'error';
	message: string;
}

export type TextLkResponse = TextLkSuccessResponse | TextLkErrorResponse;
