import { getEnv } from '$lib/server/infrastructure/env';
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
		message: compactMessage([
			`${getEnv().PUBLIC_APP_NAME}: Order ${formatOrderRef(input)} received.`,
			`Total ${input.total}.`,
			input.orderUrl ? `View: ${input.orderUrl}` : 'We will update you when it ships.'
		])
	});
}

export async function sendShippingUpdateSms(input: ShippingUpdateSmsInput): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: compactMessage([
			`${getEnv().PUBLIC_APP_NAME}: Order ${formatOrderRef(input)} shipped.`,
			input.carrier ? `${input.carrier}.` : null,
			`Tracking: ${input.trackingNumber}.`,
			input.estimatedDelivery ? `ETA: ${input.estimatedDelivery}.` : null,
			input.trackingUrl ? `Track: ${input.trackingUrl}` : null
		])
	});
}

export async function sendPaymentUpdateSms(input: PaymentUpdateSmsInput): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: compactMessage([
			`${getEnv().PUBLIC_APP_NAME}: Payment ${input.statusLabel ?? input.status} for order ${formatOrderRef(input)}.`,
			input.amount ? `Amount ${input.amount}.` : null,
			input.paymentUrl ? `View: ${input.paymentUrl}` : null
		])
	});
}

export async function sendOrderStatusUpdateSms(
	input: OrderStatusUpdateSmsInput
): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'transactional',
		message: compactMessage([
			`${getEnv().PUBLIC_APP_NAME}: Order ${formatOrderRef(input)} is ${input.statusLabel ?? input.status}.`,
			input.orderUrl ? `View: ${input.orderUrl}` : null
		])
	});
}

function formatOrderRef(input: { orderNumber?: string; orderId: string }): string {
	return input.orderNumber ?? input.orderId;
}

function compactMessage(parts: Array<string | null | undefined>): string {
	return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
