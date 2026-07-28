<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Eye, FolderOpen, Pencil, Plus, Power, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import { booleanStatusVariant } from '$lib/shared/admin/status';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminFilterToggle from '$lib/components/admin/filters/AdminFilterToggle.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminEntityMedia from '$lib/components/admin/data-display/AdminEntityMedia.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminConfirmDialog from '$lib/components/admin/overlays/AdminConfirmDialog.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CategoryItem = PageData['categories']['items'][number];
	type AllCategoryItem = PageData['allCategories'][number];

	let categories = $derived(data.categories.items);
	let total = $derived(data.categories.total);
	let allCategories = $derived(data.allCategories);
	let allStatsTotal = $derived(data.allCategories.length);
	let allStatsActive = $derived(data.allCategories.filter((category) => category.isActive).length);
	let allStatsInactive = $derived(
		data.allCategories.filter((category) => !category.isActive).length
	);

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
	let deleteDialogOpen = $state(false);
	let deleteCandidate = $state<CategoryItem | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);

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

	function requestDelete(category: CategoryItem, event: MouseEvent) {
		deleteCandidate = category;
		deleteForm = (event.currentTarget as HTMLElement).closest('form');
		deleteDialogOpen = true;
	}

	function confirmDelete() {
		deleteForm?.requestSubmit();
		deleteDialogOpen = false;
	}
</script>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

