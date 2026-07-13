export function buildOrderNumber(now: Date, suffix: string): string {
	const compactDate = now.toISOString().slice(2, 10).replace(/-/g, '');
	return `${compactDate}-${suffix}`;
}

export function shouldSendOrderStatusSms(status: string): boolean {
	return status === 'delivered' || status === 'cancelled' || status === 'refunded';
}

export function shouldSendPaymentStatusSms(status: string): boolean {
	return status === 'refunded';
}
