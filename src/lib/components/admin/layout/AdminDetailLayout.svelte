<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ArrowLeft } from 'lucide-svelte';
	import { fade } from 'svelte/transition';

	let {
		backHref,
		backLabel,
		kicker,
		title,
		subtitle,
		actionMessage,
		actionMessageClass = 'border-red-400/30 bg-red-950/20 text-red-300',
		headerActions,
		mainContent,
		sidebarContent
	}: {
		backHref: string;
		backLabel: string;
		kicker: string;
		title: string;
		subtitle?: string | null;
		actionMessage?: string | null;
		actionMessageClass?: string;
		headerActions?: Snippet;
		mainContent: Snippet;
		sidebarContent: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<section class="mx-auto max-w-7xl pb-24">
	<!-- Top Navigation and Action Bar -->
	<div
		class="flex flex-col gap-4 border-b border-charcoal pb-5 md:flex-row md:items-center md:justify-between"
	>
		<div class="flex items-center gap-4">
			<a
				href={backHref}
				class="group flex h-10 w-10 items-center justify-center border border-charcoal bg-void text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label={backLabel}
			>
				<ArrowLeft size={16} class="transition-transform group-hover:-translate-x-0.5" />
			</a>
			<div class="min-w-0">
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">{kicker}</p>
				<h1 class="truncate font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{title}
				</h1>
				{#if subtitle}
					<p class="mt-1 truncate font-mono text-[10px] text-ash uppercase">{subtitle}</p>
				{/if}
			</div>
		</div>

		{#if headerActions}
			<div class="flex items-center gap-3">
				{@render headerActions()}
			</div>
		{/if}
	</div>

	<!-- Status / Action Messages -->
	{#if actionMessage}
		<p
			class="mt-6 border px-4 py-3 font-mono text-[10px] tracking-widest uppercase {actionMessageClass}"
			transition:fade={{ duration: 150 }}
		>
			{actionMessage}
		</p>
	{/if}

	<!-- Columns Layout Grid -->
	<div class="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]" transition:fade={{ duration: 150 }}>
		<!-- Left Main Column -->
		<div class="grid gap-6">
			{@render mainContent()}
		</div>

		<!-- Right Sidebar Column -->
		<aside class="grid gap-6 lg:sticky lg:top-8 lg:self-start">
			{@render sidebarContent()}
		</aside>
	</div>
</section>
