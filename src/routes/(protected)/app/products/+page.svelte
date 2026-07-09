<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Eye, ImageOff, Pencil, Plus, Power, Sparkles, Star, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminFilterToggle from '$lib/components/admin/AdminFilterToggle.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type ProductItem = Awaited<PageData['streamed']['products']>['items'][number];

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

	$effect(() => {
		if (productActionMessage) {
			toastMessage = productActionMessage;
		}
	});

	function clearFilters() {
		goto(resolve(`/app/products?includeInactive=${includeInactive}`));
	}

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function productStatusLabel(product: ProductItem): string {
		if (product.isActive) return 'Active';
		return 'Inactive';
	}

	function productStatusClass(product: ProductItem): string {
		if (product.isActive) return 'text-volt';
		return 'text-red-300';
	}
</script>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

{#await Promise.all([data.streamed.products, data.streamed.stats, data.streamed.categories])}
	<AdminListLayout title="Products" loading={true} {tableHeaders} items={[]}>
		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each [0, 1, 2, 3, 4] as index (index)}
					<div
						class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0"
					>
						<div class="flex flex-1 items-center gap-3">
							<div class="h-16 w-12 bg-charcoal"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-1/3 rounded bg-charcoal"></div>
								<div class="h-3 w-1/2 rounded bg-charcoal"></div>
							</div>
						</div>
						<div class="h-6 w-16 bg-charcoal"></div>
						<div class="h-6 w-12 bg-charcoal"></div>
						<div class="h-6 w-20 bg-charcoal"></div>
						<div class="h-6 w-24 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}
		{#snippet card()}{/snippet}
		{#snippet row()}{/snippet}
	</AdminListLayout>
{:then [productsResult, stats, categories]}
	{@const products = productsResult.items}
	{@const total = productsResult.total}
	{@const activeCount = stats.active}
	{@const draftCount = stats.inactive}

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
		onclearfilters={clearFilters}
	>
		{#snippet headerActions()}
			<AdminButton
				href={resolve('/app/products/new')}
				variant="volt"
				size="md"
				class="mt-5 md:mt-0"
			>
				<Plus size={14} aria-hidden="true" />
				New Product
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
			</div>
		{/snippet}

		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each [0, 1, 2, 3, 4] as index (index)}
					<div
						class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0"
					>
						<div class="flex flex-1 items-center gap-3">
							<div class="h-16 w-12 bg-charcoal"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-1/3 rounded bg-charcoal"></div>
								<div class="h-3 w-1/2 rounded bg-charcoal"></div>
							</div>
						</div>
						<div class="h-6 w-16 bg-charcoal"></div>
						<div class="h-6 w-12 bg-charcoal"></div>
						<div class="h-6 w-20 bg-charcoal"></div>
						<div class="h-6 w-24 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}

		{#snippet card(product: ProductItem)}
			<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
				<div
					class="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)]"
				>
					<a
						href={resolve(`/app/products/${product.slug}`)}
						class="grid aspect-3/4 w-full place-items-center border border-charcoal bg-charcoal/30"
						aria-label={`View ${product.name}`}
					>
						{#if product.primaryImageUrl}
							<img src={product.primaryImageUrl} alt="" class="h-full w-full object-cover" />
						{:else}
							<ImageOff size={18} class="text-ash/50" aria-hidden="true" />
						{/if}
					</a>
					<div class="min-w-0 flex-1">
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
							<span
								class="shrink-0 text-right font-mono text-[9px] tracking-widest uppercase {productStatusClass(
									product
								)}"
							>
								{productStatusLabel(product)}
							</span>
						</div>
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#if product.isFeatured}
								<span
									class="border border-amber-300/40 px-2 py-1 font-mono text-[9px] tracking-widest text-amber-300 uppercase"
								>
									Featured
								</span>
							{/if}
							{#if product.isNewArrival}
								<span
									class="border border-sky-300/40 px-2 py-1 font-mono text-[9px] tracking-widest text-sky-300 uppercase"
								>
									New
								</span>
							{/if}
						</div>
						<div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[10px] uppercase">
							<span class="text-bone">{formatMoney(product.basePrice)}</span>
							<span class="truncate text-ash">{product.category?.name ?? 'No category'}</span>
							<span class="text-ash">{product.images.length} images</span>
							<span class="text-ash">{product.variants.length} variants</span>
						</div>
					</div>
				</div>
				<div class="mt-4 grid gap-2">
					<div class="grid grid-cols-3 gap-2" aria-label="Product state actions">
						<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
							<input type="hidden" name="productId" value={product.id} />
							<input type="hidden" name="isActive" value={String(!product.isActive)} />
							<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
							<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
							<button
								type="submit"
								disabled={$updateProductFlagsSubmitting}
								class="grid h-10 w-full place-items-center border transition-colors disabled:opacity-40 {product.isActive
									? 'border-volt/40 bg-volt/10 text-volt hover:bg-volt hover:text-void'
									: 'border-red-400/40 text-red-300 hover:border-volt hover:text-volt'}"
								aria-label={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`}
								title={product.isActive ? 'Deactivate' : 'Activate'}
							>
								<Power size={15} aria-hidden="true" />
							</button>
						</form>
						<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
							<input type="hidden" name="productId" value={product.id} />
							<input type="hidden" name="isActive" value={String(product.isActive)} />
							<input type="hidden" name="isFeatured" value={String(!product.isFeatured)} />
							<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
							<button
								type="submit"
								disabled={$updateProductFlagsSubmitting}
								class="grid h-10 w-full place-items-center border transition-colors disabled:opacity-40 {product.isFeatured
									? 'border-amber-300/50 bg-amber-300/10 text-amber-300'
									: 'border-ash/30 text-ash hover:border-amber-300 hover:text-amber-300'}"
								aria-label={`${product.isFeatured ? 'Remove featured from' : 'Feature'} ${product.name}`}
								title={product.isFeatured ? 'Remove featured' : 'Feature'}
							>
								<Star
									size={15}
									fill={product.isFeatured ? 'currentColor' : 'none'}
									aria-hidden="true"
								/>
							</button>
						</form>
						<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
							<input type="hidden" name="productId" value={product.id} />
							<input type="hidden" name="isActive" value={String(product.isActive)} />
							<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
							<input type="hidden" name="isNewArrival" value={String(!product.isNewArrival)} />
							<button
								type="submit"
								disabled={$updateProductFlagsSubmitting}
								class="grid h-10 w-full place-items-center border transition-colors disabled:opacity-40 {product.isNewArrival
									? 'border-sky-300/50 bg-sky-300/10 text-sky-300'
									: 'border-ash/30 text-ash hover:border-sky-300 hover:text-sky-300'}"
								aria-label={`${product.isNewArrival ? 'Remove new arrival from' : 'Mark new arrival'} ${product.name}`}
								title={product.isNewArrival ? 'Remove new arrival' : 'Mark new arrival'}
							>
								<Sparkles size={15} aria-hidden="true" />
							</button>
						</form>
					</div>
					<div class="grid grid-cols-3 gap-2" aria-label="Product record actions">
						<a
							href={resolve(`/app/products/${product.slug}`)}
							class="grid h-10 place-items-center border border-volt/40 text-volt transition-colors hover:bg-volt hover:text-void"
							aria-label={`View ${product.name}`}
							title="View"
						>
							<Eye size={15} aria-hidden="true" />
						</a>
						<a
							href={resolve(`/app/products/${product.slug}/edit`)}
							class="grid h-10 place-items-center border border-ash/30 text-bone transition-colors hover:border-volt hover:text-volt"
							aria-label={`Edit ${product.name}`}
							title="Edit"
						>
							<Pencil size={15} aria-hidden="true" />
						</a>
						<form method="POST" action="?/deleteProduct" use:deleteProductEnhance>
							<input type="hidden" name="productId" value={product.id} />
							<button
								type="submit"
								disabled={$deleteProductSubmitting}
								class="grid h-10 w-full place-items-center border border-red-400/40 text-red-300 transition-colors hover:bg-red-400 hover:text-void disabled:opacity-40"
								aria-label={`Delete ${product.name}`}
								title="Delete"
							>
								<Trash2 size={15} aria-hidden="true" />
							</button>
						</form>
					</div>
				</div>
			</article>
		{/snippet}

		{#snippet row(product: ProductItem)}
			<tr class="border-b border-charcoal/70 last:border-b-0">
				<td class="px-5 py-4">
					<div class="flex min-w-0 items-center gap-3">
						<a
							href={resolve(`/app/products/${product.slug}`)}
							class="grid h-16 w-12 shrink-0 place-items-center border border-charcoal bg-void"
							aria-label={`View ${product.name}`}
						>
							{#if product.primaryImageUrl}
								<img src={product.primaryImageUrl} alt="" class="h-full w-full object-cover" />
							{:else}
								<ImageOff size={16} class="text-ash/50" aria-hidden="true" />
							{/if}
						</a>
						<div class="min-w-0">
							<a
								href={resolve(`/app/products/${product.slug}`)}
								class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
							>
								{product.name}
							</a>
							<p class="mt-1 max-w-[220px] truncate font-mono text-[10px] text-ash">
								{product.slug}
							</p>
						</div>
					</div>
				</td>
				<td class="px-5 py-4">
					<div class="flex flex-col gap-1 font-mono text-xs">
						<span class="text-bone">{formatMoney(product.basePrice)}</span>
						{#if product.compareAtPrice}
							<span class="text-[10px] text-ash line-through">
								{formatMoney(product.compareAtPrice)}
							</span>
						{/if}
					</div>
				</td>
				<td class="px-5 py-4 font-mono text-[10px] text-ash">
					{product.category?.name ?? 'No category'}
				</td>
				<td class="px-5 py-4">
					<div class="flex flex-col gap-1">
						<span
							class="font-mono text-[10px] tracking-widest uppercase {productStatusClass(product)}"
						>
							{productStatusLabel(product)}
						</span>
						<div class="flex gap-1.5">
							{#if product.isFeatured}
								<span
									class="border border-amber-300/40 px-2 py-1 font-mono text-[8px] tracking-widest text-amber-300 uppercase"
								>
									Featured
								</span>
							{/if}
							{#if product.isNewArrival}
								<span
									class="border border-sky-300/40 px-2 py-1 font-mono text-[8px] tracking-widest text-sky-300 uppercase"
								>
									New
								</span>
							{/if}
						</div>
					</div>
				</td>
				<td class="px-5 py-4 font-mono text-[10px] text-ash">
					{product.images.length} images / {product.variants.length} variants
				</td>
				<td class="px-5 py-4">
					<div class="flex items-center justify-end gap-3">
						<div class="flex items-center gap-2" aria-label="Product state actions">
							<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<input type="hidden" name="isActive" value={String(!product.isActive)} />
								<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
								<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
								<button
									type="submit"
									disabled={$updateProductFlagsSubmitting}
									class="grid h-9 w-9 place-items-center border transition-colors disabled:opacity-40 {product.isActive
										? 'border-volt/40 bg-volt/10 text-volt hover:bg-volt hover:text-void'
										: 'border-red-400/40 text-red-300 hover:border-volt hover:text-volt'}"
									aria-label={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`}
									title={product.isActive ? 'Deactivate' : 'Activate'}
								>
									<Power size={14} aria-hidden="true" />
								</button>
							</form>
							<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<input type="hidden" name="isActive" value={String(product.isActive)} />
								<input type="hidden" name="isFeatured" value={String(!product.isFeatured)} />
								<input type="hidden" name="isNewArrival" value={String(product.isNewArrival)} />
								<button
									type="submit"
									disabled={$updateProductFlagsSubmitting}
									class="grid h-9 w-9 place-items-center border transition-colors disabled:opacity-40 {product.isFeatured
										? 'border-amber-300/50 bg-amber-300/10 text-amber-300'
										: 'border-ash/30 text-ash hover:border-amber-300 hover:text-amber-300'}"
									aria-label={`${product.isFeatured ? 'Remove featured from' : 'Feature'} ${product.name}`}
									title={product.isFeatured ? 'Remove featured' : 'Feature'}
								>
									<Star
										size={14}
										fill={product.isFeatured ? 'currentColor' : 'none'}
										aria-hidden="true"
									/>
								</button>
							</form>
							<form method="POST" action="?/updateProductFlags" use:updateProductFlagsEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<input type="hidden" name="isActive" value={String(product.isActive)} />
								<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
								<input type="hidden" name="isNewArrival" value={String(!product.isNewArrival)} />
								<button
									type="submit"
									disabled={$updateProductFlagsSubmitting}
									class="grid h-9 w-9 place-items-center border transition-colors disabled:opacity-40 {product.isNewArrival
										? 'border-sky-300/50 bg-sky-300/10 text-sky-300'
										: 'border-ash/30 text-ash hover:border-sky-300 hover:text-sky-300'}"
									aria-label={`${product.isNewArrival ? 'Remove new arrival from' : 'Mark new arrival'} ${product.name}`}
									title={product.isNewArrival ? 'Remove new arrival' : 'Mark new arrival'}
								>
									<Sparkles size={14} aria-hidden="true" />
								</button>
							</form>
						</div>
						<div class="h-9 w-px bg-charcoal" aria-hidden="true"></div>
						<div class="flex items-center gap-2" aria-label="Product record actions">
							<a
								href={resolve(`/app/products/${product.slug}`)}
								class="grid h-9 w-9 place-items-center border border-volt/40 text-volt transition-colors hover:bg-volt hover:text-void"
								aria-label={`View ${product.name}`}
								title="View"
							>
								<Eye size={14} aria-hidden="true" />
							</a>
							<a
								href={resolve(`/app/products/${product.slug}/edit`)}
								class="grid h-9 w-9 place-items-center border border-ash/30 text-bone transition-colors hover:border-volt hover:text-volt"
								aria-label={`Edit ${product.name}`}
								title="Edit"
							>
								<Pencil size={14} aria-hidden="true" />
							</a>
							<form method="POST" action="?/deleteProduct" use:deleteProductEnhance>
								<input type="hidden" name="productId" value={product.id} />
								<button
									type="submit"
									disabled={$deleteProductSubmitting}
									class="grid h-9 w-9 place-items-center border border-red-400/40 text-red-300 transition-colors hover:bg-red-400 hover:text-void disabled:opacity-40"
									aria-label={`Delete ${product.name}`}
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
			<p class="font-display text-4xl text-bone uppercase">No products found</p>
			<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
				Adjust filters or create the first product.
			</p>
			<a
				href={resolve('/app/products/new')}
				class="mt-6 inline-flex bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
			>
				Create Product
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
