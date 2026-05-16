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
		class="fixed inset-0 z-[54] hidden bg-void/50 md:block"
		transition:fade={{ duration: 250 }}
		onclick={closeCartDrawer}
		onkeydown={(e) => e.key === 'Escape' && closeCartDrawer()}
		role="button"
		tabindex="0"
		aria-label="Close bag"
	></div>

	<!-- Drawer -->
	<div
		class="fixed top-0 right-0 z-[55] hidden h-full w-[420px] flex-col border-l border-charcoal bg-void md:flex"
		transition:fly={{ x: 420, duration: 250 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-charcoal px-6 py-5">
			<div>
				<span class="font-display text-3xl text-bone uppercase">Your Bag</span>
				<span class="ml-2 font-mono text-xs text-ash">({$cartCount})</span>
			</div>
			<button class="text-2xl font-light text-ash hover:text-bone" onclick={closeCartDrawer}>
				×
			</button>
		</div>

		<!-- Free shipping bar -->
		<div class="bg-charcoal px-6 py-3">
			<div class="mb-1.5 flex items-center justify-between">
				{#if amountToFreeShipping > 0}
					<span class="font-mono text-[10px] text-ash uppercase">
						Add LKR {amountToFreeShipping.toLocaleString()} more for free shipping
					</span>
				{:else}
					<span class="font-mono text-[10px] text-volt uppercase">Free shipping unlocked</span>
				{/if}
			</div>
			<div class="h-[2px] overflow-hidden rounded-full bg-ash/20">
				<div
					class="h-full bg-volt transition-all duration-500"
					style="width: {freeShippingProgress}%"
				></div>
			</div>
		</div>

		<!-- Item list -->
		<div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if $cartStore.items.length === 0}
				<div class="flex h-full flex-col items-center justify-center text-center">
					<span class="mb-2 font-display text-3xl text-bone">Your bag is empty.</span>
					<span class="mb-6 font-mono text-xs tracking-widest text-ash uppercase">Fix that.</span>
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
			<div class="border-t border-charcoal px-6 py-5">
				<div class="mb-4 flex justify-between font-mono text-sm uppercase">
					<span class="text-ash">Subtotal</span>
					<span class="text-bone">LKR {$subtotal.toLocaleString()}</span>
				</div>
				<Button variant="primary" class="w-full" href="/checkout">Checkout</Button>
				<a
					href="/bag"
					class="mt-3 block text-center font-mono text-[10px] tracking-widest text-ash uppercase hover:text-bone"
					onclick={closeCartDrawer}
				>
					View Bag →
				</a>
			</div>
		{/if}
	</div>
{/if}
