<script lang="ts">
	import { bag } from '$lib/client/stores/bag.svelte';
	import { Check } from 'lucide-svelte';

	let amountToFreeShipping = $derived(
		bag.freeShippingThreshold !== null ? Math.max(0, bag.freeShippingThreshold - bag.subtotal) : 0
	);
	let freeShippingProgress = $derived(
		bag.freeShippingThreshold !== null
			? Math.min(100, (bag.subtotal / bag.freeShippingThreshold) * 100)
			: 0
	);
</script>

{#if bag.freeShippingThreshold !== null}
	{#if amountToFreeShipping > 0}
		<div class="mb-4 border border-charcoal bg-charcoal p-4 transition-colors hover:border-ash/10">
			<div class="mb-2 flex items-center justify-between">
				<span class="font-mono text-[10px] tracking-wider text-ash uppercase">
					Add LKR {amountToFreeShipping.toLocaleString()} more for free shipping
				</span>
				<span class="font-mono text-[10px] text-ash/40">
					{Math.round(freeShippingProgress)}%
				</span>
			</div>
			<div class="h-1 overflow-hidden rounded-full bg-void">
				<div
					class="h-full w-full origin-left bg-volt transition-transform duration-500 ease-out will-change-transform"
					style="transform: scaleX({freeShippingProgress / 100})"
				></div>
			</div>
		</div>
	{:else}
		<div class="mb-4 border border-volt/20 bg-volt/5 p-4">
			<div class="mb-2 flex items-center justify-between">
				<span class="font-mono text-[10px] tracking-widest text-volt uppercase"
					>Free shipping unlocked</span
				>
				<span class="text-volt">
					<Check size={12} strokeWidth={3} aria-hidden="true" />
				</span>
			</div>
			<div class="h-1 rounded-full bg-volt"></div>
		</div>
	{/if}
{/if}
