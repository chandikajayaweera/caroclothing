// Core
export { maskEmailRecipient, sendEmail } from './client';
export type { EmailPayload, EmailResult, EmailSendOptions } from './types';
export type {
	OTPType,
	OTPEmailInput,
	WelcomeEmailInput,
	GoogleLinkedEmailInput,
	SecurityEventType,
	SecurityEmailInput,
	OrderConfirmationInput,
	ShippingUpdateInput,
	PromotionalEmailInput,
	OrderItem
} from './types';

// Auth
export { sendWelcomeEmail, sendGoogleLinkedEmail, sendOtpEmail } from './senders/auth';

// Security
export { sendSecurityNotificationEmail } from './senders/security';

// Transactional (used by orders module)
export { sendOrderConfirmationEmail, sendShippingUpdateEmail } from './senders/transactional';

// Marketing
export { sendPromotionalEmail } from './senders/marketing';
