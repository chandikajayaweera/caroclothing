<script lang="ts">
	let {
		colors,
		activeColor,
		onSelect
	}: {
		colors: { name: string; hex: string }[];
		activeColor: string;
		onSelect: (name: string) => void;
	} = $props();
</script>

<div class="flex flex-col gap-2">
	<span class="font-mono text-[9px] tracking-widest text-ash uppercase">
		Color: <span class="text-bone">{activeColor}</span>
	</span>
	<div class="flex gap-3">
		{#each colors as color (color.name)}
			{@const isActive = activeColor === color.name}
			<button
				class="group relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition-all duration-300 focus-visible:ring-1 focus-visible:ring-volt focus-visible:outline-none
        {isActive
					? 'scale-105 border-volt bg-void'
					: 'border-ash/20 hover:scale-105 hover:border-ash/60'}"
				onclick={() => onSelect(color.name)}
				title={color.name}
				aria-label="Select color {color.name}"
			>
				<!-- Inner Color Circle -->
				<div
					class="h-4.5 w-4.5 rounded-full shadow-inner transition-transform duration-300 group-hover:scale-95"
					style="background-color: {color.hex}; border: {color.hex.toLowerCase() === '#ffffff'
						? '1px solid rgba(255,255,255,0.15)'
						: 'none'}"
				></div>

				<!-- Active Glow ring -->
				{#if isActive}
					<span class="absolute inset-0 animate-pulse rounded-full border border-volt/20"></span>
				{/if}
			</button>
		{/each}
	</div>
</div>
