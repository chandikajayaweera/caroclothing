<<<<<<< Updated upstream
import { env } from '$lib/server/modules/env';
import type { SmsSendInput, SmsResult, TextLkResponse } from './types';
=======
import { z } from 'zod';
import { getEnv } from '$lib/server/modules/env';
import type { SmsSendInput, SmsResult } from './types';
import { TextLkSendResponseSchema } from './types';
>>>>>>> Stashed changes

const BASE_URL = 'https://app.text.lk/api/v3';

/**
 * Core send primitive. All SMS senders call this — never the text.lk API directly.
 * Returns a typed result rather than throwing, so callers can decide how to handle failures.
 */
export async function sendSms(input: SmsSendInput): Promise<SmsResult> {
<<<<<<< Updated upstream
=======
	const env = getEnv();
	const parsed = SmsSendInputSchema.safeParse(input);
	if (!parsed.success) {
		const error = parsed.error.issues.map((i) => i.message).join(', ');
		console.error('[sms] Invalid input:', { error, to: input.to });
		return { ok: false, error: `INVALID_INPUT: ${error}` };
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

>>>>>>> Stashed changes
	try {
		const response = await fetch(`${BASE_URL}/sms/send`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.TEXT_LK_API_KEY}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				recipient: input.to,
				sender_id: env.TEXT_LK_SENDER_ID,
				type: 'plain',
				message: input.message
			})
		});

		const json = (await response.json()) as TextLkResponse;

		if (json.status === 'error') {
			console.error('[sms] text.lk API error:', { error: json.message, to: input.to });
			return { ok: false, error: json.message };
		}

		// text.lk wraps the created message object in `data`; extract an ID if present
		const messageId =
			typeof json.data === 'object' && json.data !== null && 'uid' in json.data
				? String((json.data as Record<string, unknown>).uid)
				: 'sent';

		console.info(`[sms] Sent to ${input.to} (id: ${messageId})`);
		return { ok: true, messageId };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'UNKNOWN_SEND_ERROR';
		console.error('[sms] Unexpected error:', { err, to: input.to });
		return { ok: false, error: message };
	}
}
