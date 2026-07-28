import type { OrderStatus } from '../orders/orders.drizzle';
import type { PaymentAttemptStatus, PaymentMethod, PaymentStatus } from './payments.drizzle';
import type { CheckoutShippingAddressInput } from '../orders/orders.types';

export type PaymentDTO = {
	id: string;
	orderId: string;
	orderStatus: OrderStatus | null;
	amount: number;
	currency: string;
	method: PaymentMethod;
	status: PaymentStatus;
	transactionId: string | null;
	refundAmount: number | null;
	refundedAt: Date | null;
	paidAt: Date | null;
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
	clientConfig?: {
		clientId: string;
		sdkUrl: string;
	};
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
};

export type CreateCheckoutPaymentSessionInput = {
	sessionToken?: string | null;
	shippingAddress: CheckoutShippingAddressInput;
	shippingMethodId: string;
	paymentMethod: Extract<PaymentMethod, 'payhere' | 'paypal'>;
	billingEmail?: string | null;
	customerNote?: string | null;
};

export type PaymentAttemptCheckoutInput = Omit<CreateCheckoutPaymentSessionInput, 'billingEmail'>;

export type PayHerePaymentData = Record<string, string | boolean> & {
	sandbox: boolean;
};

export type CreatePaymentSessionResult = {
	paymentId: string;
	orderId: string;
} & (
	| { method: 'payhere'; paymentData: PayHerePaymentData }
	| { method: 'paypal'; paypalOrderId: string }
);

export type CreateCheckoutPaymentSessionResult = {
	attemptId: string;
} & (
	| { method: 'payhere'; paymentData: PayHerePaymentData }
	| { method: 'paypal'; paypalOrderId: string }
);

export type CheckoutPaymentAttemptDTO = {
	id: string;
	method: Extract<PaymentMethod, 'payhere' | 'paypal'>;
	status: PaymentAttemptStatus;
	amount: number;
	currency: string;
	orderId: string | null;
	failureReason: string | null;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
};

export type ProcessPayHereWebhookInput = {
	payload: Record<string, unknown>;
	headers: Record<string, string>;
};

export type CapturePayPalPaymentInput = {
	paypalOrderId: string;
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

export type PaymentDashboardDTO = {
	payments: PaymentListResult;
	stats: PaymentDashboardSummaryDTO;
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
};

export type RecordRefundInput = {
	paymentId: string;
	refundAmount: number;
	gatewayResponse?: unknown | null;
};
