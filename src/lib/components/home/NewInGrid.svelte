<script lang="ts">
	import ProductCard from '../product/ProductCard.svelte';

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
		// Mocking 2 more to fill the grid
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
		}
	];
</script>

<section class="py-12 px-4 md:px-6 lg:py-20 lg:px-8 bg-void">
	<div class="max-w-7xl mx-auto">
		<div class="flex items-baseline justify-between mb-6 md:mb-10 lg:mb-12">
			<h2 class="font-display text-5xl md:text-6xl lg:text-8xl text-bone uppercase">New In</h2>
			<a
				href="/shop?sort=new"
				class="font-mono text-[10px] text-ash hover:text-volt uppercase tracking-widest transition-colors"
			>
				[View All]
			</a>
		</div>

		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
			{#each products as product}
				<ProductCard {product} />
			{/each}
		</div>
	</div>
</section>
