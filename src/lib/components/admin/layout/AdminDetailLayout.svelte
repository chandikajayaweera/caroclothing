<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ChevronDown } from 'lucide-svelte';
	import AdminPageHeader from './AdminPageHeader.svelte';
	import AdminPageShell from './AdminPageShell.svelte';

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
		sidebarContent,
		mobileSidebarLabel = 'Details and actions'
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
		mobileSidebarLabel?: string;
	} = $props();

	let mobileSidebarOpen = $state(false);
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<AdminPageShell size="normal" spacing="normal" class="overflow-x-hidden">
	<AdminPageHeader
		{kicker}
		{title}
		meta={subtitle ?? undefined}
		{backHref}
		{backLabel}
		actions={headerActions}
	/>

	<!-- Status / Action Messages -->
	{#if actionMessage}
		<p
			role="status"
			class="mt-6 border px-4 py-3 font-mono text-[10px] tracking-widest uppercase {actionMessageClass}"
			transition:fade={{ duration: 150 }}
		>
			{actionMessage}
		</p>
	{/if}

	<!-- Columns Layout Grid -->
	<div
		class="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"
		transition:fade={{ duration: 150 }}
	>
		<!-- Left Main Column -->
		<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
			{@render mainContent()}
		</div>

		<!-- Right Sidebar Column -->
		<aside
			class="order-first grid min-w-0 gap-3 lg:sticky lg:top-4 lg:order-none lg:gap-6 lg:self-start"
		>
			<button
				type="button"
				class="flex min-h-11 w-full items-center justify-between gap-3 border border-ash/20 bg-charcoal px-4 font-mono text-[10px] font-bold tracking-widest text-bone uppercase lg:hidden"
				aria-expanded={mobileSidebarOpen}
				onclick={() => (mobileSidebarOpen = !mobileSidebarOpen)}
			>
				<span>{mobileSidebarLabel}</span>
				<ChevronDown
					size={16}
					class="shrink-0 text-ash transition-transform {mobileSidebarOpen ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</button>
			<div
				class="{mobileSidebarOpen
					? 'grid'
					: 'hidden'} min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid"
			>
				{@render sidebarContent()}
			</div>
		</aside>
	</div>
</AdminPageShell>
