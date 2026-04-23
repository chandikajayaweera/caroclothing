<script lang="ts">
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import SortBottomSheet from '$lib/components/filters/SortBottomSheet.svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';

	let isSortOpen = $state(false);

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
		// Repeat for more styles
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
	<!-- PLP Header -->
	<header class="pt-6 pb-4 px-4 md:px-6 lg:pt-12 lg:pb-8 lg:px-8 flex flex-col md:flex-row md:items-baseline md:justify-between border-b border-charcoal lg:border-none">
		<div>
			<h1 class="font-display text-5xl md:text-6xl lg:text-7xl text-bone uppercase">Shop All</h1>
			<p class="font-mono text-[10px] text-ash mt-1 uppercase tracking-widest">{products.length} Styles</p>
		</div>
	</header>

	<!-- Filter Bar -->
	<FilterBar />

	<!-- Product Grid -->
	<section class="py-6 px-4 md:px-6 lg:py-12 lg:px-8">
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4 max-w-7xl mx-auto">
			{#each products as product}
				<ProductCard {product} />
			{/each}
		</div>
	</section>
</div>

<SortBottomSheet isOpen={isSortOpen} onClose={() => (isSortOpen = false)} />
