<script lang="ts">
	import { fade } from 'svelte/transition';
	import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-svelte';
	import {
		mediaPresetUrl,
		productDetailImageAttrs,
		productThumbnailImageAttrs
	} from '$lib/shared/media';

	let { images }: { images: { url: string; alt: string; r2Key?: string | null }[] } = $props();

	let activeIndex = $state(0);
	let lightboxIndex = $state(0);
	let isLightboxOpen = $state(false);
	let isZoomed = $state(false);
	let touchStartX = 0;

	const safeActiveIndex = $derived(
		images.length === 0 ? 0 : Math.min(activeIndex, images.length - 1)
	);
	const safeLightboxIndex = $derived(
		images.length === 0 ? 0 : Math.min(lightboxIndex, images.length - 1)
	);

	function nextImage() {
		if (images.length <= 1) return;
		const nextIndex = (safeActiveIndex + 1) % images.length;
		activeIndex = nextIndex;
		lightboxIndex = nextIndex;
		isZoomed = false;
	}

	function prevImage() {
		if (images.length <= 1) return;
		const nextIndex = (safeActiveIndex - 1 + images.length) % images.length;
		activeIndex = nextIndex;
		lightboxIndex = nextIndex;
		isZoomed = false;
	}

	function openLightbox(index: number) {
		activeIndex = index;
		lightboxIndex = index;
		isLightboxOpen = true;
		isZoomed = false;
	}

	function closeLightbox() {
		isLightboxOpen = false;
		isZoomed = false;
	}

	function handleTouchStart(event: TouchEvent) {
		touchStartX = event.changedTouches[0].screenX;
	}

	function handleTouchEnd(event: TouchEvent) {
		const diff = touchStartX - event.changedTouches[0].screenX;
		if (Math.abs(diff) < 40) return;
		if (diff > 0) nextImage();
		else prevImage();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isLightboxOpen) return;
		if (event.key === 'Escape') closeLightbox();
		if (event.key === 'ArrowRight') nextImage();
		if (event.key === 'ArrowLeft') prevImage();
	}

	function detailAttrs(index: number) {
		return productDetailImageAttrs(
			{
				r2Key: images[index]?.r2Key ?? null,
				imageUrl: images[index]?.url ?? null,
				altText: images[index]?.alt ?? null
			},
			{ priority: index === 0 }
		);
	}

	function thumbnailAttrs(index: number) {
		return productThumbnailImageAttrs({
			r2Key: images[index]?.r2Key ?? null,
			imageUrl: images[index]?.url ?? null,
			altText: images[index]?.alt ?? null
		});
	}

	function lightboxSrc(index: number) {
		const image = images[index];
		return image?.r2Key ? mediaPresetUrl(image.r2Key, 'product1200') : image?.url;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="w-full">
	<button
		type="button"
		class="relative block aspect-4/5 w-full cursor-zoom-in overflow-hidden bg-charcoal p-0 text-left md:hidden"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
		onclick={() => openLightbox(safeActiveIndex)}
		aria-label="Open product image {safeActiveIndex + 1}"
	>
		{#if images.length > 0}
			{#key images[safeActiveIndex]?.url}
				{@const attrs = detailAttrs(safeActiveIndex)}
				<img
					src={attrs?.src ?? images[safeActiveIndex]?.url}
					srcset={attrs?.srcset || undefined}
					sizes={attrs?.sizes}
					width={attrs?.width}
					loading={attrs?.loading}
					decoding={attrs?.decoding}
					fetchpriority={attrs?.fetchpriority}
					alt={images[safeActiveIndex]?.alt}
					class="absolute inset-0 h-full w-full object-cover"
					transition:fade={{ duration: 160 }}
				/>
			{/key}
		{/if}

		{#if images.length > 1}
			<span
				class="pointer-events-none absolute right-4 bottom-4 border border-ash/15 bg-void/85 px-2.5 py-1 font-mono text-[9px] tracking-widest text-bone uppercase"
			>
				{safeActiveIndex + 1} / {images.length}
			</span>
		{/if}
	</button>

	<div class="hidden w-full items-start gap-4 md:flex">
		{#if images.length > 1}
			<div
				class="no-scrollbar sticky top-24 flex max-h-[70vh] w-16 shrink-0 flex-col gap-3 overflow-y-auto lg:w-20"
			>
				{#each images as image, index (image.url)}
					{@const attrs = thumbnailAttrs(index)}
					<button
						type="button"
						class="relative aspect-4/5 w-full cursor-pointer overflow-hidden border bg-charcoal transition-colors focus-visible:ring-1 focus-visible:ring-volt focus-visible:outline-none {safeActiveIndex ===
						index
							? 'border-volt'
							: 'border-charcoal hover:border-ash/60'}"
						onmouseenter={() => (activeIndex = index)}
						onclick={() => openLightbox(index)}
						aria-label="Open product image {index + 1}"
					>
						<img
							src={attrs?.src ?? image.url}
							sizes={attrs?.sizes}
							width={attrs?.width}
							loading={attrs?.loading}
							decoding={attrs?.decoding}
							alt={image.alt}
							class="h-full w-full object-cover"
						/>
					</button>
				{/each}
			</div>
		{/if}

		<button
			type="button"
			class="relative block aspect-4/5 flex-1 cursor-zoom-in overflow-hidden border border-charcoal bg-charcoal p-0 text-left"
			onclick={() => openLightbox(safeActiveIndex)}
			aria-label="Open selected product image"
		>
			{#if images.length > 0}
				{#key images[safeActiveIndex]?.url}
					{@const attrs = detailAttrs(safeActiveIndex)}
					<img
						src={attrs?.src ?? images[safeActiveIndex]?.url}
						srcset={attrs?.srcset || undefined}
						sizes={attrs?.sizes}
						width={attrs?.width}
						loading={attrs?.loading}
						decoding={attrs?.decoding}
						fetchpriority={attrs?.fetchpriority}
						alt={images[safeActiveIndex]?.alt}
						class="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
						transition:fade={{ duration: 160 }}
					/>
				{/key}
			{/if}

			{#if images.length > 1}
				<span
					class="pointer-events-none absolute right-4 bottom-4 border border-charcoal bg-void/85 px-2.5 py-1 font-mono text-[9px] tracking-widest text-bone uppercase"
				>
					{safeActiveIndex + 1} / {images.length}
				</span>
			{/if}
		</button>
	</div>
</div>

{#if isLightboxOpen}
	<div
		class="fixed inset-0 z-50 flex flex-col bg-void/98 p-4 backdrop-blur-md md:p-8"
		role="dialog"
		aria-modal="true"
		aria-label="Product image viewer"
		transition:fade={{ duration: 160 }}
	>
		<div class="flex items-center justify-between">
			<span class="font-mono text-[10px] tracking-widest text-ash uppercase">
				Image {safeLightboxIndex + 1} / {images.length}
			</span>
			<button
				type="button"
				onclick={closeLightbox}
				class="flex h-10 w-10 cursor-pointer items-center justify-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label="Close image viewer"
			>
				<X size={18} aria-hidden="true" />
			</button>
		</div>

		<div class="relative flex min-h-0 flex-1 items-center justify-center py-4">
			{#if images.length > 1}
				<button
					type="button"
					onclick={prevImage}
					class="absolute left-0 z-10 flex h-11 w-11 cursor-pointer items-center justify-center border border-charcoal bg-void/85 text-ash transition-colors hover:border-volt hover:text-volt md:left-4"
					aria-label="Previous image"
				>
					<ChevronLeft size={20} aria-hidden="true" />
				</button>
			{/if}

			<button
				type="button"
				onclick={() => (isZoomed = !isZoomed)}
				class="flex max-h-full max-w-full cursor-zoom-in items-center justify-center overflow-hidden p-0"
				aria-label={isZoomed ? 'Zoom out' : 'Zoom in'}
			>
				{#key images[safeLightboxIndex]?.url}
					<img
						src={lightboxSrc(safeLightboxIndex)}
						alt={images[safeLightboxIndex]?.alt}
						class="max-h-[76vh] max-w-full object-contain transition-transform duration-200 {isZoomed
							? 'scale-150'
							: 'scale-100'}"
						transition:fade={{ duration: 120 }}
					/>
				{/key}
			</button>

			{#if images.length > 1}
				<button
					type="button"
					onclick={nextImage}
					class="absolute right-0 z-10 flex h-11 w-11 cursor-pointer items-center justify-center border border-charcoal bg-void/85 text-ash transition-colors hover:border-volt hover:text-volt md:right-4"
					aria-label="Next image"
				>
					<ChevronRight size={20} aria-hidden="true" />
				</button>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-3">
			<p class="line-clamp-2 font-sans text-xs text-ash">{images[safeLightboxIndex]?.alt}</p>
			<button
				type="button"
				onclick={() => (isZoomed = !isZoomed)}
				class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label={isZoomed ? 'Zoom out' : 'Zoom in'}
			>
				{#if isZoomed}
					<ZoomOut size={16} aria-hidden="true" />
				{:else}
					<ZoomIn size={16} aria-hidden="true" />
				{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
