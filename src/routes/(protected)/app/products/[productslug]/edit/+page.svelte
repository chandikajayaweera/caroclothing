<script lang="ts">
	import { page } from '$app/state';
	import {
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		Plus,
		Star,
		Trash2,
		Upload,
		X
	} from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { superForm, filesProxy } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminModal from '$lib/components/admin/overlays/AdminModal.svelte';
	import AdminUnsavedChangesGuard from '$lib/components/admin/forms/AdminUnsavedChangesGuard.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminColorManagerModal from '$lib/components/admin/products/AdminColorManagerModal.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import ProductBasicsSection from '$lib/components/admin/products/ProductBasicsSection.svelte';
	import ProductColorSelector from '$lib/components/admin/products/ProductColorSelector.svelte';
	import ProductPreviewPanel from '$lib/components/admin/products/ProductPreviewPanel.svelte';
	import ProductPublishingSection from '$lib/components/admin/products/ProductPublishingSection.svelte';
	import ProductTagsSection from '$lib/components/admin/products/ProductTagsSection.svelte';
	import { formatAdminMoney, formatAdminStatus } from '$lib/shared/admin/format';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		form: updateProductForm,
		errors: updateProductErrors,
		constraints: updateProductConstraints,
		message: updateProductMessage,
		enhance: updateProductEnhance,
		submitting: updateProductSubmitting,
		tainted: updateProductTainted
	} = superForm(
		initialForm(() => data.updateProductForm),
		{
			resetForm: false
		}
	);

	const imageFiles = filesProxy(updateProductForm, 'newImageFiles');

	// Local States
	type LocalVariant = {
		id: string;
		colorId?: string | null;
		color: string;
		colorHex: string | null;
		basePrice: number;
		compareAtPrice: number | null;
		sortOrder: number;
		sizes: string[];
		isNew?: boolean;
		isDeleted?: boolean;
	};

	type LocalImage = {
		id: string;
		variantId: string | null;
		imageUrl: string;
		altText: string | null;
		position: number;
		isPrimary: boolean;
		isNew?: boolean;
		isDeleted?: boolean;
		fileIndex?: number;
	};

	function buildLocalVariants(product: PageData['product']): LocalVariant[] {
		const cardsMap: Record<string, LocalVariant> = {};
		for (const variant of product.variants) {
			const colorId = variant.variantColorId;
			if (!cardsMap[colorId]) {
				cardsMap[colorId] = {
					id: colorId,
					colorId: variant.colorId,
					color: variant.color,
					colorHex: variant.colorHex,
					basePrice: variant.basePrice,
					compareAtPrice: variant.compareAtPrice,
					sortOrder: variant.sortOrder,
					sizes: []
				};
			}
			cardsMap[colorId].sizes.push(variant.size);
		}
		return Object.values(cardsMap).sort((a, b) => a.sortOrder - b.sortOrder);
	}

	function buildLocalImages(product: PageData['product']): LocalImage[] {
		return product.images.map((img) => ({
			id: img.id,
			variantId: img.variantId,
			imageUrl: img.imageUrl,
			altText: img.altText,
			position: img.position,
			isPrimary: img.isPrimary
		}));
	}

	let localVariants = $state<LocalVariant[]>(initialForm(() => buildLocalVariants(data.product)));
	let localImages = $state<LocalImage[]>(initialForm(() => buildLocalImages(data.product)));
	const initialLocalSignature = initialForm(() => ({
		variants: JSON.stringify(localVariants),
		images: JSON.stringify(localImages)
	}));

	let showColorModal = $state(false);
	// eslint-disable-next-line svelte/prefer-writable-derived
	let colors = $state<typeof data.colors>([]);

	$effect.pre(() => {
		colors = data.colors;
	});

	$effect(() => {
		if (localVariants.length > 0) {
			const activeColorIds = new Set(colors.map((c) => c.id));
			for (const variant of localVariants) {
				if (variant.colorId && !activeColorIds.has(variant.colorId)) {
					variant.colorId = null;
					variant.color = '';
					variant.colorHex = null;
				}
			}
		}
	});

	let formElement = $state<HTMLFormElement | null>(null);
	let toastMessage = $state<string | null>(null);
	let slugManuallyEdited = $state(true);

	$effect(() => {
		if ($updateProductMessage) toastMessage = $updateProductMessage;
	});

	let newImageFiles = $state<File[]>([]);
	let imagePreviews = $state<{ url: string; name: string; size: number; fileIndex: number }[]>([]);

	let activeImageId = $state<string | null>(null);
	let isSnapshotClick = $state(false);

	const activeImage = $derived(
		activeImageId === null ? null : (localImages.find((img) => img.id === activeImageId) ?? null)
	);

	let carouselImageId = $state<string | null>(null);
	let selectedSnapshotVariantId = $state<string | null>(null);
	let selectedSnapshotSize = $state<string | null>(null);

	const activeLocalVariants = $derived(
		localVariants.filter((v) => !v.isDeleted).sort((a, b) => a.sortOrder - b.sortOrder)
	);
	const previewVariants = $derived(
		activeLocalVariants.map((variant) => ({ ...variant, clientId: variant.id }))
	);

	const activeLocalImages = $derived(
		localImages.filter((img) => !img.isDeleted).sort((a, b) => a.position - b.position)
	);
	const serializedVariants = $derived(JSON.stringify(localVariants));
	const serializedImages = $derived(JSON.stringify(localImages));
	const hasUnsavedChanges = $derived(
		Boolean($updateProductTainted) ||
			serializedVariants !== initialLocalSignature.variants ||
			serializedImages !== initialLocalSignature.images
	);

	const snapshotVariant = $derived.by(() => {
		const selectedVariant = selectedSnapshotVariantId
			? activeLocalVariants.find((variant) => variant.id === selectedSnapshotVariantId)
			: null;
		return selectedVariant ?? activeLocalVariants[0] ?? null;
	});
	const previewSnapshotVariant = $derived(
		snapshotVariant ? { ...snapshotVariant, clientId: snapshotVariant.id } : null
	);

	const sortedSnapshotSizes = $derived(
		snapshotVariant
			? [...snapshotVariant.sizes].sort((a, b) => {
					const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
					return order.indexOf(a) - order.indexOf(b);
				})
			: []
	);

	const snapshotSize = $derived.by(() => {
		if (!snapshotVariant || snapshotVariant.sizes.length === 0) return null;
		return selectedSnapshotSize && snapshotVariant.sizes.includes(selectedSnapshotSize)
			? selectedSnapshotSize
			: sortedSnapshotSizes[0];
	});

	const snapshotImages = $derived.by(() => {
		if (!snapshotVariant) return activeLocalImages;
		const variantImages = activeLocalImages.filter(
			(image) => image.variantId === snapshotVariant.id
		);
		return variantImages.length > 0 ? variantImages : activeLocalImages;
	});

	const carouselImage = $derived.by(() => {
		const fallbackImage =
			snapshotImages.find((image) => image.isPrimary) ?? snapshotImages[0] ?? null;
		if (carouselImageId === null) return fallbackImage;
		return snapshotImages.find((img) => img.id === carouselImageId) ?? fallbackImage;
	});

	const snapshotDiscountPercent = $derived.by(() => {
		if (
			!snapshotVariant?.compareAtPrice ||
			snapshotVariant.compareAtPrice <= snapshotVariant.basePrice
		) {
			return null;
		}

		return Math.round(
			((snapshotVariant.compareAtPrice - snapshotVariant.basePrice) /
				snapshotVariant.compareAtPrice) *
				100
		);
	});

	let newTagDraft = $state('');

	const selectedTags = $derived(
		data.tags.filter((tag) => $updateProductForm.tagIds.includes(tag.id))
	);
	const selectedCategoryName = $derived(
		data.categories.find((category) => category.id === $updateProductForm.categoryId)?.name ??
			'No category'
	);

	let expandedColorCards = $state<Record<string, boolean>>({});

	const carePresets = [
		'Machine wash cold',
		'Hand wash only',
		'Do not tumble dry',
		'Line dry in shade',
		'Iron low heat'
	];
	const materialPresets = [
		'100% Cotton',
		'Heavyweight fleece',
		'French Terry',
		'Nylon ripstop',
		'Cotton-poly blend'
	];

	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$updateProductForm.name) warnings.push('Product name is required');
		if (!$updateProductForm.categoryId) warnings.push('No category assigned');
		if (activeLocalVariants.length === 0) {
			warnings.push('At least one color variant is required');
		}
		if (activeLocalImages.length === 0) {
			warnings.push('No product photography uploaded');
		}
		return warnings;
	});

	function revokeImagePreviews() {
		for (const preview of imagePreviews) {
			URL.revokeObjectURL(preview.url);
		}
	}

	onDestroy(revokeImagePreviews);

	function imagesForColorCard(variantColorId: string) {
		return activeLocalImages.filter((image) => image.variantId === variantColorId);
	}

	function imagePositionOptionsForVariant(variantId: string | null): number[] {
		const count = activeLocalImages.filter((img) => img.variantId === variantId).length;
		return Array.from({ length: count }, (_, index) => index + 1);
	}

	function imageDisplayOrder(imageId: string): number {
		const image = activeLocalImages.find((img) => img.id === imageId);
		if (!image) return 1;
		const variantId = image.variantId;
		const variantImages = activeLocalImages.filter((img) => img.variantId === variantId);
		const index = variantImages.findIndex((img) => img.id === imageId);
		return index >= 0 ? index + 1 : 1;
	}

	function updateImageAltText(imageId: string, event: Event): void {
		const nextAltText = (event.currentTarget as HTMLInputElement).value.trim() || null;
		localImages = localImages.map((img) =>
			img.id === imageId ? { ...img, altText: nextAltText } : img
		);
	}

	function handleImagePositionChange(imageId: string, event: Event): void {
		const nextPosition = Number((event.currentTarget as HTMLSelectElement).value);
		if (!Number.isInteger(nextPosition)) return;

		const targetImage = localImages.find((img) => img.id === imageId);
		if (!targetImage || targetImage.isDeleted) return;

		const variantId = targetImage.variantId;
		const variantImages = activeLocalImages.filter((img) => img.variantId === variantId);
		const currentIndex = variantImages.findIndex((img) => img.id === imageId);
		if (currentIndex < 0) return;

		const targetIndex = Math.min(Math.max(nextPosition - 1, 0), variantImages.length - 1);
		const [splicedImage] = variantImages.splice(currentIndex, 1);
		if (!splicedImage) return;

		variantImages.splice(targetIndex, 0, splicedImage);
		const nextPositions = new Map(variantImages.map((image, index) => [image.id, index + 1]));

		localImages = localImages.map((image) =>
			image.variantId === variantId && !image.isDeleted
				? { ...image, position: nextPositions.get(image.id) ?? image.position }
				: image
		);
	}

	function selectSnapshotVariant(variantId: string): void {
		const variant = activeLocalVariants.find((entry) => entry.id === variantId);
		if (!variant) return;

		selectedSnapshotVariantId = variantId;
		selectedSnapshotSize = variant.sizes[0] ?? null;
		carouselImageId = null;
	}

	function selectSnapshotSize(size: string): void {
		selectedSnapshotSize = size;
	}

	function addExistingTag(tagId: string): void {
		if ($updateProductForm.tagIds.includes(tagId)) return;
		$updateProductForm.tagIds = [...$updateProductForm.tagIds, tagId];
	}

	function removeExistingTag(tagId: string): void {
		$updateProductForm.tagIds = $updateProductForm.tagIds.filter((id) => id !== tagId);
	}

	function addNewTag(): void {
		const value = newTagDraft.trim();
		if (!value) return;

		const existingTag = data.tags.find((t) => t.name.toLowerCase() === value.toLowerCase());
		if (existingTag) {
			addExistingTag(existingTag.id);
			newTagDraft = '';
			return;
		}

		const alreadyAdded = $updateProductForm.newTagNames.includes(value);

		if (alreadyAdded) return;

		$updateProductForm.newTagNames = [...$updateProductForm.newTagNames, value];
		newTagDraft = '';
	}

	function removeNewTag(tagName: string): void {
		$updateProductForm.newTagNames = $updateProductForm.newTagNames.filter(
			(name) => name !== tagName
		);
	}

	function handleNewTagKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;

		event.preventDefault();
		addNewTag();
	}

	function isVariantExpanded(variantColorId: string, index: number): boolean {
		return expandedColorCards[variantColorId] ?? index === 0;
	}

	function toggleColorCardExpanded(variantColorId: string, currentlyExpanded: boolean) {
		expandedColorCards = {
			...expandedColorCards,
			[variantColorId]: !currentlyExpanded
		};
	}

	function expandAllColorCards() {
		expandedColorCards = Object.fromEntries(activeLocalVariants.map((card) => [card.id, true]));
	}

	function addVariantColor() {
		// Find the next unused color
		const usedColorIds = new Set(
			localVariants
				.filter((v) => !v.isDeleted)
				.map((v) => v.colorId)
				.filter(Boolean)
		);
		const usedColorNames = new Set(
			localVariants.filter((v) => !v.isDeleted).map((v) => v.color.toLowerCase())
		);

		const nextColor = colors.find(
			(c) => !usedColorIds.has(c.id) && !usedColorNames.has(c.name.toLowerCase())
		);
		if (!nextColor) {
			showColorModal = true;
			return;
		}

		const newVar: LocalVariant = {
			id: `new-color-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			colorId: nextColor.id,
			color: nextColor.name,
			colorHex: nextColor.hex,
			basePrice: 2500,
			compareAtPrice: null,
			sortOrder: localVariants.length + 1,
			sizes: ['M'],
			isNew: true
		};
		localVariants = [...localVariants, newVar];
		expandedColorCards = { ...expandedColorCards, [newVar.id]: true };
	}

	function deleteVariantColor(id: string) {
		const targetIndex = localVariants.findIndex((v) => v.id === id);
		if (targetIndex === -1) return;
		const v = localVariants[targetIndex];

		if (v.isNew) {
			localVariants = localVariants.filter((entry) => entry.id !== id);
			localImages = localImages.filter((img) => {
				if (img.variantId === id) {
					if (img.imageUrl.startsWith('blob:')) {
						URL.revokeObjectURL(img.imageUrl);
					}
					return false;
				}
				return true;
			});
		} else {
			localVariants = localVariants.map((entry) =>
				entry.id === id ? { ...entry, isDeleted: true } : entry
			);
			localImages = localImages.map((img) =>
				img.variantId === id ? { ...img, isDeleted: true } : img
			);
		}
		normalizeVariantSortOrders();
	}

	function normalizeVariantSortOrders(): void {
		localVariants = [...localVariants]
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((v, index) => ({ ...v, sortOrder: index + 1 }));
	}

	function handleVariantSortChange(id: string, event: Event): void {
		const nextSort = Number((event.currentTarget as HTMLSelectElement).value);
		if (!Number.isInteger(nextSort)) return;

		const variants = [...localVariants];
		const targetIndex = variants.findIndex((v) => v.id === id);
		if (targetIndex === -1) return;

		const target = variants[targetIndex];

		let previousSort = target.sortOrder;
		if (previousSort === nextSort) {
			const N = activeLocalVariants.length;
			const presentOrders = new Set(activeLocalVariants.map((v) => v.sortOrder));
			for (let i = 1; i <= N; i++) {
				if (!presentOrders.has(i)) {
					previousSort = i;
					break;
				}
			}
		}

		const duplicateIndex = variants.findIndex(
			(v) => v.id !== id && !v.isDeleted && v.sortOrder === nextSort
		);

		variants[targetIndex] = { ...target, sortOrder: nextSort };
		if (duplicateIndex !== -1) {
			variants[duplicateIndex] = { ...variants[duplicateIndex], sortOrder: previousSort };
		}

		localVariants = variants;
	}

	function toggleSize(variantColorId: string, size: string): void {
		localVariants = localVariants.map((variant) => {
			if (variant.id !== variantColorId) return variant;
			if (variant.sizes.includes(size)) {
				if (variant.sizes.length === 1) return variant;
				return { ...variant, sizes: variant.sizes.filter((s) => s !== size) };
			}
			return { ...variant, sizes: [...variant.sizes, size] };
		});
	}

	function createFileList(files: File[]): FileList {
		const transfer = new DataTransfer();
		for (const file of files) transfer.items.add(file);
		return transfer.files;
	}

	function handleVariantImageUpload(variantColorId: string, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const incomingFiles = Array.from(input.files ?? []);
		if (incomingFiles.length === 0) return;

		const currentFiles = [...newImageFiles];
		const updatedPreviews = [...imagePreviews];

		for (const file of incomingFiles) {
			currentFiles.push(file);
			const fileIndex = currentFiles.length - 1;
			const objectUrl = URL.createObjectURL(file);

			updatedPreviews.push({
				url: objectUrl,
				name: file.name,
				size: file.size,
				fileIndex
			});

			const variantImages = imagesForColorCard(variantColorId);
			const position = variantImages.length + 1;
			const isPrimary = variantImages.length === 0;

			localImages = [
				...localImages,
				{
					id: `new-img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
					variantId: variantColorId,
					imageUrl: objectUrl,
					altText: $updateProductForm.name || null,
					position,
					isPrimary,
					isNew: true,
					fileIndex
				}
			];
		}

		newImageFiles = currentFiles;
		imagePreviews = updatedPreviews;
		$imageFiles = createFileList(newImageFiles);
		input.value = '';
	}

	function setPrimaryImage(id: string): void {
		const target = localImages.find((img) => img.id === id);
		if (!target) return;

		localImages = localImages.map((img) => {
			if (img.variantId === target.variantId) {
				return { ...img, isPrimary: img.id === id };
			}
			return img;
		});
	}

	function removeImage(id: string): void {
		const target = localImages.find((img) => img.id === id);
		if (!target) return;

		const wasPrimary = target.isPrimary;
		const scopeVariantId = target.variantId;

		if (target.isNew) {
			if (target.imageUrl.startsWith('blob:')) {
				URL.revokeObjectURL(target.imageUrl);
			}
			localImages = localImages.filter((img) => img.id !== id);
		} else {
			localImages = localImages.map((img) => (img.id === id ? { ...img, isDeleted: true } : img));
		}

		if (wasPrimary) {
			const remaining = localImages.filter(
				(img) => img.variantId === scopeVariantId && !img.isDeleted
			);
			if (remaining.length > 0) {
				localImages = localImages.map((img) =>
					img.id === remaining[0].id ? { ...img, isPrimary: true } : img
				);
			}
		}

		if (activeImageId === id) {
			activeImageId = null;
		}
	}

	function openVariantImagePreview(imgId: string) {
		activeImageId = imgId;
		isSnapshotClick = false;
	}

	function openSnapshotImagePreview(imgId: string) {
		activeImageId = imgId;
		isSnapshotClick = true;
	}

	function collapseAllColorCards() {
		expandedColorCards = Object.fromEntries(activeLocalVariants.map((card) => [card.id, false]));
	}

	const activeVariantImages = $derived.by(() => {
		if (activeImageId === null || !activeImage) return [];
		return activeLocalImages.filter((img) => img.variantId === activeImage.variantId);
	});

	function navigateSnapshotImage(direction: number): void {
		if (snapshotImages.length <= 1) return;
		const currentIndex = snapshotImages.findIndex((img) => img.id === carouselImage?.id);
		if (currentIndex === -1) return;
		const nextIndex = (currentIndex + direction + snapshotImages.length) % snapshotImages.length;
		carouselImageId = snapshotImages[nextIndex].id;
	}

	function navigateActiveImage(direction: number): void {
		if (activeVariantImages.length <= 1) return;
		const currentIndex = activeVariantImages.findIndex((img) => img.id === activeImageId);
		if (currentIndex === -1) return;
		const nextIndex =
			(currentIndex + direction + activeVariantImages.length) % activeVariantImages.length;
		activeImageId = activeVariantImages[nextIndex].id;
	}
