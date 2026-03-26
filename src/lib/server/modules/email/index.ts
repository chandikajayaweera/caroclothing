// src/lib/server/modules/email/index.ts

// Core
export { sendEmail } from './client';
export type { EmailPayload, EmailResult } from './types';
export type {
	OTPType,
	OTPEmailInput,
	SecurityEventType,
	SecurityEmailInput,
	OrderConfirmationInput,
	ShippingUpdateInput,
	PromotionalEmailInput,
	OrderItem
} from './types';

// Senders — import these directly where needed
export { sendEmailVerificationOTP } from './senders/otp';
export { sendSecurityNotificationEmail } from './senders/security';
export { sendOrderConfirmationEmail, sendShippingUpdateEmail } from './senders/transactional';
export { sendPromotionalEmail } from './senders/marketing';
