<script lang="ts">
	let {
		rows = 5,
		hasMedia = true
	}: {
		rows?: number;
		hasMedia?: boolean;
	} = $props();

	const skeletonRows = $derived(Array.from({ length: rows }, (_, i) => i));
</script>

<div class="animate-pulse space-y-4 p-5">
	{#each skeletonRows as index (index)}
		<div
			class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0"
		>
			<div class="flex flex-1 items-center gap-3">
				{#if hasMedia}
					<div class="h-16 w-12 bg-charcoal"></div>
				{/if}
				<div class="flex-1 space-y-2">
					<div class="h-4 w-1/4 rounded bg-charcoal"></div>
					<div class="h-3 w-1/3 rounded bg-charcoal"></div>
				</div>
			</div>
			<div class="h-6 w-16 bg-charcoal"></div>
			<div class="h-6 w-12 bg-charcoal"></div>
		</div>
	{/each}
</div>
