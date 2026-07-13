<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import AdminTableGrid from '$lib/components/admin/AdminTableGrid.svelte';
	import AdminPageShell from './AdminPageShell.svelte';
	import AdminPageHeader from './AdminPageHeader.svelte';
	import AdminStatsGrid from './AdminStatsGrid.svelte';
	import AdminSearchBar from './AdminSearchBar.svelte';
	import AdminPagination from './AdminPagination.svelte';

	let {
		title,
		kicker = 'Catalog',
		description,
		actionMessage,
		actionMessageClass = 'border-volt/30 bg-volt/10 text-volt',
		stats, // { total: number; active: number; inactive: number }
		metrics,
		loading = false,
		showFilters = $bindable(false),
		hasActiveFilters = false,
		query = $bindable(''),
		searchPlaceholder = 'Search by name or slug...',
		searchParamName = 'query',
		showSearch = true,
		totalItems = 0,
		limit = 10,
		offset = 0,
		paginationOffsetParam = 'offset',
		filterLimitParam = 'limit',
		filterOffsetParam = 'offset',
		preserveParams = [],
		tableHeaders,
		items = [],
		gridClass = undefined,
		tableClass = undefined,
		headerActions,
		advancedFilters,
		card,
		row,
		skeleton,
		emptyState,
		statsSnippet,
		statsNotice,
		onclearfilters
	}: {
		title: string;
		kicker?: string;
		description?: string;
		actionMessage?: string | null;
		actionMessageClass?: string;
		stats?: { total: number; active: number; inactive: number };
		metrics?: Array<{
			label: string;
			value: string | number;
			description?: string;
			tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
		}>;
		loading?: boolean;
		showFilters?: boolean;
		hasActiveFilters?: boolean;
		query?: string;
		searchPlaceholder?: string;
		searchParamName?: string;
		showSearch?: boolean;
		totalItems?: number;
		limit?: number;
		offset?: number;
		paginationOffsetParam?: string;
		filterLimitParam?: string;
		filterOffsetParam?: string;
		preserveParams?: string[];
		tableHeaders: { label: string; class?: string }[];
		items?: T[];
		gridClass?: string;
		tableClass?: string;
		headerActions?: Snippet;
		advancedFilters?: Snippet;
		card?: Snippet<[T]>;
		row?: Snippet<[T]>;
		skeleton?: Snippet;
		emptyState?: Snippet;
		statsSnippet?: Snippet;
		statsNotice?: Snippet;
		onclearfilters?: () => void;
	} = $props();

	const skeletonRows = [0, 1, 2, 3, 4];
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<AdminPageShell size="normal" spacing="normal" class="overflow-x-hidden">
	<AdminPageHeader {kicker} {title} {description} actions={headerActions} />

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

	<!-- Stats Summary Section -->
	{#if statsSnippet}
		{@render statsSnippet()}
	{:else}
		<AdminStatsGrid {stats} {metrics} {loading} />
	{/if}
	{#if statsNotice}
		{@render statsNotice()}
	{/if}

	<!-- Main List Card (Search & Filters + Table Grid) -->
	<section
		class="mt-4 overflow-hidden border border-charcoal bg-charcoal/20"
		aria-label={`${title} list`}
	>
		<!-- Search and Filter Controls -->
		{#if showSearch || advancedFilters}
			<AdminSearchBar
				bind:query
				bind:showFilters
				{hasActiveFilters}
				{loading}
				{showSearch}
				{searchPlaceholder}
				{searchParamName}
				{limit}
				limitParam={filterLimitParam}
				offsetParam={filterOffsetParam}
				{preserveParams}
				{advancedFilters}
				{onclearfilters}
			/>
		{/if}

		<!-- Table / Skeletons Area -->
		{#if loading}
			{#if skeleton}
				{@render skeleton()}
			{:else}
				<div class="animate-pulse space-y-4 p-5">
					{#each skeletonRows as skeletonRow (skeletonRow)}
						<div
							class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0"
						>
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
		{:else if items.length > 0 && card && row}
			<div transition:fade={{ duration: 150 }}>
				<AdminTableGrid {items} headers={tableHeaders} {card} {row} {gridClass} {tableClass} />

				<!-- Pagination Panel -->
				<AdminPagination {offset} {limit} {totalItems} offsetParam={paginationOffsetParam} />
			</div>
		{:else if items.length === 0}
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
		{:else}
			<div class="p-12 text-center" transition:fade={{ duration: 150 }}>
				<p class="font-display text-4xl text-bone uppercase">List template unavailable</p>
				<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
					Refresh the page to restore the admin list.
				</p>
			</div>
		{/if}
	</section>
</AdminPageShell>
