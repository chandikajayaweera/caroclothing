export const adminPaymentMethodOptions = [
	{ value: 'payhere', label: 'PayHere' },
	{ value: 'paypal', label: 'PayPal' },
	{ value: 'bank_transfer', label: 'Bank transfer' },
	{ value: 'cash_on_delivery', label: 'Cash on delivery' },
	{ value: 'paykoko', label: 'PayKoko' },
	{ value: 'mintpay', label: 'Mintpay' }
] as const;

export const adminPaymentStatusOptions = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'authorized', label: 'Authorized' },
	{ value: 'captured', label: 'Captured' },
	{ value: 'failed', label: 'Failed' }
] as const;