{#snippet categoryHeaderActions()}
	<AdminButton href={resolve('/app/categories/new')} variant="volt" size="md" class="mt-5 md:mt-0">
		<Plus size={14} aria-hidden="true" />
		New Category
	</AdminButton>
{/snippet}

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
	headerActions={categoryHeaderActions}
	onclearfilters={clearFilters}
>
	{#snippet advancedFilters()}
		<AdminFilterBar cols={3}>
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
		</AdminFilterBar>
	{/snippet}

	{#snippet card(category: CategoryItem)}
		<AdminEntityCard>
			{#snippet media()}
				<AdminEntityMedia
					href={`/app/categories/${category.slug}`}
					src={category.imageUrl}
					fallbackIcon={FolderOpen}
					ariaLabel={`View ${category.name}`}
				/>
			{/snippet}

			{#snippet header()}
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
					<AdminBadge variant={booleanStatusVariant(category.isActive)} size="xs">
						{category.isActive ? 'Active' : 'Inactive'}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<div class="mt-3 flex flex-wrap gap-1.5">
					<AdminBadge variant="neutral" size="xs">Sort: {category.sortOrder}</AdminBadge>
				</div>
				<AdminMetaGrid cols={1}>
					<div>
						<span class="text-ash/50">Parent: </span>
						<span class="text-bone">{parentCategoryName(category.parentId, allCategories)}</span>
					</div>
				</AdminMetaGrid>
			{/snippet}

			{#snippet description()}
				{#if category.description}
					<p class="mt-2 line-clamp-2 font-sans text-xs text-ash/80">
						{category.description}
					</p>
				{/if}
			{/snippet}

			{#snippet actions()}
				<AdminRowActions cols={4} ariaLabel="Category actions">
					<form method="POST" action="?/updateCategoryFlags" use:updateCategoryFlagsEnhance>
						<input type="hidden" name="categoryId" value={category.id} />
						<input type="hidden" name="isActive" value={String(!category.isActive)} />
						<AdminIconAction
							type="submit"
							disabled={$updateCategoryFlagsSubmitting}
							variant={category.isActive ? 'success' : 'danger'}
							ariaLabel={`${category.isActive ? 'Deactivate' : 'Activate'} ${category.name}`}
							title={category.isActive ? 'Deactivate' : 'Activate'}
						>
							<Power size={14} aria-hidden="true" />
						</AdminIconAction>
					</form>

					<AdminIconAction
						href={`/app/categories/${category.slug}`}
						variant="accent"
						ariaLabel={`View ${category.name}`}
						title="View details"
					>
						<Eye size={14} aria-hidden="true" />
					</AdminIconAction>

					<AdminIconAction
						href={`/app/categories/${category.slug}/edit`}
						variant="neutral"
						ariaLabel={`Edit ${category.name}`}
						title="Edit"
					>
						<Pencil size={14} aria-hidden="true" />
					</AdminIconAction>

					<form method="POST" action="?/deleteCategory" use:deleteCategoryEnhance>
						<input type="hidden" name="categoryId" value={category.id} />
						<AdminIconAction
							type="button"
							disabled={$deleteCategorySubmitting}
							variant="danger"
							onclick={(event) => requestDelete(category, event)}
							ariaLabel={`Delete ${category.name}`}
							title="Delete"
						>
							<Trash2 size={14} aria-hidden="true" />
						</AdminIconAction>
					</form>
				</AdminRowActions>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(category: CategoryItem)}
		<tr class="border-b border-charcoal/70 last:border-b-0">
			<td class="px-5 py-4">
				<div class="flex min-w-0 items-center gap-3">
					<div class="w-16 shrink-0">
						<AdminEntityMedia
							href={`/app/categories/${category.slug}`}
							src={category.imageUrl}
							fallbackIcon={FolderOpen}
							ariaLabel={`View ${category.name}`}
							aspect="landscape"
						/>
					</div>
					<div class="min-w-0">
						<a
							href={resolve(`/app/categories/${category.slug}`)}
							class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
						>
							{category.name}
						</a>
						<p class="mt-1 max-w-55 truncate font-mono text-[10px] text-ash">
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
				<AdminBadge variant={booleanStatusVariant(category.isActive)} size="sm">
					{category.isActive ? 'Active' : 'Inactive'}
				</AdminBadge>
			</td>
			<td class="max-w-62.5 truncate px-5 py-4 font-sans text-xs text-ash/85">
				{category.description || 'No description'}
			</td>
			<td class="px-5 py-4">
				<div class="flex items-center justify-end gap-3">
					<div class="w-10">
						<form method="POST" action="?/updateCategoryFlags" use:updateCategoryFlagsEnhance>
							<input type="hidden" name="categoryId" value={category.id} />
							<input type="hidden" name="isActive" value={String(!category.isActive)} />
							<AdminIconAction
								type="submit"
								disabled={$updateCategoryFlagsSubmitting}
								variant={category.isActive ? 'success' : 'danger'}
								ariaLabel={`${category.isActive ? 'Deactivate' : 'Activate'} ${category.name}`}
								title={category.isActive ? 'Deactivate' : 'Activate'}
							>
								<Power size={14} aria-hidden="true" />
							</AdminIconAction>
						</form>
					</div>
					<div class="h-9 w-px bg-charcoal" aria-hidden="true"></div>
					<div class="w-28">
						<AdminRowActions cols={3} ariaLabel="Category record actions">
							<AdminIconAction
								href={`/app/categories/${category.slug}`}
								variant="accent"
								ariaLabel={`View ${category.name}`}
								title="View details"
							>
								<Eye size={14} aria-hidden="true" />
							</AdminIconAction>
							<AdminIconAction
								href={`/app/categories/${category.slug}/edit`}
								variant="neutral"
								ariaLabel={`Edit ${category.name}`}
								title="Edit"
							>
								<Pencil size={14} aria-hidden="true" />
							</AdminIconAction>
							<form method="POST" action="?/deleteCategory" use:deleteCategoryEnhance>
								<input type="hidden" name="categoryId" value={category.id} />
								<AdminIconAction
									type="button"
									disabled={$deleteCategorySubmitting}
									variant="danger"
									onclick={(event) => requestDelete(category, event)}
									ariaLabel={`Delete ${category.name}`}
									title="Delete"
								>
									<Trash2 size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
						</AdminRowActions>
					</div>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState
			title="No categories found"
			description="Adjust filters or create the first category."
		>
			{#snippet actions()}
				<AdminButton href={resolve('/app/categories/new')} variant="volt" size="md">
					Create Category
				</AdminButton>
			{/snippet}
		</AdminEmptyState>
	{/snippet}
</AdminListLayout>

<AdminConfirmDialog
	bind:open={deleteDialogOpen}
	title="Delete category"
	message={`Delete ${deleteCandidate?.name ?? 'this category'}? This action cannot be undone.`}
	confirmLabel="Delete category"
	loading={$deleteCategorySubmitting}
	onconfirm={confirmDelete}
/>

<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	duration={5000}
	onclose={() => (toastMessage = null)}
/>
