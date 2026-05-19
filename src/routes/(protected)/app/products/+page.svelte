<script lang="ts">
	import { resolve } from '$app/paths';
	import { Eye, Filter, ImageOff, Pencil, Plus } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: deleteProductMessage,
		enhance: deleteProductEnhance,
		submitting: deleteProductSubmitting
	} = superForm(initialForm(() => data.deleteProductForm));

	const products = $derived(data.products.items);
	const activeCount = $derived(products.filter((product) => product.isActive).length);
	const draftCount = $derived(products.filter((product) => !product.isActive).length);
	const actionMessage = $derived(actionData?.form?.message);
	const hasNextPage = $derived(data.products.offset + data.products.limit < data.products.total);
	const hasPreviousPage = $derived(data.products.offset > 0);

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
</script>

<svelte:head>
	<title>Products | Caro Admin</title>
	<meta name="description" content="Manage Caro products, pricing, media, and publish state." />
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<section class="mx-auto max-w-7xl">
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

	{#if actionMessage || $deleteProductMessage}
		<div class="mt-6 grid gap-2">
			{#if actionMessage}
				<p
					class="border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
				>
					{actionMessage}
				</p>
			{/if}
			{#if $deleteProductMessage}
				<p
					class="border border-red-400/30 bg-red-950/20 px-4 py-3 font-mono text-[10px] tracking-widest text-red-300 uppercase"
				>
					{$deleteProductMessage}
				</p>
			{/if}
		</div>
	{/if}

	<div class="mt-8 grid gap-3 sm:grid-cols-3">
		<div class="border border-charcoal bg-charcoal/25 p-5">
			<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Total</p>
			<p class="mt-2 font-display text-4xl leading-none text-bone uppercase">
				{data.products.total}
			</p>
		</div>
		<div class="border border-charcoal bg-charcoal/25 p-5">
			<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Active</p>
			<p class="mt-2 font-display text-4xl leading-none text-volt uppercase">{activeCount}</p>
		</div>
		<div class="border border-charcoal bg-charcoal/25 p-5">
			<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Inactive</p>
			<p class="mt-2 font-display text-4xl leading-none text-bone uppercase">{draftCount}</p>
		</div>
	</div>

	<section class="mt-4 border border-charcoal bg-charcoal/25">
		<div class="border-b border-charcoal p-5">
			<div class="items-start justify-between gap-4 md:flex">
				<div>
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
						{data.products.total} products
					</p>
					<p class="mt-2 max-w-2xl text-sm leading-6 text-ash">
						Filter catalog items by tier, category, gender, and publish state.
					</p>
				</div>

				<details class="mt-4 md:hidden">
					<summary
						class="flex h-11 cursor-pointer items-center gap-2 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<Filter size={14} aria-hidden="true" />
						Filters
					</summary>
					<form method="GET" class="mt-3 grid gap-3">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Category</span>
							<select
								name="categoryId"
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
						<input type="hidden" name="includeInactive" value="false" />
						<label
							class="flex min-h-11 items-center gap-2 border border-charcoal bg-void px-3 font-mono text-[10px] tracking-widest text-ash uppercase"
						>
							<input
								type="checkbox"
								name="includeInactive"
								value="true"
								checked={data.filters.includeInactive}
							/>
							Include inactive
						</label>
						<input type="hidden" name="limit" value={data.filters.limit} />
						<input type="hidden" name="offset" value="0" />
						<button
							type="submit"
							class="min-h-11 bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
						>
							Apply
						</button>
					</form>
				</details>

				<form method="GET" class="mt-4 hidden flex-wrap gap-2 md:flex">
					<select
						name="categoryId"
						aria-label="Category"
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
						class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
					>
						<option value="" selected={data.filters.gender === ''}>All genders</option>
						{#each data.genderOptions as option (option.value)}
							<option value={option.value} selected={data.filters.gender === option.value}>
								{option.label}
							</option>
						{/each}
					</select>
					<input type="hidden" name="includeInactive" value="false" />
					<label
						class="flex items-center gap-2 border border-charcoal bg-void px-3 py-2 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<input
							type="checkbox"
							name="includeInactive"
							value="true"
							checked={data.filters.includeInactive}
						/>
						Inactive
					</label>
					<input type="hidden" name="limit" value={data.filters.limit} />
					<input type="hidden" name="offset" value="0" />
					<button
						type="submit"
						class="border border-ash/30 px-4 py-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
					>
						Filter
					</button>
				</form>
			</div>
		</div>

		{#if products.length > 0}
			<div class="divide-y divide-charcoal md:hidden">
				{#each products as product (product.id)}
					<article class="p-4">
						<div class="flex gap-4">
							<a
								href={resolve(`/app/products/${product.slug}`)}
								class="grid h-24 w-20 shrink-0 place-items-center border border-charcoal bg-void"
								aria-label={`View ${product.name}`}
							>
								{#if product.primaryImageUrl}
									<img src={product.primaryImageUrl} alt="" class="h-full w-full object-cover" />
								{:else}
									<ImageOff size={18} class="text-ash/50" aria-hidden="true" />
								{/if}
							</a>
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-3">
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
										class="font-mono text-[10px] tracking-widest uppercase {product.isActive
											? 'text-volt'
											: 'text-red-300'}"
									>
										{product.isActive ? 'Active' : 'Inactive'}
									</span>
								</div>
								<div class="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase">
									<span class="text-bone">{formatMoney(product.basePrice)}</span>
									<span class="text-ash">{formatLabel(product.tier)}</span>
									<span class="truncate text-ash">{product.category?.name ?? 'No category'}</span>
									<span class="text-ash">{product.images.length} images</span>
								</div>
								<div class="mt-4 flex flex-wrap gap-2">
									<a
										href={resolve(`/app/products/${product.slug}`)}
										class="inline-flex min-h-11 items-center gap-2 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
									>
										<Eye size={13} aria-hidden="true" />
										View
									</a>
									<a
										href={resolve(`/app/products/${product.slug}/edit`)}
										class="inline-flex min-h-11 items-center gap-2 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
									>
										<Pencil size={13} aria-hidden="true" />
										Edit
									</a>
								</div>
							</div>
						</div>
					</article>
				{/each}
			</div>

			<div class="hidden overflow-x-auto md:block">
				<table class="w-full min-w-[980px] text-left">
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
											<p class="mt-1 max-w-[260px] truncate font-mono text-[10px] text-ash">
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
									<span
										class="font-mono text-[10px] tracking-widest uppercase {product.isActive
											? 'text-volt'
											: 'text-red-300'}"
									>
										{product.isActive ? 'Active' : 'Inactive'}
									</span>
								</td>
								<td class="px-5 py-4 font-mono text-[10px] text-ash">
									{product.images.length} images / {product.variants.length} variants
								</td>
								<td class="px-5 py-4">
									<div class="flex items-center justify-end gap-3">
										<a
											href={resolve(`/app/products/${product.slug}`)}
											class="font-mono text-[10px] tracking-widest text-volt uppercase hover:text-bone"
										>
											View
										</a>
										<a
											href={resolve(`/app/products/${product.slug}/edit`)}
											class="font-mono text-[10px] tracking-widest text-bone uppercase hover:text-volt"
										>
											Edit
										</a>
										<form method="POST" action="?/deleteProduct" use:deleteProductEnhance>
											<input type="hidden" name="productId" value={product.id} />
											<button
												type="submit"
												disabled={$deleteProductSubmitting}
												class="font-mono text-[10px] tracking-widest text-red-300 uppercase hover:text-red-200 disabled:opacity-50"
											>
												Delete
											</button>
										</form>
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
