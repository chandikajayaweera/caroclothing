<script lang="ts">
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';

	let { product }: { product: any } = $props();

	const isSaved = $derived(wishlist.has(product.id));

	function toggleWishlist(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		wishlist.toggle(product.id);
	}

	const primaryImage = $derived(
		product.primaryImageUrl ?? product.primaryImage ?? '/images/placeholder.jpg'
	);
	const hoverImage = $derived(product.images?.[1]?.imageUrl ?? product.hoverImage ?? primaryImage);
	const price = $derived(product.basePrice ?? product.price ?? 0);

	const colorSwatches = $derived.by(() => {
		if (product.colorSwatches) return product.colorSwatches;
		const swatches: { name: string; hex: string }[] = [];
		const seen = new Set<string>();
		for (const variant of product.variants ?? []) {
			if (variant.color && !seen.has(variant.color)) {
				seen.add(variant.color);
				swatches.push({
					name: variant.color,
					hex: variant.colorHex ?? '#FFFFFF'
				});
			}
		}
		return swatches;
	});
</script>

<div class="group relative flex cursor-pointer flex-col">
	<a href="/shop/{product.slug}" class="block">
		<!-- Image container -->
		<div class="relative aspect-[3/4] overflow-hidden rounded-none bg-charcoal">
			<!-- Primary Image -->
			<img
				src={primaryImage}
				alt={product.name}
				class="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
			/>

			<!-- Hover Image -->
			{#if hoverImage !== primaryImage}
				<img
					src={hoverImage}
					alt={product.name}
					class="absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				/>
			{/if}

			<!-- Badge -->
			<div class="absolute top-2 left-2 z-10 flex flex-col gap-1">
				{#if product.stockStatus === 'sold-out'}
					<span
						class="border border-ash/20 bg-charcoal px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-ash uppercase"
					>
						SOLD OUT
					</span>
				{:else if product.stockStatus === 'low-stock'}
					<span
						class="bg-volt px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.15em] text-void uppercase"
					>
						LOW STOCK
					</span>
				{:else if product.tier === 'drop'}
					<span
						class="bg-volt px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-void uppercase"
					>
						DROP
					</span>
				{:else if product.isNewArrival || product.badge === 'NEW'}
					<span
						class="bg-bone px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-void uppercase"
					>
						NEW
					</span>
				{:else if product.badge}
					<span
						class="bg-bone px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-void uppercase"
					>
						{product.badge}
					</span>
				{/if}
			</div>

			<!-- Wishlist Heart -->
			<button
				class="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100"
				onclick={toggleWishlist}
				aria-label="Add to wishlist"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill={isSaved ? 'var(--color-volt)' : 'none'}
					stroke={isSaved ? 'var(--color-volt)' : 'var(--color-bone)'}
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="transition-colors"
				>
					<path
						d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
					/>
				</svg>
			</button>
		</div>

		<!-- Info below image -->
		<div class="flex flex-col gap-1 pt-2">
			<h3
				class="font-sans text-sm leading-snug font-medium text-bone decoration-volt underline-offset-4 group-hover:underline"
			>
				{product.name}
			</h3>
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-sm text-bone">LKR {price.toLocaleString()}</span>
				{#if product.compareAtPrice}
					<span class="font-mono text-xs text-ash line-through">
						LKR {product.compareAtPrice.toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Color swatches -->
			{#if colorSwatches.length > 0}
				<div class="mt-1 flex gap-1.5">
					{#each colorSwatches as swatch}
						<div
							class="h-3 w-3 rounded-full border border-ash/20"
							style="background-color: {swatch.hex}"
							title={swatch.name}
						></div>
					{/each}
				</div>
			{/if}
		</div>
	</a>
</div>
