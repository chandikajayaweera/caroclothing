import { z } from 'zod';
import { env } from '$lib/server/modules/env';
import type { SmsSendInput, SmsResult } from './types';
import { TextLkSendResponseSchema } from './types';

const BASE_URL = 'https://app.text.lk/api/v3';

/** Abort an SMS request if the API takes more than 10 seconds. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Core send primitive. All SMS senders call this — never the text.lk API directly.
 * Returns a typed result rather than throwing, so callers can decide how to handle failures.
 */
export async function sendSms(input: SmsSendInput): Promise<SmsResult> {
	const parsed = SmsSendInputSchema.safeParse(input);
	if (!parsed.success) {
		const error = parsed.error.issues.map((i) => i.message).join(', ');
		console.error('[sms] Invalid input:', { error, to: input.to });
		return { ok: false, error: `INVALID_INPUT: ${error}` };
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(`${BASE_URL}/sms/send`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.TEXT_LK_API_KEY}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				recipient: parsed.data.to,
				sender_id: env.TEXT_LK_SENDER_ID,
				type: 'plain',
				message: parsed.data.message
			}),
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!response.ok && response.status !== 422) {
			// 422 is returned by text.lk for business-logic errors (still has JSON body)
			console.error('[sms] text.lk HTTP error:', { status: response.status, to: parsed.data.to });
			return { ok: false, error: `HTTP_${response.status}` };
		}

		const rawJson: unknown = await response.json();
		const result = TextLkSendResponseSchema.safeParse(rawJson);

		if (!result.success) {
			console.error('[sms] Unexpected text.lk response shape:', { rawJson, to: parsed.data.to });
			return { ok: false, error: 'UNEXPECTED_RESPONSE' };
		}

		if (result.data.status === 'error') {
			console.error('[sms] text.lk API error:', { error: result.data.message, to: parsed.data.to });
			return { ok: false, error: result.data.message };
		}

		const messageId = result.data.data?.uid ?? 'sent';
		console.info(`[sms] Sent to ${parsed.data.to} (id: ${messageId})`);
		return { ok: true, messageId };
	} catch (err) {
		clearTimeout(timeoutId);

		if (err instanceof Error && err.name === 'AbortError') {
			console.error('[sms] Request timed out:', { to: parsed.data.to });
			return { ok: false, error: 'TIMEOUT' };
		}

		const message = err instanceof Error ? err.message : 'UNKNOWN_SEND_ERROR';
		console.error('[sms] Unexpected error:', { err, to: parsed.data.to });
		return { ok: false, error: message };
	}
}

// ── Internal schema (not exported — callers use SmsSendInput) ─────────────────
const SmsSendInputSchema = z.object({
	/** E.164-ish phone number — digits only, 7-15 chars (e.g. "94771234567") */
	to: z
		.string()
		.min(7, 'Phone number too short')
		.max(15, 'Phone number too long')
		.regex(/^\d+$/, 'Phone number must contain only digits'),
	message: z.string().min(1, 'Message cannot be empty').max(918, 'Message exceeds max SMS length')
});
