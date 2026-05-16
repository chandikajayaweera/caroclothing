<script lang="ts">
	import { cartStore, cartCount, subtotal } from '$lib/client/modules/stores/cart';
	import CartItem from '$lib/components/cart/CartItem.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const freeShippingThreshold = 10000;
	let amountToFreeShipping = $derived(Math.max(0, freeShippingThreshold - $subtotal));
</script>

<svelte:head>
	<title>Bag | Caro Clothing</title>
	<meta name="description" content="Your shopping bag" />
</svelte:head>

<div class="min-h-screen bg-void px-4 pt-20 pb-32 md:px-8 lg:pt-24 lg:pb-20">
	<div class="mx-auto max-w-5xl">
		<h1 class="mb-8 font-display text-5xl text-bone uppercase md:text-6xl">Your Bag</h1>

		{#if $cartStore.items.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<span class="mb-2 font-display text-4xl text-bone">YOUR BAG IS EMPTY.</span>
				<span class="mb-8 font-mono text-xs tracking-widest text-ash uppercase">Fix that.</span>
				<Button variant="primary" href="/shop?sort=new">Shop New In →</Button>
			</div>
		{:else}
			<div class="lg:grid lg:grid-cols-[1fr_360px] lg:gap-12">
				<!-- Left: Item List -->
				<div class="flex flex-col gap-6">
					{#each $cartStore.items as item (item.id)}
						<div class="border-b border-charcoal pb-6 last:border-none">
							<CartItem {item} />
						</div>
					{/each}
				</div>

				<!-- Right: Summary -->
				<div class="mt-12 lg:mt-0">
					<div class="sticky top-24 bg-charcoal p-6">
						<h2 class="mb-6 font-mono text-xs tracking-[0.2em] text-ash uppercase">
							Order Summary
						</h2>

						{#if amountToFreeShipping > 0}
							<div
								class="mb-6 border border-charcoal bg-charcoal p-4 transition-colors hover:border-ash/10"
							>
								<div class="mb-2 flex items-center justify-between">
									<span class="font-mono text-[10px] tracking-wider text-ash uppercase">
										Add LKR {amountToFreeShipping.toLocaleString()} more for free shipping
									</span>
									<span class="font-mono text-[10px] text-ash/40"
										>{Math.round(($subtotal / freeShippingThreshold) * 100)}%</span
									>
								</div>
								<div class="h-1 overflow-hidden rounded-full bg-void">
									<div
										class="h-full bg-volt transition-all duration-500"
										style="width: {Math.min(100, ($subtotal / freeShippingThreshold) * 100)}%"
									></div>
								</div>
							</div>
						{:else}
							<div class="mb-6 border border-volt/20 bg-volt/5 p-4">
								<div class="mb-2 flex items-center justify-between">
									<span class="font-mono text-[10px] tracking-widest text-volt uppercase"
										>Free shipping unlocked</span
									>
									<span class="text-volt">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="lucide lucide-check"><path d="M20 6 9 17l-5-5" /></svg
										>
									</span>
								</div>
								<div class="h-1 rounded-full bg-volt"></div>
							</div>
						{/if}

						<div class="mb-6 space-y-3">
							<div class="flex justify-between font-mono text-sm uppercase">
								<span class="text-ash">Subtotal</span>
								<span class="text-bone">LKR {$subtotal.toLocaleString()}</span>
							</div>
							<div class="flex justify-between font-mono text-sm uppercase">
								<span class="text-ash">Shipping</span>
								<span class="text-bone">Calculated at checkout</span>
							</div>
						</div>

						<div class="mb-8 border-t border-ash/10 pt-4">
							<div class="flex justify-between font-mono text-base font-bold uppercase">
								<span class="text-bone">Total</span>
								<span class="text-bone">LKR {$subtotal.toLocaleString()}</span>
							</div>
						</div>

						<Button variant="primary" class="mb-4 w-full py-4" href="/checkout">Checkout</Button>

						<!-- Promo Code -->
						<div class="mt-6">
							<div class="flex gap-2 border-b border-ash/20 py-1">
								<input
									type="text"
									placeholder="PROMO CODE"
									class="flex-1 bg-transparent font-mono text-[10px] text-bone uppercase outline-none placeholder:text-ash/40"
								/>
								<button class="font-mono text-[10px] tracking-widest text-volt uppercase">
									Apply
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
