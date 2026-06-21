import type { EmailResult } from '$lib/server/infrastructure/email';
import type { SmsResult } from '$lib/server/infrastructure/sms';

export type ProviderDispatchResult =
	| { ok: true; provider: string; providerMessageId: string }
	| { ok: false; error: string };

export function toEmailDispatchResult(result: EmailResult): ProviderDispatchResult {
	if (!result.ok) return result;
	return {
		ok: true,
		provider: 'resend',
		providerMessageId: result.id
	};
}

export function toSmsDispatchResult(result: SmsResult): ProviderDispatchResult {
	if (!result.ok) return result;
	return {
		ok: true,
		provider: 'text.lk',
		providerMessageId: result.messageId
	};
}

export function isRetryableSendFailure(error: string): boolean {
	return !error.startsWith('UNSUPPORTED_');
}
