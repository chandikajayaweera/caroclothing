<script lang="ts">
	import { enhance } from '$app/forms';
	import { cart } from '$lib/client/modules/stores/cart.svelte';
	import CheckoutProgress from '$lib/components/checkout/CheckoutProgress.svelte';
	import CheckoutOrderSummary from '$lib/components/checkout/CheckoutOrderSummary.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form }: { data: any; form: any } = $props();

	let currentStep = $state(1); // 1: Contact, 2: Delivery, 3: Shipping, 4: Payment
	const steps = ['Contact', 'Delivery', 'Shipping', 'Payment'];

	// ── STEP 1: CONTACT ────────────────────────────────────────────────────────
	let phoneInput = $state(data.user?.isAnonymous ? '' : (data.user?.phoneNumber || ''));
	let email = $state(data.user?.isAnonymous ? '' : (data.user?.email || ''));
	let phoneError = $state('');

	// Format to matching SL format expected by schema (+947X XXXXXXX or 07X XXXXXXX)
	let cleanPhone = $derived(() => {
		let p = phoneInput.trim().replace(/\s+/g, '');
		if (!p) return '';
		if (p.startsWith('0')) {
			return '+94' + p.slice(1);
		}
		if (p.startsWith('7') && p.length === 9) {
			return '+94' + p;
		}
		if (p.startsWith('+94')) {
			return p;
		}
		return p;
	});

	function validateContactStep() {
		phoneError = '';
		const p = cleanPhone();
		if (!p) {
			phoneError = 'Phone number is required';
			return false;
		}
		const slPhoneRegex = /^(?:\+94|0)7[0-9]{8}$/;
		if (!slPhoneRegex.test(p)) {
			phoneError = 'Must be a valid Sri Lankan mobile number (e.g. 0771234567)';
			return false;
		}
		return true;
	}

	// ── STEP 2: DELIVERY ───────────────────────────────────────────────────────
	let useSavedAddress = $state(data.addresses && data.addresses.length > 0);
	let selectedAddressId = $state(data.defaultAddress?.id || data.addresses?.[0]?.id || '');

	let recipientName = $state(data.user?.isAnonymous ? '' : (data.user?.name || ''));
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let selectedDistrict = $state('');
	let postalCode = $state('');

	let deliveryError = $state('');

	function validateDeliveryStep() {
		deliveryError = '';
		if (useSavedAddress) {
			if (!selectedAddressId) {
				deliveryError = 'Please select a saved address';
				return false;
			}
		} else {
			if (!recipientName.trim()) {
				deliveryError = 'Recipient name is required';
				return false;
			}
			if (!addressLine1.trim()) {
				deliveryError = 'Address line 1 is required';
				return false;
			}
			if (!city.trim()) {
				deliveryError = 'City is required';
				return false;
			}
			if (!selectedDistrict) {
				deliveryError = 'District is required';
				return false;
			}
		}
		return true;
	}

	// ── STEP 3: SHIPPING ───────────────────────────────────────────────────────
	let selectedShippingMethodId = $state('');
	let shippingQuotes = $state<any[]>(data.shippingQuotes || []);
	let isLoadingShipping = $state(false);
	let shippingError = $state('');

	// Reactively fetch shipping quotes whenever the selected district changes
	$effect(() => {
		let district = '';
		if (useSavedAddress) {
			const addr = data.addresses?.find((a: any) => a.id === selectedAddressId);
			district = addr?.district || '';
		} else {
			district = selectedDistrict;
		}

		if (district) {
			isLoadingShipping = true;
			fetch(`/api/shipping/quotes?district=${encodeURIComponent(district)}&subtotal=${cart.subtotal}`)
				.then((res) => res.json())
				.then((quotes: any) => {
					shippingQuotes = quotes as any[];
					if (shippingQuotes.length > 0) {
						if (!shippingQuotes.some((q: any) => q.id === selectedShippingMethodId)) {
							selectedShippingMethodId = shippingQuotes[0].id;
						}
					} else {
						selectedShippingMethodId = '';
					}
				})
				.catch((err) => {
					console.error('Failed to load shipping quotes:', err);
					shippingError = 'Failed to load shipping quotes';
				})
				.finally(() => {
					isLoadingShipping = false;
				});
		} else {
			shippingQuotes = [];
			selectedShippingMethodId = '';
		}
	});

	let shippingCost = $derived(
		shippingQuotes.find((q) => q.id === selectedShippingMethodId)?.rate || 0
	);

	function validateShippingStep() {
		shippingError = '';
		if (!selectedShippingMethodId) {
			shippingError = 'Please select a shipping method';
			return false;
		}
		return true;
	}

	// ── STEP 4: PAYMENT ────────────────────────────────────────────────────────
	let selectedPaymentMethod = $state('payhere');
	let customerNote = $state('');
	let isSubmitting = $state(false);

	// ── STEP CONTROL ───────────────────────────────────────────────────────────
	function nextStep() {
		if (currentStep === 1) {
			if (validateContactStep()) currentStep = 2;
		} else if (currentStep === 2) {
			if (validateDeliveryStep()) currentStep = 3;
		} else if (currentStep === 3) {
			if (validateShippingStep()) currentStep = 4;
		}
	}

	function setStep(step: number) {
		if (step < currentStep) currentStep = step;
	}
