<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { uiStore, closeCartDrawer } from '$lib/client/modules/stores/ui';
	import { cartStore, cartCount, subtotal } from '$lib/client/modules/stores/cart';
	import CartItem from './CartItem.svelte';
	import Button from '../ui/Button.svelte';

	const freeShippingThreshold = 10000;
	let amountToFreeShipping = $derived(Math.max(0, freeShippingThreshold - $subtotal));
	let freeShippingProgress = $derived(Math.min(100, ($subtotal / freeShippingThreshold) * 100));
</script>

{#if $uiStore.cartDrawerOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-void/50 z-[54] hidden md:block"
		transition:fade={{ duration: 250 }}
		onclick={closeCartDrawer}
		onkeydown={(e) => e.key === 'Escape' && closeCartDrawer()}
		role="button"
		tabindex="0"
		aria-label="Close cart"
	></div>

	<!-- Drawer -->
	<div
		class="fixed top-0 right-0 h-full w-[420px] bg-void border-l border-charcoal z-[55] hidden md:flex flex-col"
		transition:fly={{ x: 420, duration: 250 }}
	>
		<!-- Header -->
		<div class="px-6 py-5 border-b border-charcoal flex justify-between items-center">
			<div>
				<span class="font-display text-3xl text-bone uppercase">Your Bag</span>
				<span class="font-mono text-xs text-ash ml-2">({$cartCount})</span>
			</div>
			<button class="text-ash hover:text-bone text-2xl font-light" onclick={closeCartDrawer}>
				×
			</button>
		</div>

		<!-- Free shipping bar -->
		<div class="px-6 py-3 bg-charcoal">
			<div class="flex justify-between items-center mb-1.5">
				{#if amountToFreeShipping > 0}
					<span class="font-mono text-[10px] text-ash uppercase">
						Add LKR {amountToFreeShipping.toLocaleString()} more for free shipping
					</span>
				{:else}
					<span class="font-mono text-[10px] text-volt uppercase">Free shipping unlocked</span>
				{/if}
			</div>
			<div class="h-[2px] bg-ash/20 rounded-full overflow-hidden">
				<div
					class="h-full bg-volt transition-all duration-500"
					style="width: {freeShippingProgress}%"
				></div>
			</div>
		</div>

		<!-- Item list -->
		<div class="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
			{#if $cartStore.items.length === 0}
				<div class="h-full flex flex-col items-center justify-center text-center">
					<span class="font-display text-3xl text-bone mb-2">Your bag is empty.</span>
					<span class="font-mono text-xs text-ash mb-6 uppercase tracking-widest">Fix that.</span>
					<Button variant="primary" onclick={closeCartDrawer} href="/shop?sort=new">
						Shop New In →
					</Button>
				</div>
			{:else}
				{#each $cartStore.items as item (item.id)}
					<CartItem {item} />
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		{#if $cartStore.items.length > 0}
			<div class="px-6 py-5 border-t border-charcoal">
				<div class="flex justify-between font-mono text-sm mb-4 uppercase">
					<span class="text-ash">Subtotal</span>
					<span class="text-bone">LKR {$subtotal.toLocaleString()}</span>
				</div>
				<Button variant="primary" class="w-full" href="/checkout">
					Checkout
				</Button>
				<a
					href="/cart"
					class="font-mono text-[10px] text-ash text-center block mt-3 hover:text-bone uppercase tracking-widest"
					onclick={closeCartDrawer}
				>
					View Bag →
				</a>
			</div>
		{/if}
	</div>
{/if}
