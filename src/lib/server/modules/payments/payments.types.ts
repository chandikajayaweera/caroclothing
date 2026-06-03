import type { PaymentMethod, PaymentStatus } from './payments.drizzle';

export type PaymentDTO = {
	id: string;
	orderId: string;
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
	createdAt: Date;
	updatedAt: Date;
};

export type CreatePaymentSessionInput = {
	orderId: string;
	method: PaymentMethod;
	bankSlipR2Key?: string | null;
	bankReference?: string | null;
};

export type CreatePaymentSessionResult = {
	paymentId: string;
	method: PaymentMethod;
	redirectUrl?: string; // Redirect url for online gateways
	paymentData?: Record<string, string>; // Extra form parameters if needed (e.g. PayHere form parameters)
};

export type ProcessWebhookInput = {
	gateway: string;
	payload: Record<string, unknown>;
	headers: Record<string, string>;
};

export type ProcessWebhookResult = {
	success: boolean;
	paymentId?: string;
	orderId?: string;
	status: PaymentStatus;
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
