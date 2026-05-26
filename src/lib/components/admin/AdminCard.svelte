<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		bg = 'bg-charcoal',
		border = 'border border-charcoal',
		padding = 'p-5 md:p-6',
		class: className = '',
		title,
		kicker,
		titleSize = 'text-2xl',
		headerActions,
		children
	}: {
		bg?: string;
		border?: string;
		padding?: string;
		class?: string;
		title?: string;
		kicker?: string;
		titleSize?: string;
		headerActions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="{bg} {border} {padding} {className}">
	{#if title || kicker || headerActions}
		<div class="border-b border-ash/10 pb-4 mb-5 flex items-end justify-between gap-4">
			<div class="min-w-0">
				{#if kicker}
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">{kicker}</p>
				{/if}
				{#if title}
					<h2 class="mt-1 font-display {titleSize} leading-none tracking-wide text-bone uppercase truncate">
						{title}
					</h2>
				{/if}
			</div>
			{#if headerActions}
				<div class="flex shrink-0 items-center gap-2">
					{@render headerActions()}
				</div>
			{/if}
		</div>
	{/if}
	{@render children()}
</div>
