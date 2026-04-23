<script lang="ts">
	import { uiStore } from '$lib/stores/ui';

	let { product } = $props();

	let isSaved = $state(false);

	function toggleWishlist(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		isSaved = !isSaved;
		// Add to wishlist store logic here
	}
</script>

<div class="group relative flex flex-col cursor-pointer">
	<a href="/shop/{product.slug}" class="block">
		<!-- Image container -->
		<div class="relative aspect-[3/4] overflow-hidden bg-charcoal rounded-none">
			<!-- Primary Image -->
			<img
				src={product.primaryImage}
				alt={product.name}
				class="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
			/>

			<!-- Hover Image -->
			{#if product.hoverImage && product.hoverImage !== product.primaryImage}
				<img
					src={product.hoverImage}
					alt={product.name}
					class="absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				/>
			{/if}

			<!-- Badge -->
			{#if product.badge}
				<div class="absolute top-2 left-2 z-10">
					{#if product.badge === 'SOLD OUT'}
						<span
							class="bg-charcoal text-ash border border-ash/30 font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5"
						>
							{product.badge}
						</span>
					{:else}
						<span
							class="bg-volt text-void font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5"
						>
							{product.badge}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Wishlist Heart -->
			<button
				class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200"
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
		<div class="pt-2 flex flex-col gap-1">
			<h3
				class="font-sans text-sm font-medium text-bone leading-snug group-hover:underline decoration-volt underline-offset-4"
			>
				{product.name}
			</h3>
			<div class="flex items-baseline gap-2">
				<span class="font-mono text-sm text-bone">LKR {product.price?.toLocaleString()}</span>
				{#if product.compareAtPrice}
					<span class="font-mono text-xs text-ash line-through">
						LKR {product.compareAtPrice.toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Color swatches -->
			{#if product.colorSwatches && product.colorSwatches.length > 0}
				<div class="flex gap-1.5 mt-1">
					{#each product.colorSwatches as swatch}
						<div
							class="w-3 h-3 rounded-full border border-ash/20"
							style="background-color: {swatch.hex}"
							title={swatch.name}
						></div>
					{/each}
				</div>
			{/if}
		</div>
	</a>
</div>
