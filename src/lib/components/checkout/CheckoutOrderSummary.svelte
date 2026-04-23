<script lang="ts">
	import { cartStore, subtotal } from '$lib/stores/cart';
	import { slide } from 'svelte/transition';

	let { isMobile = false } = $props();
	let isExpanded = $state(false);

	const shipping = 450;
</script>

<aside class="bg-void/5 md:bg-void/5 p-4 lg:p-6 lg:sticky lg:top-6 h-fit">
	{#if isMobile}
		<!-- Mobile Accordion -->
		<button
			class="w-full flex justify-between items-center py-2"
			onclick={() => (isExpanded = !isExpanded)}
		>
			<span class="font-mono text-xs text-void uppercase tracking-widest">
				Order Summary {isExpanded ? '−' : '+'}
			</span>
			<span class="font-mono text-sm text-void font-bold">
				LKR {($subtotal + shipping).toLocaleString()}
			</span>
		</button>
	{:else}
		<h2 class="font-mono text-xs text-void uppercase tracking-[0.2em] mb-6">Order Summary</h2>
	{/if}

	{#if !isMobile || isExpanded}
		<div class="flex flex-col gap-4 mt-4" transition:slide>
			<!-- Item list -->
			<div class="flex flex-col gap-3">
				{#each $cartStore.items as item}
					<div class="flex gap-3">
						<div class="relative w-12 h-16 overflow-hidden flex-shrink-0">
							<img src={item.image} alt={item.name} class="w-full h-full object-cover" />
							<div class="absolute -top-1.5 -right-1.5 bg-void text-bone font-mono text-[8px] w-4 h-4 rounded-full flex items-center justify-center">
								{item.quantity}
							</div>
						</div>
						<div class="flex-1 flex flex-col justify-center min-w-0">
							<span class="font-sans text-xs font-medium text-void truncate uppercase">{item.name}</span>
							<span class="font-mono text-[9px] text-void/40 uppercase">{item.size} · {item.color}</span>
						</div>
						<div class="flex items-center">
							<span class="font-mono text-xs text-void">LKR {(item.unitPrice * item.quantity).toLocaleString()}</span>
						</div>
					</div>
				{/each}
			</div>

			<!-- Calculations -->
			<div class="border-t border-void/10 pt-4 space-y-2">
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-void/60">Subtotal</span>
					<span class="text-void">LKR {$subtotal.toLocaleString()}</span>
				</div>
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-void/60">Shipping</span>
					<span class="text-void">LKR {shipping.toLocaleString()}</span>
				</div>
				{#if $cartStore.discountAmount > 0}
					<div class="flex justify-between font-mono text-[10px] uppercase text-volt bg-void p-1 px-2">
						<span>Discount</span>
						<span>− LKR {$cartStore.discountAmount.toLocaleString()}</span>
					</div>
				{/if}
			</div>

			<div class="border-t border-void/10 pt-4">
				<div class="flex justify-between font-mono text-sm font-bold uppercase">
					<span class="text-void">Total</span>
					<span class="text-void">LKR {($subtotal + shipping - $cartStore.discountAmount).toLocaleString()}</span>
				</div>
			</div>
		</div>
	{/if}
</aside>
