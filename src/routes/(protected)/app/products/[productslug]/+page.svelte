<script lang="ts">
	import { resolve } from '$app/paths';
	import { ImageOff, Pencil, Star } from 'lucide-svelte';
	import type { PageData } from './$types';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminModal from '$lib/components/admin/overlays/AdminModal.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminDetailLayout from '$lib/components/admin/layout/AdminDetailLayout.svelte';
	import {
		formatAdminDateTime,
		formatAdminMoney,
		formatAdminStatus
	} from '$lib/shared/admin/format';

	let { data }: { data: PageData } = $props();

	type ProductDetail = PageData['product'];

	type ColorCard = {
		variantColorId: string;
		color: string;
		colorHex: string | null;
		basePrice: number;
		compareAtPrice: number | null;
		variants: { id: string; size: string; isActive: boolean; sortOrder: number }[];
	};

	function buildColorCards(product: ProductDetail): ColorCard[] {
		const cards: ColorCard[] = [];

		for (const variant of product.variants) {
			const colorId = variant.variantColorId;
			let card = cards.find((item) => item.variantColorId === colorId);
			if (!card) {
				card = {
					variantColorId: colorId,
					color: variant.color,
					colorHex: variant.colorHex,
					basePrice: variant.basePrice,
					compareAtPrice: variant.compareAtPrice,
					variants: []
				};
				cards.push(card);
			}
			card.variants.push({
				id: variant.id,
				size: variant.size,
				isActive: variant.isActive,
				sortOrder: variant.sortOrder
			});
		}

		return cards.sort((a, b) => {
			const aSort = a.variants[0]?.sortOrder ?? 0;
			const bSort = b.variants[0]?.sortOrder ?? 0;
			return aSort - bSort;
		});
	}

	let activeImageIndex = $state<number | null>(null);

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

	function imagesForColorCard(product: ProductDetail, variantColorId: string) {
		return product.images.filter((image) => image.variantId === variantColorId);
	}

	let product = $derived(data.product);
	let primaryImage = $derived(
		product.images.find((image) => image.isPrimary) ?? product.images[0] ?? null
	);
	let activeVariantCount = $derived(product.variants.filter((variant) => variant.isActive).length);
	let colorCards = $derived(buildColorCards(product));
	let activeImage = $derived(
		activeImageIndex === null ? null : (product.images[activeImageIndex] ?? null)
	);
	let pageTitle = $derived(`${product.name} | Products | Caro Admin`);
	let pageDescription = $derived(`View ${product.name} product details in Caro admin.`);
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
</svelte:head>

