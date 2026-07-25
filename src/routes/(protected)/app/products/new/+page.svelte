<script lang="ts">
	import { page } from '$app/state';
	import { ChevronLeft, ChevronRight, Star, Trash2 } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { filesProxy, superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminColorManagerModal from '$lib/components/admin/products/AdminColorManagerModal.svelte';
	import AdminModal from '$lib/components/admin/overlays/AdminModal.svelte';
	import AdminUnsavedChangesGuard from '$lib/components/admin/forms/AdminUnsavedChangesGuard.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import ProductBasicsSection from '$lib/components/admin/products/ProductBasicsSection.svelte';
	import ProductVariantsSection from '$lib/components/admin/products/ProductVariantsSection.svelte';
	import ProductTagsSection from '$lib/components/admin/products/ProductTagsSection.svelte';
	import ProductPublishingSection from '$lib/components/admin/products/ProductPublishingSection.svelte';
	import ProductPreviewPanel from '$lib/components/admin/products/ProductPreviewPanel.svelte';
	import { formatAdminMoney, formatAdminStatus } from '$lib/shared/admin/format';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CreateProductData = PageData['createProductForm']['data'];
	type DraftVariant = CreateProductData['variants'][number];
	type SizeType = DraftVariant['sizes'][number];
	type ImageMetadata = CreateProductData['imageMetadata'][number];

	type ImagePreview = {
		url: string;
		name: string;
		size: number;
	};

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const createProductSuperform = superForm(
		initialForm(() => data.createProductForm),
		{
			dataType: 'json',
			resetForm: false
		}
	);

	const {
		form: createProductForm,
		errors: createProductErrors,
		constraints: createProductConstraints,
		message: createProductMessage,
		enhance: createProductEnhance,
		submitting: createProductSubmitting,
		tainted: createProductTainted
	} = createProductSuperform;

	const imageFiles = filesProxy(createProductSuperform, 'images');

	let formElement = $state<HTMLFormElement | null>(null);
	let slugManuallyEdited = $state(false);
	let newTagDraft = $state('');
	let toastMessage = $state<string | null>(null);

	$effect(() => {
		if ($createProductMessage) toastMessage = $createProductMessage;
	});

	let activeImageIndex = $state<number | null>(null);
	let imagePreviews = $state<ImagePreview[]>([]);
	let selectedImageFiles = $state<File[]>([]);
	const hasUnsavedChanges = $derived(
		Boolean($createProductTainted) || selectedImageFiles.length > 0
	);

	// eslint-disable-next-line svelte/prefer-writable-derived
	let colors = $state<typeof data.colors>([]);

	$effect.pre(() => {
		colors = data.colors;
	});

	// Auto-select black on default variant if available
	$effect.pre(() => {
		if ($createProductForm.variants.length > 0) {
			const firstVar = $createProductForm.variants[0];
			if (firstVar.clientId === 'default-color-card' && !firstVar.colorId) {
				const blackColor = colors.find((c) => c.name.toLowerCase() === 'black');
				if (blackColor) {
					firstVar.colorId = blackColor.id;
					firstVar.color = blackColor.name;
					firstVar.colorHex = blackColor.hex;
				}
			}
		}
	});

	// Invalidate removed colors
	$effect(() => {
		if ($createProductForm.variants.length > 0) {
			const activeColorIds = new Set(colors.map((c) => c.id));
			for (const variant of $createProductForm.variants) {
				if (variant.colorId && !activeColorIds.has(variant.colorId)) {
					variant.colorId = null;
					variant.color = '';
					variant.colorHex = null;
				}
			}
		}
	});

	let expandedVariants = $state<Record<string, boolean>>({});

	// Auto-expand first variant
	$effect(() => {
		if ($createProductForm.variants.length > 0 && Object.keys(expandedVariants).length === 0) {
			expandedVariants[$createProductForm.variants[0].clientId] = true;
		}
	});

	// Sync prices across variants
	$effect(() => {
		if ($createProductForm.syncPrices && $createProductForm.variants.length > 0) {
			const primaryCard = $createProductForm.variants.find((v) => v.sortOrder === 1);
			if (primaryCard) {
				for (const variant of $createProductForm.variants) {
					if (variant.sortOrder !== 1) {
						variant.basePrice = primaryCard.basePrice;
						variant.compareAtPrice = primaryCard.compareAtPrice;
					}
				}
			}
		}
	});

	let showColorModal = $state(false);

	// --- Snapshot (preview sidebar) state ---
	let carouselImageId = $state<string | null>(null);
	let selectedSnapshotVariantId = $state<string | null>(null);
	let selectedSnapshotSize = $state<string | null>(null);

	// --- Presets ---
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

	// --- Derived ---
	const actionMessage = $derived(actionData?.form?.message);

	const sortedVariants = $derived(
		[...$createProductForm.variants].sort((a, b) => a.sortOrder - b.sortOrder)
	);

	const selectedTags = $derived(
		data.tags.filter((tag) => $createProductForm.tagIds.includes(tag.id))
	);

	const activeImage = $derived(
		activeImageIndex === null ? null : (imagePreviews[activeImageIndex] ?? null)
	);

	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$createProductForm.name) warnings.push('Product name is required');
		if (!$createProductForm.categoryId) warnings.push('No category assigned');
		if ($createProductForm.variants.length === 0) {
			warnings.push('At least one color variant is required');
		} else {
			const variantsWithNoSizes = $createProductForm.variants.filter((v) => v.sizes.length === 0);
			if (variantsWithNoSizes.length > 0) warnings.push('Sizes are missing on some variants');
		}
		if (imagePreviews.length === 0) warnings.push('No product photography uploaded');
		return warnings;
	});

	const activeLocalImages = $derived(
		imagePreviews
			.map((preview, index) => {
				const meta = getImageMetadata(index);
				return {
					id: String(index),
					variantId: meta.variantClientId,
					imageUrl: preview.url,
					altText: meta.altText,
					position: meta.position,
					isPrimary: meta.isPrimary
				};
			})
			.sort((a, b) => a.position - b.position)
	);

	const snapshotVariant = $derived.by(() => {
		const selected = selectedSnapshotVariantId
			? sortedVariants.find((v) => v.clientId === selectedSnapshotVariantId)
			: null;
		return selected ?? sortedVariants[0] ?? null;
	});

	const sortedSnapshotSizes = $derived(
		snapshotVariant
			? [...snapshotVariant.sizes].sort((a: string, b: string) => {
					const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
					return order.indexOf(a) - order.indexOf(b);
				})
			: []
	);

	const snapshotImages = $derived.by(() => {
		if (!snapshotVariant) return activeLocalImages;
		const variantImages = activeLocalImages.filter(
			(image) => image.variantId === snapshotVariant.clientId
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

	const selectedCategoryName = $derived(
		data.categories.find((c) => c.id === $createProductForm.categoryId)?.name ?? 'No category'
	);

	const activeVariantImages = $derived.by(() => {
		if (activeImageIndex === null) return [];
		const currentMeta = getImageMetadata(activeImageIndex);
		const variantClientId = currentMeta.variantClientId;
		return imagePreviews
			.map((preview, index) => ({ preview, meta: getImageMetadata(index), index }))
			.filter((item) => item.meta.variantClientId === variantClientId)
			.sort((a, b) => a.meta.position - b.meta.position);
	});

	// --- Utility functions ---
	function formatFileSize(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	// --- Tag handlers ---
	function addExistingTag(tagId: string): void {
		if ($createProductForm.tagIds.includes(tagId)) return;
		$createProductForm.tagIds = [...$createProductForm.tagIds, tagId];
	}

	function removeExistingTag(tagId: string): void {
		$createProductForm.tagIds = $createProductForm.tagIds.filter((id) => id !== tagId);
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
		const alreadyAdded = $createProductForm.newTagNames.some(
			(tagName) => tagName.toLowerCase() === value.toLowerCase()
		);
		if (alreadyAdded) return;
		$createProductForm.newTagNames = [...$createProductForm.newTagNames, value];
		newTagDraft = '';
	}

	function removeNewTag(tagName: string): void {
		$createProductForm.newTagNames = $createProductForm.newTagNames.filter(
			(name) => name !== tagName
		);
	}

	function handleNewTagKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		addNewTag();
	}

	// --- Variant handlers ---
	function createVariantDraft(): DraftVariant | null {
		const usedColorIds = new Set($createProductForm.variants.map((v) => v.colorId).filter(Boolean));
		const usedColorNames = new Set($createProductForm.variants.map((v) => v.color.toLowerCase()));
		const nextColor = colors.find(
			(c) => !usedColorIds.has(c.id) && !usedColorNames.has(c.name.toLowerCase())
		);
		if (!nextColor) return null;

		return {
			clientId: `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			colorId: nextColor.id,
			color: nextColor.name,
			colorHex: nextColor.hex,
			basePrice: 2500,
			compareAtPrice: null,
			sortOrder: $createProductForm.variants.length + 1,
			sizes: ['M']
		};
	}

	function addVariant(): void {
		const newVar = createVariantDraft();
		if (!newVar) {
			showColorModal = true;
			return;
		}

		$createProductForm.variants = [...$createProductForm.variants, newVar];
		expandedVariants[newVar.clientId] = true;
	}

	function toggleSize(clientId: string, size: SizeType): void {
		const variants = [...$createProductForm.variants];
		const variant = variants.find((v) => v.clientId === clientId);
		if (!variant) return;
		if (variant.sizes.includes(size)) {
			if (variant.sizes.length === 1) return;
			variant.sizes = variant.sizes.filter((s) => s !== size);
		} else {
			variant.sizes = [...variant.sizes, size];
		}
		$createProductForm.variants = variants;
	}

	function removeVariant(clientId: string): void {
		$createProductForm.variants = $createProductForm.variants.filter(
			(v) => v.clientId !== clientId
		);
		$createProductForm.imageMetadata = $createProductForm.imageMetadata.map((metadata) =>
			metadata.variantClientId === clientId ? { ...metadata, variantClientId: null } : metadata
		);
		normalizeVariantSortOrders();
		normalizePrimaryImageScopes();
		delete expandedVariants[clientId];
	}

	function handleVariantSortChange(clientId: string, event: Event): void {
		const nextSort = Number((event.currentTarget as HTMLSelectElement).value);
		const variants = [...$createProductForm.variants];
		const originalIndex = variants.findIndex((v) => v.clientId === clientId);
		const current = variants[originalIndex];
		if (!current || !Number.isInteger(nextSort)) return;
		const previousSort = current.sortOrder;
		const swapIndex = variants.findIndex(
			(v) => v.clientId !== clientId && v.sortOrder === nextSort
		);
		variants[originalIndex] = { ...current, sortOrder: nextSort };
		if (swapIndex >= 0) {
			variants[swapIndex] = { ...variants[swapIndex], sortOrder: previousSort };
		}
		$createProductForm.variants = variants;
	}

	function normalizeVariantSortOrders(): void {
		$createProductForm.variants = [...$createProductForm.variants]
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((v, i) => ({ ...v, sortOrder: i + 1 }));
	}

	// --- Image helpers ---
	function variantLabel(clientId: string | null | undefined): string {
		if (!clientId) return 'Product image';
		const variant = $createProductForm.variants.find((v) => v.clientId === clientId);
		if (!variant) return 'Removed variant';
		return variant.color || `Variant ${sortedVariants.indexOf(variant) + 1}`;
	}

	function createDefaultImageMetadata(index: number): ImageMetadata {
		return {
			variantClientId: null,
			altText: $createProductForm.name || null,
			position: index + 1,
			isPrimary: index === 0
		};
	}

	function getImageMetadata(index: number): ImageMetadata {
		return $createProductForm.imageMetadata[index] ?? createDefaultImageMetadata(index);
	}

	function revokeImagePreviews(): void {
		for (const preview of imagePreviews) {
			URL.revokeObjectURL(preview.url);
		}
	}

	function fileIdentity(file: File): string {
		return `${file.name}:${file.size}:${file.lastModified}`;
	}

	function createFileList(files: File[]): FileList {
		const transfer = new DataTransfer();
		for (const file of files) transfer.items.add(file);
		return transfer.files;
	}

	function normalizeImagePositions(metadata: ImageMetadata[]): ImageMetadata[] {
		const groups: Record<string, number[]> = {};
		for (let i = 0; i < metadata.length; i++) {
			const key = metadata[i].variantClientId ?? 'product-wide';
			if (!groups[key]) groups[key] = [];
			groups[key].push(i);
		}
		const result = [...metadata];
		for (const indexes of Object.values(groups)) {
			const sortedIndexes = [...indexes].sort((a, b) => {
				const posA = metadata[a].position ?? 0;
				const posB = metadata[b].position ?? 0;
				if (posA !== posB) return posA - posB;
				return a - b;
			});
			for (let rank = 0; rank < sortedIndexes.length; rank++) {
				const idx = sortedIndexes[rank];
				result[idx] = { ...result[idx], position: rank + 1 };
			}
		}
		return result;
	}

	function currentImageMetadata(): ImageMetadata[] {
		return imagePreviews.map((_, index) => ({
			...createDefaultImageMetadata(index),
			...($createProductForm.imageMetadata[index] ?? {})
		}));
	}

	function normalizePrimaryImageScopes(preferredIndex?: number): void {
		let metadata = normalizeImagePositions(currentImageMetadata());
		if (preferredIndex !== undefined && metadata[preferredIndex]?.isPrimary) {
			const preferredScope = metadata[preferredIndex].variantClientId ?? 'product';
			metadata = metadata.map((entry, index) =>
				(entry.variantClientId ?? 'product') === preferredScope
					? { ...entry, isPrimary: index === preferredIndex }
					: entry
			);
		}
		const scopes: Record<string, number[]> = {};
		for (const [index, entry] of metadata.entries()) {
			const scope = entry.variantClientId ?? 'product';
			scopes[scope] = [...(scopes[scope] ?? []), index];
		}
		for (const indexes of Object.values(scopes)) {
			const primaryIndexes = indexes.filter((index) => metadata[index]?.isPrimary);
			const keepIndex = primaryIndexes[0] ?? indexes[0];
			for (const index of indexes) {
				metadata[index] = { ...metadata[index], isPrimary: index === keepIndex };
			}
		}
		$createProductForm.imageMetadata = metadata;
		$createProductForm.primaryImageIndex = metadata.findIndex(
			(entry) => entry.variantClientId === null && entry.isPrimary
		);
		if ($createProductForm.primaryImageIndex < 0) {
			$createProductForm.primaryImageIndex = 0;
		}
	}

	function syncImagePreviews(files: FileList | null): void {
		const previousMetadata = $createProductForm.imageMetadata;
		revokeImagePreviews();
		imagePreviews = Array.from(files ?? []).map((file) => ({
			url: URL.createObjectURL(file),
			name: file.name,
			size: file.size
		}));
		$createProductForm.imageMetadata = normalizeImagePositions(
			imagePreviews.map((_, index) => ({
				...createDefaultImageMetadata(index),
				...(previousMetadata[index] ?? {})
			}))
		);
		normalizePrimaryImageScopes();
	}

	function handleVariantImageUpload(variantClientId: string, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const incomingFiles = Array.from(input.files ?? []);
		if (incomingFiles.length === 0) return;

		const selectedKeys = selectedImageFiles.map(fileIdentity);
		const mergedFiles = [...selectedImageFiles];
		const newMetadataEntries: ImageMetadata[] = [];

		let nextPosition =
			$createProductForm.imageMetadata.filter((meta) => meta.variantClientId === variantClientId)
				.length + 1;

		for (const file of incomingFiles) {
			const key = fileIdentity(file);
			if (selectedKeys.includes(key)) continue;
			selectedKeys.push(key);
			mergedFiles.push(file);
			newMetadataEntries.push({
				variantClientId,
				altText: $createProductForm.name || null,
				position: nextPosition,
				isPrimary: false
			});
			nextPosition += 1;
		}

		selectedImageFiles = mergedFiles;
		$imageFiles = createFileList(selectedImageFiles);

		revokeImagePreviews();
		imagePreviews = selectedImageFiles.map((file) => ({
			url: URL.createObjectURL(file),
			name: file.name,
			size: file.size
		}));

		const previousMetadata = $createProductForm.imageMetadata;
		const newMetadata = imagePreviews.map((_, index) => {
			if (index < previousMetadata.length) return previousMetadata[index]!;
			return newMetadataEntries[index - previousMetadata.length]!;
		});
		$createProductForm.imageMetadata = normalizeImagePositions(newMetadata);
		normalizePrimaryImageScopes();

		input.value = '';
	}

	function imagesForVariant(variantClientId: string) {
		return imagePreviews
			.map((preview, index) => {
				const meta = getImageMetadata(index);
				return { preview, meta, index };
			})
			.filter((item) => item.meta.variantClientId === variantClientId)
			.sort((a, b) => a.meta.position - b.meta.position);
	}

	function removeImage(index: number): void {
		selectedImageFiles = selectedImageFiles.filter((_, fileIndex) => fileIndex !== index);
		$imageFiles = createFileList(selectedImageFiles);
		$createProductForm.imageMetadata = $createProductForm.imageMetadata.filter(
			(_, metadataIndex) => metadataIndex !== index
		);
		if (activeImageIndex === index) {
			activeImageIndex = null;
		} else if (activeImageIndex !== null && activeImageIndex > index) {
			activeImageIndex -= 1;
		}
		syncImagePreviews($imageFiles);
	}

	function updateImageMetadata(index: number, patch: Partial<ImageMetadata>): void {
		const metadata = [...$createProductForm.imageMetadata];
		metadata[index] = {
			...createDefaultImageMetadata(index),
			...(metadata[index] ?? {}),
			...patch
		};
		$createProductForm.imageMetadata = metadata;
		normalizePrimaryImageScopes(index);
	}

	function handleImageAltInput(index: number, event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).value.trim();
		updateImageMetadata(index, { altText: value || null });
	}

	function handleImagePositionChange(index: number, event: Event): void {
		const nextPosition = Number((event.currentTarget as HTMLSelectElement).value);
		const metadata = normalizeImagePositions(currentImageMetadata());
		const current = metadata[index];
		if (!current || !Number.isInteger(nextPosition)) return;
		const previousPosition = current.position;
		const swapIndex = metadata.findIndex(
			(entry, metadataIndex) =>
				metadataIndex !== index &&
				entry.variantClientId === current.variantClientId &&
				entry.position === nextPosition
		);
		metadata[index] = { ...current, position: nextPosition };
		if (swapIndex >= 0) {
			metadata[swapIndex] = { ...metadata[swapIndex], position: previousPosition };
		}
		$createProductForm.imageMetadata = normalizeImagePositions(metadata);
		normalizePrimaryImageScopes(index);
	}

	function markPrimaryImage(index: number): void {
		const metadata = [...$createProductForm.imageMetadata];
		metadata[index] = {
			...createDefaultImageMetadata(index),
			...(metadata[index] ?? {}),
			isPrimary: true
		};
		$createProductForm.imageMetadata = metadata;
		normalizePrimaryImageScopes(index);
	}

	function imagePositionOptionsForVariant(variantClientId: string | null | undefined): number[] {
		const targetId = variantClientId ?? null;
		const count = $createProductForm.imageMetadata.filter(
			(meta) => (meta.variantClientId ?? null) === targetId
		).length;
		return Array.from({ length: count }, (_, i) => i + 1);
	}

	function navigateSnapshotImage(direction: number): void {
		if (snapshotImages.length <= 1) return;
		const currentIndex = snapshotImages.findIndex((img) => img.id === carouselImage?.id);
		if (currentIndex === -1) return;
		const nextIndex = (currentIndex + direction + snapshotImages.length) % snapshotImages.length;
		carouselImageId = snapshotImages[nextIndex].id;
	}

	function navigateActiveImage(direction: number): void {
		if (activeVariantImages.length <= 1) return;
		const currentIndex = activeVariantImages.findIndex((img) => img.index === activeImageIndex);
		if (currentIndex === -1) return;
		const nextIndex =
			(currentIndex + direction + activeVariantImages.length) % activeVariantImages.length;
		activeImageIndex = activeVariantImages[nextIndex].index;
	}

	onDestroy(() => {
		revokeImagePreviews();
	});
</script>

<svelte:head>
	<title>New Product | Caro Admin</title>
	<meta
		name="description"
		content="Create a Caro product with media, variants, tags, and catalog state."
	/>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<form
	method="POST"
	action="?/createProduct"
	enctype="multipart/form-data"
	novalidate
	bind:this={formElement}
	use:createProductEnhance
>
	<AdminFormLayout
		backHref="/app/products"
		backLabel="Back to products"
		title="New Product"
		actionMessage={[actionMessage, $createProductMessage].filter(Boolean).join('\n') || null}
		isSubmitting={$createProductSubmitting}
		submitLabel="Create Product"
		oncancel={() => history.back()}
	>
		{#snippet mainContent()}
			<input type="hidden" name="redirectTo" bind:value={$createProductForm.redirectTo} />
			<input
				type="hidden"
				name="primaryImageIndex"
				bind:value={$createProductForm.primaryImageIndex}
			/>
			{#each $createProductForm.tagIds as tagId (tagId)}
				<input type="hidden" name="tagIds" value={tagId} />
			{/each}
			{#each $createProductForm.newTagNames as tagName (tagName)}
				<input type="hidden" name="newTagNames" value={tagName} />
			{/each}

			<!-- Hidden images input (managed programmatically) -->
			<input
				id="hidden-images-input"
				name="images"
				type="file"
				multiple
				bind:files={$imageFiles}
				class="hidden"
			/>

			<div class="grid gap-6">
				<ProductBasicsSection
					bind:form={$createProductForm}
					errors={$createProductErrors}
					constraints={$createProductConstraints}
					categories={data.categories}
					genderOptions={data.genderOptions}
					fitOptions={data.fitOptions}
					bind:slugManuallyEdited
					{imagePreviews}
				/>

				<ProductVariantsSection
					bind:form={$createProductForm}
					errors={$createProductErrors}
					{colors}
					sizeOptions={data.sizeOptions}
					bind:showColorModal
					{imagesForVariant}
					onRemoveImage={removeImage}
					onOpenImage={(index) => (activeImageIndex = index)}
					onVariantImageUpload={handleVariantImageUpload}
					onToggleSize={(clientId, size) => toggleSize(clientId, size as SizeType)}
					onAddVariant={addVariant}
					onRemoveVariant={removeVariant}
					onVariantSortChange={handleVariantSortChange}
					bind:expandedVariants
				/>

				<ProductTagsSection
					bind:form={$createProductForm}
					tags={data.tags}
					bind:newTagDraft
					onAddNewTag={addNewTag}
					onRemoveNewTag={removeNewTag}
					onAddExistingTag={addExistingTag}
					onRemoveExistingTag={removeExistingTag}
					onNewTagKeydown={handleNewTagKeydown}
				/>

				<ProductPublishingSection
					bind:form={$createProductForm}
					constraints={$createProductConstraints}
					{carePresets}
					{materialPresets}
				/>
			</div>
		{/snippet}

		{#snippet sidebarContent()}
			<ProductPreviewPanel
				form={$createProductForm}
				{sortedVariants}
				{snapshotVariant}
				bind:snapshotVariantId={selectedSnapshotVariantId}
				bind:snapshotSize={selectedSnapshotSize}
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
				onSelectVariant={(clientId) => {
					const variant = sortedVariants.find((v) => v.clientId === clientId);
					if (!variant) return;
					selectedSnapshotVariantId = clientId;
					selectedSnapshotSize = variant.sizes[0] ?? null;
					carouselImageId = null;
				}}
				onSelectSize={(size) => (selectedSnapshotSize = size)}
				onPrevImage={() => navigateSnapshotImage(-1)}
				onNextImage={() => navigateSnapshotImage(1)}
				onOpenImage={(imgId) => (activeImageIndex = Number(imgId))}
			/>
		{/snippet}

		{#snippet mobilePanel()}
			<!-- Mobile Sticky Action Bar -->
			<div
				class="fixed right-0 bottom-0 left-0 z-40 flex gap-3 border-t border-ash/15 bg-void/95 p-4 shadow-[0_-8px_24px_rgb(0,0,0,0.6)] backdrop-blur lg:hidden"
			>
				<AdminButton
					type="button"
					onclick={() => {
						$createProductForm.isActive = false;
						formElement?.requestSubmit();
					}}
					disabled={$createProductSubmitting}
					variant="outline"
					class="flex-1"
				>
					Save Draft
				</AdminButton>
				<AdminButton
					type="button"
					onclick={() => {
						formElement?.requestSubmit();
					}}
					disabled={$createProductSubmitting}
					variant="volt"
					class="flex-1"
				>
					{$createProductSubmitting ? 'Saving...' : 'Create Product'}
				</AdminButton>
			</div>
		{/snippet}
	</AdminFormLayout>
</form>

<AdminUnsavedChangesGuard
	dirty={hasUnsavedChanges && !$createProductSubmitting}
	title="Leave new product?"
	description="Product details, variants, tags, or selected media have not been saved."
	onsave={() => formElement?.requestSubmit()}
/>

<!-- Image Preview Modal -->
<AdminModal
	open={activeImageIndex !== null}
	title="Product Image Preview"
	kicker="Media"
	size="5xl"
	onOpenChange={(v) => {
		if (!v) activeImageIndex = null;
	}}
>
	{#if activeImage && activeImageIndex !== null}
		{@const metadata = getImageMetadata(activeImageIndex)}
		<div
			class="grid min-w-0 overflow-hidden border border-ash/15 bg-void lg:max-h-[75vh] lg:grid-cols-[minmax(0,1fr)_340px]"
		>
			<div
				class="group relative flex min-h-0 w-full min-w-0 items-center overflow-hidden bg-charcoal/40"
			>
				<img
					src={activeImage.url}
					alt={metadata.altText ?? ''}
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
						<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Media Info</p>
						<h2 class="wrap-break-words mt-1 font-sans text-base font-semibold text-bone">
							{activeImage.name}
						</h2>
						<p class="mt-1 font-mono text-[10px] text-ash/60">
							{formatFileSize(activeImage.size)}
						</p>
					</div>
					<AdminButton
						type="button"
						size="icon"
						variant="danger"
						onclick={() => {
							if (activeImageIndex !== null) {
								removeImage(activeImageIndex);
								activeImageIndex = null;
							}
						}}
						class="h-9 w-9"
						aria-label="Remove image"
					>
						<Trash2 size={14} aria-hidden="true" />
					</AdminButton>
				</div>

				<AdminSelect
					label="Linked Color Variant"
					name="linkedColorVariantPreview"
					value={metadata.variantClientId ?? ''}
					disabled
				>
					<option value="">Product-wide Image</option>
					{#each $createProductForm.variants as variant (variant.clientId)}
						<option value={variant.clientId}>{variantLabel(variant.clientId)}</option>
					{/each}
				</AdminSelect>

				<AdminInput
					label="Alt Text"
					value={metadata.altText ?? ''}
					oninput={(e) => handleImageAltInput(activeImageIndex!, e)}
					name="imageAltText"
				/>

				<AdminSelect
					label="Display Order"
					name="imagePosition"
					value={metadata.position}
					onchange={(e) => handleImagePositionChange(activeImageIndex!, e)}
				>
					{#each imagePositionOptionsForVariant(metadata.variantClientId) as positionValue (positionValue)}
						<option value={positionValue}>{positionValue}</option>
					{/each}
				</AdminSelect>

				<AdminButton
					type="button"
					onclick={() => markPrimaryImage(activeImageIndex!)}
					variant={metadata.isPrimary ? 'volt' : 'outline'}
					class="w-full"
				>
					<Star size={14} fill={metadata.isPrimary ? 'currentColor' : 'none'} aria-hidden="true" />
					<span>Primary for {variantLabel(metadata.variantClientId)}</span>
				</AdminButton>
			</div>
		</div>
	{/if}
</AdminModal>

<!-- Server Error Toast -->
<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	duration={6000}
	onclose={() => (toastMessage = null)}
/>

<!-- Color Manager Modal -->
<AdminColorManagerModal bind:open={showColorModal} bind:colors />
