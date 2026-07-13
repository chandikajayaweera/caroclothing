<script lang="ts">
	import { AlertTriangle, ImageOff } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import type {
		ProductPreviewForm,
		ProductUiImage,
		ProductUiTag,
		ProductUiVariant
	} from './product-ui.types';

	let {
		form,
		sortedVariants,
		snapshotVariant,
		snapshotVariantId = $bindable(null),
		snapshotSize = $bindable(null),
		carouselImageId = $bindable(null),
		snapshotImages,
		carouselImage,
		sortedSnapshotSizes,
		snapshotDiscountPercent,
		activeLocalImages,
		selectedTags,
		snapshotWarnings,
		selectedCategoryName,
		formatMoney,
		formatLabel,
		onSelectVariant,
		onSelectSize,
		onPrevImage,
		onNextImage,
		onOpenImage
	}: {
		form: ProductPreviewForm;
		sortedVariants: ProductUiVariant[];
		snapshotVariant: ProductUiVariant | null;
		snapshotVariantId: string | null;
		snapshotSize: string | null;
		carouselImageId: string | null;
		snapshotImages: ProductUiImage[];
		carouselImage: ProductUiImage | null;
		sortedSnapshotSizes: string[];
		snapshotDiscountPercent: number | null;
		activeLocalImages: ProductUiImage[];
		selectedTags: ProductUiTag[];
		snapshotWarnings: string[];
		selectedCategoryName: string;
		formatMoney: (value: number | null | undefined) => string;
		formatLabel: (value: string | null | undefined) => string;
		onSelectVariant: (clientId: string) => void;
		onSelectSize: (size: string) => void;
		onPrevImage: () => void;
		onNextImage: () => void;
		onOpenImage: (imgId: string) => void;
	} = $props();

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}
</script>

{#if carouselImage}
	<div class="group relative">
		<button
			type="button"
			onclick={() => onOpenImage(carouselImage.id)}
			class="group block w-full cursor-zoom-in text-left"
			aria-label="Open selected product image detail"
		>
			<div class="relative overflow-hidden bg-void">
				<img
					src={carouselImage.imageUrl}
					alt={carouselImage.altText ?? ''}
					class="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
				/>
				<span
					class="absolute right-2 bottom-2 border border-ash/20 bg-void/90 px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase"
				>
					Open image
				</span>
			</div>
		</button>

		{#if snapshotImages.length > 1}
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					onPrevImage();
				}}
				class="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border border-ash/20 bg-void/80 text-bone transition-colors select-none hover:border-volt hover:text-volt"
				aria-label="Previous image"
			>
				&larr;
			</button>
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					onNextImage();
				}}
				class="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border border-ash/20 bg-void/80 text-bone transition-colors select-none hover:border-volt hover:text-volt"
				aria-label="Next image"
			>
				&rarr;
			</button>
		{/if}
	</div>
{:else}
	<div class="grid aspect-video place-items-center border-b border-ash/15 bg-void text-ash/40">
		<ImageOff size={28} aria-hidden="true" />
	</div>
{/if}

