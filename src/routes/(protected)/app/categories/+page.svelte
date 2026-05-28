<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Eye, Filter, FolderOpen, Pencil, Plus, Power, Search, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminTableGrid from '$lib/components/admin/AdminTableGrid.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	const tableHeaders = [
		{ label: 'Category' },
		{ label: 'Parent' },
		{ label: 'Sort Order' },
		{ label: 'Status' },
		{ label: 'Description' },
		{ label: 'Actions', class: 'text-right' }
	];

	let includeInactive = $derived(data.filters.includeInactive);

	const hasActiveFilters = $derived(data.filters.parentId !== '' || data.filters.query !== '');
	let showFilters = $state(false);
	$effect(() => {
		if (hasActiveFilters) {
			showFilters = true;
		}
	});

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: deleteCategoryMessage,
		enhance: deleteCategoryEnhance,
		submitting: deleteCategorySubmitting
	} = superForm(initialForm(() => data.deleteCategoryForm));

	const {
		message: updateCategoryFlagsMessage,
		enhance: updateCategoryFlagsEnhance,
		submitting: updateCategoryFlagsSubmitting
	} = superForm(
		initialForm(() => data.updateCategoryFlagsForm),
		{
			resetForm: false
		}
	);

	const categories = $derived(data.categories);
	const allStatsTotal = $derived(data.allCategories.length);
	const allStatsActive = $derived(data.allCategories.filter((c) => c.isActive).length);
	const allStatsInactive = $derived(data.allCategories.filter((c) => !c.isActive).length);

	const hasNextPage = $derived(data.offset + data.limit < data.total);
	const hasPreviousPage = $derived(data.offset > 0);

	const categoryActionMessage = $derived(
		actionData?.form?.message ?? $deleteCategoryMessage ?? $updateCategoryFlagsMessage
	);
	const categoryActionMessageClass = $derived(
		page.status >= 400
			? 'border-red-400/30 bg-red-950/20 text-red-300'
			: 'border-volt/30 bg-volt/10 text-volt'
	);

	function previousOffset(): number {
		return Math.max(0, data.offset - data.limit);
	}

	function nextOffset(): number {
		return data.offset + data.limit;
	}

	function autoSubmitFilter(event: Event): void {
		const form = (event.currentTarget as HTMLElement).closest('form');
		if (!form) return;

		const offsetInput = form.elements.namedItem('offset');
		if (offsetInput instanceof HTMLInputElement) {
			offsetInput.value = '0';
		}

		form.requestSubmit();
	}

	function parentCategoryName(parentId: string | null): string {
		if (!parentId) return 'Root';
		const parent = data.allCategories.find((c) => c.id === parentId);
		return parent ? parent.name : 'Unknown';
	}
</script>

