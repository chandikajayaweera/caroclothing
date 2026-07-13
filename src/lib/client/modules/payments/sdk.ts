import type { PayHerePaymentData } from '$lib/server/modules/payments/payments.types';

const PAYHERE_SDK_URL = 'https://www.payhere.lk/lib/payhere.js';
const scriptLoads = new Map<string, Promise<void>>();

type PayHereSdk = {
	onCompleted: (orderId: string) => void;
	onDismissed: () => void;
	onError: (error: unknown) => void;
	startPayment: (payment: PayHerePaymentData) => void;
};

export type PayPalPaymentSession = {
	start: (
		options: { presentationMode: 'auto' },
		createOrder: Promise<{ orderId: string }>
	) => Promise<void>;
};

type PayPalSdkInstance = {
	createPayPalOneTimePaymentSession: (callbacks: {
		onApprove: (data: { orderId: string }) => Promise<void>;
		onCancel: (data: unknown) => void;
		onError: (error: unknown) => void;
	}) => PayPalPaymentSession;
};

type PayPalSdk = {
	createInstance: (options: {
		clientId: string;
		components: ['paypal-payments'];
		pageType: 'checkout';
	}) => Promise<PayPalSdkInstance>;
};

declare global {
	interface Window {
		payhere?: PayHereSdk;
		paypal?: PayPalSdk;
	}
}

export async function startPayHerePayment(
	paymentData: PayHerePaymentData
): Promise<'completed' | 'dismissed'> {
	await loadScript(PAYHERE_SDK_URL, () => Boolean(window.payhere));
	const payhere = window.payhere;
	if (!payhere) throw new Error('PayHere SDK did not initialize.');

	return new Promise((resolve, reject) => {
		payhere.onCompleted = () => resolve('completed');
		payhere.onDismissed = () => resolve('dismissed');
		payhere.onError = (error) => reject(toError(error, 'PayHere could not open the payment.'));
		payhere.startPayment(paymentData);
	});
}

export async function createPayPalPaymentSession(input: {
	clientId: string;
	sdkUrl: string;
	onApprove: (data: { orderId: string }) => Promise<void>;
	onCancel: () => void;
	onError: (error: unknown) => void;
}): Promise<PayPalPaymentSession> {
	await loadScript(input.sdkUrl, () => Boolean(window.paypal));
	const paypal = window.paypal;
	if (!paypal) throw new Error('PayPal SDK did not initialize.');

	const sdk = await paypal.createInstance({
		clientId: input.clientId,
		components: ['paypal-payments'],
		pageType: 'checkout'
	});
	return sdk.createPayPalOneTimePaymentSession({
		onApprove: input.onApprove,
		onCancel: () => input.onCancel(),
		onError: input.onError
	});
}

export function paymentErrorMessage(error: unknown, fallback: string): string {
	return toError(error, fallback).message;
}

function loadScript(src: string, isReady: () => boolean): Promise<void> {
	if (isReady()) return Promise.resolve();
	const cached = scriptLoads.get(src);
	if (cached) return cached;

	const load = new Promise<void>((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
		existing?.remove();
		const script = document.createElement('script');
		const onLoad = () => {
			if (isReady()) resolve();
			else reject(new Error(`Payment SDK loaded without initializing: ${src}`));
		};
		const onError = () => reject(new Error(`Payment SDK failed to load: ${src}`));

		script.addEventListener('load', onLoad, { once: true });
		script.addEventListener('error', onError, { once: true });
		script.src = src;
		script.async = true;
		document.head.appendChild(script);
	}).catch((error) => {
		scriptLoads.delete(src);
		throw error;
	});

	scriptLoads.set(src, load);
	return load;
}

function toError(value: unknown, fallback: string): Error {
	if (value instanceof Error) return value;
	if (value && typeof value === 'object' && 'message' in value) {
		const message = (value as { message?: unknown }).message;
		if (typeof message === 'string' && message.trim()) return new Error(message);
	}
	return new Error(fallback);
}
