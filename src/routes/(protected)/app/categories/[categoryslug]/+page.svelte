<script lang="ts">
	import { resolve } from '$app/paths';
	import { Edit, FolderOpen, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminConfirmDialog from '$lib/components/admin/AdminConfirmDialog.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminDetailLayout from '$lib/components/admin/layout/AdminDetailLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import { formatAdminDate, formatAdminMoney } from '$lib/shared/admin/format';

	let { data }: { data: PageData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: deleteCategoryMessage,
		enhance: deleteCategoryEnhance,
		submitting: deleteCategorySubmitting
	} = superForm(initialForm(() => data.deleteCategoryForm));

	const category = $derived(data.category);
	let deleteDialogOpen = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);

	function confirmDelete(): void {
		deleteForm?.requestSubmit();
		deleteDialogOpen = false;
	}
</script>

<form
	method="POST"
	action="?/deleteCategory"
	use:deleteCategoryEnhance
	bind:this={deleteForm}
	class="hidden"
>
	<input type="hidden" name="categoryId" value={category.id} />
</form>

<AdminDetailLayout
	backHref={resolve('/app/categories')}
	backLabel="Back to categories"
	kicker="Catalog / Categories"
	title={category.name}
	subtitle={`/${category.slug}`}
	actionMessage={$deleteCategoryMessage}
