import type {
	AddressSnapshot,
	CheckoutAddressDTO,
	CheckoutAddressInput
} from '../addresses/addresses.types';
import type { CheckoutOrderBagDTO } from '../bag/bag.types';
import type { PromoCodeSnapshot, PromoValidationResult } from '../promotions/promotions.types';
import type { ShippingMethodSnapshot, ShippingQuoteDTO } from '../shipping/shipping.types';
import type {
	Order,
	OrderItem,
	OrderStatus,
	OrderStatusHistory,
	Payment,
	PaymentMethod,
	PaymentStatus
} from './orders.drizzle';

export type RecordablePaymentStatus = Exclude<PaymentStatus, 'refunded' | 'partially_refunded'>;

export type OrderLookup = { id: string; orderNumber?: never } | { id?: never; orderNumber: string };

export type CheckoutShippingAddressInput =
	| CheckoutAddressInput
	| {
			addressId: string;
	  };

export type OrderItemDTO = {
	id: string;
	orderId: string;
	variantId: string | null;
	productId: string | null;
	productName: string;
	variantSize: string;
	variantColor: string;
	productImageR2Key: string | null;
	imageUrl: string | null;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
};

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
	requiresManualReview: boolean;
	reviewReason: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type OrderStatusHistoryDTO = {
	id: string;
	orderId: string;
	fromStatus: OrderStatus | null;
	toStatus: OrderStatus;
	changedBy: string | null;
	note: string | null;
	createdAt: Date;
};

export type OrderDTO = {
	id: string;
	orderNumber: string;
	userId: string | null;
	status: OrderStatus;
	paymentExpiresAt: Date | null;
	subtotal: number;
	discountAmount: number;
	shippingAmount: number;
	totalAmount: number;
	promoCodeId: string | null;
	promoCodeSnapshot: PromoCodeSnapshot | null;
	shippingMethodId: string | null;
	shippingAddressId: string | null;
	shippingMethodSnapshot: ShippingMethodSnapshot | null;
	shippingAddressSnapshot: AddressSnapshot | null;
	trackingNumber: string | null;
	trackingCarrier: string | null;
	trackingUrl: string | null;
	customerNote: string | null;
	adminNote: string | null;
	confirmedAt: Date | null;
	shippedAt: Date | null;
	deliveredAt: Date | null;
	cancelledAt: Date | null;
	refundedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	itemCount: number;
	isTerminal: boolean;
	availableTransitions: OrderStatus[];
	items?: OrderItemDTO[];
	payments?: PaymentDTO[];
	statusHistory?: OrderStatusHistoryDTO[];
};

export type OrderSummaryDTO = Omit<OrderDTO, 'items' | 'payments' | 'statusHistory'> & {
	firstItemImageUrl: string | null;
};

export type OrderPreviewItemDTO = {
	bagItemId: string;
	productId: string;
	variantId: string;
	productName: string;
	variantSize: string;
	variantColor: string;
	productImageR2Key: string | null;
	imageUrl: string | null;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
	availabilityStatus: string;
	isBackorder: boolean;
};

export type OrderPreviewDTO = {
	bag: CheckoutOrderBagDTO;
	items: OrderPreviewItemDTO[];
	shippingAddressId: string | null;
	shippingAddress: CheckoutAddressDTO;
	shippingAddressSnapshot: AddressSnapshot;
	shippingQuote: ShippingQuoteDTO;
	shippingMethodSnapshot: ShippingMethodSnapshot;
	promoValidation: PromoValidationResult | null;
	subtotal: number;
	discountAmount: number;
	shippingAmount: number;
	totalAmount: number;
	canCheckout: boolean;
	blockingReasons: string[];
};

export type PreviewOrderFromBagInput = {
	sessionToken?: string | null;
	shippingAddress: CheckoutShippingAddressInput;
	shippingMethodId: string;
	promoCode?: string | null;
	now?: Date;
};

export type PlaceOrderFromBagInput = PreviewOrderFromBagInput & {
	paymentMethod: PaymentMethod;
	customerNote?: string | null;
	bankSlipR2Key?: string | null;
	bankReference?: string | null;
};

export type GetOrderInput = {
	lookup: OrderLookup;
	includeItems?: boolean;
	includePayments?: boolean;
	includeStatusHistory?: boolean;
};

export type ListMyOrdersOptions = {
	status?: OrderStatus;
	limit?: number;
	offset?: number;
};

export type ListOrdersOptions = ListMyOrdersOptions & {
	userId?: string | null;
	query?: string | null;
	createdFrom?: Date;
	createdTo?: Date;
	paymentExpiredOnly?: boolean;
	orderIds?: string[];
};

export type OrderListResult = {
	items: OrderSummaryDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type TransitionOrderStatusInput = {
	orderId: string;
	toStatus: OrderStatus;
	note?: string | null;
	now?: Date;
};

export type CancelOrderInput = {
	orderId: string;
	reason?: string | null;
	now?: Date;
};

export type UpdateOrderFulfillmentInput = {
	orderId: string;
	trackingNumber?: string | null;
	trackingCarrier?: string | null;
	trackingUrl?: string | null;
	adminNote?: string | null;
	now?: Date;
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

export type GetPaymentInput = {
	paymentId: string;
};

export type RecordPaymentInput = {
	orderId: string;
	paymentId?: string;
	method?: PaymentMethod;
	amount?: number;
	status: RecordablePaymentStatus;
	transactionId?: string | null;
	gatewayResponse?: unknown;
	paidAt?: Date | null;
	now?: Date;
};

export type RecordRefundInput = {
	paymentId: string;
	refundAmount: number;
	gatewayResponse?: unknown;
	now?: Date;
};

export type CancelExpiredPendingOrdersInput = {
	limit?: number;
	now?: Date;
};

export type CancelExpiredPendingOrdersResult = {
	cancelledCount: number;
	orderIds: string[];
	orders: OrderDTO[];
	skippedCount: number;
	failedCount: number;
	failedOrderIds: string[];
};

export type OrderPlacementRecord = {
	order: Order;
	items: OrderItem[];
	payment: Payment;
	statusHistory: OrderStatusHistory;
};
