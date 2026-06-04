<script lang="ts">
	import { enhance } from '$app/forms';
	import ProductCard from '$lib/components/product/ProductCard.svelte';

	let { data } = $props();

	const wishlistItems = $derived(data.wishlist.items);
</script>

<svelte:head>
	<title>My Wishlist | Caro Clothing</title>
	<meta name="description" content="Your wishlisted items" />
</svelte:head>

<div class="flex flex-col gap-8 text-bone">
	<div class="flex items-baseline justify-between border-b border-charcoal pb-4">
		<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">My Wishlist</h2>
		<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
			{data.wishlist.total} items
		</span>
	</div>

	<div class="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 md:gap-x-6">
		{#each wishlistItems as item (item.id)}
			{@const cardProduct = {
				id: item.product.id,
				name: item.product.name,
				slug: item.product.slug,
				tier: item.product.tier,
				primaryImage: item.imageUrl || item.product.imageUrl || '/placeholder.png',
				price: item.effectivePrice,
				compareAtPrice: item.product.compareAtPrice,
				variants: item.variant ? [item.variant] : []
			}}
			<div class="flex flex-col gap-3">
				<ProductCard product={cardProduct} />
				<form
					method="POST"
					action="?/remove"
					use:enhance
					class="mt-1"
				>
					<input type="hidden" name="productId" value={item.productId} />
					<input type="hidden" name="variantId" value={item.variantId || ''} />
					<button
						type="submit"
						class="w-full border border-charcoal bg-transparent py-2.5 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
					>
						Remove
					</button>
				</form>
			</div>
		{:else}
			<div class="col-span-full border border-dashed border-charcoal py-20 text-center">
				<p class="font-mono text-xs text-ash uppercase">Your wishlist is empty.</p>
				<a
					href="/shop"
					class="mt-4 inline-block bg-bone px-6 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-volt"
				>
					Explore Shop
				</a>
			</div>
		{/each}
	</div>
</div>
