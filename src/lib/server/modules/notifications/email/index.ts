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

// Auth
export { sendWelcomeEmail, sendGoogleLinkedEmail } from './senders/auth';

// Security
export { sendSecurityNotificationEmail } from './senders/security';

// Transactional (used by orders module)
export { sendOrderConfirmationEmail, sendShippingUpdateEmail } from './senders/transactional';

// Marketing
export { sendPromotionalEmail } from './senders/marketing';
