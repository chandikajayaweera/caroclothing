<script lang="ts">
	import { resolve } from '$app/paths';
	import { fade } from 'svelte/transition';
	import { AlertTriangle, ArrowLeft, ImageOff, Pencil, Star, X } from 'lucide-svelte';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminDetailLayout from '$lib/components/admin/layout/AdminDetailLayout.svelte';

	let { data }: { data: PageData } = $props();

	type ColorCard = {
		variantColorId: string;
		color: string;
		colorHex: string | null;
		basePrice: number;
		compareAtPrice: number | null;
		variants: { id: string; size: string; isActive: boolean; sortOrder: number }[];
	};

	function buildColorCards(product: any): ColorCard[] {
		const cardsMap = new Map<string, ColorCard>();

		for (const variant of product.variants) {
			const colorId = variant.variantColorId;
			if (!cardsMap.has(colorId)) {
				cardsMap.set(colorId, {
					variantColorId: colorId,
					color: variant.color,
					colorHex: variant.colorHex,
					basePrice: variant.basePrice,
					compareAtPrice: variant.compareAtPrice,
					variants: []
				});
			}
			const card = cardsMap.get(colorId)!;
			card.variants.push({
				id: variant.id,
				size: variant.size,
				isActive: variant.isActive,
				sortOrder: variant.sortOrder
			});
		}

		return Array.from(cardsMap.values()).sort((a, b) => {
			const aSort = a.variants[0]?.sortOrder ?? 0;
			const bSort = b.variants[0]?.sortOrder ?? 0;
			return aSort - bSort;
		});
	}

	let activeImageIndex = $state<number | null>(null);

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function formatDate(value: Date | string | null): string {
		if (!value) return 'None';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

	function imagesForColorCard(product: any, variantColorId: string) {
		return product.images.filter((image: any) => image.variantId === variantColorId);
	}

	let resolvedProduct = $state<any>(null);
	$effect(() => {
		data.streamed.product
			.then((p) => {
				resolvedProduct = p;
			})
			.catch(() => {});
	});

	let pageTitle = $derived(
		resolvedProduct
			? `${resolvedProduct.name} | Products | Caro Admin`
			: 'Loading Product... | Caro Admin'
	);
	let pageDescription = $derived(
		resolvedProduct
			? `View ${resolvedProduct.name} product details in Caro admin.`
			: 'View product details in Caro admin.'
	);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
</svelte:head>

<section class="mx-auto max-w-7xl">
	{#await data.streamed.product}
		<div class="border-b border-charcoal pb-6 md:pb-8">
			<a
				href={resolve('/app/products')}
				class="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt"
			>
				<ArrowLeft size={14} aria-hidden="true" />
				Products
			</a>

			<div class="mt-4 items-end justify-between gap-6 md:flex">
				<div class="min-w-0">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Product view</p>
					<div class="mt-2 h-12 w-64 animate-pulse bg-charcoal"></div>
					<div class="mt-2 h-4 w-32 animate-pulse bg-charcoal"></div>
				</div>
				<div class="mt-5 h-11 w-32 animate-pulse bg-charcoal md:mt-0"></div>
			</div>
		</div>

		<div class="mt-8 grid animate-pulse gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
			<AdminCard kicker="Details" title="Catalog Data" border="border border-ash/15">
				<div class="grid gap-px bg-charcoal md:grid-cols-2">
					{#each Array(6) as _}
						<div class="bg-void p-5">
							<div class="h-3 w-16 rounded bg-charcoal"></div>
							<div class="mt-3 h-5 w-24 rounded bg-charcoal"></div>
						</div>
					{/each}
				</div>
				<div class="grid gap-5 border-t border-charcoal bg-void p-5">
					<div>
						<div class="h-3 w-24 rounded bg-charcoal"></div>
						<div class="mt-2 h-4 w-full rounded bg-charcoal"></div>
					</div>
					<div>
						<div class="h-3 w-20 rounded bg-charcoal"></div>
						<div class="mt-2 space-y-2">
							<div class="h-4 w-full rounded bg-charcoal"></div>
							<div class="h-4 w-5/6 rounded bg-charcoal"></div>
						</div>
					</div>
				</div>
			</AdminCard>

			<aside class="grid gap-4 xl:sticky xl:top-8 xl:self-start">
				<div class="border border-charcoal bg-charcoal">
					<div class="aspect-[4/5] w-full bg-charcoal"></div>
					<div class="p-5">
						<div class="mb-3 h-3 w-16 rounded bg-charcoal"></div>
						<div class="grid grid-cols-3 gap-3 text-center">
							{#each Array(3) as _}
								<div class="border border-charcoal/40 bg-void p-3">
									<div class="mx-auto h-8 w-8 animate-pulse rounded bg-charcoal"></div>
									<div class="mx-auto mt-2 h-2 w-10 animate-pulse rounded bg-charcoal"></div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</aside>
		</div>
	{:then product}
		{@const primaryImage =
			product.images.find((image: any) => image.isPrimary) ?? product.images[0] ?? null}
		{@const activeVariantCount = product.variants.filter((variant: any) => variant.isActive).length}
		{@const colorCards = buildColorCards(product)}
		{@const activeImage =
			activeImageIndex === null ? null : (product.images[activeImageIndex] ?? null)}

		<AdminDetailLayout
			backHref={resolve('/app/products')}
			backLabel="Products"
			kicker="Product view"
			title={product.name}
			subtitle={product.slug}
		>
			{#snippet headerActions()}
				<AdminButton
					href={resolve(`/app/products/${product.slug}/edit`)}
					variant="volt"
					class="mt-5 md:mt-0"
				>
					<Pencil size={14} aria-hidden="true" />
					Edit product
				</AdminButton>
			{/snippet}

			{#snippet mainContent()}
				<AdminCard
					kicker="Details"
					title="Catalog Data"
					border="border border-ash/15"
					class="shadow-sm"
				>
					<div class="grid gap-px bg-charcoal md:grid-cols-2">
						<div class="bg-void p-5">
							<p class="font-sans text-xs text-ash">State</p>
							<p
								class="mt-2 font-mono text-sm tracking-widest uppercase {product.isActive
									? 'font-bold text-volt'
									: 'font-bold text-red-400'}"
							>
								{product.isActive ? 'Active' : 'Inactive'}
							</p>
						</div>
						<div class="bg-void p-5">
							<p class="font-sans text-xs text-ash">Starting Price</p>
							<p class="mt-2 font-mono text-sm text-bone">{formatMoney(product.basePrice)}</p>
						</div>
						<div class="bg-void p-5">
							<p class="font-sans text-xs text-ash">Category</p>
							<p class="mt-2 font-sans text-sm text-bone">
								{product.category?.name ?? 'No category'}
							</p>
						</div>
						<div class="bg-void p-5">
							<p class="font-sans text-xs text-ash">Tier</p>
						</div>
						<div class="bg-void p-5">
							<p class="font-sans text-xs text-ash">Gender / Fit</p>
							<p class="mt-2 font-sans text-sm text-bone">
								{formatLabel(product.gender)} / {formatLabel(product.fit)}
							</p>
						</div>
						<div class="bg-void p-5">
							<p class="font-sans text-xs text-ash">Status</p>
							<p class="mt-2 font-sans text-sm text-bone">
								{product.isActive ? 'Active' : 'Inactive'}
							</p>
						</div>
					</div>

					<div class="grid gap-5 border-t border-charcoal bg-void p-5">
						<div>
							<p class="font-sans text-xs text-ash">Short Description</p>
							<p class="mt-2 font-sans text-sm leading-relaxed text-bone">
								{product.shortDescription ?? 'None'}
							</p>
						</div>
						<div>
							<p class="font-sans text-xs text-ash">Description</p>
							<p class="mt-2 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ash">
								{product.description ?? 'None'}
							</p>
						</div>
						<div>
							<p class="font-sans text-xs text-ash">Tags</p>
							{#if product.tags.length > 0}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each product.tags as tag (tag.id)}
										<span
											class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] tracking-widest text-bone uppercase"
										>
											{tag.name}
										</span>
									{/each}
								</div>
							{:else}
								<p class="mt-2 font-sans text-xs text-ash">No tags</p>
							{/if}
						</div>
					</div>
				</AdminCard>

				<!-- Variants Stock Card -->
				<AdminCard
					kicker="Variants"
					title="Stock Options"
					border="border border-ash/15"
					class="shadow-sm"
				>
					{#if colorCards.length > 0}
						<div class="grid gap-4 bg-charcoal p-5">
							{#each colorCards as card, index (card.variantColorId)}
								<article class="border border-charcoal bg-void p-5">
									<div
										class="mb-4 flex flex-col gap-4 border-b border-charcoal pb-3 md:flex-row md:items-center md:justify-between"
									>
										<div class="flex items-center gap-3">
											{#if card.colorHex && isValidHex(card.colorHex)}
												<span
													class="h-6 w-6 rounded-full border border-ash/30 shadow-sm"
													style:background={card.colorHex}
													aria-hidden="true"
												></span>
											{/if}
											<h3 class="font-display text-2xl text-bone uppercase">
												{card.color || `Variant ${index + 1}`}
											</h3>
										</div>
										<div class="font-mono text-sm text-bone">
											{#if card.compareAtPrice}
												<span class="mr-2 text-ash line-through"
													>{formatMoney(card.compareAtPrice)}</span
												>
											{/if}
											<span class="font-bold text-volt">{formatMoney(card.basePrice)}</span>
										</div>
									</div>

									<div class="grid gap-4 md:grid-cols-2">
										<div>
											<p class="mb-2 font-sans text-xs text-ash">Sizes Available</p>
											<div class="flex flex-wrap gap-2">
												{#each card.variants as v}
													<span
														class="inline-flex min-h-9 items-center border px-3 py-2 font-mono text-[10px] tracking-wider uppercase {v.isActive
															? 'border-volt bg-volt font-bold text-void'
															: 'border-charcoal bg-void text-ash/45 line-through'}"
													>
														{v.size}
													</span>
												{/each}
											</div>
										</div>

										<div>
											<p class="mb-2 font-sans text-xs text-ash">
												Images ({imagesForColorCard(product, card.variantColorId).length})
											</p>
											{#if imagesForColorCard(product, card.variantColorId).length > 0}
												<div class="flex flex-wrap gap-2">
													{#each imagesForColorCard(product, card.variantColorId) as img}
														{@const imgIndex = product.images.indexOf(img)}
														<button
															type="button"
															onclick={() => (activeImageIndex = imgIndex)}
															class="relative block cursor-pointer border border-charcoal transition-colors hover:border-volt"
														>
															<img src={img.imageUrl} alt="" class="h-14 w-14 object-cover" />
															{#if img.isPrimary}
																<span
																	class="absolute top-0.5 left-0.5 bg-volt px-1 py-0.5 font-mono text-[6px] leading-none font-bold tracking-wider text-void uppercase"
																	>Primary</span
																>
															{/if}
														</button>
													{/each}
												</div>
											{:else}
												<p class="font-sans text-xs text-ash/50">
													No images for this color variant.
												</p>
											{/if}
										</div>
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="p-10 text-center">
							<p class="font-display text-3xl text-bone uppercase">No variants</p>
							<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
								Add variants from edit.
							</p>
						</div>
					{/if}
				</AdminCard>

				<!-- Images Grid Card -->
				<AdminCard kicker="Media" title="Images" border="border border-ash/15" class="shadow-sm">
					{#if product.images.length > 0}
						<div class="animate-fade-in grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
							{#each product.images as image, idx (image.id)}
								<button
									type="button"
									onclick={() => (activeImageIndex = idx)}
									class="block w-full cursor-pointer border border-charcoal bg-void text-left transition-colors hover:border-volt"
								>
									<div class="relative">
										<img
											src={image.imageUrl}
											alt={image.altText ?? ''}
											class="aspect-[4/5] w-full object-cover"
										/>
										{#if image.isPrimary}
											<span
												class="absolute top-2 left-2 inline-flex items-center gap-1 bg-volt px-2 py-1 font-mono text-[9px] tracking-widest text-void uppercase"
											>
												<Star size={12} aria-hidden="true" />
												Primary
											</span>
										{/if}
									</div>
									<div class="p-4">
										<p class="truncate font-sans text-xs text-ash">
											{image.altText ?? 'No Alt Text'}
										</p>
										{#if image.variantId}
											{@const variantColor = colorCards.find(
												(c) => c.variantColorId === image.variantId
											)}
											<p class="mt-1 font-mono text-[10px] text-volt uppercase">
												Variant: {variantColor?.color ?? 'Linked color'}
											</p>
										{:else}
											<p class="mt-1 font-sans text-[10px] text-ash/60 uppercase">
												Product-wide image
											</p>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="p-10 text-center">
							<ImageOff size={28} class="mx-auto text-ash/50" aria-hidden="true" />
							<p class="mt-4 font-display text-3xl text-bone uppercase">No images</p>
						</div>
					{/if}
				</AdminCard>
			{/snippet}

			{#snippet sidebarContent()}
				<!-- Main Thumbnail Card -->
				<div class="border border-charcoal bg-charcoal">
					{#if primaryImage}
						<img
							src={primaryImage.imageUrl}
							alt={primaryImage.altText ?? ''}
							class="aspect-[4/5] w-full object-cover"
						/>
					{:else}
						<div class="grid aspect-[4/5] place-items-center bg-void text-ash">
							<ImageOff size={28} aria-hidden="true" />
						</div>
					{/if}
					<div class="p-5">
						<p class="mb-3 font-sans text-xs text-ash">Counts</p>
						<div class="grid grid-cols-3 gap-3 text-center">
							<div class="border border-charcoal/40 bg-void p-3">
								<p class="font-display text-3xl text-bone uppercase">{product.images.length}</p>
								<p class="mt-1 font-sans text-[10px] tracking-wider text-ash uppercase">Images</p>
							</div>
							<div class="border border-charcoal/40 bg-void p-3">
								<p class="font-display text-3xl text-bone uppercase">{activeVariantCount}</p>
								<p class="mt-1 font-sans text-[10px] tracking-wider text-ash uppercase">
									Live Vars
								</p>
							</div>
							<div class="border border-charcoal/40 bg-void p-3">
								<p class="font-display text-3xl text-bone uppercase">{product.tags.length}</p>
								<p class="mt-1 font-sans text-[10px] tracking-wider text-ash uppercase">Tags</p>
							</div>
						</div>
					</div>
				</div>
			{/snippet}
		</AdminDetailLayout>

		<!-- Large Image Preview Modal -->
		{#if activeImage}
			<div
				class="fixed inset-0 z-50 grid min-h-0 min-w-0 bg-void/95 transition-opacity sm:grid-cols-[1fr_360px]"
				transition:fade={{ duration: 150 }}
				role="dialog"
				aria-modal="true"
			>
				<div class="flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-void">
					<img
						src={activeImage.imageUrl}
						alt={activeImage.altText ?? ''}
						class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[92vh]"
					/>
				</div>
				<div class="grid min-w-0 content-start gap-4 border-l border-charcoal bg-charcoal p-5">
					<div class="animate-fade-in flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="font-sans text-xs font-bold tracking-wider text-volt uppercase">
								Image Detail
							</p>
							<h2
								class="wrap-break-words mt-2 font-display text-2xl leading-none text-bone uppercase sm:text-3xl"
							>
								{activeImage.altText ?? 'Product Image'}
							</h2>
							{#if activeImage.variantId}
								{@const variantColor = colorCards.find(
									(c) => c.variantColorId === activeImage.variantId
								)}
								<p class="mt-2 font-mono text-xs tracking-widest text-volt uppercase">
									Linked to: {variantColor?.color ?? 'Color swatch'}
								</p>
							{:else}
								<p class="mt-2 font-sans text-xs tracking-widest text-ash uppercase">
									Product-wide image
								</p>
							{/if}
						</div>
						<button
							type="button"
							onclick={() => (activeImageIndex = null)}
							class="grid h-11 w-11 shrink-0 cursor-pointer place-items-center border border-ash/30 text-ash transition-colors hover:border-volt hover:text-volt"
							aria-label="Close image detail"
						>
							<X size={15} aria-hidden="true" />
						</button>
					</div>
					<div class="grid gap-3 border-t border-charcoal pt-4 font-mono text-xs uppercase">
						<div class="flex justify-between gap-4">
							<span class="font-sans text-xs text-ash">Role</span>
							<span class="text-right font-sans text-sm text-bone"
								>{activeImage.isPrimary ? 'Primary Image' : 'Gallery Image'}</span
							>
						</div>
						<div class="flex justify-between gap-4">
							<span class="font-sans text-xs text-ash">Order Position</span>
							<span class="text-right text-bone">{activeImage.position}</span>
						</div>
						<div class="flex justify-between gap-4">
							<span class="font-sans text-xs text-ash">Uploaded</span>
							<span class="text-right text-bone">{formatDate(activeImage.createdAt)}</span>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{:catch error}
		<div class="mt-8 border border-red-500/30 bg-red-950/20 p-6 text-center text-red-200">
			<AlertTriangle size={36} class="mx-auto mb-2 text-red-400" />
			<h2 class="font-display text-2xl uppercase">Product Not Found</h2>
			<p class="mt-1 font-mono text-xs tracking-wider text-red-300/80 uppercase">
				{error instanceof Error ? error.message : 'The requested product could not be loaded.'}
			</p>
			<AdminButton href={resolve('/app/products')} variant="volt" class="mx-auto mt-6">
				Back to Products
			</AdminButton>
		</div>
	{/await}
</section>
