<script lang="ts">
	import ProductCard from '$lib/components/product/ProductCard.svelte';

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
		}
	];
</script>

<div class="flex flex-col gap-6">
	<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Your Wishlist</h2>

	<div class="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 lg:gap-4">
		{#each products as product}
			<div class="flex flex-col gap-2">
				<ProductCard {product} />
				<button class="w-full bg-void border border-ash/20 text-bone font-mono text-[10px] uppercase tracking-widest py-2 hover:bg-volt hover:text-void hover:border-volt transition-colors">
					Move to Cart
				</button>
			</div>
		{/each}
	</div>

	{#if products.length === 0}
		<div class="py-20 flex flex-col items-center justify-center text-center">
			<span class="font-display text-3xl text-bone mb-2 uppercase">Nothing saved yet.</span>
			<a href="/shop?sort=new" class="font-mono text-xs text-volt uppercase tracking-widest hover:underline">Browse New In →</a>
		</div>
	{/if}
</div>