</script>

<svelte:head>
	<title>Checkout | Caro Clothing</title>
	<meta name="description" content="Secure Checkout - Caro Clothing" />
</svelte:head>

<div class="mx-auto min-h-screen max-w-7xl bg-void px-4 pt-12 lg:px-8">
	<CheckoutProgress {currentStep} />

	<div class="pb-32 lg:mt-12 lg:grid lg:grid-cols-[1fr_400px] lg:gap-16">
		<!-- Left: Form steps -->
		<div>
			{#if form?.error || form?.message}
				<div class="mb-8 border border-red-500 bg-red-950/20 p-4 font-mono text-xs text-red-400">
					{form.message || form.error}
				</div>
			{/if}

			<form
				method="POST"
				action="?/placeOrder"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ result, update }) => {
						isSubmitting = false;
						if (result.type === 'success' && result.data) {
							const resData = result.data as any;
							if (resData.paymentSession) {
								const { redirectUrl, paymentData } = resData.paymentSession;
								if (paymentData && redirectUrl) {
									const postForm = document.createElement('form');
									postForm.method = 'POST';
									postForm.action = redirectUrl;
									for (const [key, value] of Object.entries(paymentData)) {
										const input = document.createElement('input');
										input.type = 'hidden';
										input.name = key;
										input.value = String(value);
										postForm.appendChild(input);
									}
									document.body.appendChild(postForm);
									postForm.submit();
									return;
								}
							}
						}
						await update();
					};
				}}
				class="flex flex-col gap-10"
			>
				<!-- Hidden form fields to submit -->
				<input type="hidden" name="phone" value={cleanPhone()} />
				<input type="hidden" name="email" value={email} />
				<input type="hidden" name="useSavedAddress" value={useSavedAddress ? 'true' : 'false'} />
				<input type="hidden" name="addressId" value={selectedAddressId} />
				<input type="hidden" name="recipientName" value={recipientName} />
				<input type="hidden" name="addressLine1" value={addressLine1} />
				<input type="hidden" name="addressLine2" value={addressLine2} />
				<input type="hidden" name="city" value={city} />
				<input type="hidden" name="district" value={selectedDistrict} />
				<input type="hidden" name="postalCode" value={postalCode} />
				<input type="hidden" name="shippingMethodId" value={selectedShippingMethodId} />
				<input type="hidden" name="paymentMethod" value={selectedPaymentMethod} />
				<input type="hidden" name="customerNote" value={customerNote} />

				<!-- STEP 1: CONTACT -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2 class="font-display text-2xl tracking-tight text-bone uppercase">1. Contact</h2>
						{#if currentStep > 1}
							<button
								type="button"
								class="font-mono text-[10px] tracking-widest text-ash uppercase underline hover:text-volt"
								onclick={() => setStep(1)}
							>
								Change
							</button>
						{/if}
					</div>

					{#if currentStep === 1}
						<div class="animate-fade-in flex flex-col gap-6">
							<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
								<div class="flex flex-col gap-2">
									<label for="phone-number" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
										Phone Number (OTP)
									</label>
									<div class="flex border-b border-charcoal transition-colors focus-within:border-volt">
										<span class="py-3 font-mono text-sm text-ash/40">+94</span>
										<input
											id="phone-number"
											type="text"
											placeholder="7XXXXXXXX"
											bind:value={phoneInput}
											class="flex-1 bg-transparent py-3 pl-2 font-mono text-sm text-bone outline-none placeholder:text-charcoal"
										/>
									</div>
									{#if phoneError}
										<span class="font-mono text-[10px] text-red-500">{phoneError}</span>
									{/if}
								</div>
								<div class="flex flex-col gap-2">
									<label for="email-field" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
										Email (Optional)
									</label>
									<input
										id="email-field"
										type="email"
										placeholder="EMAIL@EXAMPLE.COM"
										bind:value={email}
										class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase transition-colors outline-none placeholder:text-charcoal focus:border-volt"
									/>
								</div>
							</div>
						</div>
					{:else}
						<div class="flex flex-col gap-1 border border-charcoal bg-charcoal/20 p-5">
							<span class="font-mono text-sm text-bone">{cleanPhone()}</span>
							{#if email}
								<span class="font-mono text-[9px] tracking-widest text-ash uppercase">{email}</span>
							{/if}
						</div>
					{/if}
				</section>

				<!-- STEP 2: DELIVERY -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2 class="font-display text-2xl tracking-tight text-bone uppercase {currentStep < 2 ? 'opacity-20' : ''}">
							2. Delivery
						</h2>
						{#if currentStep > 2}
							<button
								type="button"
								class="font-mono text-[10px] tracking-widest text-ash uppercase underline hover:text-volt"
								onclick={() => setStep(2)}
							>
								Change
							</button>
						{/if}
					</div>

					{#if currentStep === 2}
						<div class="animate-fade-in flex flex-col gap-6">
							{#if deliveryError}
								<div class="border border-red-500 bg-red-950/20 p-3 font-mono text-xs text-red-400">
									{deliveryError}
								</div>
							{/if}

							{#if data.addresses && data.addresses.length > 0}
								<div class="flex gap-4 border-b border-charcoal pb-6">
									<label class="flex items-center gap-2 font-mono text-[11px] uppercase cursor-pointer">
										<input type="radio" checked={useSavedAddress} onclick={() => useSavedAddress = true} />
										Use Saved Address
									</label>
									<label class="flex items-center gap-2 font-mono text-[11px] uppercase cursor-pointer">
										<input type="radio" checked={!useSavedAddress} onclick={() => useSavedAddress = false} />
										Enter New Address
									</label>
								</div>
							{/if}

							{#if useSavedAddress && data.addresses && data.addresses.length > 0}
								<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
									{#each data.addresses as addr}
										<label
											class="flex cursor-pointer flex-col gap-2 border p-5 transition-all
											{selectedAddressId === addr.id ? 'border-volt bg-charcoal/30' : 'border-charcoal bg-transparent hover:border-ash/40'}"
										>
											<div class="flex items-start justify-between">
												<span class="font-mono text-xs font-bold text-bone">{addr.label || 'Address'}</span>
												<input type="radio" bind:group={selectedAddressId} value={addr.id} class="accent-volt" />
											</div>
											<span class="font-sans text-xs text-ash">
												{addr.recipientName}<br />
												{addr.addressLine1}{addr.addressLine2 ? ', ' + addr.addressLine2 : ''}<br />
												{addr.city}, {addr.district}
											</span>
										</label>
									{/each}
								</div>
							{:else}
								<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
									<div class="flex flex-col gap-2">
										<label for="recipient-name" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
											Recipient Name
										</label>
										<input
											id="recipient-name"
											type="text"
											placeholder="KASUN MENDIS"
											bind:value={recipientName}
											class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
										/>
									</div>
									<div class="flex flex-col gap-2">
										<label for="district" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
											District
										</label>
										<select
											id="district"
											bind:value={selectedDistrict}
											class="border-b border-charcoal bg-void py-3 font-mono text-sm text-bone outline-none focus:border-volt"
										>
											<option value="">SELECT DISTRICT</option>
											{#each data.districtOptions || [] as option}
												<option value={option.value}>{option.label.toUpperCase()}</option>
											{/each}
										</select>
									</div>
									<div class="flex flex-col gap-2 md:col-span-2">
										<label for="shipping-address" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
											Shipping Address
										</label>
										<input
											id="shipping-address"
											type="text"
											placeholder="12 GALLE ROAD, COLOMBO 03"
											bind:value={addressLine1}
											class="w-full border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
										/>
									</div>
									<div class="flex flex-col gap-2 md:col-span-2">
										<label for="shipping-address2" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
											Address Line 2 (Optional)
										</label>
										<input
											id="shipping-address2"
											type="text"
											placeholder="APARTMENT 4B"
											bind:value={addressLine2}
											class="w-full border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
										/>
									</div>
									<div class="flex flex-col gap-2">
										<label for="city" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
											City
										</label>
										<input
											id="city"
											type="text"
											placeholder="COLOMBO"
											bind:value={city}
											class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
										/>
									</div>
									<div class="flex flex-col gap-2">
										<label for="postal-code" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
											Postal Code (Optional)
										</label>
										<input
											id="postal-code"
											type="text"
											placeholder="00100"
											bind:value={postalCode}
											class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none placeholder:text-charcoal focus:border-volt"
										/>
									</div>
								</div>
							{/if}
						</div>
					{:else if currentStep > 2}
						<div class="flex flex-col gap-1 border border-charcoal bg-charcoal/20 p-5">
							{#if useSavedAddress}
								{@const addr = data.addresses?.find((a: any) => a.id === selectedAddressId)}
								{#if addr}
									<span class="font-mono text-sm leading-relaxed text-bone uppercase">
										{addr.recipientName}<br />
										{addr.addressLine1}{addr.addressLine2 ? ', ' + addr.addressLine2 : ''}<br />
										{addr.city}, {addr.district}
									</span>
								{/if}
							{:else}
								<span class="font-mono text-sm leading-relaxed text-bone uppercase">
									{recipientName}<br />
									{addressLine1}{addressLine2 ? ', ' + addressLine2 : ''}<br />
									{city}, {selectedDistrict}
								</span>
							{/if}
						</div>
					{/if}
				</section>

				<!-- STEP 3: SHIPPING METHOD -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2 class="font-display text-2xl tracking-tight text-bone uppercase {currentStep < 3 ? 'opacity-20' : ''}">
							3. Shipping
						</h2>
						{#if currentStep > 3}
							<button
								type="button"
								class="font-mono text-[10px] tracking-widest text-ash uppercase underline hover:text-volt"
								onclick={() => setStep(3)}
							>
								Change
							</button>
						{/if}
					</div>

					{#if currentStep === 3}
						<div class="animate-fade-in flex flex-col gap-4">
							{#if shippingError}
								<div class="border border-red-500 bg-red-950/20 p-3 font-mono text-xs text-red-400">
									{shippingError}
								</div>
							{/if}

							{#if isLoadingShipping}
								<div class="flex items-center justify-center py-8 font-mono text-xs text-ash uppercase">
									Calculating shipping options...
								</div>
							{:else}
								<div class="flex flex-col gap-4">
									{#each shippingQuotes as quote}
										<label
											class="group flex cursor-pointer items-center justify-between border-2 p-6 transition-all
											{selectedShippingMethodId === quote.id
												? 'border-volt bg-charcoal/30 text-bone'
												: 'border-charcoal bg-transparent text-bone hover:border-ash/40'}"
										>
											<div class="flex flex-col gap-1">
												<span class="font-display text-xl tracking-tight uppercase">
													{quote.name}
												</span>
												{#if quote.description}
													<span class="font-mono text-[10px] tracking-widest text-ash uppercase">
														{quote.description}
													</span>
												{/if}
											</div>
											<div class="flex items-center gap-4">
												<span class="font-mono text-lg font-bold">LKR {quote.rate.toLocaleString()}</span>
												<input
													type="radio"
													bind:group={selectedShippingMethodId}
													value={quote.id}
													class="accent-volt"
												/>
											</div>
										</label>
									{:else}
										<div class="border border-charcoal p-6 text-center font-mono text-xs text-ash uppercase">
											Please complete the delivery details first.
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{:else if currentStep > 3}
						{@const activeQuote = shippingQuotes.find((q) => q.id === selectedShippingMethodId)}
						<div class="flex flex-col gap-1 border border-charcoal bg-charcoal/20 p-5">
							{#if activeQuote}
								<span class="font-mono text-sm text-bone uppercase">
									{activeQuote.name} (LKR {activeQuote.rate.toLocaleString()})
								</span>
							{/if}
						</div>
					{/if}
				</section>

				<!-- STEP 4: PAYMENT -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2 class="font-display text-2xl tracking-tight text-bone uppercase {currentStep < 4 ? 'opacity-20' : ''}">
							4. Payment
						</h2>
					</div>

					{#if currentStep === 4}
						<div class="animate-fade-in flex flex-col gap-6">
							<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
								<!-- PayHere (Cards/LKR) -->
								<label
									class="flex cursor-pointer items-center justify-between border p-5 transition-all
									{selectedPaymentMethod === 'payhere' ? 'border-volt bg-charcoal/30' : 'border-charcoal hover:border-ash/40'}"
								>
									<div class="flex flex-col gap-1">
										<span class="font-display text-lg tracking-tight text-bone uppercase">Credit/Debit Card</span>
										<span class="font-mono text-[9px] text-ash uppercase">Pay securely via PayHere (LKR)</span>
									</div>
									<input type="radio" bind:group={selectedPaymentMethod} value="payhere" class="accent-volt" />
								</label>

								<!-- PayPal -->
								<label
									class="flex cursor-pointer items-center justify-between border p-5 transition-all
									{selectedPaymentMethod === 'paypal' ? 'border-volt bg-charcoal/30' : 'border-charcoal hover:border-ash/40'}"
								>
									<div class="flex flex-col gap-1">
										<span class="font-display text-lg tracking-tight text-bone uppercase">PayPal</span>
										<span class="font-mono text-[9px] text-ash uppercase">International payments (USD)</span>
									</div>
									<input type="radio" bind:group={selectedPaymentMethod} value="paypal" class="accent-volt" />
								</label>

								<!-- KOKO (Installments) -->
								<label
									class="flex cursor-pointer items-center justify-between border p-5 transition-all
									{selectedPaymentMethod === 'paykoko' ? 'border-volt bg-charcoal/30' : 'border-charcoal hover:border-ash/40'}"
								>
									<div class="flex flex-col gap-1">
										<span class="font-display text-lg tracking-tight text-bone uppercase">KOKO</span>
										<span class="font-mono text-[9px] text-ash uppercase">3 interest-free installments</span>
									</div>
									<input type="radio" bind:group={selectedPaymentMethod} value="paykoko" class="accent-volt" />
								</label>

								<!-- MintPay -->
								<label
									class="flex cursor-pointer items-center justify-between border p-5 transition-all
									{selectedPaymentMethod === 'mintpay' ? 'border-volt bg-charcoal/30' : 'border-charcoal hover:border-ash/40'}"
								>
									<div class="flex flex-col gap-1">
										<span class="font-display text-lg tracking-tight text-bone uppercase">MintPay</span>
										<span class="font-mono text-[9px] text-ash uppercase">Buy Now Pay Later in 3 payments</span>
									</div>
									<input type="radio" bind:group={selectedPaymentMethod} value="mintpay" class="accent-volt" />
								</label>

								<!-- Cash on Delivery -->
								<label
									class="flex cursor-pointer items-center justify-between border p-5 transition-all
									{selectedPaymentMethod === 'cash_on_delivery' ? 'border-volt bg-charcoal/30' : 'border-charcoal hover:border-ash/40'}"
								>
									<div class="flex flex-col gap-1">
										<span class="font-display text-lg tracking-tight text-bone uppercase">Cash On Delivery</span>
										<span class="font-mono text-[9px] text-ash uppercase">Pay when it arrives</span>
									</div>
									<input type="radio" bind:group={selectedPaymentMethod} value="cash_on_delivery" class="accent-volt" />
								</label>

								<!-- Bank Transfer -->
								<label
									class="flex cursor-pointer items-center justify-between border p-5 transition-all
									{selectedPaymentMethod === 'bank_transfer' ? 'border-volt bg-charcoal/30' : 'border-charcoal hover:border-ash/40'}"
								>
									<div class="flex flex-col gap-1">
										<span class="font-display text-lg tracking-tight text-bone uppercase">Bank Transfer</span>
										<span class="font-mono text-[9px] text-ash uppercase">Direct deposit (confirm slip later)</span>
									</div>
									<input type="radio" bind:group={selectedPaymentMethod} value="bank_transfer" class="accent-volt" />
								</label>
							</div>

							<!-- Customer note -->
							<div class="flex flex-col gap-2">
								<label for="customer-note" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
									Customer Note (Optional)
								</label>
								<textarea
									id="customer-note"
									placeholder="E.G. PLEASE CALL BEFORE ARRIVAL"
									bind:value={customerNote}
									rows="3"
									class="border border-charcoal bg-transparent p-3 font-mono text-sm text-bone uppercase outline-none focus:border-volt"
								></textarea>
							</div>
						</div>
					{/if}
				</section>

				<div class="flex flex-col gap-4 lg:flex-row">
					{#if currentStep > 1}
						<Button
							type="button"
							variant="secondary"
							class="w-full py-5 font-mono text-xs tracking-widest uppercase transition-all duration-300 lg:w-fit lg:px-12"
							onclick={() => setStep(currentStep - 1)}
						>
							← Back
						</Button>
					{/if}

					{#if currentStep < 4}
						<Button
							type="button"
							variant="primary"
							class="w-full py-5 font-mono text-xs tracking-widest uppercase transition-all duration-300 lg:w-fit lg:px-20"
							onclick={nextStep}
						>
							Continue
						</Button>
					{:else}
						<Button
							type="submit"
							variant="primary"
							disabled={isSubmitting}
							class="w-full py-5 font-mono text-xs tracking-widest uppercase transition-all duration-300 lg:w-fit lg:px-20"
						>
							{isSubmitting ? 'Processing...' : 'Complete Order →'}
						</Button>
					{/if}
				</div>
			</form>
		</div>

		<!-- Right: Order Summary (Desktop) -->
		<div class="hidden lg:block">
			<div class="sticky top-28">
				<CheckoutOrderSummary {shippingCost} />
				<div class="mt-8 flex flex-col gap-2 px-4">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
						Secure Checkout
					</span>
					<p class="font-mono text-[8px] leading-relaxed tracking-widest text-ash/40 uppercase">
						Your data is protected by industry standard encryption. By placing this order, you agree
						to our Terms of Service.
					</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.animate-fade-in {
		animation: fade-in 0.4s ease-out forwards;
	}
</style>
