import type { OrderStatus } from '../orders/orders.drizzle';
import type { PaymentMethod, PaymentStatus } from './payments.drizzle';

export type PaymentDTO = {
	id: string;
	orderId: string;
	orderStatus: OrderStatus | null;
	amount: number;
	currency: string;
	method: PaymentMethod;
	status: PaymentStatus;
	transactionId: string | null;
	gatewayResponse: unknown | null;
	refundAmount: number | null;
	refundedAt: Date | null;
	paidAt: Date | null;
	bankSlipR2Key: string | null;
	bankReference: string | null;
	requiresManualReview: boolean;
	reviewReason: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type CheckoutPaymentMethodDTO = {
	id: Extract<PaymentMethod, 'payhere' | 'paypal' | 'cash_on_delivery'>;
	title: string;
	description: string;
	kind: 'online' | 'offline';
	badge?: string;
	requiresBillingEmail: boolean;
};

export type ValidateCheckoutPaymentSelectionInput = {
	method: PaymentMethod;
	billingEmail?: string | null;
};

export type ValidatedCheckoutPaymentSelection = {
	method: CheckoutPaymentMethodDTO['id'];
	billingEmail: string | null;
};

export type CreatePaymentSessionInput = {
	orderId: string;
	method: PaymentMethod;
	billingEmail?: string | null;
	bankSlipR2Key?: string | null;
	bankReference?: string | null;
};

export type CreatePaymentSessionResult = {
	paymentId: string;
	method: PaymentMethod;
	redirectUrl?: string; // Redirect url for online gateways
	paymentData?: Record<string, string>; // Extra form parameters if needed (e.g. PayHere form parameters)
};

export type ProcessPayHereWebhookInput = {
	payload: Record<string, unknown>;
	headers: Record<string, string>;
};

export type CapturePayPalReturnInput = {
	paypalOrderId: string;
	payerId?: string | null;
};

export type PaymentGatewayResult = {
	success: boolean;
	paymentId?: string;
	orderId?: string;
	status: PaymentStatus;
	requiresManualReview?: boolean;
	errorMessage?: string;
};

export type ListPaymentsOptions = {
	orderId?: string;
	status?: PaymentStatus;
	method?: PaymentMethod;
	limit?: number;
	offset?: number;
};

export type PaymentListResult = {
	items: PaymentDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type PaymentDashboardSummaryDTO = {
	totalVolume: number;
	totalCaptured: number;
	totalPending: number;
	totalRefunded: number;
	manualReviewCount: number;
};

export type RecordPaymentInput = {
	orderId: string;
	paymentId?: string | null;
	method?: PaymentMethod | null;
	amount?: number | null;
	status: Exclude<PaymentStatus, 'refunded' | 'partially_refunded'>;
	transactionId?: string | null;
	gatewayResponse?: unknown | null;
	paidAt?: Date | null;
	bankSlipR2Key?: string | null;
	bankReference?: string | null;
};

export type RecordRefundInput = {
	paymentId: string;
	refundAmount: number;
	gatewayResponse?: unknown | null;
};
