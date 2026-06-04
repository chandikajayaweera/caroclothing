<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { cart } from '$lib/client/modules/stores/cart.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';
	import { openCartDrawer } from '$lib/client/modules/stores/ui';
	import PDPImageGallery from '$lib/components/product/PDPImageGallery.svelte';
	import ColorSelector from '$lib/components/product/ColorSelector.svelte';
	import SizeSelector from '$lib/components/product/SizeSelector.svelte';
	import ProductAccordion from '$lib/components/product/ProductAccordion.svelte';
	import ShippingEstimate from '$lib/components/product/ShippingEstimate.svelte';

	let { data }: { data: PageData } = $props();

	const product = $derived(data.product);

	// Extract unique colors for swatches
	const colors = $derived.by(() => {
		const result: { name: string; hex: string }[] = [];
		const seen = new Set<string>();
		for (const variant of product.variants) {
			if (variant.color && !seen.has(variant.color)) {
				seen.add(variant.color);
				result.push({
					name: variant.color,
					hex: variant.colorHex ?? '#FFFFFF'
				});
			}
		}
		return result;
	});

	let activeColor = $state('');
	let activeSize = $state('');

	// Select first color by default when colors are loaded
	$effect(() => {
		if (colors.length > 0 && !activeColor) {
			activeColor = colors[0].name;
		}
	});

	// Get active variant sizes and stock details
	const sizesForColor = $derived.by(() => {
		if (!activeColor) return [];
		return product.variants
			.filter((v) => v.color === activeColor)
			.map((v) => {
				const inv = data.availability.find((a) => a.variantId === v.id);
				const available = inv ? (!inv.trackInventory || inv.availableQuantity > 0) : true;
				const backorder = inv ? inv.allowBackorder : false;
				return {
					size: v.size,
					available,
					backorder,
					variantId: v.id
				};
			});
	});

	// Select size automatically if there's only one
	$effect(() => {
		if (sizesForColor.length === 1 && sizesForColor[0].available) {
			activeSize = sizesForColor[0].size;
		} else {
			activeSize = '';
		}
	});

	const activeVariant = $derived(
		product.variants.find((v) => v.color === activeColor && v.size === activeSize)
	);

	const activeVariantAvailability = $derived(
		activeVariant ? data.availability.find((a) => a.variantId === activeVariant.id) : null
	);

	const isLowStock = $derived(
		activeVariantAvailability?.trackInventory && activeVariantAvailability.availableQuantity <= 3
	);

	const galleryImages = $derived(
		product.images.map((img) => ({
			url: img.imageUrl,
			alt: img.altText ?? product.name
		}))
	);

	const accordionPanels = $derived([
		{
			id: 'description',
			title: 'Description & Fit',
			content: `${product.description ?? ''}\n\nFit: ${product.fit}\nGender: ${product.gender}`
		},
		{
			id: 'material',
			title: 'Materials & Care',
			content: `Material: ${product.material ?? 'Premium cotton blend'}\n\nCare:\n${product.careInstructions ?? 'Machine wash cold. Tumble dry low.'}`
		}
	]);

	// Review submission state
	let ratingInput = $state(5);
	let commentInput = $state('');
	let titleInput = $state('');
	let reviewSubmitted = $state(false);

	let addToBagLoading = $state(false);

	async function handleAddToBag(e: SubmitEvent) {
		e.preventDefault();
		if (!activeVariant) return;
		addToBagLoading = true;

		try {
			const res = await fetch('/api/cart', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add',
					variantId: activeVariant.id,
					quantity: 1
				})
			});
			if (res.ok) {
				const updatedCart = (await res.json()) as any;
				cart.setCart(updatedCart);
				openCartDrawer();
			}
		} catch (err) {
			console.error('Failed to add to cart:', err);
		} finally {
			addToBagLoading = false;
		}
	}
</script>

