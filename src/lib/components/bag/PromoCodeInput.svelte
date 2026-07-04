<script lang="ts">
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { Loader2 } from 'lucide-svelte';

	let promoInput = $state('');

	async function handleApply() {
		if (!promoInput.trim() || bag.isApplyingPromo || bag.isRemovingPromo) return;
		const codeToApply = promoInput;
		await bag.applyPromo(codeToApply);
		if (!bag.promoError) {
			promoInput = '';
		}
	}

	async function handleRemove() {
		if (bag.isApplyingPromo || bag.isRemovingPromo) return;
		await bag.removePromo();
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
				class="inline-flex items-center gap-1.5 font-mono text-[10px] text-ash uppercase transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-50"
				onclick={handleRemove}
				disabled={bag.isRemovingPromo || bag.isApplyingPromo}
			>
				{#if bag.isRemovingPromo}
					<Loader2 size={12} class="animate-spin text-ash" aria-hidden="true" />
					<span>REMOVING...</span>
				{:else}
					<span>Remove</span>
				{/if}
			</button>
		</div>
	{:else}
		<div class="flex gap-2 border-b border-ash/20 py-1">
			<input
				type="text"
				bind:value={promoInput}
				placeholder="PROMO CODE"
				disabled={bag.isApplyingPromo || bag.isRemovingPromo}
				class="flex-1 bg-transparent font-mono text-[10px] text-bone uppercase outline-none placeholder:text-ash/40 disabled:opacity-50"
				onkeydown={(e) => e.key === 'Enter' && handleApply()}
			/>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-volt uppercase transition-colors hover:text-volt/80 disabled:cursor-not-allowed disabled:opacity-60"
				onclick={handleApply}
				disabled={!promoInput.trim() || bag.isApplyingPromo || bag.isRemovingPromo}
			>
				{#if bag.isApplyingPromo}
					<Loader2 size={12} class="animate-spin text-volt" aria-hidden="true" />
					<span>VALIDATING...</span>
				{:else}
					<span>Apply</span>
				{/if}
			</button>
		</div>
		{#if bag.promoError}
			<p class="mt-2 font-mono text-[9px] text-red-500 uppercase">{bag.promoError}</p>
		{/if}
	{/if}
</div>
