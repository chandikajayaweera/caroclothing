<script lang="ts">
	let {
		sizes,
		activeSize,
		onSelect
	}: {
		sizes: { size: string; available: boolean; backorder?: boolean }[];
		activeSize: string;
		onSelect: (size: string) => void;
	} = $props();
</script>

<div class="flex flex-col gap-2">
	<span class="font-mono text-[9px] text-ash uppercase tracking-widest">
		Size: {activeSize || 'Select'}
	</span>
	<div class="flex flex-wrap gap-2">
		{#each sizes as s}
			<button
				class="w-12 h-10 font-mono text-xs flex items-center justify-center border transition-colors
        {!s.available && !s.backorder ? 'border-ash/20 text-ash/30 line-through cursor-not-allowed' : 
         activeSize === s.size ? 'border-volt bg-volt text-void' : 
         s.backorder ? 'border-ash/40 text-ash/60 italic' : 
         'border-ash/40 text-bone hover:border-volt'}"
				onclick={() => s.available || s.backorder ? onSelect(s.size) : null}
				disabled={!s.available && !s.backorder}
			>
				{s.size}
			</button>
		{/each}
	</div>
	<button class="font-mono text-[9px] text-ash underline mt-2 text-left w-fit cursor-pointer">
		Size Guide
	</button>
</div>