>
	{#snippet headerActions()}
		<AdminActionToolbar
			ariaLabel="Category actions"
			menuItems={[
				{
					label: 'Delete category',
					description: 'Permanently remove this category.',
					icon: Trash2,
					tone: 'danger',
					disabled: $deleteCategorySubmitting,
					onselect: () => (deleteDialogOpen = true)
				}
			]}
		>
			{#snippet primary()}
				<AdminButton href={resolve(`/app/categories/${category.slug}/edit`)} variant="volt">
					<Edit size={14} aria-hidden="true" />
					Edit category
				</AdminButton>
			{/snippet}
		</AdminActionToolbar>
	{/snippet}

	{#snippet mainContent()}
		<!-- Category Banner Card -->
		<AdminCard bg="bg-charcoal" border="border border-charcoal" class="overflow-hidden p-5 sm:p-6">
			<div
				class="relative flex aspect-video w-full items-center justify-center overflow-hidden border border-charcoal bg-void"
			>
				{#if category.imageUrl}
					<img src={category.imageUrl} alt={category.name} class="h-full w-full object-cover" />
				{:else}
					<FolderOpen size={48} class="text-ash/20" />
				{/if}
			</div>

			<div class="mt-6">
				<h2 class="font-display text-2xl tracking-wider text-bone uppercase">
					Category Description
				</h2>
				<p class="mt-3 font-sans text-sm leading-6 whitespace-pre-wrap text-ash">
					{category.description || 'No description provided for this category.'}
				</p>
			</div>
		</AdminCard>

		<!-- Subcategories Card -->
		<AdminCard bg="bg-charcoal" border="border border-charcoal" class="p-5 sm:p-6">
			{#await data.streamed.subcategories}
				<h2
					class="border-b border-charcoal/80 pb-3 font-display text-xl tracking-wider text-bone uppercase"
				>
					Subcategories
				</h2>
				<div class="mt-4 grid animate-pulse gap-3 sm:grid-cols-2">
					{#each [0, 1] as index (index)}
						<div class="h-20 border border-charcoal bg-void p-4">
							<div class="h-4 w-1/3 rounded bg-charcoal"></div>
							<div class="mt-2 h-3 w-1/2 rounded bg-charcoal"></div>
						</div>
					{/each}
				</div>
			{:then subcategories}
				<h2
					class="border-b border-charcoal/80 pb-3 font-display text-xl tracking-wider text-bone uppercase"
				>
					Subcategories ({subcategories.length})
				</h2>

				{#if subcategories.length > 0}
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						{#each subcategories as sub (sub.id)}
							<a
								href={resolve(`/app/categories/${sub.slug}`)}
								class="group flex items-center justify-between border border-charcoal bg-void p-4 transition-colors hover:border-volt"
							>
								<div>
									<p
										class="font-mono text-xs font-semibold tracking-wider text-bone uppercase group-hover:text-volt"
									>
										{sub.name}
									</p>
									<p class="mt-0.5 font-mono text-[10px] text-ash">/{sub.slug}</p>
								</div>
								<AdminBadge variant={sub.isActive ? 'success' : 'neutral'}>
									{sub.isActive ? 'Active' : 'Draft'}
								</AdminBadge>
							</a>
						{/each}
					</div>
				{:else}
					<AdminEmptyState
						title="No subcategories"
						description="This category has no subcategories."
						size="compact"
					/>
				{/if}
			{/await}
		</AdminCard>
	{/snippet}

	{#snippet sidebarContent()}
		<!-- Category Metadata -->
		<AdminCard border="border border-charcoal" bg="bg-charcoal" padding="p-5">
			<p
				class="border-b border-charcoal/80 pb-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
			>
				Details
			</p>

			<div class="mt-4 grid gap-3 font-mono text-xs uppercase">
				<div class="flex justify-between">
					<span class="text-ash/50">Status:</span>
					<AdminBadge variant={category.isActive ? 'success' : 'danger'}>
						{category.isActive ? 'Active' : 'Draft'}
					</AdminBadge>
				</div>
				<div class="flex justify-between">
					<span class="text-ash/50">Slug:</span>
					<span class="max-w-45 truncate text-bone" title={category.slug}>{category.slug}</span>
				</div>
				<div class="flex justify-between font-mono">
					<span class="text-ash/50">Parent:</span>
					{#if category.parentId}
						{#await data.streamed.parentCategoryName}
							<span class="text-ash/40">Loading parent...</span>
						{:then parentName}
							<span class="max-w-37.5 truncate text-volt" title={parentName || 'Parent Category'}>
								{parentName || 'Parent Category'}
							</span>
						{/await}
					{:else}
						<span class="text-bone">Root</span>
					{/if}
				</div>
				<div class="flex justify-between">
					<span class="text-ash/50">Sort Order:</span>
					<span class="text-bone">{category.sortOrder}</span>
				</div>
				<div class="flex justify-between border-t border-charcoal/60 pt-3 text-[10px]">
					<span class="text-ash/50">Created:</span>
					<span class="text-ash">{formatAdminDate(category.createdAt)}</span>
				</div>
				<div class="flex justify-between text-[10px]">
					<span class="text-ash/50">Updated:</span>
					<span class="text-ash">{formatAdminDate(category.updatedAt)}</span>
				</div>
			</div>
		</AdminCard>

		<!-- Associated Products Sidebar (Limit 100) -->
		<AdminCard border="border border-charcoal" bg="bg-charcoal" padding="p-5">
			{#await data.streamed.products}
				<p
					class="border-b border-charcoal/80 pb-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
				>
					Products
				</p>
				<div class="mt-4 grid animate-pulse gap-3">
					{#each [0, 1] as index (index)}
						<div class="flex gap-3 border border-charcoal bg-void p-3">
							<div class="h-10 w-8 rounded-sm bg-charcoal"></div>
							<div class="flex-1 space-y-2">
								<div class="h-3 w-1/2 rounded bg-charcoal"></div>
								<div class="h-2 w-1/3 rounded bg-charcoal"></div>
							</div>
						</div>
					{/each}
				</div>
			{:then products}
				<p
					class="border-b border-charcoal/80 pb-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
				>
					Products ({products.length})
				</p>

				{#if products.length > 0}
					<div class="mt-4 grid max-h-120 gap-3 overflow-y-auto pr-1">
						{#each products as product (product.id)}
							<div class="flex flex-col justify-between gap-3 border border-charcoal bg-void p-3">
								<div class="flex items-center gap-3">
									<div class="h-10 w-8 shrink-0 overflow-hidden border border-charcoal bg-charcoal">
										{#if product.primaryImageUrl}
											<img
												src={product.primaryImageUrl}
												alt=""
												class="h-full w-full object-cover"
											/>
										{/if}
									</div>
									<div class="min-w-0">
										<a
											href={resolve(`/app/products/${product.slug}`)}
											class="block truncate font-mono text-xs font-semibold tracking-wider text-bone uppercase hover:text-volt"
										>
											{product.name}
										</a>
										<span class="block truncate font-mono text-[9px] text-ash">/{product.slug}</span
										>
									</div>
								</div>
								<div
									class="flex items-center justify-between border-t border-charcoal/60 pt-2 font-mono text-[9px] uppercase"
								>
									<span class="text-bone">{formatAdminMoney(product.basePrice)}</span>
									<AdminBadge variant={product.isActive ? 'success' : 'danger'} size="xs">
										{product.isActive ? 'Active' : 'Inactive'}
									</AdminBadge>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<AdminEmptyState
						title="No products"
						description="No products are assigned to this category."
						size="compact"
					/>
				{/if}
			{/await}
		</AdminCard>
	{/snippet}
</AdminDetailLayout>

<AdminConfirmDialog
	bind:open={deleteDialogOpen}
	title="Delete category"
	message={`Delete ${category.name}? This action cannot be undone.`}
	confirmLabel="Delete category"
	loading={$deleteCategorySubmitting}
	onconfirm={confirmDelete}
/>
