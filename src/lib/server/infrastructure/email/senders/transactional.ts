import { buildOrderConfirmationEmail, buildShippingUpdateEmail } from '../templates/transactional';
import { sendEmail } from '../client';
import type {
	OrderConfirmationInput,
	ShippingUpdateInput,
	EmailResult,
	EmailSendOptions
} from '../types';

export async function sendOrderConfirmationEmail(
	input: OrderConfirmationInput,
	options?: EmailSendOptions
): Promise<EmailResult> {
	const { subject, html } = buildOrderConfirmationEmail(input);
	return sendEmail(
		{
			to: input.email,
			subject,
			html,
			tags: [{ name: 'category', value: 'transactional' }]
		},
		options
	);
}

export async function sendShippingUpdateEmail(
	input: ShippingUpdateInput,
	options?: EmailSendOptions
): Promise<EmailResult> {
	const { subject, html } = buildShippingUpdateEmail(input);
	return sendEmail(
		{
			to: input.email,
			subject,
			html,
			tags: [{ name: 'category', value: 'transactional' }]
		},
		options
	);
}
