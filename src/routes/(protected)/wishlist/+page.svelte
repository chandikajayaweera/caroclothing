<script lang="ts">
	import ProductCard from '$lib/components/product/ProductCard.svelte';

	// For now, using mock data. In production, this would be fetched from a store or DB.
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

<svelte:head>
	<title>Wishlist | Caro Clothing</title>
</svelte:head>

<div class="min-h-screen bg-void pt-20 pb-32 px-4 md:px-8 lg:px-12">
	<div class="max-w-7xl mx-auto">
		<header class="mb-12">
			<h1 class="font-display text-4xl md:text-6xl text-bone uppercase tracking-tight">Your Wishlist</h1>
			<p class="font-mono text-xs text-ash uppercase tracking-[0.2em] mt-2">Saved for later</p>
		</header>

		{#if products.length > 0}
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-12">
				{#each products as product}
					<div class="flex flex-col gap-3 group">
						<ProductCard {product} />
						<button class="w-full bg-void border border-ash/20 text-bone font-mono text-[10px] uppercase tracking-widest py-3 hover:bg-volt hover:text-void hover:border-volt transition-all duration-300">
							Move to Bag
						</button>
					</div>
				{/each}
			</div>
		{:else}
			<div class="py-32 flex flex-col items-center justify-center text-center border border-dashed border-charcoal rounded-sm">
				<span class="font-display text-4xl text-bone mb-6 uppercase">Nothing saved yet.</span>
				<p class="font-mono text-xs text-ash uppercase tracking-widest mb-8">Sign in to save items across devices.</p>
				<div class="flex flex-col sm:flex-row gap-4">
					<a href="/shop?sort=new" class="bg-volt text-void px-8 py-3 font-mono text-[10px] uppercase tracking-widest hover:bg-bone transition-colors">
						Browse New In
					</a>
					<a href="/sign-in" class="border border-ash/30 text-ash px-8 py-3 font-mono text-[10px] uppercase tracking-widest hover:border-volt hover:text-volt transition-colors">
						Sign In
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
