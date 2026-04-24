<script lang="ts">
	import CheckoutProgress from '$lib/components/checkout/CheckoutProgress.svelte';
	import CheckoutOrderSummary from '$lib/components/checkout/CheckoutOrderSummary.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { goto } from '$app/navigation';

	let currentStep = $state(1); // 1: Contact, 2: Delivery, 3: Shipping, 4: Payment

	const steps = ['Contact', 'Delivery', 'Shipping', 'Payment'];

	function nextStep() {
		if (currentStep < 4) currentStep++;
		else goto('/checkout/confirmation/ORD-123');
	}

	function setStep(step: number) {
		if (step < currentStep) currentStep = step;
	}
</script>

<svelte:head>
	<title>Checkout | Caro Clothing</title>
	<meta name="description" content="Checkout - Caro Clothing" />
</svelte:head>

<div class="mx-auto min-h-screen max-w-7xl bg-void px-4 pt-12 lg:px-8">
	<CheckoutProgress {currentStep} />

	<div class="pb-32 lg:mt-12 lg:grid lg:grid-cols-[1fr_400px] lg:gap-16">
		<!-- Left: Form steps -->
		<div class="flex flex-col gap-12">
			<!-- Mobile Order Summary Accordion -->
			<div class="mb-8 lg:hidden">
				<CheckoutOrderSummary isMobile={true} />
			</div>

			<div class="flex flex-col gap-10">
				<!-- STEP 1: CONTACT -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2 class="font-display text-2xl tracking-tight text-bone uppercase">1. Contact</h2>
						{#if currentStep > 1}
							<button
								class="font-mono text-[10px] tracking-widest text-ash uppercase underline hover:text-volt"
								onclick={() => setStep(1)}>Change</button
							>
						{/if}
					</div>

					{#if currentStep === 1}
						<div class="animate-fade-in flex flex-col gap-6">
							<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
								<div class="flex flex-col gap-2">
									<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
										>Phone Number (OTP)</label
									>
									<div
										class="flex border-b border-charcoal transition-colors focus-within:border-volt"
									>
										<span class="py-3 font-mono text-sm text-ash/40">+94</span>
										<input
											type="text"
											placeholder="7XXXXXXXX"
											class="flex-1 bg-transparent py-3 pl-2 font-mono text-sm text-bone outline-none placeholder:text-charcoal"
										/>
									</div>
								</div>
								<div class="flex flex-col gap-2">
									<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
										>Email (Optional)</label
									>
									<input
										type="email"
										placeholder="EMAIL@EXAMPLE.COM"
										class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase transition-colors outline-none placeholder:text-charcoal focus:border-volt"
									/>
								</div>
							</div>
						</div>
					{:else}
						<div class="flex flex-col gap-1 border border-charcoal bg-charcoal/20 p-5">
							<span class="font-mono text-sm text-bone">+94 77 123 4567</span>
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
								>KASUN@GMAIL.COM</span
							>
						</div>
					{/if}
				</section>

				<!-- STEP 2: DELIVERY -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2
							class="font-display text-2xl tracking-tight text-bone uppercase {currentStep < 2
								? 'opacity-20'
								: ''}"
						>
							2. Delivery
						</h2>
						{#if currentStep > 2}
							<button
								class="font-mono text-[10px] tracking-widest text-ash uppercase underline hover:text-volt"
								onclick={() => setStep(2)}>Change</button
							>
						{/if}
					</div>

					{#if currentStep === 2}
						<div class="animate-fade-in grid grid-cols-1 gap-8 md:grid-cols-2">
							<div class="flex flex-col gap-2">
								<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
									>Recipient Name</label
								>
								<input
									type="text"
									placeholder="KASUN MENDIS"
									class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
								/>
							</div>
							<div class="flex flex-col gap-2">
								<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
									>District</label
								>
								<select
									class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
								>
									<option value="">SELECT DISTRICT</option>
									<option value="colombo">COLOMBO</option>
									<option value="gampaha">GAMPAHA</option>
									<option value="kandy">KANDY</option>
								</select>
							</div>
							<div class="flex flex-col gap-2 md:col-span-2">
								<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
									>Shipping Address</label
								>
								<input
									type="text"
									placeholder="12 GALLE ROAD, COLOMBO 03"
									class="w-full border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
								/>
							</div>
							<div class="flex flex-col gap-2">
								<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">City</label>
								<input
									type="text"
									placeholder="COLOMBO"
									class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone uppercase outline-none placeholder:text-charcoal focus:border-volt"
								/>
							</div>
							<div class="flex flex-col gap-2">
								<label class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
									>Postal Code (Optional)</label
								>
								<input
									type="text"
									placeholder="00100"
									class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none placeholder:text-charcoal focus:border-volt"
								/>
							</div>
						</div>
					{:else if currentStep > 2}
						<div class="flex flex-col gap-1 border border-charcoal bg-charcoal/20 p-5">
							<span class="font-mono text-sm leading-relaxed text-bone uppercase">
								KASUN MENDIS<br />
								12 GALLE ROAD, COLOMBO 03
							</span>
						</div>
					{/if}
				</section>

				<!-- STEP 3: SHIPPING METHOD -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2
							class="font-display text-2xl tracking-tight text-bone uppercase {currentStep < 3
								? 'opacity-20'
								: ''}"
						>
							3. Shipping
						</h2>
						{#if currentStep > 3}
							<button
								class="font-mono text-[10px] tracking-widest text-ash uppercase underline hover:text-volt"
								onclick={() => setStep(3)}>Change</button
							>
						{/if}
					</div>

					{#if currentStep === 3}
						<div class="animate-fade-in flex flex-col gap-4">
							<label
								class="group flex cursor-pointer items-center justify-between border-2 border-bone bg-bone p-6 text-void transition-all"
							>
								<div class="flex flex-col gap-1">
									<span class="font-display text-xl tracking-tight uppercase"
										>Standard Delivery</span
									>
									<span class="font-mono text-[10px] tracking-widest text-void/40 uppercase"
										>3–5 Business Days</span
									>
								</div>
								<span class="font-mono text-lg font-bold">LKR 450</span>
								<input type="radio" name="shipping" checked class="hidden" />
							</label>
							<label
								class="group flex cursor-pointer items-center justify-between border-2 border-charcoal bg-transparent p-6 text-bone transition-all hover:border-volt"
							>
								<div class="flex flex-col gap-1">
									<span class="font-display text-xl tracking-tight uppercase">Express Shipping</span
									>
									<span class="font-mono text-[10px] tracking-widest text-ash uppercase"
										>Next Day Delivery</span
									>
								</div>
								<span class="font-mono text-lg font-bold">LKR 950</span>
								<input type="radio" name="shipping" class="hidden" />
							</label>
						</div>
					{:else if currentStep > 3}
						<div class="flex flex-col gap-1 border border-charcoal bg-charcoal/20 p-5">
							<span class="font-mono text-sm text-bone uppercase">Standard Delivery (LKR 450)</span>
						</div>
					{/if}
				</section>

				<!-- STEP 4: PAYMENT -->
				<section class="flex flex-col gap-6">
					<div class="flex items-center justify-between border-b border-charcoal pb-2">
						<h2
							class="font-display text-2xl tracking-tight text-bone uppercase {currentStep < 4
								? 'opacity-20'
								: ''}"
						>
							4. Payment
						</h2>
					</div>

					{#if currentStep === 4}
						<div
							class="animate-fade-in flex flex-col items-center justify-center gap-6 border border-dashed border-charcoal p-12 text-center"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="48"
								height="48"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-shield-check text-ash/20"
								><path
									d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
								/><path d="m9 12 2 2 4-4" /></svg
							>
							<div class="flex flex-col gap-2">
								<p class="font-mono text-[11px] font-bold tracking-widest text-bone uppercase">
									Pay securely with Credit Card or KOKO
								</p>
								<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
									You'll be redirected to complete payment
								</p>
							</div>
						</div>
					{/if}
				</section>
			</div>

			<Button
				variant="primary"
				class="w-full py-5 font-mono text-xs tracking-widest uppercase transition-all duration-300 lg:w-fit lg:px-20"
				onclick={nextStep}
			>
				{currentStep === 4 ? 'Complete Order →' : 'Continue'}
			</Button>
		</div>

		<!-- Right: Order Summary (Desktop) -->
		<div class="hidden lg:block">
			<div class="sticky top-28">
				<CheckoutOrderSummary />
				<div class="mt-8 flex flex-col gap-2 px-4">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
						>Secure Checkout</span
					>
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
