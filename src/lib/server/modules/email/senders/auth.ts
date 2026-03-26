import { buildWelcomeEmail } from '../templates/welcome';
import { buildSecurityEmail } from '../templates/security';
import { sendEmail } from '../client';
import type { EmailResult } from '../types';

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
