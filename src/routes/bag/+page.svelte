<script lang="ts">
	import { page } from '$app/state';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import BagItem from '$lib/components/bag/BagItem.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FreeShippingBar from '$lib/components/bag/FreeShippingBar.svelte';
	import PromoCodeInput from '$lib/components/bag/PromoCodeInput.svelte';
	import EmptyBag from '$lib/components/bag/EmptyBag.svelte';

	const checkoutAvailabilityError =
		'Some items cannot be checked out yet. Review their availability and try again.';
	const pageError = $derived.by(() => {
		const error = page.url.searchParams.get('error');
		if (
			error === checkoutAvailabilityError &&
			!bag.hasReservedItems &&
			!bag.hasUnavailableItems &&
			!bag.hasInsufficientItems
		) {
			return null;
		}
		return error;
	});

	function autoStartCheckout(form: HTMLFormElement) {
		if (page.url.searchParams.get('checkout') === 'start' && page.data.user) {
			form.requestSubmit();
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
			<div class="py-20">
				<EmptyBag />
			</div>
		{:else}
			<div class="lg:grid lg:grid-cols-[1fr_360px] lg:gap-12">
				<!-- Left: Item List -->
				<div class="flex flex-col gap-6">
					{#each bag.items as item (item.id)}
						<div class="border-b border-charcoal pb-6 last:border-none">
							<BagItem {item} />
						</div>
					{/each}
				</div>

				<!-- Right: Summary -->
				<div class="mt-12 lg:mt-0">
					<div class="sticky top-24 bg-charcoal p-6">
						<h2 class="mb-6 font-mono text-xs tracking-[0.2em] text-ash uppercase">
							Order Summary
						</h2>

						<FreeShippingBar />

						<div class="mb-6 space-y-3">
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
						{#if bag.hasInsufficientItems}
							<p class="font-mono text-[10px] text-amber-300 uppercase">
								Reduce quantities to the available stock before checkout.
							</p>
						{/if}
						{#if bag.hasReservedItems || bag.hasUnavailableItems || bag.hasInsufficientItems}
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
						<PromoCodeInput />
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
