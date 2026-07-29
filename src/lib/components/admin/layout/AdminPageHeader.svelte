<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowLeft } from 'lucide-svelte';

	let {
		kicker,
		title,
		description,
		meta,
		backHref,
		backLabel,
		actions
	}: {
		kicker?: string;
		title: string;
		description?: string;
		meta?: string;
		backHref?: string;
		backLabel?: string;
		actions?: Snippet;
	} = $props();
</script>

<div
	class="mb-8 border-b border-charcoal/40 pb-6 {backHref || actions || kicker || description || meta
		? ''
		: 'hidden lg:block'}"
>
	{#if backHref}
		<a
			href={resolve(backHref as '/')}
			class="mb-3 inline-flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt"
		>
			<ArrowLeft size={14} aria-hidden="true" />
			{backLabel || 'Back'}
		</a>
	{/if}

	<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="min-w-0">
			{#if kicker}
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">{kicker}</p>
			{/if}
			<h1
				class="mt-2 hidden font-display text-4xl leading-none text-bone uppercase lg:block lg:text-6xl"
			>
				{title}
			</h1>
			{#if description}
				<p class="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-ash/80">
					{description}
				</p>
			{/if}
			{#if meta}
				<p class="mt-2 font-mono text-[10px] tracking-wider wrap-break-word text-ash uppercase">
					{meta}
				</p>
			{/if}
		</div>

		{#if actions}
			<div class="mt-2 flex w-full flex-wrap items-center gap-2 lg:mt-0 lg:w-auto lg:justify-end">
				{@render actions()}
			</div>
		{/if}
	</div>
</div>
