<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, ImageOff, Pencil, Star, X } from 'lucide-svelte';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';

	let { data }: { data: PageData } = $props();

	const product = $derived(data.product);
	const primaryImage = $derived(
		product.images.find((image) => image.isPrimary) ?? product.images[0] ?? null
	);
	const activeVariantCount = $derived(
		product.variants.filter((variant) => variant.isActive).length
	);

	type ColorCard = {
		variantColorId: string;
		color: string;
		colorHex: string | null;
		basePrice: number;
		compareAtPrice: number | null;
		variants: { id: string; size: string; isActive: boolean; sortOrder: number }[];
	};

	const colorCards = $derived.by<ColorCard[]>(() => {
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
	});

	let activeImageIndex = $state<number | null>(null);
	const activeImage = $derived(
		activeImageIndex === null ? null : (product.images[activeImageIndex] ?? null)
	);

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

	function imagesForColorCard(variantColorId: string) {
		return product.images.filter((image) => image.variantId === variantColorId);
	}
</script>

<svelte:head>
	<title>{product.name} | Products | Caro Admin</title>
	<meta name="description" content={`View ${product.name} product details in Caro admin.`} />
</svelte:head>

<section class="mx-auto max-w-7xl">
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
				<h1
					class="mt-2 truncate font-display text-4xl leading-none text-bone uppercase md:text-6xl"
				>
					{product.name}
				</h1>
				<p class="mt-2 truncate font-mono text-xs tracking-widest text-ash uppercase">
					{product.slug}
				</p>
			</div>

			<AdminButton
				href={resolve(`/app/products/${product.slug}/edit`)}
				variant="volt"
				class="mt-5 md:mt-0"
			>
				<Pencil size={14} aria-hidden="true" />
				Edit product
			</AdminButton>
		</div>
	</div>

	<div class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
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
							? 'text-volt font-bold'
							: 'text-red-400 font-bold'}"
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
					<p class="mt-2 font-sans text-sm text-bone">{product.category?.name ?? 'No category'}</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-sans text-xs text-ash">Tier</p>
					<p class="mt-2 font-sans text-sm text-bone">{formatLabel(product.tier)}</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-sans text-xs text-ash">Gender / Fit</p>
					<p class="mt-2 font-sans text-sm text-bone">
						{formatLabel(product.gender)} / {formatLabel(product.fit)}
					</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-sans text-xs text-ash">Drop</p>
					<p class="mt-2 font-sans text-sm text-bone">
						{product.dropAssignment?.name ?? 'No drop'}
					</p>
				</div>
			</div>

			<div class="grid gap-5 border-t border-charcoal p-5 bg-void">
				<div>
					<p class="font-sans text-xs text-ash">Short Description</p>
					<p class="mt-2 font-sans text-sm leading-relaxed text-bone">{product.shortDescription ?? 'None'}</p>
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

		<aside class="grid gap-4 xl:sticky xl:top-8 xl:self-start">
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
					<p class="font-sans text-xs text-ash mb-3">Counts</p>
					<div class="grid grid-cols-3 gap-3 text-center">
						<div class="bg-void p-3 border border-charcoal/40">
							<p class="font-display text-3xl text-bone uppercase">{product.images.length}</p>
							<p class="font-sans text-[10px] tracking-wider text-ash uppercase mt-1">Images</p>
						</div>
						<div class="bg-void p-3 border border-charcoal/40">
							<p class="font-display text-3xl text-bone uppercase">{activeVariantCount}</p>
							<p class="font-sans text-[10px] tracking-wider text-ash uppercase mt-1">Live Vars</p>
						</div>
						<div class="bg-void p-3 border border-charcoal/40">
							<p class="font-display text-3xl text-bone uppercase">{product.tags.length}</p>
							<p class="font-sans text-[10px] tracking-wider text-ash uppercase mt-1">Tags</p>
						</div>
					</div>
				</div>
			</div>

			<AdminCard
				kicker="Drop Assignment"
				title="Drop Window"
				titleSize="text-lg"
				border="border border-charcoal/40"
				class="shadow-sm"
			>
				<div class="grid gap-3 font-mono text-xs uppercase">
					<div class="flex justify-between gap-4 border-b border-charcoal pb-2">
						<span class="font-sans text-xs text-ash uppercase">Status</span>
						<span class="text-right text-bone font-mono text-xs">{product.dropAssignment?.status ?? 'None'}</span>
					</div>
					<div class="flex justify-between gap-4 border-b border-charcoal pb-2">
						<span class="font-sans text-xs text-ash uppercase">Launch</span>
						<span class="text-right text-bone font-mono text-xs">
							{formatDate(product.dropAssignment?.launchAt ?? null)}
						</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="font-sans text-xs text-ash uppercase">End</span>
						<span class="text-right text-bone font-mono text-xs">
							{formatDate(product.dropAssignment?.endAt ?? null)}
						</span>
					</div>
				</div>
			</AdminCard>
		</aside>
	</div>

	<AdminCard
		kicker="Variants"
		title="Stock Options"
		border="border border-ash/15"
		class="mt-4 shadow-sm"
	>

		{#if colorCards.length > 0}
			<div class="grid gap-4 p-5 bg-charcoal">
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
									<span class="mr-2 text-ash line-through">{formatMoney(card.compareAtPrice)}</span>
								{/if}
								<span class="font-bold text-volt">{formatMoney(card.basePrice)}</span>
							</div>
						</div>

						<div class="grid gap-4 md:grid-cols-2">
							<div>
								<p class="mb-2 font-sans text-xs text-ash">
									Sizes Available
								</p>
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
									Images ({imagesForColorCard(card.variantColorId).length})
								</p>
								{#if imagesForColorCard(card.variantColorId).length > 0}
									<div class="flex flex-wrap gap-2">
										{#each imagesForColorCard(card.variantColorId) as img}
											{@const imgIndex = product.images.indexOf(img)}
											<button
												type="button"
												onclick={() => (activeImageIndex = imgIndex)}
												class="relative block border border-charcoal transition-colors hover:border-volt cursor-pointer"
											>
												<img src={img.imageUrl} alt="" class="h-14 w-14 object-cover" />
												{#if img.isPrimary}
													<span
														class="py-0.5 absolute top-0.5 left-0.5 bg-volt px-1 font-mono text-[6px] leading-none text-void uppercase tracking-wider font-bold"
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

	<AdminCard
		kicker="Media"
		title="Images"
		border="border border-ash/15"
		class="mt-4 shadow-sm"
	>

		{#if product.images.length > 0}
			<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
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
								{@const variantColor = colorCards.find((c) => c.variantColorId === image.variantId)}
								<p class="mt-1 font-mono text-[10px] text-volt uppercase">
									Variant: {variantColor?.color ?? 'Linked color'}
								</p>
							{:else}
								<p class="mt-1 font-sans text-[10px] text-ash/60 uppercase">Product-wide image</p>
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
</section>

{#if activeImage && activeImageIndex !== null}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/90 px-3 py-4 sm:px-4 sm:py-6 backdrop-blur-sm"
	>
		<section
			class="mx-auto my-auto grid w-full max-w-5xl min-w-0 border border-charcoal bg-charcoal shadow-2xl lg:max-h-[90vh] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden animate-fade-in"
		>
			<div class="min-h-0 min-w-0 overflow-hidden bg-void flex items-center justify-center">
				<img
					src={activeImage.imageUrl}
					alt={activeImage.altText ?? ''}
					class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[92vh]"
				/>
			</div>
			<div class="grid min-w-0 content-start gap-4 p-5 bg-charcoal border-l border-charcoal">
				<div class="flex items-start justify-between gap-4 animate-fade-in">
					<div class="min-w-0">
						<p class="font-sans text-xs font-bold text-volt uppercase tracking-wider">Image Detail</p>
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
						class="grid h-11 w-11 shrink-0 cursor-pointer place-items-center border border-ash/30 text-ash hover:border-volt hover:text-volt transition-colors"
						aria-label="Close image detail"
					>
						<X size={15} aria-hidden="true" />
					</button>
				</div>
				<div class="grid gap-3 border-t border-charcoal pt-4 font-mono text-xs uppercase">
					<div class="flex justify-between gap-4">
						<span class="font-sans text-xs text-ash">Role</span>
						<span class="text-right text-bone font-sans text-sm"
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
		</section>
	</div>
{/if}
