<script lang="ts">
	import { page } from '$app/state';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import BagItem from '$lib/components/bag/BagItem.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { BagDTO } from '$lib/server/modules/bag/bag.types';

	let amountToFreeShipping = $derived(
		bag.freeShippingThreshold !== null ? Math.max(0, bag.freeShippingThreshold - bag.subtotal) : 0
	);

	let promoInput = $state('');
	let promoError = $state('');
	const checkoutAvailabilityError =
		'Some items cannot be checked out yet. Review their availability and try again.';
	const pageError = $derived.by(() => {
		const error = page.url.searchParams.get('error');
		if (error === checkoutAvailabilityError && !bag.hasReservedItems && !bag.hasUnavailableItems) {
			return null;
		}
		return error;
	});

	function autoStartCheckout(form: HTMLFormElement) {
		if (page.url.searchParams.get('checkout') === 'start' && page.data.user) {
			form.requestSubmit();
		}
	}

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

<svelte:head>
	<title>Bag | Caro Clothing</title>
	<meta name="description" content="Your shopping bag" />
</svelte:head>

<div class="min-h-screen bg-void px-4 pt-20 pb-32 md:px-8 lg:pt-24 lg:pb-20">
	<div class="mx-auto max-w-5xl">
		<h1 class="mb-8 font-display text-5xl text-bone uppercase md:text-6xl">Your Bag</h1>

		{#if pageError}
			<div class="mb-6 border border-red-500 bg-red-950/20 p-4 font-mono text-xs text-red-400">
				{pageError}
			</div>
		{/if}

		{#if bag.items.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<span class="mb-2 font-display text-4xl text-bone">YOUR BAG IS EMPTY.</span>
				<span class="mb-8 font-mono text-xs tracking-widest text-ash/50 uppercase">Fix that.</span>
				<Button variant="primary" href="/shop?sort=new">Shop New In →</Button>
			</div>
		{:else}
			<div class="lg:grid lg:grid-cols-[1fr_360px] lg:gap-12">
				<!-- Left: Item List -->
				<div class="flex flex-col gap-6">
					{#each bag.items as item (item.id)}
						<div class="border-b border-charcoal pb-6 last:border-none">
							{#key `${item.availabilityStatus}:${item.reservationExpiresAt ?? ''}`}
								<BagItem {item} />
							{/key}
						</div>
					{/each}
				</div>

				<!-- Right: Summary -->
				<div class="mt-12 lg:mt-0">
					<div class="sticky top-24 bg-charcoal p-6">
						<h2 class="mb-6 font-mono text-xs tracking-[0.2em] text-ash uppercase">
							Order Summary
						</h2>

						{#if bag.freeShippingThreshold !== null}
							{#if amountToFreeShipping > 0}
								<div
									class="mb-6 border border-charcoal bg-charcoal p-4 transition-colors hover:border-ash/10"
								>
									<div class="mb-2 flex items-center justify-between">
										<span class="font-mono text-[10px] tracking-wider text-ash uppercase">
											Add LKR {amountToFreeShipping.toLocaleString()} more for free shipping
										</span>
										<span class="font-mono text-[10px] text-ash/40"
											>{Math.round((bag.subtotal / bag.freeShippingThreshold) * 100)}%</span
										>
									</div>
									<div class="h-1 overflow-hidden rounded-full bg-void">
										<div
											class="h-full bg-volt transition-all duration-500"
											style="width: {Math.min(
												100,
												(bag.subtotal / bag.freeShippingThreshold) * 100
											)}%"
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
						{/if}

						<div class="mb-6 space-y-3">
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
							<div class="flex justify-between font-mono text-sm uppercase">
								<span class="text-ash">Shipping</span>
								<span class="text-bone">Calculated at checkout</span>
							</div>
						</div>

						<div class="mb-8 border-t border-ash/10 pt-4">
							<div class="flex justify-between font-mono text-base font-bold uppercase">
								<span class="text-bone">Total</span>
								<span class="text-bone">LKR {bag.totalBeforeShipping.toLocaleString()}</span>
							</div>
						</div>

						{#if bag.hasReservedItems}
							<div
								class="mb-4 border border-amber-400/40 bg-amber-950/20 p-4 font-mono text-xs text-amber-300"
							>
								Stock is held by another checkout. If that checkout expires, availability updates
								automatically and you can try again.
							</div>
						{/if}
						{#if bag.hasUnavailableItems}
							<div
								class="mb-4 border border-red-500 bg-red-950/20 p-4 font-mono text-xs text-red-400"
							>
								One or more items in your bag are out of stock. Remove them to checkout.
							</div>
						{/if}
						{#if bag.hasReservedItems || bag.hasUnavailableItems}
							<Button
								variant="primary"
								class="mb-4 w-full cursor-not-allowed py-4 opacity-50"
								disabled={true}
							>
								{bag.hasReservedItems ? 'Waiting for stock' : 'Checkout'}
							</Button>
						{:else}
							<form method="POST" action="?/startCheckout" {@attach autoStartCheckout}>
								<Button type="submit" variant="primary" class="mb-4 w-full py-4">Checkout</Button>
							</form>
						{/if}

						<!-- Promo Code -->
						<div class="mt-6">
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
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
