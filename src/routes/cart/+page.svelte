<script lang="ts">
	import { cartStore, cartCount, subtotal } from '$lib/stores/cart';
	import CartItem from '$lib/components/cart/CartItem.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const freeShippingThreshold = 10000;
	let amountToFreeShipping = $derived(Math.max(0, freeShippingThreshold - $subtotal));
</script>

<div class="min-h-screen bg-void pt-20 pb-32 px-4 md:px-8 lg:pt-24 lg:pb-20">
	<div class="max-w-5xl mx-auto">
		<h1 class="font-display text-5xl md:text-6xl text-bone mb-8 uppercase">Your Bag</h1>

		{#if $cartStore.items.length === 0}
			<div class="py-20 flex flex-col items-center justify-center text-center">
				<span class="font-display text-4xl text-bone mb-2">YOUR BAG IS EMPTY.</span>
				<span class="font-mono text-xs text-ash mb-8 uppercase tracking-widest">Fix that.</span>
				<Button variant="primary" href="/shop?sort=new">
					Shop New In →
				</Button>
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
					<div class="bg-charcoal p-6 sticky top-24">
						<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em] mb-6">Order Summary</h2>
						
						{#if amountToFreeShipping > 0}
							<div class="bg-void/40 p-3 mb-6">
								<p class="font-mono text-[10px] text-ash uppercase">
									Add LKR {amountToFreeShipping.toLocaleString()} more for free shipping
								</p>
							</div>
						{:else}
							<div class="bg-volt/10 p-3 mb-6">
								<p class="font-mono text-[10px] text-volt uppercase">Free shipping unlocked</p>
							</div>
						{/if}

						<div class="space-y-3 mb-6">
							<div class="flex justify-between font-mono text-sm uppercase">
								<span class="text-ash">Subtotal</span>
								<span class="text-bone">LKR {$subtotal.toLocaleString()}</span>
							</div>
							<div class="flex justify-between font-mono text-sm uppercase">
								<span class="text-ash">Shipping</span>
								<span class="text-bone">Calculated at checkout</span>
							</div>
						</div>

						<div class="border-t border-ash/10 pt-4 mb-8">
							<div class="flex justify-between font-mono text-base font-bold uppercase">
								<span class="text-bone">Total</span>
								<span class="text-bone">LKR {$subtotal.toLocaleString()}</span>
							</div>
						</div>

						<Button variant="primary" class="w-full py-4 mb-4" href="/checkout">
							Checkout
						</Button>

						<!-- Promo Code -->
						<div class="mt-6">
							<div class="flex gap-2 border-b border-ash/20 py-1">
								<input
									type="text"
									placeholder="PROMO CODE"
									class="flex-1 bg-transparent font-mono text-[10px] text-bone placeholder:text-ash/40 outline-none uppercase"
								/>
								<button class="font-mono text-[10px] text-volt uppercase tracking-widest">
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
