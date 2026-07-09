<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Eye, FolderOpen, Pencil, Plus, Power, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminFilterToggle from '$lib/components/admin/AdminFilterToggle.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CategoryItem = Awaited<PageData['streamed']['categories']>['items'][number];
	type AllCategoryItem = Awaited<PageData['streamed']['allCategories']>[number];

	let includeInactive = $derived(data.filters.includeInactive);

	const tableHeaders = [
		{ label: 'Category' },
		{ label: 'Parent' },
		{ label: 'Sort Order' },
		{ label: 'Status' },
		{ label: 'Description' },
		{ label: 'Actions', class: 'text-right' }
	];

	const hasActiveFilters = $derived(
		data.filters.parentId !== '' ||
			data.filters.query !== '' ||
			data.filters.includeInactive === false
	);
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

	const categoryActionMessage = $derived(
		actionData?.form?.message ?? $deleteCategoryMessage ?? $updateCategoryFlagsMessage
	);

	let toastMessage = $state<string | null>(null);

	$effect(() => {
		if (categoryActionMessage) {
			toastMessage = categoryActionMessage;
		}
	});

	function clearFilters() {
		goto(resolve(`/app/categories?includeInactive=${includeInactive}`));
	}

	function parentCategoryName(parentId: string | null, allCategories: AllCategoryItem[]): string {
		if (!parentId) return 'Root';
		const parent = allCategories.find((c) => c.id === parentId);
		return parent ? parent.name : 'Unknown';
	}
</script>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

{#await Promise.all([data.streamed.categories, data.streamed.allCategories])}
	<AdminListLayout title="Categories" loading={true} {tableHeaders} items={[]}>
		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each [0, 1, 2, 3, 4] as index (index)}
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
						<div class="h-6 w-24 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}
		{#snippet card()}{/snippet}
		{#snippet row()}{/snippet}
	</AdminListLayout>
{:then [categoriesResult, allCategories]}
	{@const categories = categoriesResult.items}
	{@const total = categoriesResult.total}
	{@const allStatsTotal = allCategories.length}
	{@const allStatsActive = allCategories.filter((c) => c.isActive).length}
	{@const allStatsInactive = allCategories.filter((c) => !c.isActive).length}

	<AdminListLayout
		title="Categories"
		loading={false}
		stats={{
			total: allStatsTotal,
			active: allStatsActive,
			inactive: allStatsInactive
		}}
		query={data.filters.query}
		bind:showFilters
		{hasActiveFilters}
		totalItems={total}
		limit={data.limit}
		offset={data.offset}
		{tableHeaders}
		items={categories}
		onclearfilters={clearFilters}
	>
		{#snippet headerActions()}
			<AdminButton
				href={resolve('/app/categories/new')}
				variant="volt"
				size="md"
				class="mt-5 md:mt-0"
			>
				<Plus size={14} aria-hidden="true" />
				New Category
			</AdminButton>
		{/snippet}

		{#snippet advancedFilters()}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<AdminFilterToggle
					label="Include Inactive"
					name="includeInactive"
					checked={includeInactive}
					uncheckedValue="false"
					onclick={(e: MouseEvent) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) {
							setTimeout(() => {
								form.requestSubmit();
							}, 0);
						}
					}}
				/>

				<AdminSelect
					label="Parent Category"
					name="parentId"
					value={data.filters.parentId}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				>
					<option value="">All parents</option>
					<option value="root">Root only</option>
					{#each allCategories.filter((c) => !c.parentId) as cat (cat.id)}
						<option value={cat.id}>
							{cat.name}
						</option>
					{/each}
				</AdminSelect>
			</div>
		{/snippet}

		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each [0, 1, 2, 3, 4] as index (index)}
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
						<div class="h-6 w-24 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}

		{#snippet card(category: CategoryItem)}
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
							<span class="text-bone">{parentCategoryName(category.parentId, allCategories)}</span>
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

		{#snippet row(category: CategoryItem)}
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
					{parentCategoryName(category.parentId, allCategories)}
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

		{#snippet emptyState()}
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
		{/snippet}
	</AdminListLayout>
{/await}

<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	duration={5000}
	onclose={() => (toastMessage = null)}
/>
