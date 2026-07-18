<script lang="ts">
	import { ChevronDown, Plus, Upload, X } from 'lucide-svelte';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminCheckbox from '$lib/components/admin/controls/AdminCheckbox.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import ProductColorSelector from './ProductColorSelector.svelte';
	import type {
		ProductUiColor,
		ProductUiOption,
		ProductVariantImagePreview,
		ProductVariantsErrors,
		ProductVariantsForm
	} from './product-ui.types';

	let {
		form = $bindable(),
		errors,
		colors,
		sizeOptions,
		showColorModal = $bindable(false),
		imagesForVariant,
		onRemoveImage,
		onOpenImage,
		onVariantImageUpload,
		onToggleSize,
		onAddVariant,
		onRemoveVariant,
		onVariantSortChange,
		expandedVariants = $bindable()
	}: {
		form: ProductVariantsForm;
		errors: ProductVariantsErrors;
		colors: ProductUiColor[];
		sizeOptions: ProductUiOption[];
		showColorModal: boolean;
		imagesForVariant: (clientId: string) => ProductVariantImagePreview[];
		onRemoveImage: (index: number) => void;
		onOpenImage?: (index: number) => void;
		onVariantImageUpload: (variantClientId: string, event: Event) => void;
		onToggleSize: (clientId: string, size: string) => void;
		onAddVariant: () => void;
		onRemoveVariant: (clientId: string) => void;
		onVariantSortChange: (clientId: string, event: Event) => void;
		expandedVariants: Record<string, boolean>;
	} = $props();

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function variantSortOptions(): number[] {
		return Array.from({ length: form.variants.length }, (_, i) => i + 1);
	}

	const sortedVariants = $derived([...form.variants].sort((a, b) => a.sortOrder - b.sortOrder));
</script>

