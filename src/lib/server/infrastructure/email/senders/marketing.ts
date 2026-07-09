import { buildPromotionalEmail } from '../templates/marketing';
import { sendEmail } from '../client';
import type { PromotionalEmailInput, EmailResult } from '../types';

export async function sendPromotionalEmail(input: PromotionalEmailInput): Promise<EmailResult> {
	const html = buildPromotionalEmail(input);
	return sendEmail({
		to: input.to,
		subject: input.subject,
		html,
		tags: [{ name: 'category', value: 'marketing' }]
	});
}
