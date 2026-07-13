<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';

	let {
		media,
		header,
		metadata,
		description,
		actions,
		class: className = ''
	}: {
		media?: Snippet;
		header: Snippet;
		metadata?: Snippet;
		description?: Snippet;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<AdminCard class={className}>
	<div
		class:grid={media}
		class:grid-cols-[72px_minmax(0,1fr)]={media}
		class:sm:grid-cols-[88px_minmax(0,1fr)]={media}
		class:gap-3={media}
		class="min-w-0"
	>
		{#if media}
			{@render media()}
		{/if}
		<div class="min-w-0 flex-1">
			{@render header()}
			{#if metadata}
				{@render metadata()}
			{/if}
			{#if description}
				{@render description()}
			{/if}
		</div>
	</div>
	{#if actions}
		<div class="mt-4 grid gap-2">
			{@render actions()}
		</div>
	{/if}
</AdminCard>
