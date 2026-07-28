import { Resend } from 'resend';
import { getEnv } from '$lib/server/infrastructure/env';
import type { EmailPayload, EmailResult, EmailSendOptions } from './types';

let _resend: Resend | undefined;
let _fromAddress: string | undefined;
const RETRYABLE_RESEND_ERROR_NAMES = new Set([
	'rate_limit_exceeded',
	'internal_server_error',
	'application_error',
	'concurrent_idempotent_requests'
]);
const NON_RETRYABLE_RESEND_ERROR_NAMES = new Set([
	'monthly_quota_exceeded',
	'daily_quota_exceeded'
]);

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
export async function sendEmail(
	payload: EmailPayload,
	options: EmailSendOptions = {}
): Promise<EmailResult> {
	try {
		const { data, error } = await getResend().emails.send(
			{
				from: getFromAddress(),
				to: Array.isArray(payload.to) ? payload.to : [payload.to],
				subject: payload.subject,
				html: payload.html,
				...(payload.replyTo && { replyTo: payload.replyTo }),
				...(payload.tags && { tags: payload.tags })
			},
			options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
		);

		if (error) {
			console.error('[email] Resend API error:', {
				error: {
					name: error.name,
					message: error.message,
					statusCode: error.statusCode
				},
				to: maskEmailRecipients(payload.to),
				subject: payload.subject
			});
			return {
				ok: false,
				error: error.message,
				retryable: isRetryableResendError(error)
			};
		}

		if (!data?.id) {
			console.warn('[email] Resend returned no ID', { to: maskEmailRecipients(payload.to) });
			return {
				ok: false,
				error: 'NO_ID_RETURNED',
				retryable: Boolean(options.idempotencyKey)
			};
		}

		console.info(
			`[email] Sent "${payload.subject}" to ${maskEmailRecipients(payload.to)} (id: ${data.id})`
		);
		return { ok: true, id: data.id };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'UNKNOWN_SEND_ERROR';
		console.error('[email] Unexpected error sending via Resend:', {
			error: message,
			to: maskEmailRecipients(payload.to)
		});
		return {
			ok: false,
			error: message,
			// A thrown network failure has an ambiguous delivery result. Retrying
			// is safe only when the caller supplied Resend's durable dedupe key.
			retryable: Boolean(options.idempotencyKey)
		};
	}
}

export function isRetryableResendError(error: { name?: unknown; statusCode?: unknown }): boolean {
	if (typeof error.name === 'string' && NON_RETRYABLE_RESEND_ERROR_NAMES.has(error.name)) {
		return false;
	}
	if (typeof error.name === 'string' && RETRYABLE_RESEND_ERROR_NAMES.has(error.name)) {
		return true;
	}
	if (typeof error.statusCode === 'number') {
		if (error.statusCode === 429 || error.statusCode >= 500) return true;
		if (error.statusCode >= 400) return false;
	}
	if (error.statusCode === null) return true;
	return false;
}

function maskEmailRecipients(value: string | string[]): string | string[] {
	return Array.isArray(value) ? value.map(maskEmailRecipient) : maskEmailRecipient(value);
}

export function maskEmailRecipient(value: string): string {
	const [localPart, domain] = value.split('@');
	if (!localPart || !domain) return '***';
	return `${localPart.slice(0, 2)}***@${domain}`;
}
