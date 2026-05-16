import { buildSecurityEmail } from '../templates/security';
import { sendEmail } from '../client';
import type { SecurityEmailInput, EmailResult } from '../types';

export async function sendSecurityNotificationEmail(
	input: SecurityEmailInput
): Promise<EmailResult> {
	const { subject, html } = buildSecurityEmail({
		event: input.event,
		deviceInfo: input.deviceInfo,
		ipAddress: input.ipAddress
	});

	return sendEmail({
		to: input.email,
		subject,
		html,
		tags: [{ name: 'category', value: 'security' }]
	});
}
