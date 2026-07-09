<script lang="ts">
	import { generateSlug } from '$lib/shared/slug';
	import {
		AlertTriangle,
		ChevronDown,
		FolderPlus,
		ImageOff,
		Plus,
		Star,
		Trash2,
		Upload,
		X
	} from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { filesProxy, superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import { Dialog, DropdownMenu } from 'bits-ui';
	import { fade, scale, slide } from 'svelte/transition';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminColorManagerModal from '$lib/components/admin/AdminColorManagerModal.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CreateProductData = PageData['createProductForm']['data'];
	type DraftVariant = CreateProductData['variants'][number];
	type SizeType = DraftVariant['sizes'][number];
	type ImageMetadata = CreateProductData['imageMetadata'][number];
	type RedirectTarget = 'products' | 'categories';

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
		submitting: createProductSubmitting
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

	let categorySearch = $state('');
	let categoryDropdownOpen = $state(false);

	let activeColorDropdownClientId = $state<string | null>(null);
	let showColorModal = $state(false);
	// eslint-disable-next-line svelte/prefer-writable-derived
	let colors = $state<typeof data.colors>([]);

	$effect.pre(() => {
		colors = data.colors;
	});

	function selectColor(
		originalIndex: number,
		selectedColor: { id: string; name: string; hex: string }
	) {
		$createProductForm.variants[originalIndex].colorId = selectedColor.id;
		$createProductForm.variants[originalIndex].color = selectedColor.name;
		$createProductForm.variants[originalIndex].colorHex = selectedColor.hex;
		activeColorDropdownClientId = null;
	}

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

	$effect(() => {
		if ($createProductForm.variants.length > 0) {
			const activeColorIds = new Set(colors.map((c) => c.id));
			for (const variant of $createProductForm.variants) {
				if (variant.colorId && !activeColorIds.has(variant.colorId)) {
					variant.colorId = null;
				}
			}
		}
	});

	let expandedVariants = $state<Record<string, boolean>>({});
	let carouselImageId = $state<string | null>(null);
	let selectedSnapshotVariantId = $state<string | null>(null);
	let selectedSnapshotSize = $state<string | null>(null);

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

	const filteredCategories = $derived.by(() => {
		const q = categorySearch.toLowerCase().trim();
		if (!q) return data.categories;
		return data.categories.filter((c) => c.name.toLowerCase().includes(q));
	});

	$effect(() => {
		const currentCategory = data.categories.find((c) => c.id === $createProductForm.categoryId);
		categorySearch = currentCategory ? currentCategory.name : '';
	});

	$effect(() => {
		if ($createProductForm.variants.length > 0 && Object.keys(expandedVariants).length === 0) {
			expandedVariants[$createProductForm.variants[0].clientId] = true;
		}
	});

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

	const actionMessage = $derived(actionData?.form?.message);
	const selectedTags = $derived(
		data.tags.filter((tag) => $createProductForm.tagIds.includes(tag.id))
	);
	const availableTags = $derived(
		data.tags.filter((tag) => !$createProductForm.tagIds.includes(tag.id))
	);
	const activeImage = $derived(
		activeImageIndex === null ? null : (imagePreviews[activeImageIndex] ?? null)
	);
	const sortedVariants = $derived(
		[...$createProductForm.variants].sort((a, b) => a.sortOrder - b.sortOrder)
	);

	const priceRange = $derived.by(() => {
		const prices = $createProductForm.variants.map((v) => v.basePrice).filter((p) => p > 0);
		if (prices.length === 0) return '—';
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
	});

	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$createProductForm.name) warnings.push('Product name is required');
		if (!$createProductForm.categoryId) warnings.push('No category assigned');
		if ($createProductForm.variants.length === 0) {
			warnings.push('At least one color variant is required');
		} else {
			const variantsWithNoSizes = $createProductForm.variants.filter((v) => v.sizes.length === 0);
			if (variantsWithNoSizes.length > 0) {
				warnings.push('Sizes are missing on some variants');
			}
		}
		if (imagePreviews.length === 0) {
			warnings.push('No product photography uploaded');
		}
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
		const selectedVariant = selectedSnapshotVariantId
			? sortedVariants.find((variant) => variant.clientId === selectedSnapshotVariantId)
			: null;
		return selectedVariant ?? sortedVariants[0] ?? null;
	});

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
		return selectedSnapshotSize &&
			(snapshotVariant.sizes as string[]).includes(selectedSnapshotSize)
			? selectedSnapshotSize
			: sortedSnapshotSizes[0];
	});

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
		data.categories.find((category) => category.id === $createProductForm.categoryId)?.name ??
			'No category'
	);

	function selectSnapshotVariant(variantClientId: string): void {
		const variant = sortedVariants.find((entry) => entry.clientId === variantClientId);
		if (!variant) return;

		selectedSnapshotVariantId = variantClientId;
		selectedSnapshotSize = variant.sizes[0] ?? null;
		carouselImageId = null;
	}

	function selectSnapshotSize(size: string): void {
		selectedSnapshotSize = size;
	}

	function openSnapshotImagePreview(imgId: string) {
		activeImageIndex = Number(imgId);
	}

	onDestroy(() => {
		revokeImagePreviews();
	});

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string | undefined): string {
		return (value ?? '').replace(/_/g, ' ');
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

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

		// Check if matches an existing tag name (case-insensitive)
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

	function handleNameInput(): void {
		if (!slugManuallyEdited) {
			$createProductForm.slug = generateSlug($createProductForm.name ?? '');
		}

		if (imagePreviews.length > 0) {
			$createProductForm.imageMetadata = $createProductForm.imageMetadata.map((metadata) =>
				metadata.altText ? metadata : { ...metadata, altText: $createProductForm.name || null }
			);
		}
	}

	function createVariantDraft(): DraftVariant {
		// Find the next unused color
		const usedColorIds = new Set($createProductForm.variants.map((v) => v.colorId).filter(Boolean));
		const usedColorNames = new Set($createProductForm.variants.map((v) => v.color.toLowerCase()));

		const nextColor = colors.find(
			(c) => !usedColorIds.has(c.id) && !usedColorNames.has(c.name.toLowerCase())
		);

		const assignedColor = nextColor ||
			colors.find((c) => c.name.toLowerCase() === 'black') ||
			colors[0] || { id: null, name: 'Default', hex: '#000000' };

		return {
			clientId: `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			colorId: assignedColor.id,
			color: assignedColor.name,
			colorHex: assignedColor.hex,
			basePrice: 2500,
			compareAtPrice: null,
			sortOrder: $createProductForm.variants.length + 1,
			sizes: ['M']
		};
	}

	function addVariant(): void {
		const newVar = createVariantDraft();
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
			if (index < previousMetadata.length) {
				return previousMetadata[index]!;
			}
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

	function removeVariant(clientId: string): void {
		$createProductForm.variants = $createProductForm.variants.filter(
			(variant) => variant.clientId !== clientId
		);
		$createProductForm.imageMetadata = $createProductForm.imageMetadata.map((metadata) =>
			metadata.variantClientId === clientId ? { ...metadata, variantClientId: null } : metadata
		);
		normalizeVariantSortOrders();
		normalizePrimaryImageScopes();
		delete expandedVariants[clientId];
	}

	function variantSortOptions(): number[] {
		return Array.from({ length: $createProductForm.variants.length }, (_, index) => index + 1);
	}

	function imagePositionOptionsForVariant(variantClientId: string | null | undefined): number[] {
		const targetId = variantClientId ?? null;
		const count = $createProductForm.imageMetadata.filter(
			(meta) => (meta.variantClientId ?? null) === targetId
		).length;
		return Array.from({ length: count }, (_, index) => index + 1);
	}

	function currentImageMetadata(): ImageMetadata[] {
		return imagePreviews.map((_, index) => ({
			...createDefaultImageMetadata(index),
			...($createProductForm.imageMetadata[index] ?? {})
		}));
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
				result[idx] = {
					...result[idx],
					position: rank + 1
				};
			}
		}

		return result;
	}

	function normalizeVariantSortOrders(): void {
		$createProductForm.variants = [...$createProductForm.variants]
			.sort((left, right) => left.sortOrder - right.sortOrder)
			.map((variant, index) => ({ ...variant, sortOrder: index + 1 }));
	}

	function handleVariantSortChange(clientId: string, event: Event): void {
		const nextSort = Number((event.currentTarget as HTMLSelectElement).value);
		const variants = [...$createProductForm.variants];
		const originalIndex = variants.findIndex((v) => v.clientId === clientId);
		const current = variants[originalIndex];

		if (!current || !Number.isInteger(nextSort)) return;

		const previousSort = current.sortOrder;
		const swapIndex = variants.findIndex(
			(variant) => variant.clientId !== clientId && variant.sortOrder === nextSort
		);

		variants[originalIndex] = { ...current, sortOrder: nextSort };

		if (swapIndex >= 0) {
			variants[swapIndex] = { ...variants[swapIndex], sortOrder: previousSort };
		}

		$createProductForm.variants = variants;
	}

	function variantLabel(clientId: string | null | undefined): string {
		if (!clientId) return 'Product image';

		const variant = $createProductForm.variants.find((entry) => entry.clientId === clientId);
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

	function handleActiveImageAltInput(event: Event): void {
		if (activeImageIndex === null) return;
		handleImageAltInput(activeImageIndex, event);
	}

	function handleActiveImagePositionChange(event: Event): void {
		if (activeImageIndex === null) return;
		handleImagePositionChange(activeImageIndex, event);
	}

	function markActiveImagePrimary(): void {
		if (activeImageIndex === null) return;
		markPrimaryImage(activeImageIndex);
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

	function appendCare(preset: string) {
		const current = $createProductForm.careInstructions || '';
		if (current.includes(preset)) return;
		$createProductForm.careInstructions = current ? `${current}, ${preset}` : preset;
	}

	function appendMaterial(preset: string) {
		const current = $createProductForm.material || '';
		if (current.includes(preset)) return;
		$createProductForm.material = current ? `${current}, ${preset}` : preset;
	}

	function toggleVariantExpanded(clientId: string) {
		expandedVariants[clientId] = !expandedVariants[clientId];
	}

	function expandAllVariants() {
		for (const v of $createProductForm.variants) {
			expandedVariants[v.clientId] = true;
		}
	}

	function collapseAllVariants() {
		for (const v of $createProductForm.variants) {
			expandedVariants[v.clientId] = false;
		}
	}

	const activeVariantImages = $derived.by(() => {
		if (activeImageIndex === null) return [];
		const currentMeta = getImageMetadata(activeImageIndex);
		const variantClientId = currentMeta.variantClientId;
		return imagePreviews
			.map((preview, index) => ({ preview, meta: getImageMetadata(index), index }))
			.filter((item) => item.meta.variantClientId === variantClientId)
			.sort((a, b) => a.meta.position - b.meta.position);
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
		const currentIndex = activeVariantImages.findIndex((img) => img.index === activeImageIndex);
		if (currentIndex === -1) return;
		const nextIndex =
			(currentIndex + direction + activeVariantImages.length) % activeVariantImages.length;
		activeImageIndex = activeVariantImages[nextIndex].index;
	}
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

<AdminFormLayout
	backHref="/app/products"
	backLabel="Back to products"
	title="New Product"
	actionMessage={[actionMessage, $createProductMessage].filter(Boolean).join('\n') || null}
	isSubmitting={$createProductSubmitting}
	submitLabel="Create Product"
	oncancel={() => history.back()}
	enhanceAction={createProductEnhance}
	bind:formElement
	formAttrs={{
		method: 'POST',
		action: '?/createProduct',
		enctype: 'multipart/form-data',
		novalidate: true
	}}
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

		<div class="grid gap-6">
			<!-- Product Basics Section -->
			<AdminCard title="Product Basics" border="border border-ash/15" class="shadow-sm">
				<div class="grid gap-5">
					<div class="grid gap-4 md:grid-cols-2">
						<AdminInput
							label="Product Name"
							name="name"
							placeholder="e.g. Classic Volt Oversized Tee"
							bind:value={$createProductForm.name}
							oninput={handleNameInput}
							required
							error={$createProductErrors.name}
							{...$createProductConstraints.name}
						/>

						<AdminInput
							label="Slug"
							name="slug"
							bind:value={$createProductForm.slug}
							oninput={() => (slugManuallyEdited = true)}
							required
							error={$createProductErrors.slug}
							helpText="Auto-generated from name. Edit to customize."
							{...$createProductConstraints.slug}
						/>
					</div>

					<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
						<div class="relative grid gap-1">
							<AdminInput
								label="Category"
								placeholder="Search and select category..."
								bind:value={categorySearch}
								onfocus={() => (categoryDropdownOpen = true)}
								onblur={() => {
									setTimeout(() => (categoryDropdownOpen = false), 200);
								}}
								name="categorySearchFake"
							/>
							<input type="hidden" name="categoryId" bind:value={$createProductForm.categoryId} />

							{#if categoryDropdownOpen}
								<div
									class="absolute top-[calc(100%+4px)] left-0 z-45 max-h-60 w-full overflow-y-auto border border-ash/20 bg-void shadow-xl"
								>
									<button
										type="button"
										onclick={() => {
											$createProductForm.categoryId = null;
											categorySearch = '';
											categoryDropdownOpen = false;
										}}
										class="w-full px-4 py-2.5 text-left font-sans text-xs font-medium tracking-wider text-ash uppercase transition-colors hover:bg-charcoal hover:text-volt"
									>
										No category
									</button>
									{#each filteredCategories as category (category.id)}
										<button
											type="button"
											onclick={() => {
												$createProductForm.categoryId = category.id;
												categorySearch = category.name;
												categoryDropdownOpen = false;
											}}
											class="w-full px-4 py-2.5 text-left font-sans text-sm text-bone transition-colors hover:bg-charcoal hover:text-volt"
										>
											{category.name}
										</button>
									{:else}
										<div class="px-4 py-2.5 font-sans text-xs text-ash/60">
											No matching categories
										</div>
									{/each}
								</div>
							{/if}
						</div>

						<AdminButton href="/app/categories/new" variant="outline" size="sm" class="self-end">
							<FolderPlus size={14} aria-hidden="true" />
							New Category
						</AdminButton>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<AdminSelect label="Gender" name="gender" bind:value={$createProductForm.gender}>
							{#each data.genderOptions as option (option.value)}
								<option value={option.value}>{formatLabel(option.label)}</option>
							{/each}
						</AdminSelect>

						<AdminSelect label="Fit" name="fit" bind:value={$createProductForm.fit}>
							{#each data.fitOptions as option (option.value)}
								<option value={option.value}>{formatLabel(option.label)}</option>
							{/each}
						</AdminSelect>
					</div>

					<label class="grid gap-1">
						<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
							>Product Summary</span
						>
						<textarea
							name="shortDescription"
							rows="2"
							placeholder="A short card description (max 150 characters)..."
							bind:value={$createProductForm.shortDescription}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
							{...$createProductConstraints.shortDescription}
						></textarea>
					</label>

					<label class="grid gap-1">
						<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
							>Full Description</span
						>
						<textarea
							name="description"
							rows="5"
							placeholder="Detailed sizing, styling guidelines, and specs..."
							bind:value={$createProductForm.description}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
							{...$createProductConstraints.description}
						></textarea>
					</label>

					<!-- Custom Toggle Switches for States -->
					<div class="grid gap-4 border border-ash/20 bg-void p-4 sm:grid-cols-3">
						<AdminToggle
							label="Active Status"
							description="Visible to shoppers"
							name="isActive"
							bind:checked={$createProductForm.isActive}
						/>

						<AdminToggle
							label="Featured"
							description="Feature on homepage"
							name="isFeatured"
							bind:checked={$createProductForm.isFeatured}
							class="border-t border-ash/10 pt-3 sm:border-t-0 sm:border-l sm:border-ash/10 sm:pt-0 sm:pl-4"
						/>

						<AdminToggle
							label="New Arrival"
							description="Display tag badge"
							name="isNewArrival"
							bind:checked={$createProductForm.isNewArrival}
							class="border-t border-ash/10 pt-3 sm:border-t-0 sm:border-l sm:border-ash/10 sm:pt-0 sm:pl-4"
						/>
					</div>
				</div>
			</AdminCard>

			<!-- Variants Section -->
			<AdminCard title="Colors & Sizes" border="border border-ash/15" class="shadow-sm">
				{#snippet headerActions()}
					<div class="flex items-center gap-3">
						<button
							type="button"
							onclick={collapseAllVariants}
							class="font-sans text-[11px] text-ash transition-colors hover:text-volt"
						>
							Collapse All
						</button>
						<span class="text-ash/40">|</span>
						<button
							type="button"
							onclick={expandAllVariants}
							class="font-sans text-[11px] text-ash transition-colors hover:text-volt"
						>
							Expand All
						</button>
						<AdminButton type="button" onclick={addVariant} variant="outline" size="sm">
							<Plus size={14} aria-hidden="true" />
							Add Variant
						</AdminButton>
					</div>
				{/snippet}

				<input
					id="hidden-images-input"
					name="images"
					type="file"
					multiple
					bind:files={$imageFiles}
					class="hidden"
				/>

				{#if $createProductForm.variants.length > 0}
					<div class="mt-5 grid gap-4">
						{#each sortedVariants as variant, index (variant.clientId)}
							{@const originalIndex = $createProductForm.variants.findIndex(
								(v) => v.clientId === variant.clientId
							)}
							{@const isPriceDisabled = $createProductForm.syncPrices && variant.sortOrder !== 1}
							{@const isRemovable =
								$createProductForm.variants.length > 1 && variant.clientId !== 'default-color-card'}
							{@const isExpanded = !!expandedVariants[variant.clientId]}

							<article
								animate:flip={{ duration: 300 }}
								transition:slide={{ duration: 250 }}
								class="border border-ash/20 bg-void transition-colors"
							>
								<!-- Collapsed Header -->
								<div
									role="button"
									tabindex="0"
									class="flex cursor-pointer items-center justify-between gap-3 p-4 select-none focus-visible:ring-1 focus-visible:ring-volt focus-visible:outline-none"
									onclick={() => toggleVariantExpanded(variant.clientId)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											toggleVariantExpanded(variant.clientId);
										}
									}}
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

									<div class="flex items-center gap-3">
										{#if isRemovable}
											<button
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													removeVariant(variant.clientId);
												}}
												class="grid h-8 w-8 place-items-center border border-red-500/20 text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/10 hover:text-red-300"
												aria-label={`Remove variant ${index + 1}`}
											>
												<X size={14} aria-hidden="true" />
											</button>
										{/if}
										<span
											class="text-ash transition-transform duration-200"
											class:rotate-180={isExpanded}
										>
											<ChevronDown size={16} />
										</span>
									</div>
								</div>

								<!-- Full Card Body -->
								{#if isExpanded}
									<div class="grid gap-4 border-t border-ash/10 bg-charcoal/10 p-4">
										<input
											type="hidden"
											name={`variants[${index}].clientId`}
											bind:value={$createProductForm.variants[originalIndex].clientId}
										/>
										{#each variant.sizes as size (size)}
											<input type="hidden" name={`variants[${index}].sizes`} value={size} />
										{/each}

										<div class="grid gap-4">
											<div class="relative grid gap-1">
												<span
													class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
												>
													Color Variant
													<span class="ml-0.5 font-sans text-red-400">*</span>
												</span>
												<div class="relative flex items-center">
													<DropdownMenu.Root
														open={activeColorDropdownClientId === variant.clientId}
														onOpenChange={(v) => {
															if (v) {
																activeColorDropdownClientId = variant.clientId;
															} else if (activeColorDropdownClientId === variant.clientId) {
																activeColorDropdownClientId = null;
															}
														}}
													>
														<DropdownMenu.Trigger class="w-full text-left outline-none">
															<div class="relative flex items-center">
																{#if isValidHex($createProductForm.variants[originalIndex].colorHex)}
																	<span
																		class="absolute left-3 h-5 w-5 rounded-full border border-ash/30 shadow-sm"
																		style:background={$createProductForm.variants[originalIndex]
																			.colorHex}
																	></span>
																{/if}
																<input
																	type="text"
																	readonly
																	placeholder="Select Color"
																	value={$createProductForm.variants[originalIndex].color}
																	class="min-h-11 w-full cursor-pointer border border-ash/30 bg-void py-2 pr-10 font-sans text-sm text-bone transition-colors outline-none focus:border-volt"
																	class:pl-10={isValidHex(
																		$createProductForm.variants[originalIndex].colorHex
																	)}
																/>
																<span class="pointer-events-none absolute right-3 text-ash/60">
																	<ChevronDown size={16} />
																</span>
															</div>
														</DropdownMenu.Trigger>
														{#if activeColorDropdownClientId === variant.clientId}
															<DropdownMenu.Portal>
																<DropdownMenu.Content sideOffset={4} class="z-50">
																	{#snippet child({ props, open })}
																		{#if open}
																			<div
																				{...props}
																				transition:scale={{ duration: 120, start: 0.96 }}
																				class="max-h-60 w-[var(--bits-dropdown-anchor-width)] min-w-[var(--bits-dropdown-anchor-width)] overflow-y-auto border border-ash/20 bg-charcoal py-1 shadow-xl outline-none"
																			>
																				{#each colors as c (c.id)}
																					{@const isColorUsed = $createProductForm.variants.some(
																						(v, idx) => idx !== originalIndex && v.colorId === c.id
																					)}
																					<DropdownMenu.Item
																						disabled={isColorUsed}
																						onclick={() => selectColor(originalIndex, c)}
																						class="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-sm transition-colors outline-none {isColorUsed
																							? 'cursor-not-allowed text-ash opacity-30'
																							: 'text-bone hover:bg-void/50 data-[highlighted]:bg-void/50'}"
																					>
																						<span
																							class="h-4 w-4 rounded-full border border-ash/30"
																							style:background={c.hex}
																						></span>
																						<span>{c.name}</span>
																						<span class="ml-auto font-mono text-xs text-ash/40"
																							>{c.hex}</span
																						>
																					</DropdownMenu.Item>
																				{/each}
																				<div class="mt-1 border-t border-ash/10 px-2 pt-1 pb-1">
																					<button
																						type="button"
																						onclick={() => {
																							activeColorDropdownClientId = null;
																							showColorModal = true;
																						}}
																						class="flex w-full items-center justify-center gap-1.5 bg-ash/10 px-3 py-2 font-sans text-xs font-bold tracking-wider text-bone uppercase transition-all hover:bg-ash/25"
																					>
																						<Plus size={14} />
																						Add New Color
																					</button>
																				</div>
																			</div>
																		{/if}
																	{/snippet}
																</DropdownMenu.Content>
															</DropdownMenu.Portal>
														{/if}
													</DropdownMenu.Root>

													<input
														type="hidden"
														name={`variants[${index}].color`}
														value={$createProductForm.variants[originalIndex].color}
													/>
													<input
														type="hidden"
														name={`variants[${index}].colorHex`}
														value={$createProductForm.variants[originalIndex].colorHex ?? ''}
													/>
													<input
														type="hidden"
														name={`variants[${index}].colorId`}
														value={$createProductForm.variants[originalIndex].colorId ?? ''}
													/>
												</div>
											</div>
										</div>

										<div class="grid gap-4 md:grid-cols-3">
											<label class="grid gap-1">
												<span
													class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
												>
													Selling Price (LKR)
													<span class="ml-0.5 font-sans text-red-400">*</span>
												</span>
												<input
													type="number"
													name={`variants[${index}].basePrice`}
													bind:value={$createProductForm.variants[originalIndex].basePrice}
													disabled={isPriceDisabled}
													class="min-h-11 border border-ash/30 bg-void px-3 py-2 font-sans text-sm text-bone transition-colors outline-none focus:border-volt disabled:cursor-not-allowed disabled:opacity-40"
												/>
												<p class="font-sans text-[10px] text-ash/50">Price paid by customer.</p>
												{#if $createProductErrors.variants?.[index]?.basePrice}
													<span class="font-sans text-xs text-red-400">
														{$createProductErrors.variants[index]?.basePrice?.[0]}
													</span>
												{/if}
											</label>

											<label class="grid gap-1">
												<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
													>Original Price / Compare At</span
												>
												<input
													type="number"
													name={`variants[${index}].compareAtPrice`}
													bind:value={$createProductForm.variants[originalIndex].compareAtPrice}
													disabled={isPriceDisabled}
													placeholder="Optional"
													class="min-h-11 border border-ash/30 bg-void px-3 py-2 font-sans text-sm text-bone transition-colors outline-none focus:border-volt disabled:cursor-not-allowed disabled:opacity-40"
												/>
												<p class="font-sans text-[10px] text-ash/50">
													Pre-discount price (must be higher).
												</p>
												{#if $createProductErrors.variants?.[index]?.compareAtPrice}
													<span class="font-sans text-xs text-red-400">
														{$createProductErrors.variants[index]?.compareAtPrice?.[0]}
													</span>
												{/if}
											</label>

											{#if $createProductForm.variants.length > 1}
												<label class="grid gap-1">
													<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
														>Sort Order</span
													>
													<select
														name={`variants[${index}].sortOrder`}
														value={variant.sortOrder}
														onchange={(event) => handleVariantSortChange(variant.clientId, event)}
														class="min-h-11 border border-ash/30 bg-void px-3 py-2 font-sans text-sm text-bone transition-colors outline-none focus:border-volt"
													>
														{#each variantSortOptions() as sortValue (sortValue)}
															<option value={sortValue}>{sortValue}</option>
														{/each}
													</select>
												</label>
											{/if}
										</div>

										{#if variant.sortOrder === 1}
											<div class="border-t border-ash/10 pt-3">
												<label
													class="flex cursor-pointer items-center gap-2 font-sans text-xs font-semibold text-ash"
												>
													<input
														type="checkbox"
														name="syncPrices"
														bind:checked={$createProductForm.syncPrices}
														class="h-4 w-4 cursor-pointer border-ash/30 bg-void text-volt outline-none focus:ring-0"
													/>
													Sync prices across all color variants
												</label>
											</div>
										{/if}

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
														{@const isSelected = variant.sizes.includes(sizeOpt.value as SizeType)}
														<button
															type="button"
															onclick={() =>
																toggleSize(variant.clientId, sizeOpt.value as SizeType)}
															class="min-h-10 border px-4 font-sans text-xs font-medium transition-colors {isSelected
																? 'border-volt bg-volt font-bold text-void'
																: 'border-ash/30 bg-void text-ash hover:border-volt hover:text-volt'}"
														>
															{sizeOpt.label}
														</button>
													{/each}
												</div>
												{#if $createProductErrors.variants?.[index]?.sizes}
													<span class="mt-1 font-sans text-xs text-red-400">
														{$createProductErrors.variants[index]?.sizes?._errors?.[0] ??
															$createProductErrors.variants[index]?.sizes?.[0]}
													</span>
												{/if}
											</div>
										</div>

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
															accept="image/*"
															multiple
															onchange={(event) =>
																handleVariantImageUpload(variant.clientId, event)}
															class="hidden"
														/>
														<Upload size={14} class="text-volt" aria-hidden="true" />
														Upload Images
													</label>
												</div>

												{#if imagesForVariant(variant.clientId).length > 0}
													<div class="mt-3 flex flex-wrap gap-3">
														{#each imagesForVariant(variant.clientId) as img (img.index)}
															<div
																class="group relative block border border-ash/20 hover:border-volt"
															>
																<button
																	type="button"
																	onclick={() => (activeImageIndex = img.index)}
																	class="block"
																>
																	<img
																		src={img.preview.url}
																		alt=""
																		class="h-20 w-20 object-cover"
																	/>
																</button>
																{#if img.meta.isPrimary}
																	<span
																		class="absolute top-1 left-1 bg-volt px-1 py-0.5 font-sans text-[8px] leading-none font-bold text-void uppercase"
																		>Primary</span
																	>
																{/if}
																<button
																	type="button"
																	onclick={(e) => {
																		e.stopPropagation();
																		removeImage(img.index);
																	}}
																	class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] text-white shadow"
																>
																	×
																</button>
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

			<!-- Tags Section -->
			<AdminCard title="Product Tags" border="border border-ash/15" class="shadow-sm">
				<div class="mt-4 grid gap-4">
					{#if selectedTags.length > 0 || $createProductForm.newTagNames.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each selectedTags as tag (tag.id)}
								<button
									type="button"
									onclick={() => removeExistingTag(tag.id)}
									class="inline-flex min-h-9 items-center gap-2 border border-volt bg-volt/10 px-3 font-sans text-xs tracking-wider text-volt uppercase transition-colors hover:bg-volt hover:text-void"
								>
									{tag.name}
									<X size={12} aria-hidden="true" />
								</button>
							{/each}
							{#each $createProductForm.newTagNames as tagName (tagName)}
								<button
									type="button"
									onclick={() => removeNewTag(tagName)}
									class="inline-flex min-h-9 items-center gap-2 border border-ash/30 px-3 font-sans text-xs text-bone uppercase transition-colors hover:border-red-400 hover:text-red-300"
								>
									{tagName}
									<X size={12} aria-hidden="true" />
								</button>
							{/each}
						</div>
					{/if}

					{#if data.tags.length > 0}
						<div class="grid gap-2">
							<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
								>Existing Tags</span
							>
							{#if availableTags.length > 0}
								<div class="flex flex-wrap gap-2">
									{#each availableTags as tag (tag.id)}
										<button
											type="button"
											onclick={() => addExistingTag(tag.id)}
											class="inline-flex min-h-8 items-center border border-ash/20 bg-void px-3 font-sans text-xs text-ash transition-colors hover:border-volt hover:text-volt"
										>
											{tag.name}
										</button>
									{/each}
								</div>
							{:else}
								<p class="font-sans text-xs text-ash/50">All available database tags selected.</p>
							{/if}
						</div>
					{/if}

					<div class="flex items-end gap-2">
						<AdminInput
							label="Add Custom Tag"
							bind:value={newTagDraft}
							onkeydown={handleNewTagKeydown}
							placeholder="Press Enter to add tag"
							name="newTagDraft"
							class="flex-1"
						/>
						<AdminButton
							type="button"
							onclick={addNewTag}
							variant="outline"
							class="flex min-h-11 w-11 shrink-0 items-center justify-center p-0"
							aria-label="Add tag"
						>
							<Plus size={15} aria-hidden="true" />
						</AdminButton>
					</div>
				</div>
			</AdminCard>

			<!-- Material & Care Accordion -->
			<details class="group border border-ash/15 bg-charcoal p-5 shadow-sm md:p-6">
				<summary
					class="flex cursor-pointer items-center justify-between font-display text-2xl leading-none tracking-wide text-bone uppercase select-none"
				>
					Material & Care
					<span class="text-ash transition-transform duration-200 group-open:rotate-180">
						<ChevronDown size={20} />
					</span>
				</summary>
				<div class="mt-5 grid gap-4 border-t border-ash/10 pt-4">
					<div class="grid gap-1">
						<AdminInput
							label="Material"
							name="material"
							bind:value={$createProductForm.material}
							placeholder="e.g. 100% Organic Heavyweight Cotton"
							{...$createProductConstraints.material}
						/>
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each materialPresets as preset (preset)}
								<button
									type="button"
									onclick={() => appendMaterial(preset)}
									class="border border-ash/20 bg-void px-2.5 py-1 font-sans text-[11px] text-ash transition-colors hover:border-volt hover:text-volt"
								>
									+ {preset}
								</button>
							{/each}
						</div>
					</div>

					<label class="grid gap-1">
						<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
							>Care Instructions</span
						>
						<textarea
							name="careInstructions"
							rows="3"
							placeholder="e.g. Wash inside out, line dry to preserve graphic prints..."
							bind:value={$createProductForm.careInstructions}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone outline-none focus:border-volt"
							{...$createProductConstraints.careInstructions}
						></textarea>
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each carePresets as preset (preset)}
								<button
									type="button"
									onclick={() => appendCare(preset)}
									class="border border-ash/20 bg-void px-2.5 py-1 font-sans text-[11px] text-ash transition-colors hover:border-volt hover:text-volt"
								>
									+ {preset}
								</button>
							{/each}
						</div>
					</label>
				</div>
			</details>

			<!-- SEO Accordion -->
			<details class="group border border-ash/15 bg-charcoal p-5 shadow-sm md:p-6">
				<summary
					class="flex cursor-pointer items-center justify-between font-display text-2xl leading-none tracking-wide text-bone uppercase select-none"
				>
					SEO Configuration
					<span class="text-ash transition-transform duration-200 group-open:rotate-180">
						<ChevronDown size={20} />
					</span>
				</summary>
				<div class="mt-5 grid gap-4 border-t border-ash/10 pt-4">
					<AdminInput
						label="Meta Title"
						name="metaTitle"
						bind:value={$createProductForm.metaTitle}
						placeholder="Leave empty to use product name"
						{...$createProductConstraints.metaTitle}
					/>

					<label class="grid gap-1">
						<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
							>Meta Description</span
						>
						<textarea
							name="metaDescription"
							rows="3"
							placeholder="Leave empty to use product summary"
							bind:value={$createProductForm.metaDescription}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone outline-none focus:border-volt"
							{...$createProductConstraints.metaDescription}
						></textarea>
					</label>
				</div>
			</details>
		</div>
	{/snippet}

	{#snippet sidebarContent()}
		{#if carouselImage}
			<div class="group relative">
				<button
					type="button"
					onclick={() => openSnapshotImagePreview(carouselImage.id)}
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
							navigateSnapshotImage(-1);
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
							navigateSnapshotImage(1);
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
			<div class="scrollbar-thin flex gap-2 overflow-x-auto border-b border-ash/15 bg-void p-3">
				{#each snapshotImages as img (img.id)}
					<button
						type="button"
						onclick={() => {
							carouselImageId = img.id;
						}}
						class="relative shrink-0 cursor-pointer border transition-all {img.id ===
						carouselImage?.id
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
						{$createProductForm.name || 'Untitled product'}
					</h2>
				</div>
				<span
					class="shrink-0 border px-2 py-1 font-mono text-[9px] tracking-widest uppercase {$createProductForm.isActive
						? 'border-volt/30 bg-volt/10 text-volt'
						: 'border-red-500/25 bg-red-950/20 text-red-300'}"
				>
					{$createProductForm.isActive ? 'Live' : 'Draft'}
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
						<span class="font-mono text-sm text-bone">{priceRange}</span>
					{/if}
				</div>

				<p class="font-sans text-xs leading-relaxed text-ash/80">
					{$createProductForm.shortDescription || 'Short product description will appear here.'}
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
								onclick={() => selectSnapshotVariant(variant.clientId)}
								class="inline-flex min-h-10 cursor-pointer items-center gap-2 border px-3 font-sans text-xs font-semibold transition-colors {snapshotVariant?.clientId ===
								variant.clientId
									? 'border-volt bg-volt text-void'
									: 'border-ash/30 bg-void text-ash hover:border-volt hover:text-volt'}"
								aria-pressed={snapshotVariant?.clientId === variant.clientId}
							>
								<span
									class="h-3 w-3 border border-ash/30 {isValidHex(variant.colorHex)
										? ''
										: 'bg-ash/20'}"
									style={isValidHex(variant.colorHex)
										? `background-color: ${variant.colorHex}`
										: ''}
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
								onclick={() => selectSnapshotSize(size)}
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
						{formatLabel($createProductForm.gender ?? '')} / {formatLabel(
							$createProductForm.fit ?? ''
						)}
					</span>
				</div>
				<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
					<span class="font-medium text-ash">Images</span>
					<span class="text-right text-bone">{activeLocalImages.length}</span>
				</div>
				{#if selectedTags.length > 0 || $createProductForm.newTagNames.length > 0}
					<div class="flex flex-wrap gap-1.5 pt-1">
						{#each selectedTags as tag (tag.id)}
							<span class="border border-ash/20 px-2 py-1 font-mono text-[9px] text-ash uppercase">
								{tag.name}
							</span>
						{/each}
						{#each $createProductForm.newTagNames as tagName (tagName)}
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
						<AlertTriangle size={12} /> Attention ({snapshotWarnings.length})
					</p>
					<ul class="mt-2 list-disc space-y-1 pl-4 font-sans text-xs text-ash/70">
						{#each snapshotWarnings as warning (warning)}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
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

<!-- Image Preview Modal -->
<!-- Image Preview Modal -->
<Dialog.Root
	open={activeImageIndex !== null}
	onOpenChange={(v) => {
		if (!v) activeImageIndex = null;
	}}
>
	{#if activeImageIndex !== null}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props, open })}
					{#if open}
						<div
							{...props}
							transition:fade={{ duration: 150 }}
							class="fixed inset-0 z-50 bg-void/90 backdrop-blur-sm"
						></div>
					{/if}
				{/snippet}
			</Dialog.Overlay>
			<div
				class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-4 sm:py-6"
			>
				<Dialog.Content>
					{#snippet child({ props, open })}
						{#if open && activeImage && activeImageIndex !== null}
							{@const metadata = getImageMetadata(activeImageIndex)}
							<div
								{...props}
								transition:scale={{ duration: 200, start: 0.95 }}
								class="mx-auto my-auto grid w-full max-w-5xl min-w-0 border border-ash/25 bg-void shadow-2xl outline-none lg:max-h-[90vh] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
							>
								<Dialog.Title class="sr-only">Product Image Preview</Dialog.Title>
								<Dialog.Description class="sr-only">
									Full size zoomed view and metadata management for this product photo.
								</Dialog.Description>

								<div
									class="group relative flex min-h-0 w-full min-w-0 items-center overflow-hidden bg-charcoal/40"
								>
									<img
										src={activeImage.url}
										alt={metadata.altText ?? ''}
										class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[92vh]"
									/>

									{#if activeVariantImages.length > 1}
										<button
											type="button"
											onclick={() => navigateActiveImage(-1)}
											class="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border border-ash/20 bg-void/80 text-bone transition-colors select-none hover:border-volt hover:text-volt"
											aria-label="Previous image"
										>
											&larr;
										</button>
										<button
											type="button"
											onclick={() => navigateActiveImage(1)}
											class="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border border-ash/20 bg-void/80 text-bone transition-colors select-none hover:border-volt hover:text-volt"
											aria-label="Next image"
										>
											&rarr;
										</button>
									{/if}
								</div>
								<div
									class="grid min-w-0 content-start gap-4 overflow-x-hidden border-t border-ash/15 bg-charcoal p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l"
								>
									<div class="flex items-start justify-between gap-4">
										<div class="min-w-0">
											<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
												Media Info
											</p>
											<h2 class="wrap-break-words mt-1 font-sans text-base font-semibold text-bone">
												{activeImage.name}
											</h2>
											<p class="mt-1 font-mono text-[10px] text-ash/60">
												{formatFileSize(activeImage.size)}
											</p>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											<button
												type="button"
												onclick={() => {
													if (activeImageIndex !== null) {
														removeImage(activeImageIndex);
														activeImageIndex = null;
													}
												}}
												class="grid h-9 w-9 place-items-center border border-red-500/25 text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
												aria-label="Remove image"
											>
												<Trash2 size={14} aria-hidden="true" />
											</button>
											<button
												type="button"
												onclick={() => (activeImageIndex = null)}
												class="grid h-9 w-9 place-items-center border border-ash/30 text-ash transition-colors hover:border-volt hover:text-volt"
												aria-label="Close detail modal"
											>
												<X size={15} aria-hidden="true" />
											</button>
										</div>
									</div>

									<label class="grid gap-1">
										<span class="font-sans text-xs font-semibold text-ash"
											>Linked Color Variant</span
										>
										<select
											value={metadata.variantClientId ?? ''}
											disabled
											class="min-h-11 w-full cursor-not-allowed border border-ash/30 bg-void/50 px-3 py-2 font-sans text-sm text-ash opacity-80 outline-none"
										>
											<option value="">Product-wide Image</option>
											{#each $createProductForm.variants as variant (variant.clientId)}
												<option value={variant.clientId}>{variantLabel(variant.clientId)}</option>
											{/each}
										</select>
									</label>

									<AdminInput
										label="Alt Text"
										value={metadata.altText ?? ''}
										oninput={handleActiveImageAltInput}
										name="imageAltText"
									/>

									<AdminSelect
										label="Display Order"
										name="imagePosition"
										value={metadata.position}
										onchange={handleActiveImagePositionChange}
									>
										{#each imagePositionOptionsForVariant(metadata.variantClientId) as positionValue (positionValue)}
											<option value={positionValue}>{positionValue}</option>
										{/each}
									</AdminSelect>

									<AdminButton
										type="button"
										onclick={markActiveImagePrimary}
										variant={metadata.isPrimary ? 'volt' : 'outline'}
										class="w-full"
									>
										<Star
											size={14}
											fill={metadata.isPrimary ? 'currentColor' : 'none'}
											aria-hidden="true"
										/>
										<span>Primary for {variantLabel(metadata.variantClientId)}</span>
									</AdminButton>
								</div>
							</div>
						{/if}
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- Server Error Toast -->
<AdminToast
	message={toastMessage}
	type="error"
	duration={6000}
	onclose={() => (toastMessage = null)}
/>

<!-- Color Manager Modal -->
<AdminColorManagerModal bind:open={showColorModal} bind:colors />