<svelte:head>
	<title>Categories | Caro Admin</title>
	<meta
		name="description"
		content="Manage product categories, parent-child hierarchies, and active state."
	/>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<section class="mx-auto max-w-7xl overflow-x-hidden">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Catalog</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				Categories
			</h1>
		</div>

		<AdminButton
			href={resolve('/app/categories/new')}
			variant="volt"
			size="md"
			class="mt-5 md:mt-0"
		>
			<Plus size={14} aria-hidden="true" />
			New Category
		</AdminButton>
	</div>

	{#if categoryActionMessage}
		<p
			class="mt-6 border px-4 py-3 font-mono text-[10px] tracking-widest uppercase {categoryActionMessageClass}"
		>
			{categoryActionMessage}
		</p>
	{/if}

	<div class="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
		<AdminCard class="min-w-0" padding="p-3 sm:p-5">
			<p
				class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
			>
				Total
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
				{allStatsTotal}
			</p>
		</AdminCard>
		<AdminCard class="min-w-0" padding="p-3 sm:p-5">
			<p
				class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
			>
				Active
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
				{allStatsActive}
			</p>
		</AdminCard>
		<AdminCard class="min-w-0" padding="p-3 sm:p-5">
			<p
				class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
			>
				Inactive
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
				{allStatsInactive}
			</p>
		</AdminCard>
	</div>

	<AdminCard
		bg="bg-charcoal"
		border="border border-charcoal"
		padding=""
		class="mt-4 overflow-hidden"
	>
		<div class="border-b border-charcoal p-5">
			<div class="flex flex-col gap-4">
				<form method="GET" class="w-full" data-sveltekit-keepfocus data-sveltekit-noscroll>
					<div class="flex flex-col gap-3 md:flex-row md:items-center">
						<div class="flex flex-1 items-center gap-2">
							<div class="relative flex-1">
								<div
									class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ash/50"
								>
									<Search size={14} aria-hidden="true" />
								</div>
								<input
									type="text"
									name="query"
									placeholder="Search categories by name or slug..."
									value={data.filters.query}
									onchange={autoSubmitFilter}
									class="min-h-11 w-full border border-ash/30 bg-void py-2.5 pr-4 pl-10 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
								/>
							</div>
							<button
								type="submit"
								class="flex min-h-11 items-center justify-center border border-ash/30 bg-void px-5 font-mono text-[10px] tracking-widest text-bone uppercase transition-colors hover:border-volt hover:text-volt"
							>
								Search
							</button>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => (showFilters = !showFilters)}
								class="flex min-h-11 items-center gap-2 border px-4 font-mono text-[10px] tracking-widest uppercase transition-colors {showFilters ||
								hasActiveFilters
									? 'border-volt bg-volt/10 text-volt'
									: 'border-ash/30 text-ash hover:border-ash/60'}"
							>
								<Filter size={14} aria-hidden="true" />
								<span>Filters</span>
								{#if hasActiveFilters}
									<span class="ml-1 h-1.5 w-1.5 rounded-full bg-volt"></span>
								{/if}
							</button>

							<AdminToggle
								label="Inactive"
								name="includeInactive"
								bind:checked={includeInactive}
								onclick={autoSubmitFilter}
								class="min-h-11 gap-3 border border-ash/30 bg-void px-3.5 py-2.5"
							/>
							<input type="hidden" name="includeInactive" value="false" />
						</div>
					</div>

					{#if showFilters}
						<div
							class="mt-4 grid gap-4 border-t border-charcoal pt-4 sm:grid-cols-2 lg:grid-cols-3"
						>
							<AdminSelect
								label="Parent Category"
								name="parentId"
								value={data.filters.parentId}
								onchange={autoSubmitFilter}
							>
								<option value="">All parents</option>
								<option value="root">Root only</option>
								{#each data.allCategories.filter((c) => !c.parentId) as cat (cat.id)}
									<option value={cat.id}>
										{cat.name}
									</option>
								{/each}
							</AdminSelect>
						</div>
					{/if}

					<input type="hidden" name="limit" value={data.limit} />
					<input type="hidden" name="offset" value="0" />
					<button type="submit" class="sr-only">Apply filters</button>
				</form>
			</div>
		</div>

		{#if categories.length > 0}
			<AdminTableGrid items={categories} headers={tableHeaders}>
				{#snippet card(category)}
					<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
						<div
							class="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)]"
						>
							<a
								href={resolve(`/app/categories/${category.slug}`)}
								class="grid aspect-video w-full place-items-center border border-charcoal bg-charcoal/30"
								aria-label={`View ${category.name}`}
							>
								{#if category.imageUrl}
									<img src={category.imageUrl} alt="" class="h-full w-full object-cover" />
								{:else}
									<FolderOpen size={18} class="text-ash/50" aria-hidden="true" />
								{/if}
							</a>
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<a
											href={resolve(`/app/categories/${category.slug}`)}
											class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
										>
											{category.name}
										</a>
										<p class="mt-1 truncate font-mono text-[10px] text-ash">{category.slug}</p>
									</div>
									<span
										class="shrink-0 text-right font-mono text-[9px] tracking-widest uppercase {category.isActive
											? 'text-volt'
											: 'text-red-300'}"
									>
										{category.isActive ? 'Active' : 'Inactive'}
									</span>
								</div>

								<div class="mt-3 flex flex-wrap gap-1.5">
									<span
										class="border border-charcoal px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase"
									>
										Sort: {category.sortOrder}
									</span>
								</div>

								<div class="mt-3 font-mono text-[10px] uppercase">
									<span class="text-ash/50">Parent: </span>
									<span class="text-bone">{parentCategoryName(category.parentId)}</span>
								</div>

								{#if category.description}
									<p class="mt-2 line-clamp-2 font-sans text-xs text-ash/80">
										{category.description}
									</p>
								{/if}
							</div>
						</div>
						<div class="mt-4 grid gap-2">
							<div class="grid grid-cols-4 gap-1.5" aria-label="Category actions">
								<form method="POST" action="?/updateCategoryFlags" use:updateCategoryFlagsEnhance>
									<input type="hidden" name="categoryId" value={category.id} />
									<input type="hidden" name="isActive" value={String(!category.isActive)} />
									<button
										type="submit"
										disabled={$updateCategoryFlagsSubmitting}
										class="grid h-10 w-full place-items-center border transition-colors disabled:opacity-40 {category.isActive
											? 'border-volt/40 bg-volt/10 text-volt hover:bg-volt hover:text-void'
											: 'border-red-400/40 text-red-300 hover:border-volt hover:text-volt'}"
										aria-label={`${category.isActive ? 'Deactivate' : 'Activate'} ${category.name}`}
										title={category.isActive ? 'Deactivate' : 'Activate'}
									>
										<Power size={14} aria-hidden="true" />
									</button>
								</form>

								<a
									href={resolve(`/app/categories/${category.slug}`)}
									class="grid h-10 place-items-center border border-volt/40 text-volt transition-colors hover:bg-volt hover:text-void"
									aria-label={`View ${category.name}`}
									title="View details"
								>
									<Eye size={14} aria-hidden="true" />
								</a>

								<a
									href={resolve(`/app/categories/${category.slug}/edit`)}
									class="grid h-10 place-items-center border border-ash/30 text-bone transition-colors hover:border-volt hover:text-volt"
									aria-label={`Edit ${category.name}`}
									title="Edit"
								>
									<Pencil size={14} aria-hidden="true" />
								</a>

								<form method="POST" action="?/deleteCategory" use:deleteCategoryEnhance>
									<input type="hidden" name="categoryId" value={category.id} />
									<button
										type="submit"
										disabled={$deleteCategorySubmitting}
										class="grid h-10 w-full place-items-center border border-red-400/40 text-red-300 transition-colors hover:bg-red-400 hover:text-void disabled:opacity-40"
										aria-label={`Delete ${category.name}`}
										title="Delete"
									>
										<Trash2 size={14} aria-hidden="true" />
									</button>
								</form>
							</div>
						</div>
					</article>
				{/snippet}

				{#snippet row(category)}
					<tr class="border-b border-charcoal/70 last:border-b-0">
						<td class="px-5 py-4">
							<div class="flex min-w-0 items-center gap-3">
								<a
									href={resolve(`/app/categories/${category.slug}`)}
									class="grid h-12 w-16 shrink-0 place-items-center border border-charcoal bg-void"
									aria-label={`View ${category.name}`}
								>
									{#if category.imageUrl}
										<img src={category.imageUrl} alt="" class="h-full w-full object-cover" />
									{:else}
										<FolderOpen size={16} class="text-ash/50" aria-hidden="true" />
									{/if}
								</a>
								<div class="min-w-0">
									<a
										href={resolve(`/app/categories/${category.slug}`)}
										class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
									>
										{category.name}
									</a>
									<p class="mt-1 max-w-[220px] truncate font-mono text-[10px] text-ash">
										{category.slug}
									</p>
								</div>
							</div>
						</td>
						<td class="px-5 py-4 font-mono text-[10px] text-ash">
							{parentCategoryName(category.parentId)}
						</td>
						<td class="px-5 py-4 font-mono text-[10px] text-ash">
							{category.sortOrder}
						</td>
						<td class="px-5 py-4">
							<span
								class="font-mono text-[10px] tracking-widest uppercase {category.isActive
									? 'text-volt'
									: 'text-red-300'}"
							>
								{category.isActive ? 'Active' : 'Inactive'}
							</span>
						</td>
						<td class="max-w-[250px] truncate px-5 py-4 font-sans text-xs text-ash/85">
							{category.description || 'No description'}
						</td>
						<td class="px-5 py-4">
							<div class="flex items-center justify-end gap-3">
								<div class="flex items-center gap-2" aria-label="Category state actions">
									<form method="POST" action="?/updateCategoryFlags" use:updateCategoryFlagsEnhance>
										<input type="hidden" name="categoryId" value={category.id} />
										<input type="hidden" name="isActive" value={String(!category.isActive)} />
										<button
											type="submit"
											disabled={$updateCategoryFlagsSubmitting}
											class="grid h-9 w-9 place-items-center border transition-colors disabled:opacity-40 {category.isActive
												? 'border-volt/40 bg-volt/10 text-volt hover:bg-volt hover:text-void'
												: 'border-red-400/40 text-red-300 hover:border-volt hover:text-volt'}"
											aria-label={`${category.isActive ? 'Deactivate' : 'Activate'} ${category.name}`}
											title={category.isActive ? 'Deactivate' : 'Activate'}
										>
											<Power size={14} aria-hidden="true" />
										</button>
									</form>
								</div>
								<div class="h-9 w-px bg-charcoal" aria-hidden="true"></div>
								<div class="flex items-center gap-2" aria-label="Category record actions">
									<a
										href={resolve(`/app/categories/${category.slug}`)}
										class="grid h-9 w-9 place-items-center border border-volt/40 text-volt transition-colors hover:bg-volt hover:text-void"
										aria-label={`View ${category.name}`}
										title="View details"
									>
										<Eye size={14} aria-hidden="true" />
									</a>
									<a
										href={resolve(`/app/categories/${category.slug}/edit`)}
										class="grid h-9 w-9 place-items-center border border-ash/30 text-bone transition-colors hover:border-volt hover:text-volt"
										aria-label={`Edit ${category.name}`}
										title="Edit"
									>
										<Pencil size={14} aria-hidden="true" />
									</a>
									<form method="POST" action="?/deleteCategory" use:deleteCategoryEnhance>
										<input type="hidden" name="categoryId" value={category.id} />
										<button
											type="submit"
											disabled={$deleteCategorySubmitting}
											class="grid h-9 w-9 place-items-center border border-red-400/40 text-red-300 transition-colors hover:bg-red-400 hover:text-void disabled:opacity-40"
											aria-label={`Delete ${category.name}`}
											title="Delete"
										>
											<Trash2 size={14} aria-hidden="true" />
										</button>
									</form>
								</div>
							</div>
						</td>
					</tr>
				{/snippet}
			</AdminTableGrid>

			<div
				class="flex flex-col gap-3 border-t border-charcoal p-5 font-mono text-[10px] tracking-widest text-ash uppercase sm:flex-row sm:items-center sm:justify-between"
			>
				<p>
					Showing {data.offset + 1}-{Math.min(data.offset + data.limit, data.total)} of {data.total}
				</p>
				<div class="flex gap-2">
					{#if hasPreviousPage}
						<form method="GET">
							{#if data.filters.parentId}
								<input type="hidden" name="parentId" value={data.filters.parentId} />
							{/if}
							{#if data.filters.query}
								<input type="hidden" name="query" value={data.filters.query} />
							{/if}
							<input
								type="hidden"
								name="includeInactive"
								value={String(data.filters.includeInactive)}
							/>
							<input type="hidden" name="limit" value={data.limit} />
							<input type="hidden" name="offset" value={previousOffset()} />
							<button
								type="submit"
								class="border border-ash/30 px-4 py-2 hover:border-volt hover:text-volt"
							>
								Previous
							</button>
						</form>
					{/if}
					{#if hasNextPage}
						<form method="GET">
							{#if data.filters.parentId}
								<input type="hidden" name="parentId" value={data.filters.parentId} />
							{/if}
							{#if data.filters.query}
								<input type="hidden" name="query" value={data.filters.query} />
							{/if}
							<input
								type="hidden"
								name="includeInactive"
								value={String(data.filters.includeInactive)}
							/>
							<input type="hidden" name="limit" value={data.limit} />
							<input type="hidden" name="offset" value={nextOffset()} />
							<button
								type="submit"
								class="border border-ash/30 px-4 py-2 hover:border-volt hover:text-volt"
							>
								Next
							</button>
						</form>
					{/if}
				</div>
			</div>
		{:else}
			<div class="p-12 text-center">
				<p class="font-display text-4xl text-bone uppercase">No categories found</p>
				<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
					Adjust filters or create the first category.
				</p>
				<a
					href={resolve('/app/categories/new')}
					class="mt-6 inline-flex bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
				>
					Create Category
				</a>
			</div>
		{/if}
	</AdminCard>
</section>
