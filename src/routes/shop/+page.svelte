<script lang="ts">
	import { page } from '$app/state';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import SortBottomSheet from '$lib/components/filters/SortBottomSheet.svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';

	let isSortOpen = $state(false);
	const isDropActive = true; // Hardcoded for Phase 3

	// Dynamic Title Logic
	const pageTitle = $derived.by(() => {
		const gender = page.url.searchParams.get('gender');
		const isNew = page.url.searchParams.get('isNewArrival') === 'true';

		if (isNew) return 'New In';
		if (gender === 'men') return "Men's";
		if (gender === 'women') return "Women's";
		return 'Shop All';
	});

	const products = [
		{
			name: 'Void Oversized Tee',
			slug: 'void-oversized-tee',
			price: 3200,
			compareAtPrice: 4000,
			colorSwatches: [
				{ name: 'Void Black', hex: '#0A0A0A' },
				{ name: 'Ash Grey', hex: '#B4AFA8' }
			],
			primaryImage: '/images/black_tee.png',
			hoverImage: '/images/black_tee.png',
			badge: 'LOW STOCK'
		},
		{
			name: 'Bone Staple Tee',
			slug: 'bone-staple-tee',
			price: 2900,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Off White', hex: '#F8F5F0' }],
			primaryImage: '/images/white_tee.png',
			hoverImage: '/images/white_tee.png',
			badge: 'NEW'
		},
		{
			name: 'Void Graphite Hoodie',
			slug: 'void-graphite-hoodie',
			price: 5200,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Graphite', hex: '#1C1C1C' }],
			primaryImage: '/images/black_tee.png',
			hoverImage: '/images/black_tee.png',
			badge: null
		},
		{
			name: 'Bone Cargo Pants',
			slug: 'bone-cargo-pants',
			price: 4500,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Bone', hex: '#F8F5F0' }],
			primaryImage: '/images/white_tee.png',
			hoverImage: '/images/white_tee.png',
			badge: 'ALMOST GONE'
		},
		{
			name: 'Void Signature Cap',
			slug: 'void-signature-cap',
			price: 1800,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Black', hex: '#0A0A0A' }],
			primaryImage: '/images/black_tee.png',
			hoverImage: '/images/black_tee.png',
			badge: null
		},
		{
			name: 'Bone Ribbed Socks',
			slug: 'bone-ribbed-socks',
			price: 850,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Off White', hex: '#F8F5F0' }],
			primaryImage: '/images/white_tee.png',
			hoverImage: '/images/white_tee.png',
			badge: 'NEW'
		},
		{
			name: 'Void Canvas Tote',
			slug: 'void-canvas-tote',
			price: 1500,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Black', hex: '#0A0A0A' }],
			primaryImage: '/images/black_tee.png',
			hoverImage: '/images/black_tee.png',
			badge: 'LOW STOCK'
		},
		{
			name: 'Bone Minimalist Belt',
			slug: 'bone-minimalist-belt',
			price: 2200,
			compareAtPrice: null,
			colorSwatches: [{ name: 'Tan', hex: '#B4AFA8' }],
			primaryImage: '/images/white_tee.png',
			hoverImage: '/images/white_tee.png',
			badge: 'SOLD OUT'
		}
	];
</script>

<div class="min-h-screen md:pt-[60px] lg:pt-16">
	{#if isDropActive}
		<div class="bg-charcoal px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between border-b border-void">
			<div class="flex items-center gap-3">
				<span class="font-mono text-[9px] text-bone uppercase tracking-widest">DROP 001 — LIVE NOW</span>
				<span class="w-1.5 h-1.5 rounded-full bg-volt animate-pulse"></span>
			</div>
			<p class="hidden md:block font-mono text-[9px] text-ash uppercase tracking-widest">Limited drops. Real stock.</p>
		</div>
	{/if}

	<!-- PLP Header -->
	<header class="pt-10 pb-6 px-4 md:px-6 lg:pt-16 lg:pb-12 lg:px-8 flex flex-col md:flex-row md:items-baseline md:justify-between border-b border-charcoal lg:border-none bg-void">
		<div>
			<h1 class="font-display text-6xl md:text-7xl lg:text-8xl text-bone uppercase leading-none">{pageTitle}</h1>
			<p class="font-mono text-[10px] text-ash mt-4 uppercase tracking-[0.2em]">
				<span class="text-bone">{products.length}</span> Styles in total
			</p>
		</div>
	</header>

	<!-- Filter Bar -->
	<FilterBar />

	<!-- Product Grid -->
	<section class="py-12 px-4 md:px-6 lg:py-20 lg:px-8">
		{#if products.length > 0}
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-12 max-w-7xl mx-auto">
				{#each products as product}
					<ProductCard {product} />
				{/each}
			</div>
		{:else}
			<div class="py-32 flex flex-col items-center justify-center text-center">
				<h2 class="font-display text-5xl text-bone mb-4 uppercase">Nothing here.</h2>
				<p class="font-mono text-[10px] text-ash uppercase tracking-widest mb-8">Try a different filter.</p>
				<button class="border border-ash/30 text-ash px-8 py-3 font-mono text-[10px] uppercase tracking-widest hover:border-volt hover:text-volt transition-colors">
					Clear Filters
				</button>
			</div>
		{/if}
	</section>
</div>

<SortBottomSheet isOpen={isSortOpen} onClose={() => (isSortOpen = false)} />
