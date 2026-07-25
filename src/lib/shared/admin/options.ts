export const adminPaymentMethodOptions = [
	{ value: 'payhere', label: 'PayHere' },
	{ value: 'paypal', label: 'PayPal' },
	{ value: 'cash_on_delivery', label: 'Cash on delivery' }
] as const;

export const adminPaymentStatusOptions = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'authorized', label: 'Authorized' },
	{ value: 'captured', label: 'Captured' },
	{ value: 'failed', label: 'Failed' }
] as const;
