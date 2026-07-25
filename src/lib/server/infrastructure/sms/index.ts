// Core
export { sendSms } from './client';
export { normalizeSmsRecipient, maskSmsRecipient } from './utils';
export type {
	OrderConfirmationSmsInput,
	OrderStatusUpdateSmsInput,
	PaymentUpdateSmsInput,
	ShippingUpdateSmsInput,
	SmsResult,
	SmsSenderPurpose,
	SmsSendInput
} from './types';

// Auth
export { sendOtpSms } from './senders/auth';

// Transactional
export {
	sendOrderConfirmationSms,
	sendOrderStatusUpdateSms,
	sendPaymentUpdateSms,
	sendShippingUpdateSms
} from './senders/transactional';
