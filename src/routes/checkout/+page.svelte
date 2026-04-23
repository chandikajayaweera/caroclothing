<script lang="ts">
	import CheckoutProgress from '$lib/components/checkout/CheckoutProgress.svelte';
	import CheckoutOrderSummary from '$lib/components/checkout/CheckoutOrderSummary.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { goto } from '$app/navigation';

	let currentStep = $state(1);

	const steps = ['Contact', 'Address', 'Shipping', 'Payment'];

	function nextStep() {
		if (currentStep < 4) currentStep++;
		else goto('/checkout/confirmation/ORD-123');
	}
</script>

<div class="max-w-7xl mx-auto px-4 lg:px-8">
	<CheckoutProgress {currentStep} />

	<div class="lg:grid lg:grid-cols-[1fr_380px] lg:gap-16 lg:mt-8 pb-20">
		<!-- Left: Form steps -->
		<div class="flex flex-col gap-10">
			<!-- Mobile Order Summary Accordion -->
			<div class="lg:hidden">
				<CheckoutOrderSummary isMobile={true} />
			</div>

			<div class="flex flex-col gap-6">
				{#if currentStep === 1}
					<section class="flex flex-col gap-4">
						<span class="font-mono text-[9px] text-void/40 uppercase tracking-widest">Contact Information</span>
						<div class="flex flex-col gap-1">
							<input
								type="text"
								placeholder="PHONE NUMBER"
								class="bg-transparent border-b border-void/30 py-3 font-mono text-sm text-void placeholder:text-void/30 outline-none focus:border-void"
							/>
							<p class="font-mono text-[9px] text-void/40 uppercase tracking-widest mt-1">
								We'll text you order updates
							</p>
						</div>
					</section>
				{:else}
					<section class="flex flex-col gap-4">
						<div class="flex justify-between items-center">
							<span class="font-mono text-[9px] text-void/40 uppercase tracking-widest">Contact</span>
							<button class="font-mono text-[9px] text-void/60 underline uppercase" onclick={() => currentStep = 1}>Edit</button>
						</div>
						<div class="bg-void/5 p-4 font-mono text-xs text-void uppercase">
							+94 77 123 4567
						</div>
					</section>
				{/if}

				{#if currentStep === 2}
					<section class="flex flex-col gap-4">
						<span class="font-mono text-[9px] text-void/40 uppercase tracking-widest">Shipping Address</span>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<input type="text" placeholder="RECIPIENT NAME" class="bg-transparent border-b border-void/30 py-3 font-mono text-sm text-void placeholder:text-void/30 outline-none focus:border-void" />
							<input type="text" placeholder="CITY" class="bg-transparent border-b border-void/30 py-3 font-mono text-sm text-void placeholder:text-void/30 outline-none focus:border-void" />
							<div class="md:col-span-2">
								<input type="text" placeholder="ADDRESS LINE 1" class="bg-transparent border-b border-void/30 py-3 w-full font-mono text-sm text-void placeholder:text-void/30 outline-none focus:border-void" />
							</div>
							<select class="bg-transparent border-b border-void/30 py-3 font-mono text-sm text-void outline-none focus:border-void">
								<option value="">SELECT DISTRICT</option>
								<option value="colombo">COLOMBO</option>
								<option value="gampaha">GAMPAHA</option>
								<option value="kandy">KANDY</option>
							</select>
						</div>
					</section>
				{:else if currentStep > 2}
					<section class="flex flex-col gap-4">
						<div class="flex justify-between items-center">
							<span class="font-mono text-[9px] text-void/40 uppercase tracking-widest">Shipping Address</span>
							<button class="font-mono text-[9px] text-void/60 underline uppercase" onclick={() => currentStep = 2}>Edit</button>
						</div>
						<div class="bg-void/5 p-4 font-mono text-xs text-void uppercase leading-relaxed">
							KASUN MENDIS<br/>
							12 GALLE ROAD, COLOMBO 03
						</div>
					</section>
				{/if}

				{#if currentStep === 3}
					<section class="flex flex-col gap-4">
						<span class="font-mono text-[9px] text-void/40 uppercase tracking-widest">Shipping Method</span>
						<div class="flex flex-col gap-3">
							<label class="flex items-center justify-between p-4 border-2 border-void cursor-pointer">
								<div class="flex flex-col gap-1">
									<span class="font-sans text-sm font-medium text-void uppercase">Standard Shipping</span>
									<span class="font-mono text-[10px] text-void/60 uppercase">3–5 Business Days</span>
								</div>
								<span class="font-mono text-sm text-void">LKR 450</span>
								<input type="radio" name="shipping" checked class="hidden" />
							</label>
							<label class="flex items-center justify-between p-4 border-2 border-void/20 cursor-pointer hover:border-void/40">
								<div class="flex flex-col gap-1">
									<span class="font-sans text-sm font-medium text-void uppercase">Express Delivery</span>
									<span class="font-mono text-[10px] text-void/60 uppercase">1–2 Business Days</span>
								</div>
								<span class="font-mono text-sm text-void">LKR 950</span>
								<input type="radio" name="shipping" class="hidden" />
							</label>
						</div>
					</section>
				{/if}

				{#if currentStep === 4}
					<section class="flex flex-col gap-4">
						<span class="font-mono text-[9px] text-void/40 uppercase tracking-widest">Payment</span>
						<div class="p-8 border border-void/20 flex flex-col items-center justify-center text-center gap-4">
							<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card text-void/20"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
							<p class="font-mono text-[10px] text-void/40 uppercase tracking-widest">
								Secure payment integration goes here
							</p>
						</div>
					</section>
				{/if}
			</div>

			<Button
				variant="primary"
				class="w-full lg:w-fit lg:px-12 py-4 bg-void text-bone hover:bg-void/80"
				onclick={nextStep}
			>
				{currentStep === 4 ? 'Place Order' : 'Continue'}
			</Button>
		</div>

		<!-- Right: Order Summary (Desktop) -->
		<div class="hidden lg:block">
			<CheckoutOrderSummary />
		</div>
	</div>
</div>
