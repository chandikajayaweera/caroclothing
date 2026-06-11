<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import type { CheckoutBagDTO } from '$lib/server/modules/bag/bag.types';

	let {
		bagData,
		isMobile = false,
		shippingCost = 0
	}: {
		bagData: CheckoutBagDTO;
		isMobile?: boolean;
		shippingCost?: number;
	} = $props();

	let isExpanded = $state(false);
	let total = $derived(bagData.totalBeforeShipping + shippingCost);

	function money(value: number) {
		return `LKR ${value.toLocaleString()}`;
	}
</script>

<aside class="h-fit border border-charcoal bg-charcoal/20 lg:sticky lg:top-6">
	{#if isMobile}
		<button
			class="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left"
			type="button"
			aria-expanded={isExpanded}
			aria-controls="mobile-order-summary"
			onclick={() => (isExpanded = !isExpanded)}
		>
			<span
				class="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-bone uppercase"
			>
				Order summary
				<ChevronDown
					size={15}
					class="transition-transform {isExpanded ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</span>
			<strong class="font-mono text-sm text-bone">{money(total)}</strong>
		</button>
	{:else}
		<div class="border-b border-charcoal px-6 py-5">
			<h2 class="font-mono text-[10px] tracking-[0.18em] text-bone uppercase">Your order</h2>
			<p class="mt-1 font-sans text-xs text-ash">
				{bagData.itemCount} item{bagData.itemCount === 1 ? '' : 's'}
			</p>
		</div>
	{/if}

	{#if !isMobile || isExpanded}
		<div id={isMobile ? 'mobile-order-summary' : undefined} class="p-4 lg:p-6" transition:slide>
			<ul class="flex flex-col gap-4">
				{#each bagData.items as item (item.id)}
					<li class="flex gap-3">
						<div class="relative h-20 w-16 shrink-0 overflow-hidden bg-charcoal">
							<img
								src={item.imageUrl || '/placeholder.png'}
								alt={item.productName || 'Product'}
								class="h-full w-full object-cover"
							/>
							<span
								class="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center bg-void/90 px-1 font-mono text-[9px] text-bone"
								aria-label="Quantity {item.quantity}"
							>
								{item.quantity}
							</span>
						</div>
						<div class="flex min-w-0 flex-1 flex-col justify-center">
							<span class="truncate font-sans text-sm font-medium text-bone">
								{item.productName || 'Unnamed product'}
							</span>
							<span class="mt-1 font-mono text-[9px] tracking-wide text-ash uppercase">
								{item.size || 'One size'} / {item.color || 'Default'}
							</span>
							<span class="mt-2 font-mono text-xs text-bone">{money(item.lineTotal)}</span>
						</div>
					</li>
				{/each}
			</ul>

			<div class="mt-5 space-y-3 border-t border-charcoal pt-5">
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-ash">Subtotal</span>
					<span class="text-bone">{money(bagData.subtotal)}</span>
				</div>
				{#if bagData.discountAmount > 0}
					<div class="flex justify-between font-mono text-[10px] text-volt uppercase">
						<span>Discount</span>
						<span>-{money(bagData.discountAmount)}</span>
					</div>
				{/if}
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-ash">Shipping</span>
					<span class="text-bone"
						>{shippingCost === 0 ? 'Free / pending' : money(shippingCost)}</span
					>
				</div>
			</div>

			{#if bagData.promoCode}
				<div class="mt-5 border border-volt/25 bg-volt/5 p-3">
					<span class="font-mono text-[9px] tracking-[0.14em] text-ash uppercase"
						>Promo applied</span
					>
					<strong class="mt-1 block font-mono text-xs text-volt uppercase"
						>{bagData.promoCode}</strong
					>
				</div>
			{/if}

			<div class="mt-5 flex items-end justify-between border-t border-charcoal pt-5">
				<span class="font-mono text-xs font-bold text-bone uppercase">Total</span>
				<strong class="font-display text-2xl tracking-wide text-bone">{money(total)}</strong>
			</div>
		</div>
	{/if}
</aside>
