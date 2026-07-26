// Core primitives
export type SmsResult =
	| { ok: true; messageId: string }
	| { ok: false; error: string; retryable: boolean };
export type SmsSenderPurpose = 'otp' | 'transactional' | 'promotional';

// Send SMS

export interface SmsSendInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	message: string;
	senderPurpose: SmsSenderPurpose;
}

// Transactional

export interface OrderConfirmationSmsInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	customerName: string;
	orderId: string;
	orderNumber?: string;
	total: string;
	orderUrl?: string;
}

export interface ShippingUpdateSmsInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	orderId: string;
	orderNumber?: string;
	trackingNumber: string;
	trackingUrl?: string;
	estimatedDelivery?: string;
	carrier?: string;
}

export interface PaymentUpdateSmsInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	orderId: string;
	orderNumber?: string;
	status: string;
	statusLabel?: string;
	amount?: string;
	paymentUrl?: string;
}

export interface OrderStatusUpdateSmsInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	orderId: string;
	orderNumber?: string;
	status: string;
	statusLabel?: string;
	orderUrl?: string;
}

// text.lk API shapes

export interface TextLkSendPayload {
	recipient: string;
	sender_id: string;
	type: 'plain';
	message: string;
}

export interface TextLkSuccessResponse {
	status: 'success';
	data: unknown;
}

export interface TextLkErrorResponse {
	status: 'error';
	message: string;
}

export type TextLkResponse = TextLkSuccessResponse | TextLkErrorResponse;
