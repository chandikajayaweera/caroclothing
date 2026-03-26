import { Resend } from 'resend';
import { env } from '$lib/server/modules/env';
import type { EmailPayload, EmailResult } from './types';

export const resend = new Resend(env.RESEND_API_KEY);
export const FROM_ADDRESS = `${env.APP_NAME} <${env.EMAIL_FROM_ADDRESS}>`;

/**
 * Core send primitive. All senders call this — never Resend directly.
 * Returns a typed result rather than throwing, so callers can decide
 * how to handle failures.
 */
// client.ts — full corrected sendEmail
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
	try {
		const { data, error } = await resend.emails.send({
			from: FROM_ADDRESS,
			to: Array.isArray(payload.to) ? payload.to : [payload.to],
			subject: payload.subject,
			html: payload.html,
			...(payload.replyTo && { replyTo: payload.replyTo }),
			...(payload.tags && { tags: payload.tags })
		});

		if (error) {
			console.error('[email] Resend API error:', {
				error,
				to: payload.to,
				subject: payload.subject
			});
			return { ok: false, error: error.message };
		}

		if (!data?.id) {
			console.warn('[email] Resend returned no ID', { to: payload.to });
			return { ok: false, error: 'NO_ID_RETURNED' };
		}

		console.info(`[email] Sent "${payload.subject}" → ${payload.to} (id: ${data.id})`);
		return { ok: true, id: data.id };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'UNKNOWN_SEND_ERROR';
		console.error('[email] Unexpected error sending via Resend:', { err, to: payload.to });
		return { ok: false, error: message };
	}
}
