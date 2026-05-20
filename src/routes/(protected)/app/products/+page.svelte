<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Eye,
		Filter,
		ImageOff,
		Pencil,
		Plus,
		Power,
		Sparkles,
		Star,
		Trash2
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type ProductItem = PageData['products']['items'][number];

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

	const products = $derived(data.products.items);
	const activeCount = $derived(products.filter((product) => product.isActive).length);
	const draftCount = $derived(products.filter((product) => !product.isActive).length);
	const hasNextPage = $derived(data.products.offset + data.products.limit < data.products.total);
	const hasPreviousPage = $derived(data.products.offset > 0);
	const productActionMessage = $derived(
		actionData?.form?.message ?? $deleteProductMessage ?? $updateProductFlagsMessage
	);
	const productActionMessageClass = $derived(
		page.status >= 400
			? 'border-red-400/30 bg-red-950/20 text-red-300'
			: 'border-volt/30 bg-volt/10 text-volt'
	);

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function previousOffset(): number {
		return Math.max(0, data.products.offset - data.products.limit);
	}

	function nextOffset(): number {
		return data.products.offset + data.products.limit;
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

	function productStatusLabel(product: ProductItem): string {
		if (product.isActive) return 'Active';
		return product.tier === 'drop' && !product.dropAssignment ? 'Needs drop' : 'Inactive';
	}

	function productStatusClass(product: ProductItem): string {
		if (product.isActive) return 'text-volt';
		return product.tier === 'drop' && !product.dropAssignment ? 'text-amber-300' : 'text-red-300';
	}
</script>

<svelte:head>
	<title>Products | Caro Admin</title>
	<meta name="description" content="Manage Caro products, pricing, media, and publish state." />
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<section class="mx-auto max-w-7xl overflow-x-hidden">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Catalog</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				Products
			</h1>
		</div>

		<a
			href={resolve('/app/products/new')}
			class="mt-5 inline-flex min-h-11 items-center gap-2 bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone md:mt-0"
		>
			<Plus size={14} aria-hidden="true" />
			New Product
		</a>
	</div>

	{#if productActionMessage}
		<p
			class="mt-6 border px-4 py-3 font-mono text-[10px] tracking-widest uppercase {productActionMessageClass}"
		>
			{productActionMessage}
		</p>
	{/if}

	<div class="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
		<div class="min-w-0 border border-charcoal bg-charcoal/25 p-3 sm:p-5">
			<p
				class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
			>
				Total
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
				{data.products.total}
			</p>
		</div>
		<div class="min-w-0 border border-charcoal bg-charcoal/25 p-3 sm:p-5">
			<p
				class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
			>
				Active
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
				{activeCount}
			</p>
		</div>
		<div class="min-w-0 border border-charcoal bg-charcoal/25 p-3 sm:p-5">
			<p
				class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
			>
				Inactive
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
				{draftCount}
			</p>
		</div>
	</div>

	<section class="mt-4 overflow-hidden border border-charcoal bg-charcoal/25">
		<div class="border-b border-charcoal p-5">
			<div class="items-start justify-between gap-4 md:flex">
				<div>
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
						{data.products.total} products
					</p>
				</div>

				<details class="mt-4 md:hidden">
					<summary
						class="flex h-11 cursor-pointer items-center gap-2 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<Filter size={14} aria-hidden="true" />
						Filters
					</summary>
					<form
						method="GET"
						class="mt-3 grid gap-3"
						data-sveltekit-keepfocus
						data-sveltekit-noscroll
					>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Category</span>
							<select
								name="categoryId"
								onchange={autoSubmitFilter}
								class="min-h-11 border border-charcoal bg-void px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								<option value="" selected={data.filters.categoryId === ''}>All categories</option>
								{#each data.categories as category (category.id)}
									<option value={category.id} selected={data.filters.categoryId === category.id}>
										{category.name}
									</option>
								{/each}
							</select>
						</label>
						<div class="grid gap-3 sm:grid-cols-2">
							<label class="grid gap-1">
								<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Tier</span>
								<select
									name="tier"
									onchange={autoSubmitFilter}
									class="min-h-11 border border-charcoal bg-void px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
								>
									<option value="" selected={data.filters.tier === ''}>All tiers</option>
									{#each data.tierOptions as option (option.value)}
										<option value={option.value} selected={data.filters.tier === option.value}>
											{option.label}
										</option>
									{/each}
								</select>
							</label>
							<label class="grid gap-1">
								<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Gender</span>
								<select
									name="gender"
									onchange={autoSubmitFilter}
									class="min-h-11 border border-charcoal bg-void px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
								>
									<option value="" selected={data.filters.gender === ''}>All genders</option>
									{#each data.genderOptions as option (option.value)}
										<option value={option.value} selected={data.filters.gender === option.value}>
											{option.label}
										</option>
									{/each}
								</select>
							</label>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							<label class="grid gap-1">
								<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
									>Featured</span
								>
								<select
									name="isFeatured"
									onchange={autoSubmitFilter}
									class="min-h-11 border border-charcoal bg-void px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
								>
									<option value="" selected={data.filters.isFeatured === ''}>Any</option>
									<option value="true" selected={data.filters.isFeatured === 'true'}
										>Featured</option
									>
									<option value="false" selected={data.filters.isFeatured === 'false'}
										>Not featured</option
									>
								</select>
							</label>
							<label class="grid gap-1">
								<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
									>New arrival</span
								>
								<select
									name="isNewArrival"
									onchange={autoSubmitFilter}
									class="min-h-11 border border-charcoal bg-void px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
								>
									<option value="" selected={data.filters.isNewArrival === ''}>Any</option>
									<option value="true" selected={data.filters.isNewArrival === 'true'}>New</option>
									<option value="false" selected={data.filters.isNewArrival === 'false'}
										>Not new</option
									>
								</select>
							</label>
						</div>
						<label
							class="flex min-h-11 items-center gap-2 border border-charcoal bg-void px-3 font-mono text-[10px] tracking-widest text-ash uppercase"
						>
							<input
								type="checkbox"
								name="includeInactive"
								value="true"
								checked={data.filters.includeInactive}
								onchange={autoSubmitFilter}
							/>
							Include inactive
						</label>
						<input type="hidden" name="includeInactive" value="false" />
						<input type="hidden" name="limit" value={data.filters.limit} />
						<input type="hidden" name="offset" value="0" />
						<button type="submit" class="sr-only">Apply filters</button>
					</form>
				</details>

				<form
					method="GET"
					class="mt-4 hidden flex-wrap gap-2 md:flex"
					data-sveltekit-keepfocus
					data-sveltekit-noscroll
				>
					<select
						name="categoryId"
						aria-label="Category"
						onchange={autoSubmitFilter}
						class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
					>
						<option value="" selected={data.filters.categoryId === ''}>All categories</option>
						{#each data.categories as category (category.id)}
							<option value={category.id} selected={data.filters.categoryId === category.id}>
								{category.name}
							</option>
						{/each}
					</select>
					<select
						name="tier"
						aria-label="Tier"
						onchange={autoSubmitFilter}
						class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
					>
						<option value="" selected={data.filters.tier === ''}>All tiers</option>
						{#each data.tierOptions as option (option.value)}
							<option value={option.value} selected={data.filters.tier === option.value}>
								{option.label}
							</option>
						{/each}
					</select>
					<select
						name="gender"
						aria-label="Gender"
						onchange={autoSubmitFilter}
						class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
					>
						<option value="" selected={data.filters.gender === ''}>All genders</option>
						{#each data.genderOptions as option (option.value)}
							<option value={option.value} selected={data.filters.gender === option.value}>
								{option.label}
							</option>
						{/each}
					</select>
					<select
						name="isFeatured"
						aria-label="Featured"
						onchange={autoSubmitFilter}
						class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
					>
						<option value="" selected={data.filters.isFeatured === ''}>Any featured</option>
						<option value="true" selected={data.filters.isFeatured === 'true'}>Featured</option>
						<option value="false" selected={data.filters.isFeatured === 'false'}
							>Not featured</option
						>
					</select>
					<select
						name="isNewArrival"
						aria-label="New arrival"
						onchange={autoSubmitFilter}
						class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
					>
						<option value="" selected={data.filters.isNewArrival === ''}>Any arrival</option>
						<option value="true" selected={data.filters.isNewArrival === 'true'}>New arrival</option
						>
						<option value="false" selected={data.filters.isNewArrival === 'false'}>Not new</option>
					</select>
					<label
						class="flex items-center gap-2 border border-charcoal bg-void px-3 py-2 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<input
							type="checkbox"
							name="includeInactive"
							value="true"
							checked={data.filters.includeInactive}
							onchange={autoSubmitFilter}
						/>
						Inactive
					</label>
					<input type="hidden" name="includeInactive" value="false" />
					<input type="hidden" name="limit" value={data.filters.limit} />
					<input type="hidden" name="offset" value="0" />
					<button type="submit" class="sr-only">Apply filters</button>
				</form>
			</div>
		</div>

		{#if products.length > 0}
			<div class="grid gap-3 p-3 md:grid-cols-2 md:p-4 xl:hidden">
				{#each products as product (product.id)}
					<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
						<div
							class="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)]"
						>
							<a
								href={resolve(`/app/products/${product.slug}`)}
								class="grid aspect-[3/4] w-full place-items-center border border-charcoal bg-charcoal/30"
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
									<span
										class="border border-charcoal px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase"
									>
										{formatLabel(product.tier)}
									</span>
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
				{/each}
			</div>

			<div class="hidden overflow-hidden xl:block">
				<table class="w-full text-left">
					<thead class="border-b border-charcoal">
						<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
							<th class="px-5 py-4 font-normal">Product</th>
							<th class="px-5 py-4 font-normal">Tier</th>
							<th class="px-5 py-4 font-normal">Price</th>
							<th class="px-5 py-4 font-normal">Category</th>
							<th class="px-5 py-4 font-normal">State</th>
							<th class="px-5 py-4 font-normal">Media</th>
							<th class="px-5 py-4 text-right font-normal">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each products as product (product.id)}
							<tr class="border-b border-charcoal/70 last:border-b-0">
								<td class="px-5 py-4">
									<div class="flex min-w-0 items-center gap-3">
										<a
											href={resolve(`/app/products/${product.slug}`)}
											class="grid h-16 w-12 shrink-0 place-items-center border border-charcoal bg-void"
											aria-label={`View ${product.name}`}
										>
											{#if product.primaryImageUrl}
												<img
													src={product.primaryImageUrl}
													alt=""
													class="h-full w-full object-cover"
												/>
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
								<td class="px-5 py-4 font-mono text-[10px] tracking-widest text-ash uppercase">
									{formatLabel(product.tier)}
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
											class="font-mono text-[10px] tracking-widest uppercase {productStatusClass(
												product
											)}"
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
											<form
												method="POST"
												action="?/updateProductFlags"
												use:updateProductFlagsEnhance
											>
												<input type="hidden" name="productId" value={product.id} />
												<input type="hidden" name="isActive" value={String(!product.isActive)} />
												<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
												<input
													type="hidden"
													name="isNewArrival"
													value={String(product.isNewArrival)}
												/>
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
											<form
												method="POST"
												action="?/updateProductFlags"
												use:updateProductFlagsEnhance
											>
												<input type="hidden" name="productId" value={product.id} />
												<input type="hidden" name="isActive" value={String(product.isActive)} />
												<input
													type="hidden"
													name="isFeatured"
													value={String(!product.isFeatured)}
												/>
												<input
													type="hidden"
													name="isNewArrival"
													value={String(product.isNewArrival)}
												/>
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
											<form
												method="POST"
												action="?/updateProductFlags"
												use:updateProductFlagsEnhance
											>
												<input type="hidden" name="productId" value={product.id} />
												<input type="hidden" name="isActive" value={String(product.isActive)} />
												<input type="hidden" name="isFeatured" value={String(product.isFeatured)} />
												<input
													type="hidden"
													name="isNewArrival"
													value={String(!product.isNewArrival)}
												/>
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
						{/each}
					</tbody>
				</table>
			</div>

			<div
				class="flex flex-col gap-3 border-t border-charcoal p-5 font-mono text-[10px] tracking-widest text-ash uppercase sm:flex-row sm:items-center sm:justify-between"
			>
				<p>
					Showing {data.products.offset + 1}-{Math.min(
						data.products.offset + data.products.limit,
						data.products.total
					)} of {data.products.total}
				</p>
				<div class="flex gap-2">
					{#if hasPreviousPage}
						<form method="GET">
							{#if data.filters.categoryId}
								<input type="hidden" name="categoryId" value={data.filters.categoryId} />
							{/if}
							{#if data.filters.tier}
								<input type="hidden" name="tier" value={data.filters.tier} />
							{/if}
							{#if data.filters.gender}
								<input type="hidden" name="gender" value={data.filters.gender} />
							{/if}
							{#if data.filters.isFeatured}
								<input type="hidden" name="isFeatured" value={data.filters.isFeatured} />
							{/if}
							{#if data.filters.isNewArrival}
								<input type="hidden" name="isNewArrival" value={data.filters.isNewArrival} />
							{/if}
							<input
								type="hidden"
								name="includeInactive"
								value={String(data.filters.includeInactive)}
							/>
							<input type="hidden" name="limit" value={data.filters.limit} />
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
							{#if data.filters.categoryId}
								<input type="hidden" name="categoryId" value={data.filters.categoryId} />
							{/if}
							{#if data.filters.tier}
								<input type="hidden" name="tier" value={data.filters.tier} />
							{/if}
							{#if data.filters.gender}
								<input type="hidden" name="gender" value={data.filters.gender} />
							{/if}
							{#if data.filters.isFeatured}
								<input type="hidden" name="isFeatured" value={data.filters.isFeatured} />
							{/if}
							{#if data.filters.isNewArrival}
								<input type="hidden" name="isNewArrival" value={data.filters.isNewArrival} />
							{/if}
							<input
								type="hidden"
								name="includeInactive"
								value={String(data.filters.includeInactive)}
							/>
							<input type="hidden" name="limit" value={data.filters.limit} />
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
			</div>
		{/if}
	</section>
</section>
