<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';
	import type { StorefrontVariantAvailabilityDTO } from '$lib/server/modules/bag/bag.types';
	import { Check, Heart, Loader2, Mail, ShieldCheck, Star, Truck, X } from 'lucide-svelte';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';
	import { openBagDrawer } from '$lib/client/modules/stores/ui';
	import PDPImageGallery from '$lib/components/product/PDPImageGallery.svelte';
	import ColorSelector from '$lib/components/product/ColorSelector.svelte';
	import SizeSelector from '$lib/components/product/SizeSelector.svelte';
	import ProductAccordion from '$lib/components/product/ProductAccordion.svelte';
	import ShippingEstimate from '$lib/components/product/ShippingEstimate.svelte';
	import SizeGuideModal from '$lib/components/product/SizeGuideModal.svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';
	import CheckoutHoldNotice from '$lib/components/product/CheckoutHoldNotice.svelte';
	import ProductVariantAvailabilitySync from '$lib/components/product/ProductVariantAvailabilitySync.svelte';

	let { data }: { data: PageData } = $props();

	const product = $derived(data.product);
	const drop = $derived(product.dropAssignment);
	const isDropProduct = $derived(product.tier === 'drop');
	const isDropLive = $derived(!isDropProduct || drop?.status === 'live');
	const isDropTeaser = $derived(isDropProduct && drop?.status === 'teaser');
	const isDropSoldOut = $derived(isDropProduct && drop?.status === 'sold_out');
	const hasReviews = $derived(data.reviewsSummary.reviewCount > 0);
	const isSaved = $derived(wishlist.has(product.id));

	const metaTitle = $derived(product.metaTitle ?? `${product.name} | Caro Clothing`);
	const metaDescription = $derived(
		product.metaDescription ??
			product.shortDescription ??
			`${product.name} from Caro Clothing. Sri Lankan-made streetwear.`
	);

	const colors = $derived.by(() => {
		const result: { name: string; hex: string }[] = [];
		const seen: string[] = [];

		for (const variant of product.variants) {
			if (!variant.color || seen.includes(variant.color)) continue;

			seen.push(variant.color);
			result.push({
				name: variant.color,
				hex: variant.colorHex ?? '#FFFFFF'
			});
		}

		return result;
	});

	let activeColor = $state('');
	let requestedSize = $state('');
	let isSizeGuideOpen = $state(false);
	let addToBagLoading = $state(false);
	let addedToBag = $state(false);
	let addToBagError = $state('');
	let waitlistContact = $state('');
	let waitlistLoading = $state(false);
	let waitlistMessage = $state('');
	let waitlistError = $state('');
	let availability = $state<StorefrontVariantAvailabilityDTO[]>([]);

	$effect(() => {
		availability = data.availability;
	});

	let quantitySelected = $state(1);

	$effect(() => {
		if (activeSize || activeColor) {
			quantitySelected = 1;
		}
	});

	const maxQuantityAvailable = $derived.by(() => {
		if (!activeVariantAvailability) return 10;
		if (activeVariantAvailability.trackInventory && !activeVariantAvailability.allowBackorder) {
			return activeVariantAvailability.availableQuantity;
		}
		return 10;
	});
	let ratingInput = $state(5);
	let hoverRating = $state<number | null>(null);
	let commentInput = $state('');
	let titleInput = $state('');
	let reviewSubmitted = $state(false);
	let reviewError = $state('');
	let selectedStarFilter = $state<number | null>(null);
	let sortBy = $state<'newest' | 'highest' | 'lowest'>('newest');
	let visibleCount = $state(5);

	$effect(() => {
		if (colors.length === 0) return;
		if (!activeColor || !colors.some((color) => color.name === activeColor)) {
			activeColor = colors[0].name;
		}
	});

	const sizesForColor = $derived.by(() => {
		if (!activeColor) return [];

		return product.variants
			.filter((variant) => variant.color === activeColor)
			.map((variant) => {
				const stock = availability.find((item) => item.variantId === variant.id);
				const available = stock ? !stock.trackInventory || stock.availableQuantity > 0 : false;

				return {
					size: variant.size,
					available,
					reserved: stock?.availabilityStatus === 'reserved',
					backorder: stock?.allowBackorder ?? false,
					variantId: variant.id,
					quantity: stock?.availableQuantity ?? 0,
					trackInventory: stock?.trackInventory ?? false,
					isLowStock: stock?.isLowStock ?? false
				};
			});
	});

	const activeSize = $derived.by(() => {
		if (sizesForColor.length === 1) return sizesForColor[0].size;
		return sizesForColor.some((item) => item.size === requestedSize) ? requestedSize : '';
	});

	const activeVariant = $derived(
		product.variants.find((variant) => variant.color === activeColor && variant.size === activeSize)
	);
	const activeVariantAvailability = $derived(
		activeVariant ? availability.find((item) => item.variantId === activeVariant.id) : null
	);
	const selectedPrice = $derived(activeVariant?.effectivePrice ?? product.basePrice);
	const activeColorVariantId = $derived(
		product.variants.find((variant) => variant.color === activeColor)?.variantColorId ?? null
	);
	const galleryImages = $derived(
		product.images
			.filter((image) => image.variantId === null || image.variantId === activeColorVariantId)
			.map((image) => ({
				url: image.imageUrl,
				alt: image.altText ?? `${product.name} in ${activeColor || 'selected color'}`
			}))
	);
	const displayQuantityAvailable = $derived(
		activeVariantAvailability ? activeVariantAvailability.availableQuantity : 0
	);
	const isSelectedUnavailable = $derived(
		!activeVariantAvailability || activeVariantAvailability.availabilityStatus === 'unavailable'
	);
	const isSelectedReserved = $derived(activeVariantAvailability?.availabilityStatus === 'reserved');
	const isSelectedPreOrder = $derived(
		activeVariantAvailability?.trackInventory &&
			activeVariantAvailability.availableQuantity === 0 &&
			activeVariantAvailability.allowBackorder
	);
	const isLowStock = $derived(
		Boolean(
			activeVariantAvailability?.trackInventory &&
			activeVariantAvailability.availableQuantity > 0 &&
			activeVariantAvailability.isLowStock
		)
	);
	const canAddToBag = $derived(
		isDropLive &&
			Boolean(activeVariant) &&
			!isSelectedReserved &&
			!isSelectedUnavailable &&
			!addToBagLoading
	);
	const addToBagLabel = $derived.by(() => {
		if (addToBagLoading) return 'Adding';
		if (addedToBag) return 'Added';
		if (!isDropLive) return isDropSoldOut ? 'Sold Out' : 'Drop Not Live';
		if (!activeSize) return 'Select Size';
		if (isSelectedReserved) return 'Reserved at Checkout';
		if (isSelectedPreOrder) return 'Pre-Order';
		if (isSelectedUnavailable) return 'Sold Out';
		return 'Add to Bag';
	});
	const tierLabel = $derived.by(() => {
		if (product.tier === 'core') return 'Core Essential';
		if (drop?.status === 'teaser') return 'Drop Teaser';
		if (drop?.status === 'live') return 'Live Drop';
		if (drop?.status === 'sold_out') return 'Sold Out Drop';
		return 'Limited Drop';
	});
	const accordionPanels = $derived.by(() => [
		{
			id: 'details',
			title: 'Details',
			content:
				[
					product.description,
					`Fit: ${formatEnum(product.fit)}`,
					`Gender: ${formatEnum(product.gender)}`
				]
					.filter(Boolean)
					.join('\n\n') || 'Oversized Sri Lankan streetwear.'
		},
		{
			id: 'material',
			title: 'Material and Care',
			content: [
				product.material ? `Material: ${product.material}` : 'Material: Premium cotton blend',
				product.careInstructions ?? 'Care: Machine wash cold. Dry low. Do not bleach.'
			].join('\n\n')
		}
	]);
	const filteredReviews = $derived.by(() => {
		let items = [...data.reviews.items];

		if (selectedStarFilter !== null) {
			items = items.filter((review) => review.rating === selectedStarFilter);
		}

		if (sortBy === 'newest') {
			items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		} else if (sortBy === 'highest') {
			items.sort((a, b) => b.rating - a.rating);
		} else {
			items.sort((a, b) => a.rating - b.rating);
		}

		return items;
	});
	const displayedReviews = $derived(filteredReviews.slice(0, visibleCount));
	const hasMoreReviews = $derived(filteredReviews.length > visibleCount);

	function formatMoney(value: number | null | undefined): string {
		return `LKR ${Math.round(value ?? 0).toLocaleString('en-LK')}`;
	}

	function formatEnum(value: string): string {
		return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function formatDate(value: Date | string | null | undefined): string {
		if (!value) return 'TBC';
		return new Intl.DateTimeFormat('en-LK', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function toggleStarFilter(star: number) {
		selectedStarFilter = selectedStarFilter === star ? null : star;
		visibleCount = 5;
	}

	function clearFilters() {
		selectedStarFilter = null;
		visibleCount = 5;
	}

	function handleSortChange(event: Event) {
		sortBy = (event.currentTarget as HTMLSelectElement).value as typeof sortBy;
		visibleCount = 5;
	}

	function handleWishlistToggle() {
		wishlist.toggle(product.id);
	}

	function updateVariantAvailability(updated: StorefrontVariantAvailabilityDTO) {
		const index = availability.findIndex((item) => item.variantId === updated.variantId);
		availability =
			index === -1
				? [...availability, updated]
				: [...availability.slice(0, index), updated, ...availability.slice(index + 1)];
	}

	const enhanceAddToBag: SubmitFunction = () => {
		addToBagLoading = true;
		addedToBag = false;
		addToBagError = '';

		return async ({ result, update }) => {
			if (result.type === 'success') {
				const resultData = result.data as
					| { bag?: Parameters<typeof bag.setBag>[0]; message?: string }
					| undefined;
				if (resultData?.bag) bag.setBag(resultData.bag);
				addedToBag = true;
				openBagDrawer();
				setTimeout(() => {
					addedToBag = false;
				}, 1800);
				await update({ reset: false, invalidateAll: false });
			} else if (result.type === 'failure') {
				const resultData = result.data as { message?: string } | undefined;
				addToBagError = resultData?.message ?? 'Did not add. Try again.';
				await update({ reset: false, invalidateAll: false });
			} else {
				await update();
			}

			addToBagLoading = false;
		};
	};

	const enhanceWaitlist: SubmitFunction = () => {
		waitlistLoading = true;
		waitlistMessage = '';
		waitlistError = '';

		return async ({ result, update }) => {
			if (result.type === 'success') {
				const resultData = result.data as { message?: string } | undefined;
				waitlistMessage = resultData?.message ?? 'Drop alert locked.';
				waitlistContact = '';
				await update({ reset: false, invalidateAll: false });
			} else if (result.type === 'failure') {
				const resultData = result.data as { message?: string } | undefined;
				waitlistError = resultData?.message ?? 'Could not join. Try again.';
				await update({ reset: false, invalidateAll: false });
			} else {
				await update();
			}

			waitlistLoading = false;
		};
	};

	const enhanceReview: SubmitFunction = () => {
		reviewError = '';

		return async ({ result, update }) => {
			if (result.type === 'success') {
				reviewSubmitted = true;
				await update({ reset: true, invalidateAll: false });
			} else if (result.type === 'failure') {
				const resultData = result.data as { message?: string } | undefined;
				reviewError = resultData?.message ?? 'Review did not submit.';
				await update({ reset: false, invalidateAll: false });
			} else {
				await update();
			}
		};
	};
</script>

<svelte:head>
	<title>{metaTitle}</title>
	<meta name="description" content={metaDescription} />
	<meta property="og:title" content={metaTitle} />
	<meta property="og:description" content={metaDescription} />
	{#if product.primaryImageUrl}
		<meta property="og:image" content={product.primaryImageUrl} />
	{/if}
</svelte:head>

<div class="min-h-screen bg-void pt-24 pb-44 text-bone md:pb-20">
	<div class="mx-auto max-w-7xl px-4 md:px-8">
		<nav class="mb-5">
			<a
				href={resolve('/shop')}
				class="inline-flex min-h-11 items-center font-mono text-xs tracking-widest text-ash uppercase transition-colors hover:text-volt"
			>
				Back to Shop
			</a>
		</nav>

		<section
			class="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:gap-14 xl:grid-cols-[minmax(0,760px)_minmax(380px,1fr)]"
		>
			<div class="w-full">
				{#if galleryImages.length > 0}
					<PDPImageGallery images={galleryImages} />
				{:else}
					<div
						class="flex aspect-[4/5] w-full items-center justify-center border border-charcoal bg-charcoal"
					>
						<span class="font-mono text-xs text-ash uppercase">No product image</span>
					</div>
				{/if}
			</div>

			<div class="h-fit md:sticky md:top-24">
				<div class="border-b border-charcoal/70 pb-6">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="border px-2 py-1 font-mono text-[10px] tracking-widest uppercase {isDropLive &&
							isDropProduct
								? 'border-volt/40 bg-volt/10 text-volt'
								: 'border-ash/20 text-ash'}"
						>
							{tierLabel}
						</span>
						{#if product.isNewArrival}
							<span
								class="border border-bone/20 px-2 py-1 font-mono text-[10px] text-bone uppercase"
							>
								New
							</span>
						{/if}
					</div>

					<h1 class="mt-4 font-display text-5xl leading-none tracking-normal uppercase md:text-6xl">
						{product.name}
					</h1>

					{#if product.shortDescription}
						<p class="mt-2 max-w-xl font-sans text-sm leading-relaxed text-ash">
							{product.shortDescription}
						</p>
					{/if}

					<div class="mt-5 flex flex-wrap items-center gap-3">
						<span class="font-mono text-xl font-bold text-bone">{formatMoney(selectedPrice)}</span>
						{#if hasReviews}
							<a
								href="#reviews"
								class="inline-flex min-h-9 items-center gap-1.5 font-mono text-[11px] text-ash uppercase transition-colors hover:text-volt"
							>
								<Star size={13} fill="currentColor" aria-hidden="true" />
								{(data.reviewsSummary.averageRating ?? 0).toFixed(1)}
								<span>({data.reviewsSummary.reviewCount})</span>
							</a>
						{/if}
					</div>
				</div>

				{#if isDropProduct}
					<div class="mt-5 border border-charcoal bg-charcoal/35 p-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<p class="font-mono text-[10px] tracking-widest text-volt uppercase">
									{drop?.name ?? 'Drop assignment pending'}
								</p>
								<p class="mt-1 font-sans text-sm text-bone">
									{#if drop?.status === 'teaser'}
										Opens {formatDate(drop.launchAt)}.
									{:else if drop?.status === 'live'}
										Live now. Stock updates at checkout.
									{:else if drop?.status === 'sold_out'}
										Sold out. No restock.
									{:else}
										Drop not open.
									{/if}
								</p>
							</div>
							{#if drop?.slug}
								<a
									href={resolve(`/drops/${drop.slug}`)}
									class="shrink-0 font-mono text-[10px] text-ash uppercase transition-colors hover:text-volt"
								>
									View Drop
								</a>
							{/if}
						</div>
					</div>
				{/if}

				<div class="mt-6 space-y-6">
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
								requestedSize = size;
							}}
							onOpenSizeGuide={() => (isSizeGuideOpen = true)}
						/>
					{/if}
				</div>

				{#if activeVariant}
					{#key activeVariant.id}
						<ProductVariantAvailabilitySync
							variantId={activeVariant.id}
							onAvailability={updateVariantAvailability}
						/>
					{/key}
				{/if}

				<div class="mt-5 min-h-6">
					{#if activeSize && activeVariant && activeVariantAvailability && isSelectedReserved}
						{#key `${activeVariant.id}:${activeVariantAvailability.checkoutHoldExpiresAt ?? ''}`}
							<CheckoutHoldNotice
								size={activeSize}
								initialSeconds={activeVariantAvailability.checkoutHoldSecondsRemaining ?? 0}
							/>
						{/key}
					{:else if isLowStock}
						<p class="font-mono text-[11px] font-bold tracking-widest text-volt uppercase">
							Only {displayQuantityAvailable} left in {activeSize} — ALMOST GONE
						</p>
					{:else if isSelectedPreOrder}
						<p class="font-mono text-[11px] tracking-widest text-volt uppercase">
							Pre-order available for this size
						</p>
					{:else if activeSize && isSelectedUnavailable}
						<p class="font-mono text-[11px] tracking-widest text-red-400 uppercase">
							Sold out in {activeSize}
						</p>
					{:else if !activeSize && sizesForColor.length > 1 && isDropLive}
						<p class="font-mono text-[11px] tracking-widest text-ash uppercase">Choose a size</p>
					{/if}
				</div>

				{#if isDropTeaser && drop}
					<div id="drop-alert" class="mt-6 border border-volt/25 bg-volt/5 p-4">
						<div class="flex items-start gap-3">
							<Mail size={18} class="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
							<div>
								<h2 class="font-mono text-xs font-bold tracking-widest text-volt uppercase">
									Get the drop alert
								</h2>
								<p class="mt-1 font-sans text-sm text-ash">
									Phone or email. No fake countdown resets.
								</p>
							</div>
						</div>

						<form
							method="POST"
							action="?/joinDropWaitlist"
							use:enhance={enhanceWaitlist}
							class="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"
						>
							<input type="hidden" name="dropId" value={drop.id} />
							<label class="sr-only" for="waitlist-contact">Phone or email</label>
							<input
								id="waitlist-contact"
								name="contact"
								bind:value={waitlistContact}
								required
								inputmode="email"
								placeholder="+94771234567 or email"
								class="h-12 border border-charcoal bg-void px-3 font-sans text-sm text-bone outline-none placeholder:text-ash/45 focus:border-volt"
							/>
							<button
								type="submit"
								class="h-12 cursor-pointer bg-volt px-5 font-mono text-xs font-bold tracking-widest text-void uppercase transition-colors hover:bg-bone disabled:bg-charcoal disabled:text-ash"
								disabled={waitlistLoading}
							>
								{waitlistLoading ? 'Saving' : 'Notify Me'}
							</button>
						</form>
						{#if waitlistMessage}
							<p class="mt-3 font-mono text-[11px] text-volt uppercase" role="status">
								{waitlistMessage}
							</p>
						{/if}
						{#if waitlistError}
							<p class="mt-3 font-mono text-[11px] text-red-400 uppercase" role="alert">
								{waitlistError}
							</p>
						{/if}
					</div>
				{:else}
					<div class="mt-7 flex gap-3">
						<form
							method="POST"
							action="?/addToBag"
							use:enhance={enhanceAddToBag}
							class="flex flex-1 gap-3"
						>
							<input type="hidden" name="variantId" value={activeVariant?.id ?? ''} />
							<input type="hidden" name="quantity" value={quantitySelected} />

							{#if activeSize && canAddToBag}
								<div
									class="flex h-14 items-center gap-3 border border-charcoal bg-charcoal/20 px-4 font-mono text-sm text-bone"
								>
									<button
										type="button"
										class="cursor-pointer hover:text-volt disabled:opacity-30"
										onclick={() => (quantitySelected = Math.max(1, quantitySelected - 1))}
										disabled={quantitySelected <= 1}
										aria-label="Decrease quantity"
									>
										[−]
									</button>
									<span class="min-w-6 text-center">{quantitySelected}</span>
									<button
										type="button"
										class="cursor-pointer hover:text-volt disabled:opacity-30"
										onclick={() =>
											(quantitySelected = Math.min(maxQuantityAvailable, quantitySelected + 1))}
										disabled={quantitySelected >= maxQuantityAvailable}
										aria-label="Increase quantity"
									>
										[+]
									</button>
								</div>
							{/if}

							<button
								type="submit"
								class="flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 border border-volt bg-volt px-5 font-mono text-xs font-bold tracking-widest text-void uppercase transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:border-charcoal disabled:bg-charcoal disabled:text-ash/50"
								disabled={!canAddToBag}
							>
								{#if addToBagLoading}
									<Loader2 size={16} class="animate-spin" aria-hidden="true" />
								{:else if addedToBag}
									<Check size={16} aria-hidden="true" />
								{/if}
								{addToBagLabel}
							</button>
						</form>

						<button
							type="button"
							onclick={handleWishlistToggle}
							class="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center border border-charcoal text-bone transition-colors hover:border-volt hover:text-volt"
							aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
							aria-pressed={isSaved}
						>
							<Heart
								size={20}
								fill={isSaved ? 'currentColor' : 'none'}
								strokeWidth={1.8}
								aria-hidden="true"
							/>
						</button>
					</div>
					{#if addToBagError}
						<p class="mt-3 font-mono text-[11px] text-red-400 uppercase" role="alert">
							{addToBagError}
						</p>
					{/if}
				{/if}

				<div class="mt-5 grid grid-cols-2 gap-2">
					<div class="border border-charcoal bg-charcoal/25 p-3">
						<Truck size={16} class="text-volt" aria-hidden="true" />
						<p class="mt-2 font-mono text-[10px] text-bone uppercase">Ships from Colombo</p>
					</div>
					<div class="border border-charcoal bg-charcoal/25 p-3">
						<ShieldCheck size={16} class="text-volt" aria-hidden="true" />
						<p class="mt-2 font-mono text-[10px] text-bone uppercase">Local made</p>
					</div>
				</div>

				<ShippingEstimate quotes={data.shippingQuotes} {selectedPrice} />
				<ProductAccordion panels={accordionPanels} />
			</div>
		</section>

		{#if hasReviews || data.reviewEligibility?.canReview}
			<section id="reviews" class="mt-20 border-t border-charcoal/70 pt-12 md:mt-24 md:pt-16">
				<div class="grid grid-cols-1 gap-10 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
					<div class="h-fit space-y-8 lg:sticky lg:top-24">
						{#if hasReviews}
							<div>
								<h2 class="font-display text-4xl uppercase">Reviews</h2>
								<div class="mt-4 flex items-center gap-3">
									<div class="flex items-center gap-1 text-volt">
										{#each [0, 1, 2, 3, 4] as index (index)}
											<Star
												size={17}
												fill={index < Math.round(data.reviewsSummary.averageRating ?? 0)
													? 'currentColor'
													: 'none'}
												aria-hidden="true"
											/>
										{/each}
									</div>
									<span class="font-mono text-base font-bold">
										{(data.reviewsSummary.averageRating ?? 0).toFixed(1)}
									</span>
								</div>
								<p class="mt-1 font-mono text-xs text-ash uppercase">
									{data.reviewsSummary.reviewCount} approved reviews
								</p>

								<div class="mt-6 space-y-2 border-t border-charcoal/60 pt-4">
									{#each [5, 4, 3, 2, 1] as star (star)}
										{@const count =
											data.reviewsSummary.distribution[star as 1 | 2 | 3 | 4 | 5] ?? 0}
										{@const pct =
											data.reviewsSummary.reviewCount > 0
												? (count / data.reviewsSummary.reviewCount) * 100
												: 0}
										<button
											class="grid min-h-10 w-full cursor-pointer grid-cols-[32px_1fr_32px] items-center gap-2 border px-2 text-left transition-colors hover:border-charcoal hover:bg-charcoal/30 {selectedStarFilter ===
											star
												? 'border-volt/40 bg-volt/5 text-volt'
												: 'border-transparent text-ash'}"
											onclick={() => toggleStarFilter(star)}
											aria-label="Filter by {star} star reviews"
										>
											<span class="font-mono text-[10px]">{star}</span>
											<span class="h-1.5 overflow-hidden bg-charcoal">
												<span class="block h-full bg-volt" style="width: {pct}%"></span>
											</span>
											<span class="text-right font-mono text-[10px]">{count}</span>
										</button>
									{/each}

									{#if selectedStarFilter !== null}
										<button
											onclick={clearFilters}
											class="mt-2 inline-flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-volt uppercase"
										>
											<X size={12} aria-hidden="true" />
											Clear Filter
										</button>
									{/if}
								</div>
							</div>
						{/if}

						{#if data.reviewEligibility?.canReview}
							{#if reviewSubmitted}
								<div class="border border-volt/25 bg-volt/5 p-4">
									<p class="font-mono text-xs text-volt uppercase">Review submitted.</p>
									<p class="mt-1 font-sans text-sm text-ash">It appears after moderation.</p>
								</div>
							{:else}
								<form
									method="POST"
									action="?/submitReview"
									enctype="multipart/form-data"
									use:enhance={enhanceReview}
									class="space-y-4 border border-charcoal bg-charcoal/20 p-5"
								>
									<h3 class="font-mono text-xs font-bold tracking-widest text-bone uppercase">
										Write a review
									</h3>
									<input type="hidden" name="productId" value={product.id} />

									<div>
										<span class="mb-2 block font-mono text-[10px] text-ash uppercase">
											Rating
										</span>
										<div class="flex items-center gap-1.5">
											{#each [1, 2, 3, 4, 5] as starValue (starValue)}
												<button
													type="button"
													class="cursor-pointer text-ash transition-colors hover:text-volt focus-visible:text-volt"
													onmouseenter={() => (hoverRating = starValue)}
													onmouseleave={() => (hoverRating = null)}
													onclick={() => (ratingInput = starValue)}
													aria-label="Set rating to {starValue}"
												>
													<Star
														size={22}
														fill={(
															hoverRating !== null
																? starValue <= hoverRating
																: starValue <= ratingInput
														)
															? 'currentColor'
															: 'none'}
														aria-hidden="true"
													/>
												</button>
											{/each}
											<span class="ml-2 font-mono text-[11px] text-volt">{ratingInput}/5</span>
										</div>
										<input type="hidden" name="rating" value={ratingInput} />
									</div>

									<div>
										<label
											for="review-title"
											class="mb-1 block font-mono text-[10px] text-ash uppercase"
										>
											Title
										</label>
										<input
											id="review-title"
											type="text"
											name="title"
											bind:value={titleInput}
											placeholder="Fit, fabric, first wear"
											class="h-11 w-full border border-charcoal bg-void px-3 font-sans text-sm text-bone outline-none placeholder:text-ash/45 focus:border-volt"
										/>
									</div>

									<div>
										<label
											for="review-body"
											class="mb-1 block font-mono text-[10px] text-ash uppercase"
										>
											Review
										</label>
										<textarea
											id="review-body"
											name="body"
											bind:value={commentInput}
											required
											rows="4"
											placeholder="How did it fit? How did it wear?"
											class="w-full border border-charcoal bg-void px-3 py-2 font-sans text-sm text-bone outline-none placeholder:text-ash/45 focus:border-volt"
										></textarea>
									</div>

									<div>
										<label
											for="review-files"
											class="mb-1 block font-mono text-[10px] text-ash uppercase"
										>
											Photo or video
										</label>
										<input
											id="review-files"
											type="file"
											name="files"
											accept="image/*,video/mp4,video/webm"
											multiple
											class="block w-full cursor-pointer border border-charcoal bg-void text-sm text-ash file:mr-3 file:h-11 file:border-0 file:bg-charcoal file:px-3 file:font-mono file:text-[10px] file:text-bone file:uppercase hover:file:bg-volt hover:file:text-void"
										/>
									</div>

									{#if reviewError}
										<p class="font-mono text-[11px] text-red-400 uppercase" role="alert">
											{reviewError}
										</p>
									{/if}

									<button
										type="submit"
										class="h-12 w-full cursor-pointer bg-bone font-mono text-xs font-bold tracking-widest text-void uppercase transition-colors hover:bg-volt"
									>
										Submit Review
									</button>
								</form>
							{/if}
						{/if}
					</div>

					{#if hasReviews}
						<div class="space-y-6">
							<div
								class="flex flex-col items-start justify-between gap-4 border-b border-charcoal/70 pb-4 sm:flex-row sm:items-center"
							>
								<p class="font-mono text-xs text-ash uppercase">
									Showing {filteredReviews.length} reviews
								</p>
								<div class="flex items-center gap-2">
									<label for="sort-reviews" class="font-mono text-[10px] text-ash uppercase">
										Sort
									</label>
									<select
										id="sort-reviews"
										class="h-10 cursor-pointer border border-charcoal bg-void px-3 font-mono text-xs text-bone outline-none focus:border-volt"
										value={sortBy}
										onchange={handleSortChange}
									>
										<option value="newest">Newest</option>
										<option value="highest">Highest</option>
										<option value="lowest">Lowest</option>
									</select>
								</div>
							</div>

							{#if displayedReviews.length > 0}
								<div class="space-y-6">
									{#each displayedReviews as review (review.id)}
										<article class="border-b border-charcoal pb-6 last:border-none">
											<div class="flex flex-wrap items-center gap-3">
												<span class="font-mono text-xs font-bold text-bone uppercase">
													{review.reviewerName}
												</span>
												{#if review.isVerifiedPurchase}
													<span
														class="inline-flex items-center gap-1 border border-volt/35 bg-volt/5 px-2 py-1 font-mono text-[9px] text-volt uppercase"
													>
														<Check size={11} aria-hidden="true" />
														Verified Buyer
													</span>
												{/if}
												<span class="font-mono text-[10px] text-ash sm:ml-auto">
													{formatDate(review.createdAt)}
												</span>
											</div>

											<div class="mt-2 flex items-center gap-1 text-volt">
												{#each [0, 1, 2, 3, 4] as index (index)}
													<Star
														size={13}
														fill={index < review.rating ? 'currentColor' : 'none'}
														aria-hidden="true"
													/>
												{/each}
											</div>

											{#if review.title}
												<h3 class="mt-3 font-mono text-sm font-bold text-bone uppercase">
													{review.title}
												</h3>
											{/if}
											{#if review.body}
												<p
													class="mt-2 max-w-3xl font-sans text-sm leading-relaxed whitespace-pre-line text-bone/80"
												>
													{review.body}
												</p>
											{/if}

											{#if review.media.length > 0}
												<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
													{#each review.media as media (media.id)}
														{#if media.type === 'image'}
															<img
																src={media.mediaUrl}
																alt={`Review media for ${product.name}`}
																loading="lazy"
																class="aspect-square w-full border border-charcoal object-cover"
															/>
														{:else}
															<video
																src={media.mediaUrl}
																controls
																class="aspect-square w-full border border-charcoal object-cover"
															>
																<track kind="captions" />
															</video>
														{/if}
													{/each}
												</div>
											{/if}
										</article>
									{/each}
								</div>

								{#if hasMoreReviews}
									<button
										onclick={() => (visibleCount += 5)}
										class="mx-auto flex h-12 cursor-pointer items-center justify-center border border-charcoal px-8 font-mono text-xs tracking-widest text-bone uppercase transition-colors hover:border-volt hover:text-volt"
									>
										Load More
									</button>
								{/if}
							{:else}
								<div class="border border-dashed border-charcoal py-12 text-center">
									<p class="font-mono text-xs text-ash uppercase">No reviews match that filter.</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</section>
		{/if}

		{#if data.relatedProducts.length > 0}
			<section class="mt-20 border-t border-charcoal/70 pt-12 md:mt-24">
				<div class="mb-7 flex items-end justify-between gap-4">
					<div>
						<h2 class="font-display text-4xl uppercase">Keep Shopping</h2>
						<p class="mt-1 font-mono text-xs text-ash uppercase">Same lane. Real stock.</p>
					</div>
					<a
						href={resolve('/shop')}
						class="hidden font-mono text-xs text-ash uppercase transition-colors hover:text-volt sm:inline-flex"
					>
						Shop All
					</a>
				</div>
				<div class="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
					{#each data.relatedProducts as relatedProduct (relatedProduct.id)}
						<ProductCard product={relatedProduct} />
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>

{#if !isDropTeaser}
	<div
		class="fixed right-0 bottom-[calc(60px+env(safe-area-inset-bottom))] left-0 z-30 border-t border-charcoal bg-void/95 px-4 py-3 backdrop-blur md:hidden"
	>
		<div class="flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<p class="truncate font-mono text-[11px] text-bone uppercase">{product.name}</p>
				<p class="font-mono text-[11px] text-ash">
					{formatMoney(selectedPrice)}{activeSize ? ` / ${activeSize}` : ''}
				</p>
			</div>
			<form method="POST" action="?/addToBag" use:enhance={enhanceAddToBag}>
				<input type="hidden" name="variantId" value={activeVariant?.id ?? ''} />
				<input type="hidden" name="quantity" value="1" />
				<button
					type="submit"
					class="h-12 min-w-36 cursor-pointer bg-volt px-4 font-mono text-xs font-bold tracking-widest text-void uppercase disabled:bg-charcoal disabled:text-ash"
					disabled={!canAddToBag}
				>
					{addToBagLabel}
				</button>
			</form>
		</div>
	</div>
{:else}
	<div
		class="fixed right-0 bottom-[calc(60px+env(safe-area-inset-bottom))] left-0 z-30 border-t border-charcoal bg-void/95 px-4 py-3 backdrop-blur md:hidden"
	>
		<a
			href="#drop-alert"
			class="flex h-12 w-full items-center justify-center bg-volt font-mono text-xs font-bold tracking-widest text-void uppercase"
		>
			Notify Me
		</a>
	</div>
{/if}

<SizeGuideModal isOpen={isSizeGuideOpen} onClose={() => (isSizeGuideOpen = false)} />
