<script lang="ts">
	import { cart } from '$lib/client/modules/stores/cart.svelte';
	import { slide } from 'svelte/transition';

	let { isMobile = false, shippingCost = 0 } = $props();
	let isExpanded = $state(false);
</script>

<aside class="h-fit border border-charcoal bg-charcoal/20 p-4 lg:sticky lg:top-6 lg:p-6">
	{#if isMobile}
		<!-- Mobile Accordion -->
		<button
			class="flex w-full items-center justify-between py-2"
			type="button"
			onclick={() => (isExpanded = !isExpanded)}
		>
			<span class="font-mono text-xs tracking-widest text-bone uppercase">
				Order Summary {isExpanded ? '−' : '+'}
			</span>
			<span class="font-mono text-sm font-bold text-bone">
				LKR {(cart.totalBeforeShipping + shippingCost).toLocaleString()}
			</span>
		</button>
	{:else}
		<h2 class="mb-6 font-mono text-xs tracking-[0.2em] text-bone uppercase">Order Summary</h2>
	{/if}

	{#if !isMobile || isExpanded}
		<div class="mt-4 flex flex-col gap-4" transition:slide>
			<!-- Item list -->
			<div class="flex flex-col gap-3">
				{#each cart.items as item}
					<div class="flex gap-3">
						<div class="relative h-16 w-12 shrink-0 overflow-hidden bg-charcoal/50">
							<img src={item.imageUrl || '/placeholder.png'} alt={item.productName || 'Product'} class="h-full w-full object-cover" />
							<div
								class="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-bone font-mono text-[8px] text-void"
							>
								{item.quantity}
							</div>
						</div>
						<div class="flex min-w-0 flex-1 flex-col justify-center">
							<span class="truncate font-sans text-xs font-medium text-bone uppercase"
								>{item.productName || 'Unnamed'}</span
							>
							<span class="font-mono text-[9px] text-ash uppercase">{item.size || ''} · {item.color || ''}</span
							>
						</div>
						<div class="flex items-center">
							<span class="font-mono text-xs text-bone"
								>LKR {(item.lineTotal).toLocaleString()}</span
							>
						</div>
					</div>
				{/each}
			</div>

			<!-- Calculations -->
			<div class="space-y-2 border-t border-charcoal pt-4">
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-ash">Subtotal</span>
					<span class="text-bone">LKR {cart.subtotal.toLocaleString()}</span>
				</div>
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-ash">Shipping</span>
					<span class="text-bone">LKR {shippingCost.toLocaleString()}</span>
				</div>
				{#if cart.discountAmount > 0}
					<div
						class="flex justify-between bg-volt/10 p-1 px-2 font-mono text-[10px] text-volt uppercase"
					>
						<span>Discount</span>
						<span>− LKR {cart.discountAmount.toLocaleString()}</span>
					</div>
				{/if}
			</div>

			<div class="border-t border-charcoal pt-4">
				<div class="flex justify-between font-mono text-sm font-bold uppercase">
					<span class="text-bone">Total</span>
					<span class="text-bone"
						>LKR {(cart.totalBeforeShipping + shippingCost).toLocaleString()}</span
					>
				</div>
			</div>
		</div>
	{/if}
</aside>
