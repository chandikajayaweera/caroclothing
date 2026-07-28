<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Eye, ImageOff, Pencil, Plus, Power, Sparkles, Star, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import { booleanStatusVariant } from '$lib/shared/admin/status';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminFilterToggle from '$lib/components/admin/filters/AdminFilterToggle.svelte';
	import { formatAdminMoney } from '$lib/shared/admin/format';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminEntityMedia from '$lib/components/admin/data-display/AdminEntityMedia.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminConfirmDialog from '$lib/components/admin/overlays/AdminConfirmDialog.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type ProductItem = PageData['products']['items'][number];

	let products = $derived(data.products.items);
	let total = $derived(data.products.total);
	let activeCount = $derived(data.stats.active);
	let draftCount = $derived(data.stats.inactive);
	let categories = $derived(data.categories);

	const tableHeaders = [
		{ label: 'Product' },
		{ label: 'Price' },
		{ label: 'Category' },
		{ label: 'State' },
		{ label: 'Media' },
		{ label: 'Actions', class: 'text-right' }
	];

	let includeInactive = $derived(data.filters.includeInactive);

	const hasActiveFilters = $derived(
		data.filters.categoryId !== '' ||
			data.filters.gender !== '' ||
			data.filters.isFeatured !== '' ||
			data.filters.isNewArrival !== '' ||
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
		message: deleteProductMessage,
		enhance: deleteProductEnhance,
		submitting: deleteProductSubmitting
	} = superForm(initialForm(() => data.deleteProductForm));

	const {
		message: updateProductFlagsMessage,
		enhance: updateProductFlagsEnhance,
		submitting: updateProductFlagsSubmitting
	} = superForm(
		initialForm(() => data.updateProductFlagsForm),
		{
			resetForm: false
		}
	);

	const productActionMessage = $derived(
		actionData?.form?.message ?? $deleteProductMessage ?? $updateProductFlagsMessage
	);

	let toastMessage = $state<string | null>(null);
	let deleteDialogOpen = $state(false);
	let deleteCandidate = $state<ProductItem | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);

	$effect(() => {
		if (productActionMessage) {
			toastMessage = productActionMessage;
		}
	});

	function clearFilters() {
		goto(resolve(`/app/products?includeInactive=${includeInactive}`));
	}

	function requestDelete(product: ProductItem, event: MouseEvent) {
		deleteCandidate = product;
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

{#snippet productHeaderActions()}
	<AdminButton href={resolve('/app/products/new')} variant="volt" size="md" class="mt-5 md:mt-0">
		<Plus size={14} aria-hidden="true" />
		New Product
	</AdminButton>
{/snippet}

<AdminListLayout
	title="Products"
	loading={false}
	stats={{
		total: total,
		active: activeCount,
		inactive: draftCount
	}}
	query={data.filters.query}
	bind:showFilters
	{hasActiveFilters}
	totalItems={total}
	limit={data.filters.limit}
	offset={data.filters.offset}
	{tableHeaders}
	items={products}
	headerActions={productHeaderActions}
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
				label="Category"
				name="categoryId"
				value={data.filters.categoryId}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			>
				<option value="">All categories</option>
				{#each categories as category (category.id)}
					<option value={category.id}>
						{category.name}
					</option>
				{/each}
			</AdminSelect>

			<AdminSelect
				label="Gender"
				name="gender"
				value={data.filters.gender}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
				options={[{ value: '', label: 'All genders' }, ...data.genderOptions]}
			/>

			<AdminSelect
				label="Featured"
				name="isFeatured"
				value={data.filters.isFeatured}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
				options={[
					{ value: '', label: 'Any' },
					{ value: 'true', label: 'Featured' },
					{ value: 'false', label: 'Not featured' }
				]}
			/>

			<AdminSelect
				label="New arrival"
				name="isNewArrival"
				value={data.filters.isNewArrival}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
				options={[
					{ value: '', label: 'Any' },
					{ value: 'true', label: 'New' },
					{ value: 'false', label: 'Not new' }
				]}
			/>
		</AdminFilterBar>
	{/snippet}

	{#snippet card(product: ProductItem)}
		<AdminEntityCard>
			{#snippet media()}
				<AdminEntityMedia
					href={`/app/products/${product.slug}`}
					src={product.primaryImageUrl}
					fallbackIcon={ImageOff}
					ariaLabel={`View ${product.name}`}
					aspect="portrait"
				/>
			{/snippet}

			{#snippet header()}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<a
							href={resolve(`/app/products/${product.slug}`)}
							class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
						>
							{product.name}
						</a>
						<p class="mt-1 truncate font-mono text-[10px] text-ash">{product.slug}</p>
					</div>
					<AdminBadge variant={booleanStatusVariant(product.isActive)} size="xs">
						{product.isActive ? 'Active' : 'Inactive'}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#if product.isFeatured}
						<AdminBadge variant="warning" size="xs">Featured</AdminBadge>
					{/if}
					{#if product.isNewArrival}
						<AdminBadge variant="info" size="xs">New</AdminBadge>
					{/if}
				</div>
				<AdminMetaGrid cols={2}>
					<span class="text-bone">{formatAdminMoney(product.basePrice)}</span>
					<span class="truncate text-ash">{product.category?.name ?? 'No category'}</span>
					<span class="text-ash">{product.images.length} images</span>
					<span class="text-ash">{product.variants.length} variants</span>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<AdminRowActions cols={3} ariaLabel="Product state actions">
					<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
						<input type="hidden" name="productId" value={product.id} />
						<input type="hidden" name="isActive" value={String(!product.isActive)} />
						<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
						<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
						<AdminIconAction
							type="submit"
							disabled={$updateProductFlagsSubmitting}
							variant={product.isActive ? 'success' : 'danger'}
							ariaLabel={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`}
							title={product.isActive ? 'Deactivate' : 'Activate'}
						>
							<Power size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
					<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
						<input type="hidden" name="productId" value={product.id} />
						<input type="hidden" name="isActive" value={String(product.isActive)} />
						<input type="hidden" name="isFeatured" value={String(!product.isFeatured)} />
						<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
						<AdminIconAction
							type="submit"
							disabled={$updateProductFlagsSubmitting}
							variant={product.isFeatured ? 'warning' : 'neutral'}
							ariaLabel={`${product.isFeatured ? 'Remove featured from' : 'Feature'} ${product.name}`}
							title={product.isFeatured ? 'Remove featured' : 'Feature'}
						>
							<Star
								size={15}
								fill={product.isFeatured ? 'currentColor' : 'none'}
								aria-hidden="true"
							/>
						</AdminIconAction>
					</form>
					<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
						<input type="hidden" name="productId" value={product.id} />
						<input type="hidden" name="isActive" value={String(product.isActive)} />
						<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
						<input type="hidden" name="isNewArrival" value={String(!product.isNewArrival)} />
						<AdminIconAction
							type="submit"
							disabled={$updateProductFlagsSubmitting}
							variant={product.isNewArrival ? 'info' : 'neutral'}
							ariaLabel={`${product.isNewArrival ? 'Remove new arrival from' : 'Mark new arrival'} ${product.name}`}
							title={product.isNewArrival ? 'Remove new arrival' : 'Mark new arrival'}
						>
							<Sparkles size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
				</AdminRowActions>
				<AdminRowActions cols={3} ariaLabel="Product record actions">
					<AdminIconAction
						href={`/app/products/${product.slug}`}
						variant="accent"
						ariaLabel={`View ${product.name}`}
						title="View"
					>
						<Eye size={15} aria-hidden="true" />
					</AdminIconAction>
					<AdminIconAction
						href={`/app/products/${product.slug}/edit`}
						variant="neutral"
						ariaLabel={`Edit ${product.name}`}
						title="Edit"
					>
						<Pencil size={15} aria-hidden="true" />
					</AdminIconAction>
					<form method="POST" action="?/deleteProduct" use:deleteProductEnhance>
						<input type="hidden" name="productId" value={product.id} />
						<AdminIconAction
							type="button"
							disabled={$deleteProductSubmitting}
							variant="danger"
							onclick={(event) => requestDelete(product, event)}
							ariaLabel={`Delete ${product.name}`}
							title="Delete"
						>
							<Trash2 size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
				</AdminRowActions>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(product: ProductItem)}
		<tr class="border-b border-charcoal/70 last:border-b-0">
			<td class="px-5 py-4">
				<div class="flex min-w-0 items-center gap-3">
					<div class="w-12 shrink-0">
						<AdminEntityMedia
							href={`/app/products/${product.slug}`}
							src={product.primaryImageUrl}
							fallbackIcon={ImageOff}
							ariaLabel={`View ${product.name}`}
							aspect="portrait"
						/>
					</div>
					<div class="min-w-0">
						<a
							href={resolve(`/app/products/${product.slug}`)}
							class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
						>
							{product.name}
						</a>
						<p class="mt-1 max-w-55 truncate font-mono text-[10px] text-ash">
							{product.slug}
						</p>
					</div>
				</div>
			</td>
			<td class="px-5 py-4">
				<div class="flex flex-col gap-1 font-mono text-xs">
					<span class="text-bone">{formatAdminMoney(product.basePrice)}</span>
					{#if product.compareAtPrice}
						<span class="text-[10px] text-ash line-through">
							{formatAdminMoney(product.compareAtPrice)}
						</span>
					{/if}
				</div>
			</td>
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{product.category?.name ?? 'No category'}
			</td>
			<td class="px-5 py-4">
				<div class="flex flex-col gap-1">
					<AdminBadge variant={booleanStatusVariant(product.isActive)} size="sm">
						{product.isActive ? 'Active' : 'Inactive'}
					</AdminBadge>
					<div class="flex gap-1.5">
						{#if product.isFeatured}
							<AdminBadge variant="warning" size="xs">Featured</AdminBadge>
						{/if}
						{#if product.isNewArrival}
							<AdminBadge variant="info" size="xs">New</AdminBadge>
						{/if}
					</div>
				</div>
			</td>
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{product.images.length} images / {product.variants.length} variants
			</td>
			<td class="px-5 py-4">
				<div class="flex items-center justify-end gap-3">
					<div class="w-28">
						<AdminRowActions cols={3} ariaLabel="Product state actions">
							<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<input type="hidden" name="isActive" value={String(!product.isActive)} />
								<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
								<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
								<AdminIconAction
									type="submit"
									disabled={$updateProductFlagsSubmitting}
									variant={product.isActive ? 'success' : 'danger'}
									ariaLabel={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`}
									title={product.isActive ? 'Deactivate' : 'Activate'}
								>
									<Power size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
							<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<input type="hidden" name="isActive" value={String(product.isActive)} />
								<input type="hidden" name="isFeatured" value={String(!product.isFeatured)} />
								<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
								<AdminIconAction
									type="submit"
									disabled={$updateProductFlagsSubmitting}
									variant={product.isFeatured ? 'warning' : 'neutral'}
									ariaLabel={`${product.isFeatured ? 'Remove featured from' : 'Feature'} ${product.name}`}
									title={product.isFeatured ? 'Remove featured' : 'Feature'}
								>
									<Star
										size={14}
										fill={product.isFeatured ? 'currentColor' : 'none'}
										aria-hidden="true"
									/>
								</AdminIconAction>
							</form>
							<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<input type="hidden" name="isActive" value={String(product.isActive)} />
								<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
								<input type="hidden" name="isNewArrival" value={String(!product.isNewArrival)} />
								<AdminIconAction
									type="submit"
									disabled={$updateProductFlagsSubmitting}
									variant={product.isNewArrival ? 'info' : 'neutral'}
									ariaLabel={`${product.isNewArrival ? 'Remove new arrival from' : 'Mark new arrival'} ${product.name}`}
									title={product.isNewArrival ? 'Remove new arrival' : 'Mark new arrival'}
								>
									<Sparkles size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
						</AdminRowActions>
					</div>
					<div class="h-9 w-px bg-charcoal" aria-hidden="true"></div>
					<div class="w-28">
						<AdminRowActions cols={3} ariaLabel="Product record actions">
							<AdminIconAction
								href={`/app/products/${product.slug}`}
								variant="accent"
								ariaLabel={`View ${product.name}`}
								title="View"
							>
								<Eye size={14} aria-hidden="true" />
							</AdminIconAction>
							<AdminIconAction
								href={`/app/products/${product.slug}/edit`}
								variant="neutral"
								ariaLabel={`Edit ${product.name}`}
								title="Edit"
							>
								<Pencil size={14} aria-hidden="true" />
							</AdminIconAction>
							<form method="POST" action="?/deleteProduct" use:deleteProductEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<AdminIconAction
									type="button"
									disabled={$deleteProductSubmitting}
									variant="danger"
									onclick={(event) => requestDelete(product, event)}
									ariaLabel={`Delete ${product.name}`}
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
			title="No products found"
			description="Adjust filters or create the first product."
		>
			{#snippet actions()}
				<AdminButton href={resolve('/app/products/new')} variant="volt" size="md">
					Create Product
				</AdminButton>
			{/snippet}
		</AdminEmptyState>
	{/snippet}
</AdminListLayout>

<AdminConfirmDialog
	bind:open={deleteDialogOpen}
	title="Delete product"
	message={`Delete ${deleteCandidate?.name ?? 'this product'}? This action cannot be undone.`}
	confirmLabel="Delete product"
	loading={$deleteProductSubmitting}
	onconfirm={confirmDelete}
/>

<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	duration={5000}
	onclose={() => (toastMessage = null)}
/>
