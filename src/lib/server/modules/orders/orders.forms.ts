import { z } from 'zod';
import { SRI_LANKA_DISTRICTS } from '../addresses/addresses.drizzle';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from './orders.drizzle';

const RECORDABLE_PAYMENT_STATUSES = ['pending', 'authorized', 'captured', 'failed'] as const;

const emptyStringToUndefined = (value: unknown): unknown =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

const idSchema = z.string().min(1).max(255);
const optionalIdSchema = z.preprocess(emptyStringToUndefined, idSchema.optional());
const optionalNullableStringSchema = (maxLength: number) =>
	z.preprocess(emptyStringToUndefined, z.string().trim().max(maxLength).optional().nullable());
const optionalDateSchema = z.preprocess(emptyStringToUndefined, z.coerce.date().optional());
const optionalNullableDateSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.date().optional().nullable()
);
const optionalPositiveIntegerSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().positive().optional()
);
const limitSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(1).max(100).default(50)
);
const offsetSchema = z.preprocess(
	emptyStringToUndefined,
	z.coerce.number().int().min(0).default(0)
);
const noteSchema = optionalNullableStringSchema(500);
const adminNoteSchema = optionalNullableStringSchema(1000);
const promoCodeSchema = z.preprocess(
	emptyStringToUndefined,
	z
		.string()
		.transform((value) => value.trim().toUpperCase())
		.pipe(
			z
				.string()
				.min(3)
				.max(50)
				.regex(/^[A-Z0-9_-]+$/, 'Invalid promo code')
		)
		.optional()
		.nullable()
);
const optionalOrderStatusSchema = z.preprocess(
	emptyStringToUndefined,
	z.enum(ORDER_STATUSES).optional()
);
const optionalPaymentMethodSchema = z.preprocess(
	emptyStringToUndefined,
	z.enum(PAYMENT_METHODS).optional()
);
const optionalPaymentStatusSchema = z.preprocess(
	emptyStringToUndefined,
	z.enum(PAYMENT_STATUSES).optional()
);
const trackingUrlSchema = z.preprocess(
	emptyStringToUndefined,
	z.string().trim().url().optional().nullable()
);
const refundAmountSchema = z.preprocess(emptyStringToUndefined, z.coerce.number().int().positive());

export const checkoutAddressFormSchema = z.object({
	recipientName: z.string().min(1).max(150),
	phone: z.string().regex(/^(?:\+94|0)7[0-9]{8}$/, 'Must be a valid Sri Lankan mobile number'),
	addressLine1: z.string().min(1).max(255),
	addressLine2: optionalNullableStringSchema(255),
	city: z.string().min(1).max(100),
	district: z.enum(SRI_LANKA_DISTRICTS),
	postalCode: optionalNullableStringSchema(10)
});

export const checkoutShippingAddressFormSchema = z.union([
	z.object({ addressId: idSchema }),
	checkoutAddressFormSchema
]);

export const orderLookupFormSchema = z.union([
	z.object({ id: idSchema }),
	z.object({ orderNumber: z.string().min(1).max(50) })
]);

export const previewOrderFromCartFormSchema = z.object({
	sessionToken: z.preprocess(emptyStringToUndefined, idSchema.optional().nullable()),
	shippingAddress: checkoutShippingAddressFormSchema,
	shippingMethodId: idSchema,
	promoCode: promoCodeSchema
});

export const placeOrderFromCartFormSchema = previewOrderFromCartFormSchema.safeExtend({
	paymentMethod: z.enum(PAYMENT_METHODS),
	customerNote: optionalNullableStringSchema(1000)
});

export const getOrderFormSchema = z.object({
	lookup: orderLookupFormSchema,
	includeItems: z.boolean().optional(),
	includePayments: z.boolean().optional(),
	includeStatusHistory: z.boolean().optional()
});

export const listMyOrdersFormSchema = z.object({
	status: optionalOrderStatusSchema,
	limit: limitSchema,
	offset: offsetSchema
});

export const listOrdersFormSchema = listMyOrdersFormSchema.safeExtend({
	userId: z.preprocess(emptyStringToUndefined, idSchema.optional().nullable()),
	query: optionalNullableStringSchema(120),
	createdFrom: optionalDateSchema,
	createdTo: optionalDateSchema,
	paymentExpiredOnly: z.boolean().optional()
});

export const transitionOrderStatusFormSchema = z.object({
	orderId: idSchema,
	toStatus: z.enum(ORDER_STATUSES),
	note: noteSchema
});

export const cancelOrderFormSchema = z.object({
	orderId: idSchema,
	reason: noteSchema
});

export const updateOrderFulfillmentFormSchema = z.object({
	orderId: idSchema,
	trackingNumber: optionalNullableStringSchema(100),
	trackingCarrier: optionalNullableStringSchema(100),
	trackingUrl: trackingUrlSchema,
	adminNote: adminNoteSchema
});

export const listPaymentsFormSchema = z.object({
	orderId: optionalIdSchema,
	status: optionalPaymentStatusSchema,
	method: optionalPaymentMethodSchema,
	limit: limitSchema,
	offset: offsetSchema
});

export const getPaymentFormSchema = z.object({
	paymentId: idSchema
});

export const recordPaymentFormSchema = z.object({
	orderId: idSchema,
	paymentId: optionalIdSchema,
	method: optionalPaymentMethodSchema,
	amount: optionalPositiveIntegerSchema,
	status: z.enum(RECORDABLE_PAYMENT_STATUSES),
	transactionId: optionalNullableStringSchema(255),
	gatewayResponse: z.unknown().optional(),
	paidAt: optionalNullableDateSchema
});

export const recordRefundFormSchema = z.object({
	paymentId: idSchema,
	refundAmount: refundAmountSchema,
	gatewayResponse: z.unknown().optional()
});

export const cancelExpiredPendingOrdersFormSchema = z.object({
	limit: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(200).default(50))
});
