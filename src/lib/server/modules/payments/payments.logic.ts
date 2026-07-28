import crypto from 'node:crypto';
import { z } from 'zod';
import type { OrderStatus } from '../orders/orders.drizzle';
import type { PaymentStatus } from './payments.drizzle';

const TEMPORARY_EMAIL_DOMAINS = ['@phone.caroclothing.lk', '@anon.caroclothing.lk'];
const emailSchema = z.email();
const PAYHERE_AUDIT_FIELDS = [
	'merchant_id',
	'order_id',
	'payment_id',
	'payhere_amount',
	'payhere_currency',
	'status_code',
	'status_message',
	'method'
] as const;
const MAX_AUDIT_FIELD_LENGTH = 500;

export type PayPalFxQuote = {
	rate: number;
	usdAmount: string;
	quotedAt: string;
	source: string;
};

export type GatewayMetadata = {
	billingEmail?: string;
	paypalFxQuote?: PayPalFxQuote;
	paypalRequestIds?: {
		create: string;
		capture: string;
	};
	manualReview?: {
		required: true;
		reason: string;
		createdAt: string;
	};
};

export type GatewayEnvelope = {
	provider?: unknown;
	metadata?: GatewayMetadata;
};

export function resolvePublicPaymentEmail(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const email = value.trim().toLowerCase();
	if (!emailSchema.safeParse(email).success) return null;
	if (TEMPORARY_EMAIL_DOMAINS.some((domain) => email.endsWith(domain))) return null;
	return email;
}

export function sanitizePayHereWebhookPayload(
	payload: Record<string, unknown>
): Record<string, string> {
	const sanitized: Record<string, string> = {};
	for (const field of PAYHERE_AUDIT_FIELDS) {
		const value = payload[field];
		if (typeof value !== 'string') continue;
		const normalized = value.trim();
		if (!normalized) continue;
		sanitized[field] = normalized.slice(0, MAX_AUDIT_FIELD_LENGTH);
	}
	return sanitized;
}

export function getGatewayMetadata(value: unknown): GatewayMetadata {
	const envelope = toGatewayEnvelope(value);
	return envelope.metadata ?? {};
}

export function mergeGatewayEnvelope(
	current: unknown,
	patch: { provider?: unknown; metadata?: GatewayMetadata }
): GatewayEnvelope {
	const envelope = toGatewayEnvelope(current);
	return {
		provider: patch.provider === undefined ? envelope.provider : patch.provider,
		metadata: patch.metadata === undefined ? envelope.metadata : patch.metadata
	};
}

export function getManualReviewReason(value: unknown): string | null {
	const review = getGatewayMetadata(value).manualReview;
	return review?.required ? review.reason : null;
}

export function createPayPalFxQuote(
	lkrAmount: number,
	rate: number,
	quotedAt: Date,
	source: string
): PayPalFxQuote {
	if (!Number.isInteger(lkrAmount) || lkrAmount <= 0) {
		throw new Error('LKR amount must be a positive whole number.');
	}
	if (!Number.isFinite(rate) || rate <= 0) {
		throw new Error('Exchange rate must be positive.');
	}

	const usdCents = Math.round(lkrAmount * rate * 100);
	if (usdCents <= 0) {
		throw new Error('Converted PayPal amount is too small.');
	}

	return {
		rate,
		usdAmount: (usdCents / 100).toFixed(2),
		quotedAt: quotedAt.toISOString(),
		source
	};
}

export function generatePayHereCheckoutHash(
	merchantId: string,
	orderId: string,
	formattedAmount: string,
	currency: string,
	merchantSecret: string
): string {
	const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
	return crypto
		.createHash('md5')
		.update(merchantId + orderId + formattedAmount + currency + hashedSecret)
		.digest('hex')
		.toUpperCase();
}

export function verifyPayHereWebhookSignature(input: {
	merchantId: string;
	orderId: string;
	amount: string;
	currency: string;
	statusCode: string;
	merchantSecret: string;
	signature: string;
}): boolean {
	const expected = generatePayHereWebhookSignature(input);
	const actual = input.signature.trim().toUpperCase();

	if (expected.length !== actual.length) return false;
	return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function generatePayHereWebhookSignature(input: {
	merchantId: string;
	orderId: string;
	amount: string;
	currency: string;
	statusCode: string;
	merchantSecret: string;
}): string {
	const hashedSecret = crypto
		.createHash('md5')
		.update(input.merchantSecret)
		.digest('hex')
		.toUpperCase();
	return crypto
		.createHash('md5')
		.update(
			input.merchantId +
				input.orderId +
				input.amount +
				input.currency +
				input.statusCode +
				hashedSecret
		)
		.digest('hex')
		.toUpperCase();
}

export function mapPayHereStatus(statusCode: string): PaymentStatus {
	if (statusCode === '2') return 'captured';
	if (statusCode === '0') return 'pending';
	return 'failed';
}

export function decideCapturedOrderAction(
	orderStatus: OrderStatus,
	paymentExpiresAt: Date | null,
	now: Date
): 'confirm' | 'cancel_and_review' | 'review' | 'none' {
	if (orderStatus === 'pending') {
		if (paymentExpiresAt && paymentExpiresAt.getTime() <= now.getTime()) {
			return 'cancel_and_review';
		}
		return 'confirm';
	}

	if (orderStatus === 'confirmed') return 'none';
	return 'review';
}

function toGatewayEnvelope(value: unknown): GatewayEnvelope {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const candidate = value as Record<string, unknown>;
	const metadata =
		candidate.metadata &&
		typeof candidate.metadata === 'object' &&
		!Array.isArray(candidate.metadata)
			? (candidate.metadata as GatewayMetadata)
			: undefined;

	if ('provider' in candidate || metadata) {
		return { provider: candidate.provider, metadata };
	}

	return { provider: value };
}
