<script lang="ts">
	import SkeletonBlock from '$lib/components/navigation/SkeletonBlock.svelte';

	let {
		rows = 5,
		hasMedia = true
	}: {
		rows?: number;
		hasMedia?: boolean;
	} = $props();

	const skeletonRows = $derived(Array.from({ length: rows }, (_, i) => i));
</script>

<div class="space-y-4 p-5" aria-hidden="true">
	{#each skeletonRows as index (index)}
		<div
			class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0"
		>
			<div class="flex flex-1 items-center gap-3">
				{#if hasMedia}
					<SkeletonBlock class="h-16 w-12" />
				{/if}
				<div class="flex-1 space-y-2">
					<SkeletonBlock class="h-4 w-1/4" />
					<SkeletonBlock class="h-3 w-1/3" />
				</div>
			</div>
			<SkeletonBlock class="h-6 w-16" />
			<SkeletonBlock class="h-6 w-12" />
		</div>
	{/each}
</div>
