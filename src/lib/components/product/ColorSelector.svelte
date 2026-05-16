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
		Color: {activeColor}
	</span>
	<div class="flex gap-2.5">
		{#each colors as color}
			<button
				class="h-6 w-6 rounded-full border-2 transition-all
        {activeColor === color.name ? 'border-volt p-0.5' : 'border-ash/20 hover:border-ash/50'}"
				onclick={() => onSelect(color.name)}
				title={color.name}
			>
				<div class="h-full w-full rounded-full" style="background-color: {color.hex}"></div>
			</button>
		{/each}
	</div>
</div>
