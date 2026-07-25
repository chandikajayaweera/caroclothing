<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		action,
		class: className = '',
		border = true,
		children
	}: {
		title: string;
		description?: string;
		action?: Snippet;
		class?: string;
		border?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="{border ? 'border border-charcoal bg-charcoal/25' : ''} {className}">
	<div
		class="flex flex-wrap items-center justify-between gap-3 {border
			? 'border-b border-charcoal p-4 sm:p-5'
			: 'mb-4'}"
	>
		<div>
			<h2 class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">{title}</h2>
			{#if description}<p class="mt-1 max-w-2xl text-xs text-ash/55">{description}</p>{/if}
		</div>
		{#if action}
			{@render action()}
		{/if}
	</div>
	<div class={border ? 'p-4 sm:p-5' : ''}>
		{@render children()}
	</div>
</div>