{#if snapshotImages.length > 0}
	<div class="flex scrollbar-thin gap-2 overflow-x-auto border-b border-ash/15 bg-void p-3">
		{#each snapshotImages as img (img.id)}
			<button
				type="button"
				onclick={() => {
					carouselImageId = img.id;
				}}
				class="relative shrink-0 cursor-pointer border transition-all {img.id === carouselImage?.id
					? 'border-volt ring-1 ring-volt'
					: 'border-ash/20 hover:border-volt/60'}"
				title={img.altText ?? 'Product image'}
				aria-label="Select product preview image"
			>
				<img src={img.imageUrl} alt="" class="h-12 w-12 object-cover" />
				{#if img.isPrimary}
					<span
						class="absolute top-0 left-0 bg-volt px-0.5 font-sans text-[6px] leading-none font-bold text-void uppercase"
						>Primary</span
					>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<div class="p-5">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Snapshot</p>
			<h2 class="mt-1 font-sans text-base leading-snug font-semibold text-bone">
				{form.name || 'Untitled product'}
			</h2>
		</div>
		<span
			class="shrink-0 border px-2 py-1 font-mono text-[9px] tracking-widest uppercase {form.isActive
				? 'border-volt/30 bg-volt/10 text-volt'
				: 'border-red-500/25 bg-red-950/20 text-red-300'}"
		>
			{form.isActive ? 'Live' : 'Draft'}
		</span>
	</div>

	<div class="mt-4 grid gap-2">
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			{#if snapshotVariant}
				<span class="font-mono text-base font-semibold text-bone">
					{formatMoney(snapshotVariant.basePrice)}
				</span>
				{#if snapshotVariant.compareAtPrice}
					<span class="font-mono text-xs text-ash line-through">
						{formatMoney(snapshotVariant.compareAtPrice)}
					</span>
				{/if}
				{#if snapshotDiscountPercent}
					<span
						class="border border-volt/25 bg-volt/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-volt uppercase"
					>
						{snapshotDiscountPercent}% off
					</span>
				{/if}
			{:else}
				<span class="font-mono text-sm text-bone"
					>{sortedVariants.length === 0
						? '—'
						: formatMoney(sortedVariants[0]?.basePrice ?? 0)}</span
				>
			{/if}
		</div>

		<p class="font-sans text-xs leading-relaxed text-ash/80">
			{form.shortDescription || 'Short product description will appear here.'}
		</p>
	</div>

	{#if sortedVariants.length > 0}
		<div class="mt-5 border-t border-ash/10 pt-4">
			<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
				Color: {snapshotVariant?.color ?? 'Select'}
			</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each sortedVariants as variant (variant.clientId)}
					<button
						type="button"
						onclick={() => onSelectVariant(variant.clientId)}
						class="inline-flex min-h-10 cursor-pointer items-center gap-2 border px-3 font-sans text-xs font-semibold transition-colors {snapshotVariant?.clientId ===
						variant.clientId
							? 'border-volt bg-volt text-void'
							: 'border-ash/30 bg-void text-ash hover:border-volt hover:text-volt'}"
						aria-pressed={snapshotVariant?.clientId === variant.clientId}
					>
						<span
							class="h-3 w-3 border border-ash/30 {isValidHex(variant.colorHex) ? '' : 'bg-ash/20'}"
							style={isValidHex(variant.colorHex) ? `background-color: ${variant.colorHex}` : ''}
							aria-hidden="true"
						></span>
						<span>{variant.color || 'Unnamed'}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if snapshotVariant && snapshotVariant.sizes.length > 0}
		<div class="mt-4 border-t border-ash/10 pt-4">
			<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
				Size: {snapshotSize ?? 'Select'}
			</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each sortedSnapshotSizes as size (size)}
					<button
						type="button"
						onclick={() => onSelectSize(size)}
						class="grid h-10 min-w-11 cursor-pointer place-items-center border px-3 font-mono text-xs transition-colors {snapshotSize ===
						size
							? 'border-volt bg-volt text-void'
							: 'border-ash/30 bg-void text-bone hover:border-volt'}"
						aria-pressed={snapshotSize === size}
					>
						{size}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="grid gap-3 font-sans text-xs">
		<div class="mt-5 flex justify-between gap-4 border-t border-ash/10 pt-4">
			<span class="font-medium text-ash">Category</span>
			<span class="text-right text-bone">{selectedCategoryName}</span>
		</div>
		<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
			<span class="font-medium text-ash">Gender / Fit</span>
			<span class="text-right text-bone uppercase">
				{formatLabel(form.gender ?? '')} / {formatLabel(form.fit ?? '')}
			</span>
		</div>
		<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
			<span class="font-medium text-ash">Images</span>
			<span class="text-right text-bone">{activeLocalImages.length}</span>
		</div>
		{#if selectedTags.length > 0 || form.newTagNames.length > 0}
			<div class="flex flex-wrap gap-1.5 pt-1">
				{#each selectedTags as tag (tag.id)}
					<span class="border border-ash/20 px-2 py-1 font-mono text-[9px] text-ash uppercase">
						{tag.name}
					</span>
				{/each}
				{#each form.newTagNames as tagName (tagName)}
					<span class="border border-ash/20 px-2 py-1 font-mono text-[9px] text-ash uppercase">
						{tagName}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	{#if snapshotWarnings.length > 0}
		<div
			transition:slide={{ duration: 200 }}
			class="mt-4 border border-amber-300/20 bg-amber-300/5 p-3.5"
		>
			<p
				class="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
			>
				<AlertTriangle size={12} />
				Attention ({snapshotWarnings.length})
			</p>
			<ul class="mt-2 list-disc space-y-1 pl-4 font-sans text-xs text-ash/70">
				{#each snapshotWarnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
