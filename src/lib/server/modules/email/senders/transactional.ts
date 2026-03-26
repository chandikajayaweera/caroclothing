import { buildOrderConfirmationEmail, buildShippingUpdateEmail } from '../templates/transactional';
import { sendEmail } from '../client';
import type { OrderConfirmationInput, ShippingUpdateInput, EmailResult } from '../types';

export async function sendOrderConfirmationEmail(input: OrderConfirmationInput): Promise<EmailResult> {
	const { subject, html } = buildOrderConfirmationEmail(input);
	return sendEmail({
		to: input.email,
		subject,
		html,
		tags: [{ name: 'category', value: 'transactional' }]
	});
}

export async function sendShippingUpdateEmail(input: ShippingUpdateInput): Promise<EmailResult> {
	const { subject, html } = buildShippingUpdateEmail(input);
	return sendEmail({
		to: input.email,
		subject,
		html,
		tags: [{ name: 'category', value: 'transactional' }]
	});
}
