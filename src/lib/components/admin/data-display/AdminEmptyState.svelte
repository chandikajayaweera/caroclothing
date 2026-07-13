<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title = 'No items found',
		description = 'Adjust filters or query parameters.',
		actions,
		size = 'default'
	}: {
		title?: string;
		description?: string;
		actions?: Snippet;
		size?: 'default' | 'compact';
	} = $props();
</script>

<div class={size === 'compact' ? 'py-4 text-center' : 'py-12 text-center'}>
	<p
		class={size === 'compact'
			? 'font-mono text-xs text-bone uppercase'
			: 'font-display text-2xl wrap-break-word text-bone uppercase sm:text-4xl'}
	>
		{title}
	</p>
	<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
		{description}
	</p>
	{#if actions}
		<div class="mt-6 flex flex-wrap justify-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