<section class="mx-auto max-w-7xl">
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
						<div class="mt-2">
							<AdminBadge variant={product.isActive ? 'success' : 'danger'}>
								{product.isActive ? 'Active' : 'Inactive'}
							</AdminBadge>
						</div>
					</div>
					<div class="bg-void p-5">
						<p class="font-sans text-xs text-ash">Starting Price</p>
						<p class="mt-2 font-mono text-sm text-bone">
							{formatAdminMoney(product.basePrice)}
						</p>
					</div>
					<div class="bg-void p-5">
						<p class="font-sans text-xs text-ash">Category</p>
						<p class="mt-2 font-sans text-sm text-bone">
							{product.category?.name ?? 'No category'}
						</p>
					</div>
					<div class="bg-void p-5">
						<p class="font-sans text-xs text-ash">Gender / Fit</p>
						<p class="mt-2 font-sans text-sm text-bone">
							{formatAdminStatus(product.gender)} / {formatAdminStatus(product.fit)}
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
									<AdminBadge variant="neutral">{tag.name}</AdminBadge>
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
												>{formatAdminMoney(card.compareAtPrice)}</span
											>
										{/if}
										<span class="font-bold text-volt">{formatAdminMoney(card.basePrice)}</span>
									</div>
								</div>

								<div class="grid gap-4 md:grid-cols-2">
									<div>
										<p class="mb-2 font-sans text-xs text-ash">Sizes Available</p>
										<div class="flex flex-wrap gap-2">
											{#each card.variants as v (v.id)}
												<AdminBadge variant={v.isActive ? 'success' : 'neutral'}>
													{v.size}
												</AdminBadge>
											{/each}
										</div>
									</div>

									<div>
										<p class="mb-2 font-sans text-xs text-ash">
											Images ({imagesForColorCard(product, card.variantColorId).length})
										</p>
										{#if imagesForColorCard(product, card.variantColorId).length > 0}
											<div class="flex flex-wrap gap-2">
												{#each imagesForColorCard(product, card.variantColorId) as img (img.id)}
													{@const imgIndex = product.images.indexOf(img)}
													<AdminButton
														type="button"
														size="icon"
														variant="outline"
														onclick={() => (activeImageIndex = imgIndex)}
														class="relative h-14 w-14 overflow-hidden p-0"
														aria-label={`View ${card.color || 'variant'} image`}
													>
														<img src={img.imageUrl} alt="" class="h-14 w-14 object-cover" />
														{#if img.isPrimary}
															<span
																class="absolute top-0.5 left-0.5 bg-volt px-1 py-0.5 font-mono text-[6px] leading-none font-bold tracking-wider text-void uppercase"
																>Primary</span
															>
														{/if}
													</AdminButton>
												{/each}
											</div>
										{:else}
											<p class="font-sans text-xs text-ash/50">No images for this color variant.</p>
										{/if}
									</div>
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<AdminEmptyState title="No variants" description="Add variants from edit." />
				{/if}
			</AdminCard>

			<!-- Images Grid Card -->
			<AdminCard kicker="Media" title="Images" border="border border-ash/15" class="shadow-sm">
				{#if product.images.length > 0}
					<div class="animate-fade-in grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
						{#each product.images as image, idx (image.id)}
							<AdminButton
								type="button"
								variant="outline"
								onclick={() => (activeImageIndex = idx)}
								class="block h-auto w-full p-0 text-left normal-case"
								aria-label={`View ${image.altText ?? 'product image'}`}
							>
								<div class="relative">
									<img
										src={image.imageUrl}
										alt={image.altText ?? ''}
										class="aspect-4/5 w-full object-cover"
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
							</AdminButton>
						{/each}
					</div>
				{:else}
					<AdminEmptyState title="No images" description="Upload product media from edit." />
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
						class="aspect-4/5 w-full object-cover"
					/>
				{:else}
					<div class="grid aspect-4/5 place-items-center bg-void text-ash">
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
							<p class="mt-1 font-sans text-[10px] tracking-wider text-ash uppercase">Live Vars</p>
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

	<AdminModal
		open={activeImage !== null}
		title={activeImage?.altText ?? 'Product Image'}
		kicker="Image detail"
		size="5xl"
		onOpenChange={(open) => {
			if (!open) activeImageIndex = null;
		}}
	>
		{#if activeImage}
			<div
				class="grid min-w-0 overflow-hidden border border-ash/15 bg-void lg:grid-cols-[minmax(0,1fr)_340px]"
			>
				<div class="flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-void">
					<img
						src={activeImage.imageUrl}
						alt={activeImage.altText ?? ''}
						class="mx-auto max-h-[64vh] w-full min-w-0 object-contain"
					/>
				</div>
				<div
					class="grid min-w-0 content-start gap-4 border-t border-charcoal bg-charcoal p-5 lg:border-t-0 lg:border-l"
				>
					{#if activeImage.variantId}
						{@const variantColor = colorCards.find(
							(c) => c.variantColorId === activeImage.variantId
						)}
						<AdminBadge variant="accent">
							Linked to {variantColor?.color ?? 'color swatch'}
						</AdminBadge>
					{:else}
						<AdminBadge variant="neutral">Product-wide image</AdminBadge>
					{/if}
					<div class="grid gap-3 border-t border-charcoal pt-4 font-mono text-xs uppercase">
						<div class="flex justify-between gap-4">
							<span class="font-sans text-xs text-ash">Role</span>
							<span class="text-right font-sans text-sm text-bone">
								{activeImage.isPrimary ? 'Primary Image' : 'Gallery Image'}
							</span>
						</div>
						<div class="flex justify-between gap-4">
							<span class="font-sans text-xs text-ash">Order Position</span>
							<span class="text-right text-bone">{activeImage.position}</span>
						</div>
						<div class="flex justify-between gap-4">
							<span class="font-sans text-xs text-ash">Uploaded</span>
							<span class="text-right text-bone">
								{formatAdminDateTime(activeImage.createdAt, 'None')}
							</span>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</AdminModal>
</section>
