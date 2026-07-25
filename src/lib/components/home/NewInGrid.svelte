<script lang="ts">
	import { resolve } from '$app/paths';
	import ProductCard from '../product/ProductCard.svelte';

	type ProductTile = {
		id: string;
		slug: string;
		name: string;
	};

	let { products = [] }: { products?: ProductTile[] } = $props();
</script>

{#if products.length > 0}
	<section class="bg-void px-4 py-12 md:px-6 lg:px-8 lg:py-20">
		<div class="mx-auto max-w-7xl">
			<div class="mb-6 flex items-baseline justify-between md:mb-10 lg:mb-12">
				<h2 class="font-display text-5xl text-bone uppercase md:text-6xl lg:text-8xl">New In</h2>
				<a
					href={resolve('/shop?sort=new')}
					class="font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:text-volt"
				>
					[View All]
				</a>
			</div>

			<div class="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
				{#each products as product (product.id ?? product.slug)}
					<ProductCard {product} />
				{/each}
			</div>
		</div>
	</section>
{/if}
