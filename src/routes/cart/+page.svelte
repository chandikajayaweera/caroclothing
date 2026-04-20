<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	let cartItems = [
		{
			id: 'item_1',
			name: 'Signature Box Tee // Black',
			size: 'L',
			price: 8500,
			quantity: 1,
			image: '/images/black_tee.png',
			href: '/shop/signature-box-tee-black'
		},
		{
			id: 'item_2',
			name: 'Oversized Hoodie // Void',
			size: 'XL',
			price: 14500,
			quantity: 1,
			image: '/images/black_tee.png',
			href: '/shop/oversized-hoodie-void'
		}
	];

	let subtotal = $derived(cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0));
	let freeShippingThreshold = 15000;
	let amountToFreeShipping = $derived(Math.max(0, freeShippingThreshold - subtotal));
	let freeShippingPercentage = $derived(Math.min(100, (subtotal / freeShippingThreshold) * 100));

	function formatPrice(val: number) {
		return new Intl.NumberFormat('en-LK', {
			style: 'currency',
			currency: 'LKR',
			minimumFractionDigits: 0
		}).format(val);
	}
</script>

<div class="min-h-screen border-t border-charcoal bg-void">
	<div
		class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:grid lg:grid-cols-12 lg:gap-x-12 lg:px-8 lg:py-20"
	>
		<!-- Cart Items Section -->
		<div class="lg:col-span-7">
			<h1 class="mb-8 font-bebas text-4xl tracking-wide text-bone uppercase sm:text-5xl">
				Your Bag <span class="ml-2 text-ash">({cartItems.length})</span>
			</h1>

			<!-- Free Shipping Progress -->
			{#if amountToFreeShipping > 0}
				<div class="mb-8 rounded-sm border border-charcoal bg-charcoal/50 p-4">
					<p class="mb-3 font-mono text-sm text-bone">
						Add <span class="text-volt">{formatPrice(amountToFreeShipping)}</span> more for free shipping
					</p>
					<div class="h-1 w-full overflow-hidden bg-void">
						<div
							class="h-full bg-volt transition-all duration-500"
							style="width: {freeShippingPercentage}%"
						></div>
					</div>
				</div>
			{:else}
				<div class="mb-8 rounded-sm border border-volt/30 bg-charcoal/50 p-4">
					<p class="flex items-center font-mono text-sm font-bold text-volt">
						<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/></svg
						>
						You unlocked free shipping!
					</p>
				</div>
			{/if}

			<div class="mb-10 divide-y divide-charcoal border-t border-charcoal">
				{#each cartItems as item}
					<div class="flex py-6">
						<a
							href={item.href}
							class="h-32 w-24 shrink-0 bg-charcoal ring-volt outline-none focus:ring-2"
						>
							<img src={item.image} alt={item.name} class="h-full w-full object-cover" />
						</a>

						<div class="ml-6 flex grow flex-col justify-between">
							<!-- Top Detail -->
							<div class="flex justify-between">
								<div>
									<a
										href={item.href}
										class="inline-block pr-4 font-bebas text-xl tracking-wide text-balance text-bone uppercase transition-colors hover:text-volt"
									>
										{item.name}
									</a>
									<p class="mt-1 font-mono text-sm text-ash">Size: {item.size}</p>
								</div>
								<div class="hidden text-right font-mono whitespace-nowrap text-bone sm:block">
									{formatPrice(item.price)}
								</div>
							</div>

							<!-- Bottom Detail -->
							<div class="mt-4 flex items-end justify-between">
								<div class="flex items-center border border-charcoal">
									<button
										class="px-3 py-1 font-mono text-bone transition-colors hover:bg-charcoal hover:text-volt"
										>—</button
									>
									<span class="min-w-[3ch] px-3 py-1 text-center font-mono text-bone"
										>{item.quantity}</span
									>
									<button
										class="px-3 py-1 font-mono text-bone transition-colors hover:bg-charcoal hover:text-volt"
										>+</button
									>
								</div>
								<div class="flex flex-col items-end">
									<!-- Mobile price -->
									<div class="mb-2 text-right font-mono text-bone sm:hidden">
										{formatPrice(item.price)}
									</div>
									<button
										class="font-mono text-xs text-ash underline decoration-charcoal underline-offset-4 hover:text-bone"
										>Remove</button
									>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Order Summary -->
		<div class="relative lg:col-span-5">
			<div class="sticky top-24 border border-charcoal bg-charcoal/30 p-6 lg:p-8">
				<h2 class="mb-6 font-bebas text-2xl tracking-wide text-bone uppercase">Summary</h2>

				<!-- Promo Code -->
				<div class="mb-8 border-b border-charcoal pb-8">
					<form class="flex font-sans text-sm" onsubmit={(e) => e.preventDefault()}>
						<input
							type="text"
							placeholder="Promo code"
							class="h-12 grow border border-charcoal bg-void px-4 py-3 text-bone uppercase placeholder:text-ash focus:border-volt focus:ring-1 focus:ring-volt focus:outline-none"
						/>
						<button
							type="submit"
							class="h-12 border-l border-charcoal bg-bone px-6 font-bebas text-lg tracking-wide text-void transition-colors hover:bg-volt hover:text-void"
							>Apply</button
						>
					</form>
				</div>

				<div class="mb-4 flex justify-between font-mono text-sm text-ash">
					<p>Subtotal</p>
					<p class="text-bone">{formatPrice(subtotal)}</p>
				</div>
				<div class="mb-8 flex justify-between font-mono text-sm text-ash">
					<p>Shipping</p>
					<p>Calculated next step</p>
				</div>

				<div class="mb-8 flex items-end justify-between border-t border-charcoal pt-6">
					<p class="font-bebas text-xl tracking-wide text-bone uppercase">Total Estimated</p>
					<p class="font-mono text-xl text-volt">{formatPrice(subtotal)}</p>
				</div>

				<Button
					variant="volt"
					href="/checkout"
					class="h-16 w-full shadow-[0_0_30px_-10px_rgba(200,255,0,0.4)]"
				>
					Checkout
				</Button>

				<p class="mt-6 text-center font-mono text-xs text-ash">
					Taxes and shipping calculated at checkout.
				</p>
			</div>
		</div>
	</div>
</div>
