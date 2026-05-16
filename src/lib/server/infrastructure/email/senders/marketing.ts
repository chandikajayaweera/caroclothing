import { buildPromotionalEmail } from '../templates/marketing';
import { sendEmail } from '../client';
import type { DropLaunchEmailInput, PromotionalEmailInput, EmailResult } from '../types';

export async function sendPromotionalEmail(input: PromotionalEmailInput): Promise<EmailResult> {
	const html = buildPromotionalEmail(input);
	return sendEmail({
		to: input.to,
		subject: input.subject,
		html,
		tags: [{ name: 'category', value: 'marketing' }]
	});
}

export async function sendDropLaunchEmail(input: DropLaunchEmailInput): Promise<EmailResult> {
	return sendPromotionalEmail({
		to: input.to,
		subject: `${input.dropName} is live`,
		previewText: `${input.dropName} is live now.`,
		headline: `${input.dropName} is live`,
		body: input.tagline ?? 'The drop is live now. Get it before it moves.',
		ctaLabel: 'Shop drop',
		ctaUrl: input.dropUrl,
		heroImageUrl: input.heroImageUrl
	});
}