<div class="min-h-screen bg-void text-bone pt-24 pb-20">
	<div class="mx-auto max-w-6xl px-4 md:px-8">
		<!-- Back to Shop -->
		<nav class="mb-6">
			<a
				href="/shop"
				class="font-mono text-xs tracking-widest text-ash hover:text-volt uppercase transition-colors"
			>
				← Back to Shop
			</a>
		</nav>

		<!-- PDP Grid -->
		<div class="grid grid-cols-1 gap-10 md:grid-cols-2 lg:gap-16">
			<!-- Left Column: Gallery -->
			<div>
				{#if galleryImages.length > 0}
					<PDPImageGallery images={galleryImages} />
				{:else}
					<div class="aspect-[3/4] w-full bg-charcoal flex items-center justify-center">
						<span class="font-mono text-xs text-ash">No images available</span>
					</div>
				{/if}
			</div>

			<!-- Right Column: Details & CTA -->
			<div class="flex flex-col">
				<div class="mb-4">
					{#if product.tier === 'drop'}
						<span class="bg-volt px-2 py-0.5 font-mono text-[9px] tracking-widest text-void uppercase">
							Limited Drop Release
						</span>
					{/if}
					<h1 class="font-display text-4xl mt-2 leading-none uppercase md:text-5xl">{product.name}</h1>
					<p class="font-mono text-xs text-ash/70 mt-1">{product.shortDescription ?? ''}</p>
				</div>

				<!-- Pricing -->
				<div class="mb-8 flex items-baseline gap-3">
					<span class="font-mono text-xl text-bone">
						LKR {activeVariant ? activeVariant.effectivePrice.toLocaleString() : product.basePrice.toLocaleString()}
					</span>
					{#if product.compareAtPrice}
						<span class="font-mono text-sm text-ash line-through">
							LKR {product.compareAtPrice.toLocaleString()}
						</span>
					{/if}
				</div>

				<!-- Selectors -->
				<div class="space-y-6">
					{#if colors.length > 0}
						<ColorSelector
							{colors}
							{activeColor}
							onSelect={(name) => {
								activeColor = name;
							}}
						/>
					{/if}

					{#if sizesForColor.length > 0}
						<SizeSelector
							sizes={sizesForColor}
							{activeSize}
							onSelect={(size) => {
								activeSize = size;
							}}
						/>
					{/if}
				</div>

				<!-- Stock Signal -->
				{#if isLowStock}
					<p class="mt-4 font-mono text-[10px] text-volt uppercase">
						Low Stock — Only {activeVariantAvailability?.availableQuantity} remaining
					</p>
				{:else if activeVariantAvailability?.trackInventory && activeVariantAvailability.availableQuantity === 0 && !activeVariantAvailability.allowBackorder}
					<p class="mt-4 font-mono text-[10px] text-red-500 uppercase">
						Sold out in this size
					</p>
				{/if}

				<!-- Actions -->
				<div class="mt-8 flex gap-4">
					<!-- Add to Bag Form -->
					<form onsubmit={handleAddToBag} class="flex-1">
						<button
							type="submit"
							class="w-full bg-volt py-4 font-mono text-xs tracking-widest font-bold text-void uppercase transition-all hover:bg-white disabled:bg-charcoal disabled:text-ash/50 cursor-pointer"
							disabled={!activeVariant || (activeVariantAvailability?.trackInventory && activeVariantAvailability.availableQuantity === 0 && !activeVariantAvailability.allowBackorder) || addToBagLoading}
						>
							{#if addToBagLoading}
								ADDING...
							{:else if !activeSize}
								SELECT SIZE
							{:else if activeVariantAvailability?.trackInventory && activeVariantAvailability.availableQuantity === 0 && activeVariantAvailability.allowBackorder}
								BACKORDER
							{:else}
								ADD TO BAG
							{/if}
						</button>
					</form>

					<!-- Wishlist Button -->
					<button
						type="button"
						onclick={() => wishlist.toggle(product.id)}
						class="aspect-square border border-charcoal hover:border-volt/40 flex items-center justify-center p-4 transition-colors text-bone cursor-pointer"
						aria-label="Add to wishlist"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill={wishlist.has(product.id) ? 'var(--color-volt)' : 'none'}
							stroke={wishlist.has(product.id) ? 'var(--color-volt)' : 'currentColor'}
							stroke-width="1.5"
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

				<!-- Shipping Estimate -->
				<ShippingEstimate />

				<!-- Accordion (Product description / details) -->
				<ProductAccordion panels={accordionPanels} />
			</div>
		</div>

		<!-- Reviews Section -->
		<div class="mt-24 border-t border-charcoal pt-16">
			<div class="grid grid-cols-1 gap-12 lg:grid-cols-[300px_1fr]">
				<!-- Left side: Review Stats & Create Review -->
				<div class="space-y-8">
					<div>
						<h2 class="font-display text-3xl uppercase">Customer Reviews</h2>
						<div class="mt-4 flex items-center gap-3">
							<div class="flex items-center gap-0.5 text-volt">
								{#each Array(5) as _, i}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill={i < Math.round(data.reviewsSummary.averageRating ?? 0) ? 'currentColor' : 'none'}
										stroke="currentColor"
										stroke-width="1.5"
									>
										<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
									</svg>
								{/each}
							</div>
							<span class="font-mono text-sm">{(data.reviewsSummary.averageRating ?? 0).toFixed(1)} / 5.0</span>
						</div>
						<p class="font-mono text-xs text-ash mt-1">{data.reviewsSummary.reviewCount} reviews total</p>
					</div>

					<!-- Write review form if eligible -->
					{#if data.reviewEligibility?.canReview}
						{#if reviewSubmitted}
							<div class="border border-volt/20 bg-volt/5 p-4 text-center">
								<p class="font-mono text-xs text-volt uppercase">Review submitted successfully!</p>
								<p class="font-sans text-[11px] text-ash mt-1">Thank you. It will appear after moderation.</p>
							</div>
						{:else}
							<form
								method="POST"
								action="?/submitReview"
								use:enhance={() => {
									return async ({ result }) => {
										if (result.type === 'success') {
											reviewSubmitted = true;
										}
									};
								}}
								class="border border-charcoal p-6 space-y-4"
							>
								<h3 class="font-mono text-[10px] tracking-widest text-ash uppercase">Write a review</h3>
								<input type="hidden" name="productId" value={product.id} />

								<div>
									<label for="review-rating" class="block font-mono text-[9px] text-ash uppercase mb-1">Rating</label>
									<select
										id="review-rating"
										name="rating"
										bind:value={ratingInput}
										class="w-full border border-charcoal bg-void py-2 px-3 font-mono text-xs text-bone outline-none focus:border-volt"
									>
										<option value={5}>5 Stars (Excellent)</option>
										<option value={4}>4 Stars (Good)</option>
										<option value={3}>3 Stars (Average)</option>
										<option value={2}>2 Stars (Poor)</option>
										<option value={1}>1 Star (Terrible)</option>
									</select>
								</div>

								<div>
									<label for="review-title" class="block font-mono text-[9px] text-ash uppercase mb-1">Title (Optional)</label>
									<input
										id="review-title"
										type="text"
										name="title"
										bind:value={titleInput}
										placeholder="SUMMARY OF YOUR EXPERIENCE"
										class="w-full border border-charcoal bg-void py-2 px-3 font-sans text-xs text-bone outline-none placeholder:text-ash/40 focus:border-volt uppercase"
									/>
								</div>

								<div>
									<label for="review-body" class="block font-mono text-[9px] text-ash uppercase mb-1">Review</label>
									<textarea
										id="review-body"
										name="body"
										bind:value={commentInput}
										required
										rows="4"
										placeholder="WHAT DID YOU THINK OF THIS ITEM?"
										class="w-full border border-charcoal bg-void py-2 px-3 font-sans text-xs text-bone outline-none placeholder:text-ash/40 focus:border-volt uppercase"
									></textarea>
								</div>

								<button
									type="submit"
									class="w-full bg-bone text-void py-3 font-mono text-[10px] tracking-widest font-bold uppercase hover:bg-volt hover:text-void transition-colors cursor-pointer"
								>
									SUBMIT REVIEW
								</button>
							</form>
						{/if}
					{/if}
				</div>

				<!-- Right side: Reviews list -->
				<div class="space-y-6">
					{#if data.reviews.items.length > 0}
						{#each data.reviews.items as rev (rev.id)}
							<div class="border-b border-charcoal pb-6 last:border-none">
								<div class="flex items-center justify-between">
									<span class="font-mono text-xs font-bold text-bone uppercase">
										{rev.reviewerName || 'Anonymous'}
									</span>
									<span class="font-mono text-[10px] text-ash">
										{new Date(rev.createdAt).toLocaleDateString()}
									</span>
								</div>
								<!-- Stars -->
								<div class="flex items-center gap-0.5 text-volt mt-1">
									{#each Array(5) as _, i}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill={i < rev.rating ? 'currentColor' : 'none'}
											stroke="currentColor"
											stroke-width="1.5"
										>
											<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
										</svg>
									{/each}
								</div>
								{#if rev.title}
									<h4 class="font-mono text-xs font-bold text-bone uppercase mt-3">{rev.title}</h4>
								{/if}
								<p class="font-sans text-sm text-bone/80 mt-2 whitespace-pre-line leading-relaxed">
									{rev.body}
								</p>
							</div>
						{/each}
					{:else}
						<div class="py-12 border border-dashed border-charcoal text-center">
							<p class="font-mono text-xs text-ash uppercase">No reviews yet for this product</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
