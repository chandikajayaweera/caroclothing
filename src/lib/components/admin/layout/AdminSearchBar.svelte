<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { slide } from 'svelte/transition';
	import { Filter } from 'lucide-svelte';

	import AdminSearchInput from '$lib/components/admin/filters/AdminSearchInput.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';

	let {
		query = $bindable(''),
		showFilters = $bindable(false),
		hasActiveFilters = false,
		loading = false,
		showSearch = true,
		searchPlaceholder = 'Search by name or slug...',
		searchParamName = 'query',
		limit = 10,
		limitParam = 'limit',
		offsetParam = 'offset',
		preserveParams = [],
		advancedFilters,
		onclearfilters
	}: {
		query?: string;
		showFilters?: boolean;
		hasActiveFilters?: boolean;
		loading?: boolean;
		showSearch?: boolean;
		searchPlaceholder?: string;
		searchParamName?: string;
		limit?: number;
		limitParam?: string;
		offsetParam?: string;
		preserveParams?: string[];
		advancedFilters?: Snippet;
		onclearfilters?: () => void;
	} = $props();

	const preservedValues = $derived(
		preserveParams
			.map((name) => ({ name, value: page.url.searchParams.get(name) }))
			.filter((entry): entry is { name: string; value: string } => entry.value !== null)
	);

	function autoSubmitFilter(event: Event): void {
		const form = (event.currentTarget as HTMLElement).closest('form');
		if (!form) return;

		const offsetInput = form.elements.namedItem(offsetParam);
		if (offsetInput instanceof HTMLInputElement) {
			offsetInput.value = '0';
		}

		form.requestSubmit();
	}
</script>

<div class="border-b border-charcoal p-5">
	<div class="flex flex-col gap-4">
		<form method="GET" class="w-full" data-sveltekit-keepfocus data-sveltekit-noscroll>
			<div class="flex flex-col gap-3 md:flex-row md:items-center">
				{#if showSearch}
					<AdminSearchInput
						bind:value={query}
						name={searchParamName}
						placeholder={searchPlaceholder}
						{loading}
						onchange={autoSubmitFilter}
					/>
				{/if}

				<div
					class="grid w-full grid-cols-1 gap-2 md:ml-auto md:flex md:w-auto md:items-center"
					class:ml-auto={!showSearch}
				>
					<AdminButton
						type="button"
						onclick={() => {
							if (!loading) showFilters = !showFilters;
						}}
						disabled={loading}
						variant="outline"
						class="w-full gap-2 md:w-auto {showFilters || hasActiveFilters
							? 'border-volt bg-volt/10 text-volt'
							: 'text-ash'}"
						aria-expanded={showFilters}
					>
						<Filter size={14} aria-hidden="true" />
						<span>Filters</span>
						{#if hasActiveFilters}
							<span class="ml-1 h-1.5 w-1.5 rounded-full bg-volt"></span>
						{/if}
					</AdminButton>

					{#if (hasActiveFilters || query) && onclearfilters}
						<AdminButton
							type="button"
							onclick={onclearfilters}
							disabled={loading}
							variant="danger"
							class="w-full md:w-auto"
						>
							Clear
						</AdminButton>
					{/if}
				</div>
			</div>

			{#if advancedFilters}
				<div
					hidden={!showFilters}
					aria-hidden={!showFilters}
					class="mt-4 border-t border-charcoal pt-4"
					transition:slide={{ duration: 150 }}
				>
					{@render advancedFilters()}
				</div>
			{/if}

			<input type="hidden" name={limitParam} value={limit} />
			<input type="hidden" name={offsetParam} value="0" />
			{#each preservedValues as entry (entry.name)}
				<input type="hidden" name={entry.name} value={entry.value} />
			{/each}
			<button type="submit" class="sr-only">Apply filters</button>
		</form>
	</div>
</div>