<AdminCard title="Colors & Sizes" border="border border-ash/15" class="shadow-sm">
	{#snippet headerActions()}
		<div class="flex flex-wrap items-center gap-2">
			<AdminButton
				type="button"
				variant="outline"
				size="sm"
				onclick={() => {
					for (const v of form.variants) expandedVariants[v.clientId] = false;
				}}
			>
				Collapse All
			</AdminButton>
			<AdminButton
				type="button"
				variant="outline"
				size="sm"
				onclick={() => {
					for (const v of form.variants) expandedVariants[v.clientId] = true;
				}}
			>
				Expand All
			</AdminButton>
			<AdminButton type="button" onclick={onAddVariant} variant="outline" size="sm">
				<Plus size={14} aria-hidden="true" />
				Add Variant
			</AdminButton>
		</div>
	{/snippet}

	{#if form.variants.length > 0}
		<div class="mt-5 grid gap-4">
			{#each sortedVariants as variant, index (variant.clientId)}
				{@const originalIndex = form.variants.findIndex((v) => v.clientId === variant.clientId)}
				{@const isPriceDisabled = form.syncPrices && variant.sortOrder !== 1}
				{@const isRemovable = form.variants.length > 1 && variant.clientId !== 'default-color-card'}
				{@const isExpanded = !!expandedVariants[variant.clientId]}

				<article
					animate:flip={{ duration: 300 }}
					transition:slide={{ duration: 250 }}
					class="border border-ash/20 bg-void transition-colors"
				>
					<!-- Collapsed Header -->
					<div class="flex items-stretch gap-2">
						<AdminButton
							type="button"
							variant="charcoal"
							size="sm"
							class="h-auto min-w-0 flex-1 justify-between border-0 bg-void p-4 text-left normal-case"
							onclick={() =>
								(expandedVariants[variant.clientId] = !expandedVariants[variant.clientId])}
							aria-expanded={isExpanded}
						>
							<div class="flex min-w-0 items-center gap-3">
								<span
									class="h-5 w-5 shrink-0 rounded-full border border-ash/30"
									style:background={isValidHex(variant.colorHex) ? variant.colorHex : '#333'}
								></span>
								<div class="min-w-0">
									<h3 class="flex items-center gap-2 font-sans text-sm font-semibold text-bone">
										{variant.color || `Variant ${index + 1}`}
										{#if variant.sortOrder === 1}
											<span
												class="border border-volt/20 bg-volt/10 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-volt uppercase"
												>Default</span
											>
										{/if}
									</h3>
									<p class="mt-0.5 font-sans text-xs text-ash">
										Sizes: {variant.sizes.join(', ') || 'None'} • Selling: {formatMoney(
											variant.basePrice
										)} • Images: {imagesForVariant(variant.clientId).length}
									</p>
								</div>
							</div>

							<span
								class="shrink-0 text-ash transition-transform duration-200"
								class:rotate-180={isExpanded}
							>
								<ChevronDown size={16} />
							</span>
						</AdminButton>
						{#if isRemovable}
							<div class="grid place-items-center pr-2">
								<AdminButton
									type="button"
									size="icon"
									variant="danger"
									onclick={() => onRemoveVariant(variant.clientId)}
									aria-label={`Remove variant ${index + 1}`}
								>
									<X size={14} aria-hidden="true" />
								</AdminButton>
							</div>
						{/if}
					</div>

					<!-- Expanded Body -->
					{#if isExpanded}
						<div class="grid gap-4 border-t border-ash/10 bg-charcoal/10 p-4">
							<input
								type="hidden"
								name={`variants[${index}].clientId`}
								bind:value={form.variants[originalIndex].clientId}
							/>
							{#each variant.sizes as size (size)}
								<input type="hidden" name={`variants[${index}].sizes`} value={size} />
							{/each}

							<!-- Color -->
							<div class="grid gap-4">
								<ProductColorSelector
									bind:variant={form.variants[originalIndex]}
									{colors}
									bind:showColorModal
									variants={form.variants}
									{originalIndex}
								/>
								<input
									type="hidden"
									name={`variants[${index}].color`}
									value={form.variants[originalIndex].color}
								/>
								<input
									type="hidden"
									name={`variants[${index}].colorHex`}
									value={form.variants[originalIndex].colorHex ?? ''}
								/>
								<input
									type="hidden"
									name={`variants[${index}].colorId`}
									value={form.variants[originalIndex].colorId ?? ''}
								/>
							</div>

							<!-- Prices -->
							<div class="grid gap-4 md:grid-cols-3">
								<AdminInput
									label="Selling Price (LKR)"
									type="number"
									name={`variants[${index}].basePrice`}
									bind:value={form.variants[originalIndex].basePrice}
									disabled={isPriceDisabled}
									required
									helpText="Price paid by customer."
									error={errors.variants?.[index]?.basePrice}
								/>

								<AdminInput
									label="Original Price / Compare At"
									type="number"
									name={`variants[${index}].compareAtPrice`}
									bind:value={form.variants[originalIndex].compareAtPrice}
									disabled={isPriceDisabled}
									placeholder="Optional"
									helpText="Pre-discount price (must be higher)."
									error={errors.variants?.[index]?.compareAtPrice}
								/>

								{#if form.variants.length > 1}
									<AdminSelect
										label="Sort Order"
										name={`variants[${index}].sortOrder`}
										value={variant.sortOrder}
										onchange={(event) => onVariantSortChange(variant.clientId, event)}
									>
										{#each variantSortOptions() as sortValue (sortValue)}
											<option value={sortValue}>{sortValue}</option>
										{/each}
									</AdminSelect>
								{/if}
							</div>

							<!-- Sync prices -->
							{#if variant.sortOrder === 1}
								<div class="border-t border-ash/10 pt-3">
									<div class="flex items-center gap-2 font-sans text-xs font-semibold text-ash">
										<AdminCheckbox
											name="syncPrices"
											bind:checked={form.syncPrices}
											ariaLabel="Sync prices across all color variants"
										/>
										<span>Sync prices across all color variants</span>
									</div>
								</div>
							{/if}

							<!-- Sizes -->
							<div class="border-t border-ash/10 pt-3">
								<div class="grid gap-1">
									<span
										class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
									>
										Available Sizes
										<span class="ml-0.5 font-sans text-red-400">*</span>
									</span>
									<div class="mt-1 flex flex-wrap gap-2">
										{#each sizeOptions as sizeOpt (sizeOpt.value)}
											{@const isSelected = variant.sizes.includes(sizeOpt.value)}
											<AdminButton
												type="button"
												onclick={() => onToggleSize(variant.clientId, sizeOpt.value)}
												variant={isSelected ? 'volt' : 'outline'}
												size="sm"
											>
												{sizeOpt.label}
											</AdminButton>
										{/each}
									</div>
									{#if errors.variants?.[index]?.sizes}
										<span class="mt-1 font-sans text-xs text-red-400">
											{errors.variants[index]?.sizes?._errors?.[0] ??
												errors.variants[index]?.sizes?.[0]}
										</span>
									{/if}
								</div>
							</div>

							<!-- Variant Photography -->
							<div class="border-t border-ash/10 pt-3">
								<div class="grid gap-1">
									<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
										>Variant Photography</span
									>
									<div class="mt-2 flex items-center gap-3">
										<label
											class="relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-dashed border-ash/30 bg-void px-4 font-sans text-xs font-semibold text-ash transition-colors hover:border-volt hover:text-volt"
										>
											<input
												type="file"
												accept="image/jpeg,image/png,image/webp,image/avif"
												multiple
												onchange={(event) => onVariantImageUpload(variant.clientId, event)}
												class="hidden"
											/>
											<Upload size={14} class="text-volt" aria-hidden="true" />
											Upload Images
										</label>
									</div>
									{#if imagesForVariant(variant.clientId).length > 0}
										<div class="mt-3 flex flex-wrap gap-3">
											{#each imagesForVariant(variant.clientId) as img (img.index)}
												<div class="group relative block border border-ash/20 hover:border-volt">
													<AdminButton
														type="button"
														onclick={() => onOpenImage?.(img.index)}
														variant="outline"
														class="block h-auto p-0"
														aria-label="View image"
													>
														<img src={img.preview.url} alt="" class="h-20 w-20 object-cover" />
													</AdminButton>
													{#if img.meta.isPrimary}
														<span
															class="absolute top-1 left-1 bg-volt px-1 py-0.5 font-sans text-[8px] leading-none font-bold text-void uppercase"
															>Primary</span
														>
													{/if}
													<AdminButton
														type="button"
														size="icon"
														variant="danger"
														onclick={(e) => {
															e.stopPropagation();
															onRemoveImage(img.index);
														}}
														class="absolute -top-2 -right-2 h-8 w-8 bg-void sm:h-8 sm:w-8"
														aria-label="Remove image"
													>
														<X size={12} aria-hidden="true" />
													</AdminButton>
												</div>
											{/each}
										</div>
									{:else}
										<p class="mt-1 font-sans text-xs text-ash/50">
											No photography uploaded for this color swatch.
										</p>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else}
		<p class="mt-4 border border-ash/15 bg-void px-4 py-5 font-sans text-xs text-ash/70">
			No color swatches configured. Click Add Variant above to begin.
		</p>
	{/if}
</AdminCard>
