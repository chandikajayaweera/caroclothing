<script lang="ts">
	import { bag } from '$lib/client/modules/stores/bag.svelte';

	let promoInput = $state('');

	function handleApply() {
		if (!promoInput.trim()) return;
		void bag.applyPromo(promoInput);
		promoInput = '';
	}

	function handleRemove() {
		void bag.removePromo();
	}
</script>

<div class="mt-4 border-t border-charcoal/30 pt-4">
	{#if bag.promoCodeId}
		<div class="flex items-center justify-between border border-volt/20 bg-volt/5 p-3">
			<div class="flex flex-col">
				<span class="font-mono text-[9px] tracking-wider text-ash uppercase">Applied Promo</span>
				<span class="font-mono text-xs font-bold text-volt uppercase"
					>{bag.promoCode || 'Applied'}</span
				>
			</div>
			<button
				type="button"
				class="font-mono text-[10px] text-ash uppercase hover:text-bone"
				onclick={handleRemove}
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
				onkeydown={(e) => e.key === 'Enter' && handleApply()}
			/>
			<button
				type="button"
				class="font-mono text-[10px] tracking-widest text-volt uppercase"
				onclick={handleApply}
			>
				Apply
			</button>
		</div>
		{#if bag.promoError}
			<p class="mt-2 font-mono text-[9px] text-red-500 uppercase">{bag.promoError}</p>
		{/if}
	{/if}
</div>
