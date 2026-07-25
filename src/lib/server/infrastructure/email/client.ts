import { Resend } from 'resend';
import { getEnv } from '$lib/server/infrastructure/env';
import type { EmailPayload, EmailResult } from './types';

let _resend: Resend | undefined;
let _fromAddress: string | undefined;

function getResend(): Resend {
	_resend ??= new Resend(getEnv().RESEND_API_KEY);
	return _resend;
}

function getFromAddress(): string {
	_fromAddress ??= `${getEnv().PUBLIC_APP_NAME} <${getEnv().EMAIL_FROM_ADDRESS}>`;
	return _fromAddress;
}

/**
 * Core send primitive. All senders call this; never Resend directly.
 * Returns a typed result rather than throwing, so callers can decide
 * how to handle failures.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
	try {
		const { data, error } = await getResend().emails.send({
			from: getFromAddress(),
			to: Array.isArray(payload.to) ? payload.to : [payload.to],
			subject: payload.subject,
			html: payload.html,
			...(payload.replyTo && { replyTo: payload.replyTo }),
			...(payload.tags && { tags: payload.tags })
		});

		if (error) {
			console.error('[email] Resend API error:', {
				error,
				to: maskEmailRecipients(payload.to),
				subject: payload.subject
			});
			return { ok: false, error: error.message };
		}

		if (!data?.id) {
			console.warn('[email] Resend returned no ID', { to: maskEmailRecipients(payload.to) });
			return { ok: false, error: 'NO_ID_RETURNED' };
		}

		console.info(
			`[email] Sent "${payload.subject}" to ${maskEmailRecipients(payload.to)} (id: ${data.id})`
		);
		return { ok: true, id: data.id };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'UNKNOWN_SEND_ERROR';
		console.error('[email] Unexpected error sending via Resend:', {
			err,
			to: maskEmailRecipients(payload.to)
		});
		return { ok: false, error: message };
	}
}

function maskEmailRecipients(value: string | string[]): string | string[] {
	return Array.isArray(value) ? value.map(maskEmailRecipient) : maskEmailRecipient(value);
}

function maskEmailRecipient(value: string): string {
	const [localPart, domain] = value.split('@');
	if (!localPart || !domain) return '***';
	return `${localPart.slice(0, 2)}***@${domain}`;
}
