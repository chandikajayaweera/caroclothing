import { z } from 'zod';
import { getEnv } from '$lib/server/infrastructure/env';
import type { SmsSendInput, SmsResult, SmsSenderPurpose, TextLkResponse } from './types';
import { maskSmsRecipient, normalizeSmsRecipient } from './utils';

const BASE_URL = 'https://app.text.lk/api/v3';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Core send primitive. All SMS senders call this; never the text.lk API directly.
 * Returns a typed result rather than throwing, so callers can decide how to handle failures.
 */
export async function sendSms(input: SmsSendInput): Promise<SmsResult> {
	const normalizedInput = {
		...input,
		to: normalizeSmsRecipient(input.to)
	};
	const parsed = SmsSendInputSchema.safeParse(normalizedInput);
	if (!parsed.success) {
		const error = parsed.error.issues.map((i) => i.message).join(', ');
		console.error('[sms] Invalid input:', { error, to: maskSmsRecipient(input.to) });
		return { ok: false, error: `INVALID_INPUT: ${error}` };
	}

	try {
		const env = getEnv();
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		let json: TextLkResponse;

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
					sender_id: resolveSenderId(parsed.data.senderPurpose, env),
					type: 'plain',
					message: parsed.data.message
				}),
				signal: controller.signal
			});

			json = await parseTextLkResponse(response);

			if (!response.ok) {
				const error = json.status === 'error' ? json.message : `HTTP_${response.status}`;
				console.error('[sms] text.lk HTTP error:', {
					error,
					status: response.status,
					to: maskSmsRecipient(parsed.data.to)
				});
				return { ok: false, error };
			}
		} finally {
			clearTimeout(timeoutId);
		}

		if (json.status === 'error') {
			console.error('[sms] text.lk API error:', {
				error: json.message,
				to: maskSmsRecipient(parsed.data.to)
			});
			return { ok: false, error: json.message };
		}

		// text.lk wraps the created message object in `data`; extract an ID if present
		const messageId =
			typeof json.data === 'object' && json.data !== null && 'uid' in json.data
				? String((json.data as Record<string, unknown>).uid)
				: 'sent';

		console.info(`[sms] Sent to ${maskSmsRecipient(parsed.data.to)} (id: ${messageId})`);
		return { ok: true, messageId };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'UNKNOWN_SEND_ERROR';
		console.error('[sms] Unexpected error:', { err, to: maskSmsRecipient(input.to) });
		return { ok: false, error: message };
	}
}

// Internal schema. Callers use SmsSendInput.
const SmsSendInputSchema = z.object({
	/** E.164 phone number, e.g. "+94771234567" */
	to: z.e164({ error: 'Invalid phone number format' }),
	message: z.string().min(1, 'Message cannot be empty').max(918, 'Message exceeds max SMS length'),
	senderPurpose: z.enum(['otp', 'transactional', 'promotional'])
});

function resolveSenderId(senderPurpose: SmsSenderPurpose, env: ReturnType<typeof getEnv>): string {
	switch (senderPurpose) {
		case 'otp':
			return env.TEXT_LK_OTP_SENDER_ID;
		case 'transactional':
			return env.TEXT_LK_TRANSACTIONAL_SENDER_ID;
		case 'promotional':
			return env.TEXT_LK_PROMOTIONAL_SENDER_ID;
	}
}

async function parseTextLkResponse(response: Response): Promise<TextLkResponse> {
	try {
		return (await response.json()) as TextLkResponse;
	} catch {
		return {
			status: 'error',
			message: `INVALID_JSON_RESPONSE:${response.status}`
		};
	}
}
