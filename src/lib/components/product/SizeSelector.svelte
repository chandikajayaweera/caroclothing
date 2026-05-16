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
	<span class="font-mono text-[9px] tracking-widest text-ash uppercase">
		Size: {activeSize || 'Select'}
	</span>
	<div class="flex flex-wrap gap-2">
		{#each sizes as s}
			<button
				class="flex h-10 w-12 items-center justify-center border font-mono text-xs transition-colors
        {!s.available && !s.backorder
					? 'cursor-not-allowed border-ash/20 text-ash/30 line-through'
					: activeSize === s.size
						? 'border-volt bg-volt text-void'
						: s.backorder
							? 'border-ash/40 text-ash/60 italic'
							: 'border-ash/40 text-bone hover:border-volt'}"
				onclick={() => (s.available || s.backorder ? onSelect(s.size) : null)}
				disabled={!s.available && !s.backorder}
			>
				{s.size}
			</button>
		{/each}
	</div>
	<button class="mt-2 w-fit cursor-pointer text-left font-mono text-[9px] text-ash underline">
		Size Guide
	</button>
</div>
