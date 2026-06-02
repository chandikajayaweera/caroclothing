<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Filter, Search } from 'lucide-svelte';
	import { slide, fade } from 'svelte/transition';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminTableGrid from '$lib/components/admin/AdminTableGrid.svelte';

	let {
		title,
		kicker = 'Catalog',
		actionMessage,
		actionMessageClass = 'border-volt/30 bg-volt/10 text-volt',
		stats, // { total: number; active: number; inactive: number }
		loading = false,
		showFilters = $bindable(false),
		hasActiveFilters = false,
		includeInactive = $bindable(false),
		query = $bindable(''),
		searchPlaceholder = 'Search by name or slug...',
		totalItems = 0,
		limit = 10,
		offset = 0,
		tableHeaders,
		items = [],
		headerActions,
		advancedFilters,
		card,
		row,
		skeleton,
		emptyState,
		onclearfilters
	}: {
		title: string;
		kicker?: string;
		actionMessage?: string | null;
		actionMessageClass?: string;
		stats?: { total: number; active: number; inactive: number };
		loading?: boolean;
		showFilters?: boolean;
		hasActiveFilters?: boolean;
		includeInactive?: boolean;
		query?: string;
		searchPlaceholder?: string;
		totalItems?: number;
		limit?: number;
		offset?: number;
		tableHeaders: { label: string; class?: string }[];
		items?: any[];
		headerActions?: Snippet;
		advancedFilters?: Snippet;
		card: Snippet<[any]>;
		row: Snippet<[any]>;
		skeleton?: Snippet;
		emptyState?: Snippet;
		onclearfilters?: () => void;
	} = $props();

	function autoSubmitFilter(event: Event): void {
		const form = (event.currentTarget as HTMLElement).closest('form');
		if (!form) return;

		const offsetInput = form.elements.namedItem('offset');
		if (offsetInput instanceof HTMLInputElement) {
			offsetInput.value = '0';
		}

		form.requestSubmit();
	}

	const hasPreviousPage = $derived(offset > 0);
	const hasNextPage = $derived(offset + limit < totalItems);

	function getPageUrl(newOffset: number): string {
		const url = new URL(page.url);
		url.searchParams.set('offset', String(newOffset));
		return url.pathname + url.search;
	}
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<section class="mx-auto max-w-7xl overflow-x-hidden">
	<!-- Page Header -->
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">{kicker}</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				{title}
			</h1>
		</div>

		{#if headerActions}
			{@render headerActions()}
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

	<!-- Stats Summary Section -->
	<div class="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
		{#if loading || !stats}
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]">
					Total
				</p>
				<div class="mt-2 h-8 w-12 animate-pulse bg-charcoal"></div>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]">
					Active
				</p>
				<div class="mt-2 h-8 w-12 animate-pulse bg-charcoal"></div>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]">
					Inactive
				</p>
				<div class="mt-2 h-8 w-12 animate-pulse bg-charcoal"></div>
			</AdminCard>
		{:else}
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]">
					Total
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{stats.total}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]">
					Active
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
					{stats.active}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]">
					Inactive
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{stats.inactive}
				</p>
			</AdminCard>
		{/if}
	</div>

	<!-- Main List Card (Search & Filters + Table Grid) -->
	<AdminCard
		bg="bg-charcoal"
		border="border border-charcoal"
		padding=""
		class="mt-4 overflow-hidden"
	>
		<!-- Search and Filter Controls -->
		<div class="border-b border-charcoal p-5">
			<div class="flex flex-col gap-4">
				<form method="GET" class="w-full" data-sveltekit-keepfocus data-sveltekit-noscroll>
					<div class="flex flex-col gap-3 md:flex-row md:items-center">
						<div class="flex flex-1 items-center gap-2">
							<div class="relative flex-1">
								<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ash/50">
									<Search size={14} aria-hidden="true" />
								</div>
								<input
									type="text"
									name="query"
									placeholder={searchPlaceholder}
									bind:value={query}
									disabled={loading}
									onchange={autoSubmitFilter}
									class="min-h-11 w-full border border-ash/30 bg-void py-2.5 pr-4 pl-10 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:opacity-50"
								/>
							</div>
							<button
								type="submit"
								disabled={loading}
								class="flex min-h-11 items-center justify-center border border-ash/30 bg-void px-5 font-mono text-[10px] tracking-widest text-bone uppercase transition-colors hover:border-volt hover:text-volt disabled:opacity-50"
							>
								Search
							</button>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => { if (!loading) showFilters = !showFilters; }}
								disabled={loading}
								class="flex min-h-11 items-center gap-2 border px-4 font-mono text-[10px] tracking-widest uppercase transition-colors disabled:opacity-50 {showFilters || hasActiveFilters ? 'border-volt bg-volt/10 text-volt' : 'border-ash/30 text-ash hover:border-ash/60'}"
							>
								<Filter size={14} aria-hidden="true" />
								<span>Filters</span>
								{#if hasActiveFilters}
									<span class="ml-1 h-1.5 w-1.5 rounded-full bg-volt"></span>
								{/if}
							</button>
 
							{#if (hasActiveFilters || query) && onclearfilters}
								<button
									type="button"
									onclick={onclearfilters}
									disabled={loading}
									class="flex min-h-11 items-center justify-center border border-red-400/30 bg-void px-4 font-mono text-[10px] tracking-widest text-red-300 uppercase transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
								>
									Clear
								</button>
							{/if}

							<AdminToggle
								label="Inactive"
								name="includeInactive"
								disabled={loading}
								bind:checked={includeInactive}
								onclick={autoSubmitFilter}
								class="min-h-11 gap-3 border border-ash/30 bg-void px-3.5 py-2.5 disabled:opacity-50"
							/>
							<input type="hidden" name="includeInactive" value="false" />
						</div>
					</div>

					{#if showFilters && advancedFilters}
						<div class="mt-4 border-t border-charcoal pt-4" transition:slide={{ duration: 150 }}>
							{@render advancedFilters()}
						</div>
					{/if}

					<input type="hidden" name="limit" value={limit} />
					<input type="hidden" name="offset" value="0" />
					<button type="submit" class="sr-only">Apply filters</button>
				</form>
			</div>
		</div>

		<!-- Table / Skeletons Area -->
		{#if loading}
			{#if skeleton}
				{@render skeleton()}
			{:else}
				<div class="animate-pulse space-y-4 p-5">
					{#each Array(5) as _}
						<div class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0">
							<div class="flex flex-1 items-center gap-3">
								<div class="h-12 w-16 bg-charcoal"></div>
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
			{/if}
		{:else if items.length > 0}
			<div transition:fade={{ duration: 150 }}>
				<AdminTableGrid {items} headers={tableHeaders} {card} {row} />

				<!-- Pagination Panel -->
				<div class="flex flex-col gap-3 border-t border-charcoal p-5 font-mono text-[10px] tracking-widest text-ash uppercase sm:flex-row sm:items-center sm:justify-between">
					<p>
						Showing {offset + 1}-{Math.min(offset + limit, totalItems)} of {totalItems}
					</p>
					<div class="flex gap-2">
						{#if hasPreviousPage}
							<a
								href={getPageUrl(offset - limit)}
								class="border border-ash/30 px-4 py-2 transition-colors hover:border-volt hover:text-volt"
							>
								Previous
							</a>
						{/if}
						{#if hasNextPage}
							<a
								href={getPageUrl(offset + limit)}
								class="border border-ash/30 px-4 py-2 transition-colors hover:border-volt hover:text-volt"
							>
								Next
							</a>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="p-12 text-center" transition:fade={{ duration: 150 }}>
				{#if emptyState}
					{@render emptyState()}
				{:else}
					<p class="font-display text-4xl text-bone uppercase">No items found</p>
					<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
						Adjust filters or query parameters.
					</p>
				{/if}
			</div>
		{/if}
	</AdminCard>
</section>
