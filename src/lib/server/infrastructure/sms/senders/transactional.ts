import { sendSms } from '../client';
import type {
	OrderConfirmationSmsInput,
	OrderStatusUpdateSmsInput,
	PaymentUpdateSmsInput,
	ShippingUpdateSmsInput,
	SmsResult
} from '../types';

export async function sendOrderConfirmationSms(
	input: OrderConfirmationSmsInput
): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: formatMessage([
			'Your order has been placed.',
			`Order ID: ${formatOrderRef(input)}`,
			`Total: ${input.total}`,
			input.orderUrl ? `View your order: ${input.orderUrl}` : null,
			'Thank you for shopping with us.'
		])
	});
}

export async function sendShippingUpdateSms(input: ShippingUpdateSmsInput): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: formatMessage([
			'Your order is on the way.',
			`Order ID: ${formatOrderRef(input)}`,
			input.carrier ? `Carrier: ${input.carrier}` : null,
			`Tracking: ${input.trackingNumber}`,
			input.estimatedDelivery ? `Estimated delivery: ${input.estimatedDelivery}` : null,
			input.trackingUrl ? `Track your order: ${input.trackingUrl}` : null
		])
	});
}

export async function sendPaymentUpdateSms(input: PaymentUpdateSmsInput): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: formatMessage([
			paymentHeadline(input.status),
			`Order ID: ${formatOrderRef(input)}`,
			input.amount ? `Amount: ${input.amount}` : null,
			input.paymentUrl ? `View your order: ${input.paymentUrl}` : null,
			input.status === 'refunded'
				? 'Your bank may take several business days to show the refund.'
				: null
		])
	});
}

export async function sendOrderStatusUpdateSms(
	input: OrderStatusUpdateSmsInput
): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: formatMessage([
			orderStatusHeadline(input.status, input.statusLabel),
			`Order ID: ${formatOrderRef(input)}`,
			input.orderUrl ? `View your order: ${input.orderUrl}` : null,
			input.status === 'delivered' ? 'Thank you for shopping with us.' : null,
			input.status === 'refunded'
				? 'Your bank may take several business days to show the refund.'
				: null,
			input.status === 'cancelled' ? 'Need help? Reply to this message.' : null
		])
	});
}

function formatOrderRef(input: { orderNumber?: string; orderId: string }): string {
	return input.orderNumber ?? input.orderId;
}

function formatMessage(parts: Array<string | null | undefined>): string {
	return parts
		.filter((part): part is string => Boolean(part))
		.map((part) => part.replace(/[ \t]+/g, ' ').trim())
		.join('\n');
}

function paymentHeadline(status: string): string {
	if (status === 'refunded') return 'Your payment has been refunded.';
	if (status === 'captured') return 'Your payment has been received.';
	if (status === 'failed') return 'Your payment was not completed.';
	return `Payment update: ${status.replaceAll('_', ' ')}.`;
}

function orderStatusHeadline(status: string, statusLabel?: string): string {
	if (status === 'delivered') return 'Your order has been delivered.';
	if (status === 'cancelled') return 'Your order has been cancelled.';
	if (status === 'refunded') return 'Your order has been refunded.';
	return `Order update: ${statusLabel ?? status}.`;
}
