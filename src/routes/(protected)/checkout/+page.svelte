<script lang="ts">
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { beforeNavigate, goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ActionResult } from '@sveltejs/kit';
	import {
		AlertTriangle,
		ArrowLeft,
		BookmarkPlus,
		Check,
		Clock,
		CreditCard,
		Loader2,
		Truck
	} from 'lucide-svelte';
	import { Dialog } from 'bits-ui';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { closeBagDrawer } from '$lib/client/modules/stores/ui';
	import {
		createPayPalPaymentSession,
		paymentErrorMessage,
		startPayHerePayment,
		type PayPalPaymentSession
	} from '$lib/client/modules/payments/sdk';
	import CheckoutProgress from '$lib/components/checkout/CheckoutProgress.svelte';
	import CheckoutOrderSummary from '$lib/components/checkout/CheckoutOrderSummary.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { AddressDTO } from '$lib/server/modules/addresses/addresses.types';
	import type { ShippingQuoteDTO } from '$lib/server/modules/shipping/shipping.types';
	import type {
		CheckoutPaymentMethodDTO,
		CreateCheckoutPaymentSessionResult
	} from '$lib/server/modules/payments/payments.types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type FieldErrors = Record<string, string>;

	function initialPaymentOptions() {
		return data.paymentMethods as CheckoutPaymentMethodDTO[];
	}

	const paymentOptions = initialPaymentOptions();

	function initialCheckoutState() {
		const useSavedAddress = data.addresses.length > 0;
		const selectedAddressId = data.defaultAddress?.id ?? data.addresses[0]?.id ?? '';

		return {
			addresses: data.addresses as AddressDTO[],
			useSavedAddress,
			selectedAddressId,
			recipientName: data.user?.isAnonymous ? '' : (data.user?.name ?? ''),
			phone: data.user?.isAnonymous ? '' : (data.user?.phoneNumber ?? ''),
			shippingQuotes: data.shippingQuotes as ShippingQuoteDTO[],
			selectedShippingMethodId:
				(data.shippingQuotes as ShippingQuoteDTO[])[0]?.shippingMethodId ?? ''
		};
	}

	function initialCheckoutClock() {
		const deadline = data.bag.checkoutExpiresAt
			? new Date(data.bag.checkoutExpiresAt).getTime()
			: new Date(data.serverNow).getTime();

		return {
			deadline,
			clientServerOffset: Date.now() - new Date(data.serverNow).getTime()
		};
	}

	const initial = initialCheckoutState();
	const checkoutClock = initialCheckoutClock();

	let currentStep = $state(1);
	let savedAddresses = $state<AddressDTO[]>([...initial.addresses]);
	let useSavedAddress = $state(initial.useSavedAddress);
	let selectedAddressId = $state(initial.selectedAddressId);
	let recipientName = $state(initial.recipientName);
	let phone = $state(initial.phone);
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let selectedDistrict = $state('');
	let postalCode = $state('');
	let shippingQuotes = $state<ShippingQuoteDTO[]>(initial.shippingQuotes);
	let selectedShippingMethodId = $state(initial.selectedShippingMethodId);
	let isLoadingShipping = $state(false);
	let shippingError = $state('');
	let selectedPaymentMethod = $state<CheckoutPaymentMethodDTO['id']>(
		paymentOptions[0]?.id ?? 'cash_on_delivery'
	);
	let billingEmail = $state(initialBillingEmail());
	let customerNote = $state('');
	let localErrors = $state<FieldErrors>({});
	let isSubmitting = $state(false);
	let paymentProviderError = $state('');
	let paypalReady = $state(false);
	let paymentAttemptId = $state<string | null>(null);
	let saveAddressOpen = $state(false);
	let saveAddressStage = $state<'decision' | 'label'>('decision');
	let saveAddressLabel = $state('');
	let saveAddressError = $state('');
	let addressSaveMessage = $state('');
	let isSavingAddress = $state(false);
	let handledAddressFingerprint = $state('');
	let leavingCheckout = $state(false);
	let remainingSeconds = $state(remainingCheckoutSeconds());
	let expiryRedirectStarted = false;
	let checkoutCancelRequest: Promise<void> | null = null;
	let paypalSession: PayPalPaymentSession | null = null;
	let paypalSessionLoad: Promise<PayPalPaymentSession> | null = null;
	let paymentNavigationStarted = false;

	function initialBillingEmail() {
		return data.user?.email ?? '';
	}

	let selectedAddress = $derived(
		savedAddresses.find((address) => address.id === selectedAddressId) ?? null
	);
	let deliveryDistrict = $derived(
		useSavedAddress ? (selectedAddress?.district ?? '') : selectedDistrict
	);
	let selectedQuote = $derived(
		shippingQuotes.find((quote) => quote.shippingMethodId === selectedShippingMethodId) ?? null
	);
	let shippingCost = $derived(selectedQuote?.price ?? 0);
	let selectedPayment = $derived(
		paymentOptions.find((option) => option.id === selectedPaymentMethod) ?? paymentOptions[0]
	);
	let checkoutExpired = $derived(remainingSeconds <= 0);
	let checkoutUrgent = $derived(remainingSeconds > 0 && remainingSeconds <= 120);
	let checkoutTime = $derived(
		`${Math.floor(remainingSeconds / 60)
			.toString()
			.padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
	);
	let actionMessage = $derived(paymentProviderError || readActionMessage(form));
	let actionErrors = $derived(readActionErrors(form));
	let primaryActionLabel = $derived(
		currentStep === 1
			? 'Continue to shipping'
			: currentStep === 2
				? 'Continue to payment'
				: selectedPaymentMethod === 'cash_on_delivery'
					? 'Place order'
					: `Continue to ${selectedPayment.title}`
	);

	function remainingCheckoutSeconds() {
		const estimatedServerNow = Date.now() - checkoutClock.clientServerOffset;
		return Math.max(0, Math.ceil((checkoutClock.deadline - estimatedServerNow) / 1000));
	}

	function readActionMessage(value: unknown): string {
		if (!value || typeof value !== 'object') return '';
		const result = value as { message?: unknown; error?: unknown };
		if (typeof result.message === 'string') return result.message;
		if (typeof result.error === 'string') return result.error;
		if (result.error && typeof result.error === 'object') {
			const actionError = result.error as { code?: unknown; message?: unknown };
			if (actionError.code === 'CHECKOUT_SESSION_EXPIRED') return '';
			const message = actionError.message;
			if (typeof message === 'string') return message;
		}
		return '';
	}

	function readActionErrors(value: unknown): FieldErrors {
		if (!value || typeof value !== 'object') return {};
		const errors = (value as { fieldErrors?: unknown }).fieldErrors;
		if (!errors || typeof errors !== 'object') return {};
		return errors as FieldErrors;
	}

	function errorFor(field: string) {
		return localErrors[field] ?? actionErrors[field] ?? '';
	}

	function normalizePhone(value: string) {
		const normalized = value.trim().replace(/[\s-]+/g, '');
		if (normalized.startsWith('0')) return `+94${normalized.slice(1)}`;
		if (normalized.startsWith('7') && normalized.length === 9) return `+94${normalized}`;
		return normalized;
	}

	function focusField(id: string) {
		requestAnimationFrame(() => document.getElementById(id)?.focus());
	}

	function deliveryAddressFingerprint() {
		return JSON.stringify({
			recipientName: recipientName.trim(),
			phone: normalizePhone(phone),
			addressLine1: addressLine1.trim(),
			addressLine2: addressLine2.trim(),
			city: city.trim(),
			district: selectedDistrict,
			postalCode: postalCode.trim()
		});
	}

	function continueToShipping() {
		handledAddressFingerprint = deliveryAddressFingerprint();
		saveAddressOpen = false;
		saveAddressStage = 'decision';
		saveAddressError = '';
		currentStep = 2;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function offerAddressSave() {
		saveAddressStage = 'decision';
		saveAddressLabel = '';
		saveAddressError = '';
		saveAddressOpen = true;
	}

	function readSaveAddressError(value: unknown): string {
		if (!value || typeof value !== 'object') {
			return 'Address could not be saved. Try again.';
		}

		const result = value as {
			saveAddressError?: unknown;
			saveAddressFieldErrors?: unknown;
			error?: unknown;
		};
		if (typeof result.saveAddressError === 'string') return result.saveAddressError;
		if (result.saveAddressFieldErrors && typeof result.saveAddressFieldErrors === 'object') {
			const errors = result.saveAddressFieldErrors as FieldErrors;
			return errors.label ?? Object.values(errors)[0] ?? 'Review the address and try again.';
		}
		if (result.error && typeof result.error === 'object') {
			const message = (result.error as { message?: unknown }).message;
			if (typeof message === 'string') return message;
		}
		return 'Address could not be saved. Try again.';
	}

	function validateDelivery() {
		const errors: FieldErrors = {};

		if (useSavedAddress) {
			if (!selectedAddressId) errors.addressId = 'Select a saved address.';
		} else {
			if (!recipientName.trim()) errors.recipientName = 'Enter the recipient name.';
			const normalizedPhone = normalizePhone(phone);
			if (!normalizedPhone) {
				errors.phone = 'Enter a mobile number.';
			} else if (!/^\+947[0-9]{8}$/.test(normalizedPhone)) {
				errors.phone = 'Enter a valid Sri Lankan mobile number.';
			}
			if (!addressLine1.trim()) errors.addressLine1 = 'Enter the delivery address.';
			if (!city.trim()) errors.city = 'Enter the city.';
			if (!selectedDistrict) errors.district = 'Select a district.';
		}

		localErrors = errors;
		const firstField = Object.keys(errors)[0];
		if (firstField) {
			focusField(firstField === 'addressId' ? 'saved-addresses' : firstField);
			return false;
		}
		return true;
	}

	function validateShipping() {
		if (!selectedShippingMethodId) {
			localErrors = { shippingMethodId: 'Select a shipping method.' };
			focusField('shipping-methods');
			return false;
		}
		localErrors = {};
		return true;
	}

	function validatePayment() {
		if (selectedPayment?.requiresBillingEmail) {
			const email = billingEmail.trim();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
				localErrors = { billingEmail: 'Enter a valid billing email.' };
				focusField('billingEmail');
				return false;
			}
		}
		localErrors = {};
		return true;
	}

	function nextStep() {
		if (checkoutExpired) {
			returnToBagAfterExpiry();
			return;
		}
		if (currentStep === 1) {
			if (!validateDelivery()) return;
			const fingerprint = deliveryAddressFingerprint();
			if (data.canSaveAddress && !useSavedAddress && handledAddressFingerprint !== fingerprint) {
				offerAddressSave();
				return;
			}
			currentStep = 2;
		} else if (currentStep === 2 && validateShipping()) currentStep = 3;
	}

	function previousStep() {
		if (currentStep > 1) {
			localErrors = {};
			currentStep -= 1;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function stepForActionErrors(errors: FieldErrors) {
		const fields = Object.keys(errors);
		if (
			fields.some((field) =>
				['addressId', 'recipientName', 'phone', 'addressLine1', 'city', 'district'].includes(field)
			)
		) {
			return 1;
		}
		if (fields.includes('shippingMethodId')) return 2;
		return 3;
	}

	async function finishPaymentFlow(attemptId: string, notice: string) {
		if (paymentNavigationStarted) return;
		paymentNavigationStarted = true;
		leavingCheckout = true;
		await goto(resolve(`/checkout/payment/${attemptId}?payment=${encodeURIComponent(notice)}`));
	}

	async function capturePayPalOrder(paypalOrderId: string) {
		const response = await fetch(resolve('/api/payments/paypal/capture'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ paypalOrderId })
		});
		const body = (await response.json()) as {
			success?: boolean;
			orderId?: string;
			error?: { message?: string } | string;
			message?: string;
		};
		if (!response.ok || !body.success || !body.orderId) {
			const message =
				typeof body.error === 'string'
					? body.error
					: (body.error?.message ?? body.message ?? 'PayPal payment could not be confirmed.');
			throw new Error(message);
		}
		leavingCheckout = true;
		await goto(resolve(`/checkout/confirmation/${body.orderId}?payment=completed`));
	}

	function ensurePayPalSession(config: { clientId: string; sdkUrl: string }) {
		if (paypalSession) return Promise.resolve(paypalSession);
		if (paypalSessionLoad) return paypalSessionLoad;

		paypalReady = false;
		paypalSessionLoad = createPayPalPaymentSession({
			...config,
			onApprove: async ({ orderId }) => capturePayPalOrder(orderId),
			onCancel: () => {
				if (paymentAttemptId) void finishPaymentFlow(paymentAttemptId, 'cancelled');
				else isSubmitting = false;
			},
			onError: (error) => {
				console.error('[checkout] PayPal SDK error:', error);
				if (paymentAttemptId) void finishPaymentFlow(paymentAttemptId, 'failed');
				else isSubmitting = false;
			}
		})
			.then((session) => {
				paypalSession = session;
				paypalReady = true;
				return session;
			})
			.catch((error) => {
				paypalSessionLoad = null;
				paypalReady = false;
				paymentProviderError = paymentErrorMessage(error, 'PayPal could not be loaded.');
				throw error;
			});
		return paypalSessionLoad;
	}

	async function submitPlaceOrder(formElement: HTMLFormElement): Promise<{ orderId: string }> {
		const response = await fetch(formElement.action, {
			method: 'POST',
			body: new FormData(formElement),
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
			credentials: 'same-origin'
		});
		const result = deserialize(await response.text()) as ActionResult;

		if (result.type === 'failure') {
			const resultErrors = readActionErrors(result.data);
			currentStep = stepForActionErrors(resultErrors);
			isSubmitting = false;
			await applyAction(result);
			window.scrollTo({ top: 0, behavior: 'smooth' });
			throw new Error('Checkout details require attention.');
		}
		if (result.type === 'redirect') {
			leavingCheckout = true;
			await applyAction(result);
			throw new Error('Checkout redirected.');
		}
		if (result.type !== 'success' || !result.data) {
			await applyAction(result);
			throw new Error('Order placement failed.');
		}

		const paymentSession = (result.data as { paymentSession?: CreateCheckoutPaymentSessionResult })
			.paymentSession;
		if (!paymentSession || paymentSession.method !== 'paypal') {
			throw new Error('PayPal session was not created.');
		}
		paymentAttemptId = paymentSession.attemptId;
		leavingCheckout = true;
		return { orderId: paymentSession.paypalOrderId };
	}

	async function startPayHereFlow(paymentSession: CreateCheckoutPaymentSessionResult) {
		if (paymentSession.method !== 'payhere') return;
		paymentAttemptId = paymentSession.attemptId;
		leavingCheckout = true;
		try {
			const outcome = await startPayHerePayment(paymentSession.paymentData);
			await finishPaymentFlow(
				paymentSession.attemptId,
				outcome === 'completed' ? 'processing' : 'cancelled'
			);
		} catch (error) {
			console.error('[checkout] PayHere SDK error:', error);
			await finishPaymentFlow(paymentSession.attemptId, 'setup_failed');
		}
	}

	function isCheckoutDestination(url: URL) {
		return url.pathname.startsWith(resolve('/checkout'));
	}

	async function cancelCheckoutReservation(keepalive = false) {
		if (checkoutCancelRequest) return checkoutCancelRequest;

		checkoutCancelRequest = fetch(resolve('/api/bag'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'cancelCheckout' }),
			keepalive
		})
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Checkout cancellation failed: ${response.status}`);
				}
				bag.applyMutationResult(await response.json());
			})
			.catch((error) => {
				console.error('[checkout] Failed to release checkout reservation:', error);
			})
			.finally(() => {
				checkoutCancelRequest = null;
			});

		return checkoutCancelRequest;
	}

	function returnToBagAfterExpiry() {
		goto(resolve('/bag'));
	}

	$effect(() => {
		closeBagDrawer();
	});

	$effect(() => {
		const config = selectedPaymentMethod === 'paypal' ? selectedPayment?.clientConfig : undefined;
		if (!config) return;
		paymentProviderError = '';
		void ensurePayPalSession(config).catch(() => undefined);
	});

	$effect(() => {
		const interval = setInterval(() => {
			remainingSeconds = remainingCheckoutSeconds();
		}, 1000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (!checkoutExpired || expiryRedirectStarted) return;
		expiryRedirectStarted = true;
		returnToBagAfterExpiry();
	});

	$effect(() => {
		const district = deliveryDistrict;
		const subtotal = data.bag.subtotal;
		const controller = new AbortController();

		shippingError = '';
		if (!district) {
			shippingQuotes = [];
			selectedShippingMethodId = '';
			isLoadingShipping = false;
			return;
		}

		isLoadingShipping = true;
		void (async () => {
			try {
				const search = new URLSearchParams({ district, subtotal: String(subtotal) });
				const response = await fetch(`${resolve('/api/shipping/quotes')}?${search}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error(`Shipping quote request failed: ${response.status}`);

				const quotes = (await response.json()) as ShippingQuoteDTO[];
				shippingQuotes = quotes;
				if (!quotes.some((quote) => quote.shippingMethodId === selectedShippingMethodId)) {
					selectedShippingMethodId = quotes[0]?.shippingMethodId ?? '';
				}
			} catch (error) {
				if (controller.signal.aborted) return;
				console.error('[checkout] Failed to load shipping quotes:', error);
				shippingQuotes = [];
				selectedShippingMethodId = '';
				shippingError = 'Shipping options could not be loaded. Try again.';
			} finally {
				if (!controller.signal.aborted) isLoadingShipping = false;
			}
		})();

		return () => controller.abort();
	});

	onNavigate((navigation) => {
		if (
			isSubmitting ||
			leavingCheckout ||
			!navigation.to ||
			isCheckoutDestination(navigation.to.url)
		) {
			return;
		}
		void cancelCheckoutReservation(true);
	});

	beforeNavigate((navigation) => {
		if (
			isSubmitting ||
			leavingCheckout ||
			!navigation.willUnload ||
			(navigation.to && isCheckoutDestination(navigation.to.url))
		) {
			return;
		}
		void cancelCheckoutReservation(true);
	});
</script>

<svelte:head>
	<title>Checkout | Caro Clothing</title>
	<meta name="description" content="Complete your Caro Clothing order." />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 pb-28 lg:px-8">
	<div class="flex items-center justify-between pt-5">
		<button
			type="button"
			class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-ash uppercase transition-colors hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-volt"
			onclick={() => goto(resolve('/bag'))}
		>
			<ArrowLeft size={15} aria-hidden="true" />
			Exit checkout
		</button>
		<span class="hidden font-mono text-[9px] tracking-[0.14em] text-ash uppercase sm:block">
			Your bag stays saved if you leave
		</span>
	</div>

	<CheckoutProgress {currentStep} />

	<div
		class="mb-6 flex items-center justify-between gap-4 border px-4 py-3
		{checkoutExpired
			? 'border-red-500/60 bg-red-950/20'
			: checkoutUrgent
				? 'border-amber-400/50 bg-amber-400/5'
				: 'border-volt/30 bg-volt/5'}"
		role="status"
		aria-live="polite"
	>
		<div class="flex min-w-0 items-center gap-3">
			<Clock
				size={18}
				class={checkoutExpired ? 'text-red-400' : checkoutUrgent ? 'text-amber-300' : 'text-volt'}
				aria-hidden="true"
			/>
			<div class="min-w-0">
				<p class="font-mono text-[10px] tracking-[0.14em] text-bone uppercase">
					{checkoutExpired ? 'Checkout expired' : 'Secure checkout window'}
				</p>
				<p class="mt-1 truncate font-sans text-xs text-ash">
					{checkoutExpired
						? 'Returning you to your saved bag.'
						: 'Stock is verified when payment completes.'}
				</p>
			</div>
		</div>
		<strong
			class="shrink-0 font-mono text-lg tabular-nums
			{checkoutExpired ? 'text-red-400' : checkoutUrgent ? 'text-amber-300' : 'text-volt'}"
		>
			{checkoutTime}
		</strong>
	</div>

	<div class="mb-6 lg:hidden">
		<CheckoutOrderSummary bagData={data.bag} isMobile {shippingCost} />
	</div>

	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
		<form
			method="POST"
			action="?/placeOrder"
			class="min-w-0"
			use:enhance={({ cancel, submitter, formElement }) => {
				if (checkoutExpired) {
					cancel();
					returnToBagAfterExpiry();
					return;
				}
				if (currentStep !== 3) {
					cancel();
					nextStep();
					return;
				}
				if (!(submitter instanceof HTMLButtonElement) || submitter.dataset.placeOrder !== 'true') {
					cancel();
					return;
				}
				if (!validatePayment()) {
					cancel();
					return;
				}

				paymentProviderError = '';
				isSubmitting = true;
				if (selectedPaymentMethod === 'paypal') {
					cancel();
					if (!paypalSession) {
						isSubmitting = false;
						paymentProviderError = 'PayPal is still loading. Try again.';
						return;
					}

					const createOrder = submitPlaceOrder(formElement);
					void paypalSession
						.start({ presentationMode: 'auto' }, createOrder)
						.catch(async (error) => {
							try {
								await createOrder;
							} catch {
								// The action result already owns form errors or redirects.
							}
							console.error('[checkout] PayPal payment failed:', error);
							if (paymentAttemptId) {
								await finishPaymentFlow(paymentAttemptId, 'failed');
							} else {
								isSubmitting = false;
							}
						});
					return;
				}

				return async ({ result, update }) => {
					if (result.type === 'success' && result.data) {
						const resultData = result.data as {
							paymentSession?: CreateCheckoutPaymentSessionResult;
						};
						const paymentSession = resultData.paymentSession;
						if (paymentSession?.method === 'payhere') {
							void startPayHereFlow(paymentSession);
							return;
						}
					}

					if (result.type === 'redirect') leavingCheckout = true;
					if (result.type === 'failure') {
						const resultErrors = readActionErrors(result.data);
						currentStep = stepForActionErrors(resultErrors);
						window.scrollTo({ top: 0, behavior: 'smooth' });
					}

					isSubmitting = false;
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="useSavedAddress" value={useSavedAddress ? 'true' : 'false'} />
			<input type="hidden" name="addressId" value={selectedAddressId} />
			<input type="hidden" name="recipientName" value={recipientName} />
			<input type="hidden" name="phone" value={normalizePhone(phone)} />
			<input type="hidden" name="addressLine1" value={addressLine1} />
			<input type="hidden" name="addressLine2" value={addressLine2} />
			<input type="hidden" name="city" value={city} />
			<input type="hidden" name="district" value={selectedDistrict} />
			<input type="hidden" name="postalCode" value={postalCode} />
			<input type="hidden" name="shippingMethodId" value={selectedShippingMethodId} />
			<input type="hidden" name="paymentMethod" value={selectedPaymentMethod} />
			<input type="hidden" name="billingEmail" value={billingEmail} />
			<input type="hidden" name="customerNote" value={customerNote} />

			{#if actionMessage}
				<div
					class="mb-6 flex items-start gap-3 border border-red-500/60 bg-red-950/20 p-4 text-red-300"
					role="alert"
					aria-live="assertive"
				>
					<AlertTriangle size={18} class="mt-0.5 shrink-0" aria-hidden="true" />
					<p class="font-sans text-sm">{actionMessage}</p>
				</div>
			{/if}

			{#if addressSaveMessage}
				<div
					class="mb-6 flex items-start gap-3 border border-volt/40 bg-volt/5 p-4 text-bone"
					role="status"
					aria-live="polite"
				>
					<Check size={18} class="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
					<p class="font-sans text-sm">{addressSaveMessage}</p>
				</div>
			{/if}

			<section
				aria-labelledby="delivery-heading"
				class={currentStep === 1 ? '' : 'border-b border-charcoal pb-6'}
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="font-mono text-[9px] tracking-[0.16em] text-volt uppercase">Step 01</p>
						<h1
							id="delivery-heading"
							class="mt-1 font-display text-4xl tracking-wide text-bone uppercase"
						>
							Delivery details
						</h1>
					</div>
					{#if currentStep > 1}
						<button
							type="button"
							class="min-h-11 px-2 font-mono text-[10px] tracking-[0.14em] text-ash uppercase hover:text-volt"
							onclick={() => (currentStep = 1)}
						>
							Edit
						</button>
					{/if}
				</div>

				{#if currentStep === 1}
					<p class="mt-3 max-w-xl font-sans text-sm leading-6 text-ash">
						Choose where this order should go. Shipping options update for the selected district.
					</p>

					{#if savedAddresses.length > 0}
						<div class="mt-7 grid grid-cols-2 gap-2">
							<button
								type="button"
								class="min-h-12 border px-3 font-mono text-[10px] uppercase
								{useSavedAddress ? 'border-volt bg-volt/5 text-bone' : 'border-charcoal text-ash'}"
								onclick={() => (useSavedAddress = true)}
							>
								Saved address
							</button>
							<button
								type="button"
								class="min-h-12 border px-3 font-mono text-[10px] uppercase
								{!useSavedAddress ? 'border-volt bg-volt/5 text-bone' : 'border-charcoal text-ash'}"
								onclick={() => (useSavedAddress = false)}
							>
								New address
							</button>
						</div>
					{/if}

					{#if useSavedAddress && savedAddresses.length > 0}
						<fieldset id="saved-addresses" class="mt-6" tabindex="-1">
							<legend class="sr-only">Saved delivery addresses</legend>
							<div class="grid gap-3 md:grid-cols-2">
								{#each savedAddresses as address (address.id)}
									<label
										class="relative flex min-h-36 cursor-pointer flex-col border p-5 transition-colors
										{selectedAddressId === address.id ? 'border-volt bg-volt/5' : 'border-charcoal hover:border-ash'}"
									>
										<input
											class="sr-only"
											type="radio"
											bind:group={selectedAddressId}
											value={address.id}
										/>
										<div class="flex items-start justify-between gap-3">
											<strong class="font-mono text-[10px] tracking-[0.12em] text-bone uppercase">
												{address.label || 'Delivery address'}
											</strong>
											<span
												class="flex h-5 w-5 shrink-0 items-center justify-center border
												{selectedAddressId === address.id ? 'border-volt bg-volt text-void' : 'border-ash'}"
											>
												{#if selectedAddressId === address.id}
													<Check size={13} aria-hidden="true" />
												{/if}
											</span>
										</div>
										<p class="mt-4 font-sans text-sm leading-6 text-ash">
											{address.recipientName}<br />
											{address.singleLine}<br />
											{address.phone}
										</p>
									</label>
								{/each}
							</div>
							{#if errorFor('addressId')}
								<p class="mt-2 font-sans text-xs text-red-400">{errorFor('addressId')}</p>
							{/if}
						</fieldset>
					{:else}
						<div class="mt-7 grid gap-x-5 gap-y-5 md:grid-cols-2">
							<div>
								<label for="recipientName" class="field-label">Recipient name</label>
								<input
									id="recipientName"
									class="field-input"
									class:border-red-500={Boolean(errorFor('recipientName'))}
									type="text"
									autocomplete="name"
									bind:value={recipientName}
									aria-invalid={Boolean(errorFor('recipientName'))}
									aria-describedby={errorFor('recipientName') ? 'recipientName-error' : undefined}
								/>
								{#if errorFor('recipientName')}
									<p id="recipientName-error" class="field-error">{errorFor('recipientName')}</p>
								{/if}
							</div>
							<div>
								<label for="phone" class="field-label">Mobile number</label>
								<input
									id="phone"
									class="field-input"
									class:border-red-500={Boolean(errorFor('phone'))}
									type="tel"
									inputmode="tel"
									autocomplete="tel"
									placeholder="077 123 4567"
									bind:value={phone}
									aria-invalid={Boolean(errorFor('phone'))}
									aria-describedby={errorFor('phone') ? 'phone-error' : undefined}
								/>
								{#if errorFor('phone')}
									<p id="phone-error" class="field-error">{errorFor('phone')}</p>
								{/if}
							</div>
							<div class="md:col-span-2">
								<label for="addressLine1" class="field-label">Address</label>
								<input
									id="addressLine1"
									class="field-input"
									class:border-red-500={Boolean(errorFor('addressLine1'))}
									type="text"
									autocomplete="address-line1"
									bind:value={addressLine1}
									aria-invalid={Boolean(errorFor('addressLine1'))}
									aria-describedby={errorFor('addressLine1') ? 'addressLine1-error' : undefined}
								/>
								{#if errorFor('addressLine1')}
									<p id="addressLine1-error" class="field-error">{errorFor('addressLine1')}</p>
								{/if}
							</div>
							<div class="md:col-span-2">
								<label for="addressLine2" class="field-label"
									>Apartment, suite, etc. (optional)</label
								>
								<input
									id="addressLine2"
									class="field-input"
									type="text"
									autocomplete="address-line2"
									bind:value={addressLine2}
								/>
							</div>
							<div>
								<label for="city" class="field-label">City</label>
								<input
									id="city"
									class="field-input"
									class:border-red-500={Boolean(errorFor('city'))}
									type="text"
									autocomplete="address-level2"
									bind:value={city}
									aria-invalid={Boolean(errorFor('city'))}
									aria-describedby={errorFor('city') ? 'city-error' : undefined}
								/>
								{#if errorFor('city')}
									<p id="city-error" class="field-error">{errorFor('city')}</p>
								{/if}
							</div>
							<div>
								<label for="district" class="field-label">District</label>
								<select
									id="district"
									class="field-input"
									class:border-red-500={Boolean(errorFor('district'))}
									bind:value={selectedDistrict}
									autocomplete="address-level1"
									aria-invalid={Boolean(errorFor('district'))}
									aria-describedby={errorFor('district') ? 'district-error' : undefined}
								>
									<option value="">Select district</option>
									{#each data.districtOptions as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
								{#if errorFor('district')}
									<p id="district-error" class="field-error">{errorFor('district')}</p>
								{/if}
							</div>
							<div>
								<label for="postalCode" class="field-label">Postal code (optional)</label>
								<input
									id="postalCode"
									class="field-input"
									type="text"
									inputmode="numeric"
									autocomplete="postal-code"
									bind:value={postalCode}
								/>
							</div>
						</div>
					{/if}
				{:else if selectedAddress}
					<p class="mt-4 font-sans text-sm leading-6 text-ash">
						{selectedAddress.recipientName}, {selectedAddress.singleLine}
					</p>
				{:else}
					<p class="mt-4 font-sans text-sm text-ash">
						{recipientName}, {addressLine1}, {city}, {selectedDistrict}
					</p>
				{/if}
			</section>

			{#if currentStep >= 2}
				<section
					aria-labelledby="shipping-heading"
					class="pt-8 {currentStep > 2 ? 'border-b border-charcoal pb-6' : ''}"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="font-mono text-[9px] tracking-[0.16em] text-volt uppercase">Step 02</p>
							<h2
								id="shipping-heading"
								class="mt-1 font-display text-4xl tracking-wide text-bone uppercase"
							>
								Shipping
							</h2>
						</div>
						{#if currentStep > 2}
							<button
								type="button"
								class="min-h-11 px-2 font-mono text-[10px] tracking-[0.14em] text-ash uppercase hover:text-volt"
								onclick={() => (currentStep = 2)}
							>
								Edit
							</button>
						{/if}
					</div>

					{#if currentStep === 2}
						<p class="mt-3 font-sans text-sm text-ash">
							Available for {deliveryDistrict || 'your district'}.
						</p>
						<fieldset id="shipping-methods" class="mt-6" tabindex="-1">
							<legend class="sr-only">Shipping methods</legend>
							{#if isLoadingShipping}
								<div
									class="flex min-h-32 items-center justify-center gap-3 border border-charcoal text-ash"
								>
									<Loader2 size={18} class="animate-spin" aria-hidden="true" />
									<span class="font-mono text-[10px] tracking-[0.12em] uppercase"
										>Loading options</span
									>
								</div>
							{:else if shippingError}
								<div class="border border-red-500/50 bg-red-950/20 p-5" role="alert">
									<p class="font-sans text-sm text-red-300">{shippingError}</p>
								</div>
							{:else if shippingQuotes.length === 0}
								<div class="border border-charcoal p-5">
									<p class="font-sans text-sm text-ash">
										No shipping methods are available for this district.
									</p>
								</div>
							{:else}
								<div class="grid gap-3">
									{#each shippingQuotes as quote (quote.shippingMethodId)}
										<label
											class="flex min-h-28 cursor-pointer items-center gap-4 border p-5 transition-colors
											{selectedShippingMethodId === quote.shippingMethodId
												? 'border-volt bg-volt/5'
												: 'border-charcoal hover:border-ash'}"
										>
											<input
												class="sr-only"
												type="radio"
												bind:group={selectedShippingMethodId}
												value={quote.shippingMethodId}
											/>
											<Truck size={22} class="shrink-0 text-volt" aria-hidden="true" />
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-2">
													<strong class="font-sans text-sm text-bone">{quote.name}</strong>
													{#if quote.isFreeShipping}
														<span class="bg-volt px-2 py-1 font-mono text-[8px] text-void uppercase"
															>Free</span
														>
													{/if}
												</div>
												<p class="mt-1 font-sans text-xs leading-5 text-ash">
													{quote.etaText}{quote.carrier ? ` / ${quote.carrier}` : ''}
												</p>
												{#if quote.description}
													<p class="mt-1 font-sans text-xs text-ash">{quote.description}</p>
												{/if}
											</div>
											<strong class="shrink-0 font-mono text-sm text-bone">
												{quote.price === 0 ? 'Free' : `LKR ${quote.price.toLocaleString()}`}
											</strong>
										</label>
									{/each}
								</div>
							{/if}
							{#if errorFor('shippingMethodId')}
								<p class="mt-2 font-sans text-xs text-red-400">{errorFor('shippingMethodId')}</p>
							{/if}
						</fieldset>
					{:else if selectedQuote}
						<p class="mt-4 font-sans text-sm text-ash">
							{selectedQuote.name}, {selectedQuote.etaText}, {selectedQuote.price === 0
								? 'free'
								: `LKR ${selectedQuote.price.toLocaleString()}`}
						</p>
					{/if}
				</section>
			{/if}

			{#if currentStep >= 3}
				<section aria-labelledby="payment-heading" class="pt-8">
					<p class="font-mono text-[9px] tracking-[0.16em] text-volt uppercase">Step 03</p>
					<h2
						id="payment-heading"
						class="mt-1 font-display text-4xl tracking-wide text-bone uppercase"
					>
						Payment
					</h2>
					<p class="mt-3 font-sans text-sm text-ash">Choose how you want to complete this order.</p>

					<fieldset class="mt-6">
						<legend class="sr-only">Payment method</legend>
						<div class="grid gap-3">
							{#each paymentOptions as option (option.id)}
								<label
									class="flex min-h-24 cursor-pointer items-center gap-4 border p-5 transition-colors
									{selectedPaymentMethod === option.id
										? 'border-volt bg-volt/5'
										: 'border-charcoal hover:border-ash'}"
								>
									<input
										class="sr-only"
										type="radio"
										bind:group={selectedPaymentMethod}
										value={option.id}
									/>
									<CreditCard size={21} class="shrink-0 text-volt" aria-hidden="true" />
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<strong class="font-sans text-sm text-bone">{option.title}</strong>
											{#if option.badge}
												<span
													class="border border-volt/40 px-2 py-1 font-mono text-[8px] text-volt uppercase"
												>
													{option.badge}
												</span>
											{/if}
										</div>
										<p class="mt-1 font-sans text-xs leading-5 text-ash">{option.description}</p>
									</div>
									<span
										class="flex h-5 w-5 shrink-0 items-center justify-center border
										{selectedPaymentMethod === option.id ? 'border-volt bg-volt text-void' : 'border-ash'}"
									>
										{#if selectedPaymentMethod === option.id}
											<Check size={13} aria-hidden="true" />
										{/if}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					{#if selectedPayment?.requiresBillingEmail}
						<div class="mt-6">
							<label for="billingEmail" class="field-label">Billing email</label>
							<input
								id="billingEmail"
								class="field-input"
								class:border-red-500={Boolean(errorFor('billingEmail'))}
								type="email"
								inputmode="email"
								autocomplete="email"
								placeholder="you@example.com"
								bind:value={billingEmail}
								aria-invalid={Boolean(errorFor('billingEmail'))}
								aria-describedby={errorFor('billingEmail') ? 'billingEmail-error' : undefined}
							/>
							{#if errorFor('billingEmail')}
								<p id="billingEmail-error" class="field-error">{errorFor('billingEmail')}</p>
							{:else}
								<p class="mt-2 font-sans text-xs leading-5 text-ash">
									PayHere uses this email for the payment receipt.
								</p>
							{/if}
						</div>
					{/if}

					<div class="mt-6">
						<label for="customerNote" class="field-label">Order note (optional)</label>
						<textarea
							id="customerNote"
							class="field-input min-h-28 resize-y"
							maxlength="1000"
							placeholder="Delivery instructions or order notes"
							bind:value={customerNote}
						></textarea>
					</div>

					<div class="mt-6 border border-charcoal bg-charcoal/20 p-4">
						<p class="font-sans text-xs leading-5 text-ash">
							Your total is <strong class="text-bone"
								>LKR {(data.bag.totalBeforeShipping + shippingCost).toLocaleString()}</strong
							>. Online methods continue to the selected payment provider after the order is placed.
						</p>
					</div>
				</section>
			{/if}

			<div
				class="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-charcoal bg-void/95 px-4 py-4 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-6 lg:backdrop-blur-none"
			>
				<div class="flex gap-3">
					{#if currentStep > 1}
						<Button
							type="button"
							variant="outline"
							class="min-h-12 shrink-0 px-4"
							onclick={previousStep}
						>
							Back
						</Button>
					{/if}
					{#if currentStep === 3}
						<Button
							type="submit"
							variant="primary"
							disabled={isSubmitting ||
								checkoutExpired ||
								(selectedPaymentMethod === 'paypal' && !paypalReady)}
							class="min-h-12 flex-1 px-5 lg:flex-none lg:px-10"
							data-place-order="true"
						>
							{#if isSubmitting}
								<span class="inline-flex items-center justify-center gap-2">
									<Loader2 size={15} class="animate-spin" aria-hidden="true" />
									Processing
								</span>
							{:else}
								{primaryActionLabel}
							{/if}
						</Button>
					{:else}
						<Button
							type="button"
							variant="primary"
							disabled={checkoutExpired || (currentStep === 2 && isLoadingShipping)}
							class="min-h-12 flex-1 px-5 lg:flex-none lg:px-10"
							onclick={nextStep}
						>
							{primaryActionLabel}
						</Button>
					{/if}
				</div>
			</div>
		</form>

		<div class="hidden lg:block">
			<CheckoutOrderSummary bagData={data.bag} {shippingCost} />
		</div>
	</div>
</div>

<Dialog.Root
	open={saveAddressOpen}
	onOpenChange={(open) => {
		saveAddressOpen = open;
		if (!open && !isSavingAddress) {
			saveAddressStage = 'decision';
			saveAddressError = '';
		}
	}}
>
	{#if saveAddressOpen}
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-void/90 backdrop-blur-sm" />
			<div
				class="fixed inset-0 z-50 grid items-end overflow-y-auto sm:place-items-center sm:px-4 sm:py-6"
			>
				<Dialog.Content
					class="w-full border-t border-volt/30 bg-charcoal p-5 outline-none sm:max-w-md sm:border sm:p-6"
				>
					<div class="flex items-start gap-4">
						<div
							class="flex h-11 w-11 shrink-0 items-center justify-center border border-volt/40 bg-volt/5 text-volt"
						>
							<BookmarkPlus size={20} aria-hidden="true" />
						</div>
						<div class="min-w-0">
							<p class="font-mono text-[9px] tracking-[0.16em] text-volt uppercase">
								Faster next time
							</p>
							<Dialog.Title class="mt-1 font-display text-3xl tracking-wide text-bone uppercase">
								{saveAddressStage === 'decision' ? 'Save this address?' : 'Name this address'}
							</Dialog.Title>
						</div>
					</div>

					<Dialog.Description class="mt-4 font-sans text-sm leading-6 text-ash">
						{saveAddressStage === 'decision'
							? 'Keep these delivery details in your account for a quicker future checkout.'
							: 'Add an optional label so this address is easy to recognize later.'}
					</Dialog.Description>

					{#if saveAddressStage === 'decision'}
						<div class="mt-6 grid gap-3 sm:grid-cols-2">
							<Button
								type="button"
								variant="primary"
								class="min-h-12 w-full"
								onclick={() => {
									saveAddressStage = 'label';
									focusField('saveAddressLabel');
								}}
							>
								Yes, save it
							</Button>
							<Button
								type="button"
								variant="outline"
								class="min-h-12 w-full"
								onclick={continueToShipping}
							>
								Not now
							</Button>
						</div>
					{:else}
						<form
							method="POST"
							action="?/saveAddress"
							class="mt-6"
							use:enhance={() => {
								isSavingAddress = true;
								saveAddressError = '';

								return async ({ result }) => {
									isSavingAddress = false;
									if (result.type === 'success') {
										const resultData = result.data as { savedAddress?: AddressDTO };
										if (
											resultData.savedAddress &&
											!savedAddresses.some((address) => address.id === resultData.savedAddress?.id)
										) {
											savedAddresses = [...savedAddresses, resultData.savedAddress];
										}
										addressSaveMessage = 'Delivery address saved to your account.';
										continueToShipping();
										return;
									}

									if (result.type === 'failure') {
										saveAddressError = readSaveAddressError(result.data);
										focusField('saveAddressLabel');
										return;
									}

									saveAddressError = 'Address could not be saved. Try again.';
								};
							}}
						>
							<input type="hidden" name="recipientName" value={recipientName} />
							<input type="hidden" name="phone" value={normalizePhone(phone)} />
							<input type="hidden" name="addressLine1" value={addressLine1} />
							<input type="hidden" name="addressLine2" value={addressLine2} />
							<input type="hidden" name="city" value={city} />
							<input type="hidden" name="district" value={selectedDistrict} />
							<input type="hidden" name="postalCode" value={postalCode} />

							<label for="saveAddressLabel" class="field-label">Address label (optional)</label>
							<input
								id="saveAddressLabel"
								name="label"
								class="field-input"
								class:border-red-500={Boolean(saveAddressError)}
								type="text"
								maxlength="50"
								placeholder="Home, work, etc."
								autocomplete="off"
								bind:value={saveAddressLabel}
								aria-invalid={Boolean(saveAddressError)}
								aria-describedby={saveAddressError ? 'saveAddress-error' : 'saveAddress-help'}
							/>
							<p id="saveAddress-help" class="mt-2 font-sans text-xs leading-5 text-ash">
								Leave blank to save it as a delivery address.
							</p>

							{#if saveAddressError}
								<p id="saveAddress-error" class="mt-3 font-sans text-xs text-red-400" role="alert">
									{saveAddressError}
								</p>
							{/if}

							<div class="mt-6 grid gap-3 sm:grid-cols-2">
								<Button
									type="submit"
									variant="primary"
									class="min-h-12 w-full"
									disabled={isSavingAddress}
								>
									{#if isSavingAddress}
										<span class="inline-flex items-center gap-2">
											<Loader2 size={15} class="animate-spin" aria-hidden="true" />
											Saving
										</span>
									{:else}
										Save and continue
									{/if}
								</Button>
								<Button
									type="button"
									variant="outline"
									class="min-h-12 w-full"
									disabled={isSavingAddress}
									onclick={() => {
										saveAddressStage = 'decision';
										saveAddressError = '';
									}}
								>
									Back
								</Button>
							</div>
						</form>
					{/if}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<style>
	.field-label {
		display: block;
		margin-bottom: 0.5rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.625rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #b4afa8;
	}

	.field-input {
		min-height: 3rem;
		width: 100%;
		border: 1px solid #3a3a3a;
		background: transparent;
		padding: 0.75rem 0.875rem;
		font-family: var(--font-sans, sans-serif);
		font-size: 0.875rem;
		color: #f8f5f0;
		outline: none;
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease;
	}

	.field-input:focus {
		border-color: #c8ff00;
		box-shadow: 0 0 0 2px rgb(200 255 0 / 0.15);
	}

	.field-input::placeholder {
		color: #77736e;
	}

	.field-error {
		margin-top: 0.4rem;
		font-family: var(--font-sans, sans-serif);
		font-size: 0.75rem;
		color: #f87171;
	}
</style>
