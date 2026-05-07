<script lang="ts">
	import { resolve } from '$app/paths';
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

<div class="min-h-screen bg-void px-4 pt-20 pb-32 md:px-8 lg:px-12">
	<div class="mx-auto max-w-7xl">
		<header class="mb-12">
			<h1 class="font-display text-4xl tracking-tight text-bone uppercase md:text-6xl">
				Your Wishlist
			</h1>
			<p class="mt-2 font-mono text-xs tracking-[0.2em] text-ash uppercase">Saved for later</p>
		</header>

		{#if products.length > 0}
			<div class="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4">
				{#each products as product (product.slug)}
					<div class="group flex flex-col gap-3">
						<ProductCard {product} />
						<button
							class="w-full border border-ash/20 bg-void py-3 font-mono text-[10px] tracking-widest text-bone uppercase transition-all duration-300 hover:border-volt hover:bg-volt hover:text-void"
						>
							Move to Bag
						</button>
					</div>
				{/each}
			</div>
		{:else}
			<div
				class="flex flex-col items-center justify-center rounded-sm border border-dashed border-charcoal py-32 text-center"
			>
				<span class="mb-6 font-display text-4xl text-bone uppercase">Nothing saved yet.</span>
				<p class="mb-8 font-mono text-xs tracking-widest text-ash uppercase">
					Sign in to save items across devices.
				</p>
				<div class="flex flex-col gap-4 sm:flex-row">
					<a
						href={resolve('/shop?sort=new')}
						class="bg-volt px-8 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone"
					>
						Browse New In
					</a>
					<a
						href={resolve('/sign-in')}
						class="border border-ash/30 px-8 py-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
					>
						Sign In
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
