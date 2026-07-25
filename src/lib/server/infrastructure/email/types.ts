export type OTPType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

export type SecurityEventType =
	| 'new_login'
	| 'password_changed'
	| 'email_changed'
	| 'account_linked';

export interface EmailPayload {
	to: string | string[];
	subject: string;
	html: string;
	replyTo?: string | string[];
	tags?: Array<{ name: string; value: string }>;
}

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

// OTP

export interface WelcomeEmailInput {
	email: string;
	name: string;
}

export interface GoogleLinkedEmailInput {
	email: string;
}

export interface OTPEmailInput {
	email: string;
	otp: string;
	type: OTPType;
}

// Security

export interface SecurityEmailInput {
	email: string;
	event: SecurityEventType;
	/** e.g. "Chrome on Windows, Colombo, LK" */
	deviceInfo?: string;
	ipAddress?: string;
}

// Transactional

export interface OrderItem {
	name: string;
	quantity: number;
	/** Formatted price string e.g. "LKR 2,500" */
	price: string;
	imageUrl?: string;
}

export interface OrderConfirmationInput {
	email: string;
	customerName: string;
	orderId: string;
	orderNumber?: string;
	orderDate: string;
	items: OrderItem[];
	subtotal: string;
	shipping: string;
	total: string;
	shippingAddress: string;
	estimatedDelivery?: string;
	orderUrl?: string;
}

export interface ShippingUpdateInput {
	email: string;
	customerName: string;
	orderId: string;
	orderNumber?: string;
	trackingNumber: string;
	trackingUrl?: string;
	estimatedDelivery?: string;
	carrier?: string;
	orderUrl?: string;
}

// Marketing

export interface PromotionalEmailInput {
	to: string | string[];
	subject: string;
	previewText?: string;
	headline: string;
	/** Plain text. Paragraphs can be separated with a blank line. */
	body: string;
	ctaLabel: string;
	ctaUrl: string;
	/** Optional hero image URL */
	heroImageUrl?: string;
}
