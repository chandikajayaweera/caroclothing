<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import ProductCard from '$lib/components/product/ProductCard.svelte';

	let { data }: { data: PageData } = $props();

	const products = $derived(data.products.items);
	const total = $derived(data.products.total);

	// Sync local states with filters
	let activeCategory = $derived(data.filters.categoryId);
	let activeGender = $derived(data.filters.gender);
	let activeTier = $derived(data.filters.tier);
	let activeSort = $derived(data.filters.sort);

	function updateFilter(name: string, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) {
			params.set(name, value);
		} else {
			params.delete(name);
		}
		// Reset offset when changing filters
		params.delete('offset');
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function handleCategoryClick(categoryId: string) {
		updateFilter('categoryId', categoryId === activeCategory ? '' : categoryId);
	}

	function handlePageChange(offsetDelta: number) {
		const limit = data.products.limit;
		const currentOffset = data.products.offset;
		const nextOffset = Math.max(0, currentOffset + offsetDelta);
		const params = new URLSearchParams(page.url.searchParams);
		params.set('offset', String(nextOffset));
		goto(`?${params.toString()}`);
	}
</script>

<svelte:head>
	<title>Shop | Caro Clothing</title>
	<meta
		name="description"
		content="Shop the latest premium streetwear drops and core essentials from Caro Clothing."
	/>
</svelte:head>

<div class="min-h-screen bg-void pt-24 pb-20 text-bone">
	<div class="mx-auto max-w-7xl px-4 md:px-8">
		<!-- Header -->
		<div class="mb-10 flex flex-col justify-between border-b border-charcoal pb-6 md:flex-row md:items-end">
			<div>
				<h1 class="font-display text-5xl tracking-tight uppercase md:text-7xl">Shop</h1>
				<p class="mt-2 font-mono text-xs tracking-widest text-ash uppercase">
					{#if activeCategory}
						{data.categories.find(c => c.id === activeCategory)?.name ?? 'Collection'}
					{:else}
						All collections
					{/if}
				</p>
			</div>
			<div class="mt-4 font-mono text-xs tracking-widest text-ash uppercase md:mt-0">
				{total} styles found
			</div>
		</div>

		<!-- Main Layout -->
		<div class="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
			<!-- Filters Sidebar -->
			<aside class="space-y-8">
				<!-- Category -->
				<div>
					<h3 class="mb-4 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Collections</h3>
					<div class="flex flex-wrap gap-2 lg:flex-col lg:items-start lg:gap-3">
						<button
							class="font-mono text-xs uppercase transition-colors hover:text-volt {activeCategory === '' ? 'text-volt font-bold' : 'text-ash'}"
							onclick={() => updateFilter('categoryId', '')}
						>
							All Products
						</button>
						{#each data.categories as category (category.id)}
							<button
								class="font-mono text-xs uppercase transition-colors hover:text-volt {activeCategory === category.id ? 'text-volt font-bold' : 'text-ash'}"
								onclick={() => handleCategoryClick(category.id)}
							>
								{category.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Gender -->
				<div>
					<h3 class="mb-4 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Gender</h3>
					<div class="flex flex-wrap gap-3 lg:flex-col lg:items-start">
						<button
							class="font-mono text-xs uppercase transition-colors hover:text-volt {activeGender === '' ? 'text-volt font-bold' : 'text-ash'}"
							onclick={() => updateFilter('gender', '')}
						>
							All
						</button>
						{#each data.genderOptions as option (option.value)}
							<button
								class="font-mono text-xs uppercase transition-colors hover:text-volt {activeGender === option.value ? 'text-volt font-bold' : 'text-ash'}"
								onclick={() => updateFilter('gender', option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Tier -->
				<div>
					<h3 class="mb-4 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Release Type</h3>
					<div class="flex flex-wrap gap-3 lg:flex-col lg:items-start">
						<button
							class="font-mono text-xs uppercase transition-colors hover:text-volt {activeTier === '' ? 'text-volt font-bold' : 'text-ash'}"
							onclick={() => updateFilter('tier', '')}
						>
							All Releases
						</button>
						{#each data.tierOptions as option (option.value)}
							<button
								class="font-mono text-xs uppercase transition-colors hover:text-volt {activeTier === option.value ? 'text-volt font-bold' : 'text-ash'}"
								onclick={() => updateFilter('tier', option.value)}
							>
								{option.label === 'drop' ? 'Limited Drop' : 'Core restock'}
							</button>
						{/each}
					</div>
				</div>

				<!-- Sort -->
				<div>
					<h3 class="mb-4 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Sort By</h3>
					<select
						value={activeSort}
						onchange={(e) => updateFilter('sort', e.currentTarget.value)}
						class="w-full border border-charcoal bg-void py-2 px-3 font-mono text-xs tracking-wider text-bone uppercase outline-none focus:border-volt"
					>
						<option value="">Default</option>
						<option value="new">Newest First</option>
						<option value="price_asc">Price: Low to High</option>
						<option value="price_desc">Price: High to Low</option>
					</select>
				</div>
			</aside>

			<!-- Products Grid -->
			<main>
				{#if products.length > 0}
					<div class="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
						{#each products as product (product.id)}
							<ProductCard {product} />
						{/each}
					</div>

					<!-- Pagination -->
					<div class="mt-16 flex items-center justify-between border-t border-charcoal pt-6">
						<button
							class="font-mono text-xs tracking-widest text-ash hover:text-volt disabled:opacity-30 disabled:hover:text-ash uppercase"
							disabled={data.products.offset === 0}
							onclick={() => handlePageChange(-data.products.limit)}
						>
							← Prev Page
						</button>
						<span class="font-mono text-xs text-ash">
							{Math.floor(data.products.offset / data.products.limit) + 1}
						</span>
						<button
							class="font-mono text-xs tracking-widest text-ash hover:text-volt disabled:opacity-30 disabled:hover:text-ash uppercase"
							disabled={data.products.offset + products.length >= total}
							onclick={() => handlePageChange(data.products.limit)}
						>
							Next Page →
						</button>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-24 text-center">
						<span class="mb-2 font-display text-4xl text-bone">No styles found.</span>
						<span class="mb-8 font-mono text-xs tracking-widest text-ash/50 uppercase">Try relaxing your filters.</span>
						<a
							href="/shop"
							class="border border-bone py-3 px-6 font-mono text-xs tracking-widest text-bone uppercase hover:bg-bone hover:text-void transition-colors"
						>
							Reset Filters
						</a>
					</div>
				{/if}
			</main>
		</div>
	</div>
</div>