</script>

<svelte:head>
	<title>Edit Product | {$updateProductForm.name || data.product.name} | Caro Admin</title>
	<meta
		name="description"
		content="Edit product details, variants, images, merchandising flags, and product publishing state."
	/>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<form
	id="update-product-form"
	method="POST"
	action="?/updateProduct"
	enctype="multipart/form-data"
	novalidate
	bind:this={formElement}
	use:updateProductEnhance
>
	<AdminFormLayout
		backHref="/app/products"
		backLabel="Back to products"
		title={$updateProductForm.name || data.product.name}
		kicker="Product edit"
		isSubmitting={$updateProductSubmitting}
		submitLabel="Save Changes"
		oncancel={() => history.back()}
	>
		{#snippet mainContent()}
			<input type="hidden" name="serializedVariants" value={serializedVariants} />
			<input type="hidden" name="serializedImages" value={serializedImages} />
			<input type="file" name="newImageFiles" bind:files={$imageFiles} multiple class="hidden" />

			{#each $updateProductForm.newTagNames as tagName (tagName)}
				<input type="hidden" name="newTagNames" value={tagName} />
			{/each}
			{#each $updateProductForm.tagIds as tagId (tagId)}
				<input type="hidden" name="tagIds" value={tagId} />
			{/each}

			<div class="grid gap-6">
				<ProductBasicsSection
					bind:form={$updateProductForm}
					errors={$updateProductErrors}
					constraints={$updateProductConstraints}
					categories={data.categories}
					genderOptions={data.genderOptions}
					fitOptions={data.fitOptions}
					bind:slugManuallyEdited
					imagePreviews={[]}
				/>

				<!-- Colors & Sizes -->
				<AdminCard title="Colors & Sizes" border="border border-ash/15" class="shadow-sm">
					{#snippet headerActions()}
						<div class="flex flex-wrap items-center gap-2">
							<AdminButton
								type="button"
								onclick={collapseAllColorCards}
								variant="outline"
								size="sm"
							>
								Collapse All
							</AdminButton>
							<AdminButton type="button" onclick={expandAllColorCards} variant="outline" size="sm">
								Expand All
							</AdminButton>
							<AdminButton type="button" onclick={addVariantColor} variant="outline" size="sm">
								<Plus size={14} aria-hidden="true" />
								Add Variant
							</AdminButton>
						</div>
					{/snippet}

					{#if activeLocalVariants.length > 0}
						<div class="mt-5 grid gap-4">
							{#each activeLocalVariants as card, index (card.id)}
								{@const isExpanded = isVariantExpanded(card.id, index)}

								<article
									animate:flip={{ duration: 300 }}
									class="border border-ash/20 bg-void transition-colors"
								>
									<div
										role="button"
										tabindex="0"
										class="flex cursor-pointer items-center justify-between gap-3 p-4 select-none focus-visible:ring-1 focus-visible:ring-volt focus-visible:outline-none"
										onclick={() => toggleColorCardExpanded(card.id, isExpanded)}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												toggleColorCardExpanded(card.id, isExpanded);
											}
										}}
									>
										<div class="flex min-w-0 items-center gap-3">
											<span
												class="h-5 w-5 shrink-0 rounded-full border border-ash/30"
												style:background={isValidHex(card.colorHex) ? card.colorHex : '#333'}
											></span>
											<div class="min-w-0">
												<h3
													class="flex items-center gap-2 font-sans text-sm font-semibold text-bone"
												>
													{card.color || `Variant Color ${index + 1}`}
													{#if card.isNew}
														<span
															class="border border-volt/25 bg-volt/15 px-1 font-sans text-[9px] font-bold text-volt uppercase"
															>New</span
														>
													{/if}
												</h3>
												<p class="mt-0.5 font-sans text-xs text-ash">
													Sizes: {card.sizes.join(', ') || 'None'} • Selling: {formatAdminMoney(
														card.basePrice
													)} • Images: {imagesForColorCard(card.id).length}
												</p>
											</div>
										</div>

										<span
											class="text-ash transition-transform duration-200"
											class:rotate-180={isExpanded}
										>
											<ChevronDown size={16} />
										</span>
									</div>

									{#if isExpanded}
										{@const originalIndex = localVariants.findIndex((v) => v.id === card.id)}
										<div class="grid gap-4 border-t border-ash/10 bg-charcoal/10 p-4">
											<ProductColorSelector
												bind:variant={localVariants[originalIndex]}
												{colors}
												bind:showColorModal
												variants={localVariants}
												{originalIndex}
											/>

											<div class="grid gap-4 md:grid-cols-3">
												<AdminInput
													label="Selling Price (LKR)"
													type="number"
													name="basePrice"
													bind:value={localVariants[originalIndex].basePrice}
													required
													helpText="Price paid by customer."
												/>

												<AdminInput
													label="Original Price / Compare At"
													type="number"
													name="compareAtPrice"
													bind:value={localVariants[originalIndex].compareAtPrice}
													placeholder="Optional"
													helpText="Pre-discount price (must be higher)."
												/>

												{#if activeLocalVariants.length > 1}
													<AdminSelect
														label="Sort Order"
														name="sortOrder"
														bind:value={localVariants[originalIndex].sortOrder}
														onchange={(e) => handleVariantSortChange(card.id, e)}
													>
														{#each Array.from({ length: activeLocalVariants.length }, (_, i) => i + 1) as sortValue (sortValue)}
															<option value={sortValue}>{sortValue}</option>
														{/each}
													</AdminSelect>
												{/if}
											</div>

											<div class="border-t border-ash/10 pt-3">
												<div class="grid gap-1">
													<span
														class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
													>
														Available Sizes
														<span class="ml-0.5 font-sans text-red-400">*</span>
													</span>
													<div class="mt-1 flex flex-wrap gap-2">
														{#each data.sizeOptions as sizeOpt (sizeOpt.value)}
															{@const hasSize = card.sizes.includes(sizeOpt.value)}
															<AdminButton
																type="button"
																onclick={() => toggleSize(card.id, sizeOpt.value)}
																variant={hasSize ? 'volt' : 'outline'}
																size="sm"
																title={hasSize ? 'Click to remove size' : 'Click to add size'}
															>
																{sizeOpt.label}
															</AdminButton>
														{/each}
													</div>
												</div>
											</div>

											<div class="border-t border-ash/10 pt-3">
												<div class="grid gap-1">
													<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">
														Variant Photography
													</span>

													<div class="mt-2 flex items-center gap-3">
														<label
															class="relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-dashed border-ash/30 bg-void px-4 font-sans text-xs font-semibold text-ash transition-colors hover:border-volt hover:text-volt"
														>
															<input
																type="file"
																accept="image/jpeg,image/png,image/webp,image/avif"
																multiple
																onchange={(e) => handleVariantImageUpload(card.id, e)}
																class="hidden"
															/>
															<Upload size={14} class="text-volt" aria-hidden="true" />
															Upload Variant Image
														</label>
													</div>

													{#if imagesForColorCard(card.id).length > 0}
														<div class="mt-3 flex flex-wrap gap-3">
															{#each imagesForColorCard(card.id) as img (img.id)}
																<div
																	class="group relative block border border-ash/20 hover:border-volt"
																>
																	<AdminButton
																		type="button"
																		variant="outline"
																		onclick={() => openVariantImagePreview(img.id)}
																		class="block h-auto p-0"
																		aria-label="Open product image"
																	>
																		<img src={img.imageUrl} alt="" class="h-20 w-20 object-cover" />
																	</AdminButton>
																	{#if img.isPrimary}
																		<span
																			class="absolute top-1 left-1 bg-volt px-1 py-0.5 font-sans text-[8px] leading-none font-bold text-void uppercase"
																			>Primary</span
																		>
																	{/if}
																	<AdminButton
																		type="button"
																		size="icon"
																		variant="danger"
																		onclick={() => removeImage(img.id)}
																		class="absolute -top-2 -right-2 flex h-11 w-11 bg-void sm:h-8 sm:w-8"
																		title="Delete image"
																		aria-label="Delete image"
																	>
																		<X size={12} aria-hidden="true" />
																	</AdminButton>
																</div>
															{/each}
														</div>
													{:else}
														<p class="mt-1 font-sans text-xs text-ash/50">
															No photography uploaded for this product variant.
														</p>
													{/if}
												</div>
											</div>

											{#if activeLocalVariants.length > 1}
												<div class="mt-4 flex justify-end border-t border-ash/10 pt-4">
													<AdminButton
														type="button"
														onclick={() => deleteVariantColor(card.id)}
														variant="danger"
														size="sm"
													>
														<Trash2 size={13} aria-hidden="true" />
														Delete Variant
													</AdminButton>
												</div>
											{/if}
										</div>
									{/if}
								</article>
							{/each}
						</div>
					{:else}
						<p class="mt-4 border border-ash/15 bg-void px-4 py-5 font-sans text-xs text-ash/60">
							No product variants configured.
						</p>
					{/if}
				</AdminCard>

				<ProductTagsSection
					bind:form={$updateProductForm}
					tags={data.tags}
					bind:newTagDraft
					onAddNewTag={addNewTag}
					onRemoveNewTag={removeNewTag}
					onAddExistingTag={addExistingTag}
					onRemoveExistingTag={removeExistingTag}
					onNewTagKeydown={handleNewTagKeydown}
				/>

				<ProductPublishingSection
					bind:form={$updateProductForm}
					constraints={$updateProductConstraints}
					{carePresets}
					{materialPresets}
				/>
			</div>
		{/snippet}

		{#snippet sidebarContent()}
			<ProductPreviewPanel
				form={$updateProductForm}
				sortedVariants={previewVariants}
				snapshotVariant={previewSnapshotVariant}
				snapshotVariantId={selectedSnapshotVariantId}
				{snapshotSize}
				bind:carouselImageId
				{snapshotImages}
				{carouselImage}
				{sortedSnapshotSizes}
				{snapshotDiscountPercent}
				{activeLocalImages}
				{selectedTags}
				{snapshotWarnings}
				{selectedCategoryName}
				formatMoney={formatAdminMoney}
				formatLabel={formatAdminStatus}
				onSelectVariant={selectSnapshotVariant}
				onSelectSize={selectSnapshotSize}
				onPrevImage={() => navigateSnapshotImage(-1)}
				onNextImage={() => navigateSnapshotImage(1)}
				onOpenImage={openSnapshotImagePreview}
			/>
		{/snippet}
	</AdminFormLayout>
</form>

<AdminUnsavedChangesGuard
	dirty={hasUnsavedChanges && !$updateProductSubmitting}
	title="Leave product editor?"
	description="Product fields, variants, tags, or media changes have not been saved."
	onsave={() => formElement?.requestSubmit()}
/>

<AdminModal
	open={activeImage !== null}
	title={activeImage?.altText ?? 'Photography Image'}
	kicker="Media detail"
	size="5xl"
	onOpenChange={(open) => {
		if (!open) activeImageId = null;
	}}
>
	{#if activeImage && activeImageId !== null}
		<div
			class="grid w-full min-w-0 overflow-hidden border border-ash/25 bg-void lg:max-h-[75vh] lg:grid-cols-[minmax(0,1fr)_340px]"
		>
			<div
				class="group relative flex min-h-0 w-full min-w-0 items-center overflow-hidden bg-charcoal/40"
			>
				<img
					src={activeImage.imageUrl}
					alt={activeImage.altText ?? ''}
					class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[92vh]"
				/>

				{#if activeVariantImages.length > 1}
					<AdminButton
						type="button"
						size="icon"
						variant="outline"
						onclick={() => navigateActiveImage(-1)}
						class="absolute top-1/2 left-2 h-8 w-8 -translate-y-1/2 bg-void/80"
						aria-label="Previous image"
					>
						<ChevronLeft size={16} aria-hidden="true" />
					</AdminButton>
					<AdminButton
						type="button"
						size="icon"
						variant="outline"
						onclick={() => navigateActiveImage(1)}
						class="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 bg-void/80"
						aria-label="Next image"
					>
						<ChevronRight size={16} aria-hidden="true" />
					</AdminButton>
				{/if}
			</div>
			<div
				class="grid min-w-0 content-start gap-4 overflow-x-hidden border-t border-ash/15 bg-charcoal p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Media Detail</p>
						<h2 class="wrap-break-words mt-1 font-sans text-base font-semibold text-bone">
							{activeImage.altText ?? 'Photography Image'}
						</h2>
						{#if activeImage.variantId}
							{@const variantColor = activeLocalVariants.find(
								(c) => c.id === activeImage.variantId
							)}
							<p class="mt-1 font-sans text-xs font-semibold text-volt uppercase">
								Linked to Variant: {variantColor?.color ?? 'Product Variant'}
							</p>
						{:else}
							<p class="mt-1 font-sans text-xs text-ash/60">Product-wide Image</p>
						{/if}
					</div>
				</div>

				{#if isSnapshotClick}
					<div class="grid gap-3 border-t border-ash/10 pt-4 font-sans text-xs">
						<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
							<span class="font-medium text-ash">Image ID (Primary Key)</span>
							<span class="text-right font-mono text-[10px] text-bone select-all"
								>{activeImage.id}</span
							>
						</div>
						<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
							<span class="font-medium text-ash">Link Target</span>
							<span class="text-right font-sans font-medium text-volt">
								{#if activeImage.variantId}
									{@const variantColor = activeLocalVariants.find(
										(c) => c.id === activeImage.variantId
									)}
									{variantColor?.color ?? 'Unknown Variant'}
								{:else}
									Product-wide
								{/if}
							</span>
						</div>
						<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
							<span class="font-medium text-ash">Role</span>
							<span class="text-right font-sans text-bone">
								{#if activeImage.isPrimary}
									Primary Image
								{:else}
									Standard Image
								{/if}
							</span>
						</div>
						<AdminInput
							label="Image Description (Alt Text)"
							value={activeImage.altText ?? ''}
							oninput={(event) => updateImageAltText(activeImage.id, event)}
							name="imageAltText"
							placeholder="Image description..."
						/>

						<AdminSelect
							label="Display Order"
							name="imagePosition"
							value={imageDisplayOrder(activeImage.id)}
							onchange={(event) => handleImagePositionChange(activeImage.id, event)}
						>
							{#each imagePositionOptionsForVariant(activeImage.variantId) as positionValue (positionValue)}
								<option value={positionValue}>{positionValue}</option>
							{/each}
						</AdminSelect>
					</div>
				{:else}
					<div class="flex flex-col gap-4 border-t border-ash/10 pt-4">
						<AdminInput
							label="Image Description (Alt Text)"
							value={activeImage.altText ?? ''}
							oninput={(event) => updateImageAltText(activeImage.id, event)}
							name="imageAltText"
							placeholder="Image description..."
						/>

						<AdminSelect
							label="Display Order"
							name="imagePosition"
							value={imageDisplayOrder(activeImage.id)}
							onchange={(event) => handleImagePositionChange(activeImage.id, event)}
						>
							{#each imagePositionOptionsForVariant(activeImage.variantId) as positionValue (positionValue)}
								<option value={positionValue}>{positionValue}</option>
							{/each}
						</AdminSelect>

						<div class="flex flex-col gap-2">
							<AdminButton
								type="button"
								onclick={() => setPrimaryImage(activeImage.id)}
								variant={activeImage.isPrimary ? 'volt' : 'outline'}
								class="w-full"
							>
								<Star
									size={14}
									fill={activeImage.isPrimary ? 'currentColor' : 'none'}
									aria-hidden="true"
								/>
								{activeImage.isPrimary ? 'Primary Image' : 'Set as primary'}
							</AdminButton>

							<AdminButton
								type="button"
								onclick={() => removeImage(activeImage.id)}
								variant="danger"
								class="w-full"
							>
								<Trash2 size={14} aria-hidden="true" />
								Delete Image
							</AdminButton>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</AdminModal>

<!-- Color Manager Modal -->
<AdminColorManagerModal bind:open={showColorModal} bind:colors />

<!-- Server Error Toast -->
<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	duration={6000}
	onclose={() => (toastMessage = null)}
/>
