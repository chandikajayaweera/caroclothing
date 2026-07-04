<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { uiStore, closeBagDrawer } from '$lib/client/modules/stores/ui';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { resolve } from '$app/paths';
	import BagItem from './BagItem.svelte';
	import Button from '../ui/Button.svelte';
	import FreeShippingBar from './FreeShippingBar.svelte';
	import PromoCodeInput from './PromoCodeInput.svelte';
	import EmptyBag from './EmptyBag.svelte';
</script>

{#if $uiStore.bagDrawerOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[54] hidden bg-void/50 md:block"
		transition:fade={{ duration: 250 }}
		onclick={closeBagDrawer}
		onkeydown={(e) => e.key === 'Escape' && closeBagDrawer()}
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
				<span class="ml-2 font-mono text-xs text-ash">({bag.count})</span>
			</div>
			<button class="text-2xl font-light text-ash hover:text-bone" onclick={closeBagDrawer}>
				×
			</button>
		</div>

		<!-- Free shipping bar -->
		<div class="px-6 pt-4">
			<FreeShippingBar />
		</div>

		<!-- Item list -->
		<div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if bag.items.length === 0}
				<div class="flex h-full flex-col items-center justify-center">
					<EmptyBag onShopClick={closeBagDrawer} />
				</div>
			{:else}
				{#each bag.items as item (item.id)}
					<BagItem {item} />
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		{#if bag.items.length > 0}
			<div class="border-t border-charcoal px-6 py-5">
				<div class="mb-4 space-y-3">
					<div class="flex justify-between font-mono text-sm uppercase">
						<span class="text-ash">Subtotal</span>
						<span class="text-bone">LKR {bag.subtotal.toLocaleString()}</span>
					</div>
					{#if bag.effectiveDiscountAmount > 0}
						<div class="flex justify-between font-mono text-sm text-volt uppercase">
							<span>Promo Discount</span>
							<span>- LKR {bag.effectiveDiscountAmount.toLocaleString()}</span>
						</div>
					{/if}
				</div>

				{#if bag.hasReservedItems}
					<p class="mb-3 font-mono text-[9px] text-amber-400 uppercase">
						Stock held by another checkout. Availability refreshes automatically.
					</p>
				{/if}
				{#if bag.hasUnavailableItems}
					<p class="mb-3 font-mono text-[9px] text-red-400 uppercase">
						Remove out-of-stock items to checkout
					</p>
				{/if}
				{#if bag.hasReservedItems || bag.hasUnavailableItems}
					<Button variant="primary" class="w-full cursor-not-allowed opacity-50" disabled={true}
						>{bag.hasReservedItems ? 'Waiting for stock' : 'Checkout'}</Button
					>
				{:else}
					<form method="POST" action="/bag?/startCheckout" onsubmit={closeBagDrawer}>
						<Button type="submit" variant="primary" class="w-full">Checkout</Button>
					</form>
				{/if}

				<!-- Coupon Input / Display -->
				<PromoCodeInput />

				<a
					href={resolve('/bag')}
					class="mt-4 block text-center font-mono text-[10px] tracking-widest text-ash uppercase hover:text-bone"
					onclick={closeBagDrawer}
				>
					View Bag →
				</a>
			</div>
		{/if}
	</div>
{/if}
