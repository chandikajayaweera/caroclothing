import { sendPromotionalEmail } from './marketing';
import type { DropLaunchEmailInput, EmailResult } from '../types';

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
