import { buildWelcomeEmail } from '../templates/welcome';
import { buildSecurityEmail } from '../templates/security';
import { buildOTPEmail } from '../templates/otp';
import { sendEmail } from '../client';
import type { EmailResult, OTPEmailInput } from '../types';

/**
 * Sent once when a new user account is created via email or Google.
 * Never called for phone-only users (they have a temp @phone.caroclothing.lk address).
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<EmailResult> {
	const { subject, html } = buildWelcomeEmail(name);
	return sendEmail({
		to: email,
		subject,
		html,
		tags: [{ name: 'category', value: 'auth' }]
	});
}

/**
 * Sent when a Google account is linked to an existing phone-registered user account.
 */
export async function sendGoogleLinkedEmail(email: string): Promise<EmailResult> {
	const { subject, html } = buildSecurityEmail({ event: 'account_linked' });
	return sendEmail({
		to: email,
		subject,
		html,
		tags: [{ name: 'category', value: 'security' }]
	});
}

export async function sendOtpEmail(input: OTPEmailInput): Promise<EmailResult> {
	const { subject, html } = buildOTPEmail(input.otp, input.type);
	return sendEmail({
		to: input.email,
		subject,
		html,
		tags: [{ name: 'category', value: 'otp' }]
	});
}
