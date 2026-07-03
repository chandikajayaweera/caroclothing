<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { uiStore, closeBagDrawer } from '$lib/client/modules/stores/ui';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { resolve } from '$app/paths';
	import type { BagDTO } from '$lib/server/modules/bag/bag.types';
	import BagItem from './BagItem.svelte';
	import Button from '../ui/Button.svelte';

	let amountToFreeShipping = $derived(
		bag.freeShippingThreshold !== null ? Math.max(0, bag.freeShippingThreshold - bag.subtotal) : 0
	);
	let freeShippingProgress = $derived(
		bag.freeShippingThreshold !== null
			? Math.min(100, (bag.subtotal / bag.freeShippingThreshold) * 100)
			: 0
	);

	let promoInput = $state('');
	let promoError = $state('');

	async function applyPromo() {
		if (!promoInput.trim()) return;
		promoError = '';
		try {
			const res = await fetch('/api/bag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'applyPromo', code: promoInput })
			});
			if (res.ok) {
				const updated = (await res.json()) as BagDTO;
				bag.setBag(updated);
				promoInput = '';
			} else {
				const errData = (await res.json()) as { message?: string };
				promoError = errData?.message || 'Invalid promo code';
			}
		} catch (err) {
			promoError = 'Failed to apply promo';
			console.error(err);
		}
	}

	async function removePromo() {
		try {
			const res = await fetch('/api/bag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'removePromo' })
			});
			if (res.ok) {
				const updated = (await res.json()) as BagDTO;
				bag.setBag(updated);
			}
		} catch (err) {
			console.error(err);
		}
	}
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
		{#if bag.freeShippingThreshold !== null}
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
						class="h-full w-full origin-left bg-volt transition-transform duration-500 ease-out will-change-transform"
						style="transform: scaleX({freeShippingProgress / 100})"
					></div>
				</div>
			</div>
		{/if}

		<!-- Item list -->
		<div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if bag.items.length === 0}
				<div class="flex h-full flex-col items-center justify-center text-center">
					<span class="mb-2 font-display text-3xl text-bone">Your bag is empty.</span>
					<span class="mb-6 font-mono text-xs tracking-widest text-ash/50 uppercase">Fix that.</span
					>
					<Button variant="primary" onclick={closeBagDrawer} href="/shop?sort=new">
						Shop New In →
					</Button>
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
					{#if bag.discountAmount > 0}
						<div class="flex justify-between font-mono text-sm text-volt uppercase">
							<span>Promo Discount</span>
							<span>- LKR {bag.discountAmount.toLocaleString()}</span>
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
				<div class="mt-4 border-t border-charcoal/30 pt-4">
					{#if bag.promoCodeId}
						<div class="flex items-center justify-between border border-volt/20 bg-volt/5 p-3">
							<div class="flex flex-col">
								<span class="font-mono text-[9px] tracking-wider text-ash uppercase"
									>Applied Promo</span
								>
								<span class="font-mono text-xs font-bold text-volt uppercase"
									>{bag.promoCode || 'Applied'}</span
								>
							</div>
							<button
								type="button"
								class="font-mono text-[10px] text-ash uppercase hover:text-bone"
								onclick={removePromo}
							>
								Remove
							</button>
						</div>
					{:else}
						<div class="flex gap-2 border-b border-ash/20 py-1">
							<input
								type="text"
								bind:value={promoInput}
								placeholder="PROMO CODE"
								class="flex-1 bg-transparent font-mono text-[10px] text-bone uppercase outline-none placeholder:text-ash/40"
								onkeydown={(e) => e.key === 'Enter' && applyPromo()}
							/>
							<button
								type="button"
								class="font-mono text-[10px] tracking-widest text-volt uppercase"
								onclick={applyPromo}
							>
								Apply
							</button>
						</div>
						{#if promoError}
							<p class="mt-2 font-mono text-[9px] text-red-500 uppercase">{promoError}</p>
						{/if}
					{/if}
				</div>

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
