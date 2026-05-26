<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		AlertTriangle,
		ArrowLeft,
		ChevronDown,
		FolderPlus,
		ImageOff,
		Layers,
		Plus,
		Save,
		Star,
		Trash2,
		Upload,
		X
	} from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { superForm, filesProxy } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminHexInput from '$lib/components/admin/AdminHexInput.svelte';
	import AdminUnsavedChangesModal from '$lib/components/admin/AdminUnsavedChangesModal.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

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
		isTainted: isUpdateProductTainted
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

	function categoryNameById(categoryId: string | null | undefined): string {
		return data.categories.find((category) => category.id === categoryId)?.name ?? '';
	}

	let localVariants = $state<LocalVariant[]>([]);
	let localImages = $state<LocalImage[]>([]);
	let hexIndicatorActive = $state<Record<string, boolean>>({});

	$effect(() => {
		localVariants = buildLocalVariants(data.product);
		localImages = buildLocalImages(data.product);
	});

	let formElement = $state<HTMLFormElement | null>(null);
	let showUnsavedModal = $state(false);

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

	const activeLocalImages = $derived(
		localImages.filter((img) => !img.isDeleted).sort((a, b) => a.position - b.position)
	);
	const serializedVariants = $derived(JSON.stringify(localVariants));
	const serializedImages = $derived(JSON.stringify(localImages));

	const snapshotVariant = $derived.by(() => {
		const selectedVariant = selectedSnapshotVariantId
			? activeLocalVariants.find((variant) => variant.id === selectedSnapshotVariantId)
			: null;
		return selectedVariant ?? activeLocalVariants[0] ?? null;
	});

	const snapshotSize = $derived.by(() => {
		if (!snapshotVariant || snapshotVariant.sizes.length === 0) return null;
		return selectedSnapshotSize && snapshotVariant.sizes.includes(selectedSnapshotSize)
			? selectedSnapshotSize
			: snapshotVariant.sizes[0];
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
	let categorySearch = $derived(categoryNameById($updateProductForm.categoryId));
	let categoryDropdownOpen = $state(false);

	const filteredCategories = $derived.by(() => {
		const q = categorySearch.toLowerCase().trim();
		if (!q) return data.categories;
		return data.categories.filter((c) => c.name.toLowerCase().includes(q));
	});

	const dropTierWithoutDrop = $derived(
		$updateProductForm.tier === 'drop' && !$updateProductForm.dropId
	);
	const activeVariantCount = $derived(
		activeLocalVariants.reduce((sum, v) => sum + v.sizes.length, 0)
	);
	const actionMessage = $derived(actionData?.form?.message);

	const selectedTags = $derived(
		data.tags.filter((tag) => $updateProductForm.tagIds.includes(tag.id))
	);
	const availableTags = $derived(
		data.tags.filter((tag) => !$updateProductForm.tagIds.includes(tag.id))
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

	const priceRange = $derived.by(() => {
		const prices = activeLocalVariants.map((v) => v.basePrice);
		if (prices.length === 0) return '—';
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
	});

	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$updateProductForm.name) warnings.push('Product name is required');
		if (!$updateProductForm.categoryId) warnings.push('No category assigned');
		if (activeLocalVariants.length === 0) {
			warnings.push('At least one color variant is required');
		}
		if ($updateProductForm.tier === 'drop' && !$updateProductForm.dropId) {
			warnings.push('Drop is required for Drop Tier');
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

	function resetState() {
		localVariants = buildLocalVariants(data.product);
		localImages = buildLocalImages(data.product);

		// Revoke object URLs and clear new uploads
		revokeImagePreviews();
		newImageFiles = [];
		imagePreviews = [];
		$imageFiles = createFileList([]);
		activeImageId = null;
		carouselImageId = null;
		selectedSnapshotVariantId = null;
		selectedSnapshotSize = null;
		expandedColorCards = {};
	}

	function discardChanges() {
		resetState();
		// Re-sync form fields from data.product
		$updateProductForm.name = data.product.name;
		$updateProductForm.slug = data.product.slug;
		$updateProductForm.description = data.product.description;
		$updateProductForm.shortDescription = data.product.shortDescription;
		$updateProductForm.categoryId = data.product.categoryId;
		$updateProductForm.tier = data.product.tier;
		$updateProductForm.gender = data.product.gender;
		$updateProductForm.fit = data.product.fit;
		$updateProductForm.material = data.product.material;
		$updateProductForm.careInstructions = data.product.careInstructions;
		$updateProductForm.isActive = data.product.isActive;
		$updateProductForm.isFeatured = data.product.isFeatured;
		$updateProductForm.isNewArrival = data.product.isNewArrival;
		$updateProductForm.metaTitle = data.product.metaTitle;
		$updateProductForm.metaDescription = data.product.metaDescription;
		$updateProductForm.tagIds = data.product.tags.map((tag) => tag.id);
		$updateProductForm.newTagNames = [];
		$updateProductForm.dropId = data.product.dropAssignment?.id ?? null;
		categorySearch = categoryNameById(data.product.categoryId);
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

	function handleHexInput(id: string, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		let val = input.value;
		if (val.includes('#')) {
			val = val.replace(/#/g, '');
			hexIndicatorActive = { ...hexIndicatorActive, [id]: true };
			setTimeout(() => {
				hexIndicatorActive = { ...hexIndicatorActive, [id]: false };
			}, 800);
		}
		if (val.length > 6) {
			val = val.slice(0, 6);
		}
		localVariants = localVariants.map((variant) =>
			variant.id === id ? { ...variant, colorHex: val ? `#${val}` : null } : variant
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

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
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

	function appendCare(preset: string) {
		const current = $updateProductForm.careInstructions || '';
		if (current.includes(preset)) return;
		$updateProductForm.careInstructions = current ? `${current}, ${preset}` : preset;
	}

	function appendMaterial(preset: string) {
		const current = $updateProductForm.material || '';
		if (current.includes(preset)) return;
		$updateProductForm.material = current ? `${current}, ${preset}` : preset;
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
		const newVar: LocalVariant = {
			id: `new-color-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			color: '',
			colorHex: '#000000',
			basePrice: $updateProductForm.tier === 'drop' ? 3000 : 2500,
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

	function updateVariantTextField(id: string, field: 'color' | 'colorHex', event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).value;
		localVariants = localVariants.map((variant) =>
			variant.id === id
				? { ...variant, [field]: field === 'colorHex' ? value || null : value }
				: variant
		);
	}

	function updateVariantNumberField(
		id: string,
		field: 'basePrice' | 'compareAtPrice',
		event: Event
	): void {
		const input = event.currentTarget as HTMLInputElement;
		const nextValue =
			input.value === '' ? (field === 'compareAtPrice' ? null : 0) : Number(input.value);
		localVariants = localVariants.map((variant) =>
			variant.id === id ? { ...variant, [field]: nextValue } : variant
		);
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
			const presentOrders = new Set(activeLocalVariants.map(v => v.sortOrder));
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

	function hasDirtyChanges(): boolean {
		if (isUpdateProductTainted()) return true;

		const initialVariants = buildLocalVariants(data.product);
		if (JSON.stringify(localVariants) !== JSON.stringify(initialVariants)) return true;

		const initialImages = buildLocalImages(data.product);
		if (JSON.stringify(localImages) !== JSON.stringify(initialImages)) return true;

		if (newImageFiles.length > 0) return true;

		return false;
	}

	async function handleBackClick(): Promise<void> {
		if (hasDirtyChanges()) {
			showUnsavedModal = true;
		} else {
			await goto(resolve('/app/products'));
		}
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
		const nextIndex = (currentIndex + direction + activeVariantImages.length) % activeVariantImages.length;
		activeImageId = activeVariantImages[nextIndex].id;
	}
</script>

<svelte:head>
	<title>{$updateProductForm.name || data.product.name} | Products | Caro Admin</title>
	<meta
		name="description"
		content="Edit product details, variants, images, merchandising flags, and product publishing state."
	/>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<section class="mx-auto max-w-7xl overflow-x-hidden px-2 pb-24 md:px-0 lg:pb-10">
	<div class="border-b border-charcoal pb-4 md:pb-6">
		<button
			type="button"
			onclick={handleBackClick}
			class="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt cursor-pointer select-none"
		>
			<ArrowLeft size={14} aria-hidden="true" />
			Back to products
		</button>

		<div class="mt-4 items-end justify-between gap-6 md:flex">
			<div class="min-w-0">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Product edit</p>
				<h1
					class="mt-1 truncate font-display text-4xl leading-none text-bone uppercase md:text-6xl"
				>
					{$updateProductForm.name || data.product.name}
				</h1>
				<p class="mt-1.5 truncate font-mono text-xs tracking-wide text-ash">
					Slug: {data.product.slug}
				</p>
			</div>

			<div class="mt-5 grid grid-cols-2 gap-3 text-right font-sans text-xs md:mt-0 md:grid-cols-4">
				<div
					class="border border-ash/10 bg-charcoal/20 p-2 text-center md:border-0 md:bg-transparent md:p-0 md:text-right"
				>
					<p class="font-sans text-[11px] font-semibold tracking-wider text-ash uppercase">State</p>
					<p
						class="mt-1 font-display text-2xl uppercase {$updateProductForm.isActive
							? 'text-volt'
							: 'text-red-400'}"
					>
						{$updateProductForm.isActive ? 'Live' : 'Draft'}
					</p>
				</div>
				<div
					class="border border-ash/10 bg-charcoal/20 p-2 text-center md:border-0 md:bg-transparent md:p-0 md:text-right"
				>
					<p class="font-sans text-[11px] font-semibold tracking-wider text-ash uppercase">
						Price Range
					</p>
					<p class="mt-1 font-mono text-sm font-semibold text-bone">
						{priceRange.replace('LKR ', '')}
					</p>
				</div>
				<div
					class="border border-ash/10 bg-charcoal/20 p-2 text-center md:border-0 md:bg-transparent md:p-0 md:text-right"
				>
					<p class="font-sans text-[11px] font-semibold tracking-wider text-ash uppercase">
						Variants
					</p>
					<p class="mt-1 font-display text-2xl text-bone uppercase">{activeVariantCount}</p>
				</div>
				<div
					class="border border-ash/10 bg-charcoal/20 p-2 text-center md:border-0 md:bg-transparent md:p-0 md:text-right"
				>
					<p class="font-sans text-[11px] font-semibold tracking-wider text-ash uppercase">
						Images
					</p>
					<p class="mt-1 font-display text-2xl text-bone uppercase">{activeLocalImages.length}</p>
				</div>
			</div>
		</div>
	</div>

	{#if actionMessage || $updateProductMessage}
		<div class="mt-6 grid gap-2">
			<p class="border border-volt/30 bg-volt/10 px-4 py-3 font-sans text-xs text-volt">
				{actionMessage || $updateProductMessage}
			</p>
		</div>
	{/if}

	<form
		bind:this={formElement}
		id="update-product-form"
		method="POST"
		action="?/updateProduct"
		enctype="multipart/form-data"
		use:updateProductEnhance
		novalidate
		class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
	>
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
			<AdminCard title="Product Basics" border="border border-ash/15" class="shadow-sm">
				<div class="grid gap-5">
					<div class="grid gap-4 md:grid-cols-2">
						<AdminInput
							label="Product Name"
							name="name"
							placeholder="e.g. Classic Volt Oversized Tee"
							bind:value={$updateProductForm.name}
							required
							error={$updateProductErrors.name}
							{...$updateProductConstraints.name}
						/>
						<AdminInput
							label="Slug"
							name="slug"
							bind:value={$updateProductForm.slug}
							required
							helpText="Edit to customize the product's URL slug."
							error={$updateProductErrors.slug}
							{...$updateProductConstraints.slug}
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
							<input type="hidden" name="categoryId" bind:value={$updateProductForm.categoryId} />

							{#if categoryDropdownOpen}
								<div
									class="absolute top-[calc(100%+4px)] left-0 z-45 max-h-60 w-full overflow-y-auto border border-ash/20 bg-void shadow-xl"
								>
									<button
										type="button"
										onclick={() => {
											$updateProductForm.categoryId = null;
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
												$updateProductForm.categoryId = category.id;
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

						<AdminButton
							href={resolve('/app/categories')}
							variant="outline"
							size="sm"
							class="self-end"
						>
							<FolderPlus size={14} aria-hidden="true" />
							New Category
						</AdminButton>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<AdminSelect
							label="Tier"
							name="tier"
							bind:value={$updateProductForm.tier}
						>
							{#each data.tierOptions as option (option.value)}
								<option value={option.value}>{formatLabel(option.label)}</option>
							{/each}
						</AdminSelect>

						{#if $updateProductForm.tier === 'drop'}
							<AdminSelect
								label="Drop"
								name="dropId"
								bind:value={$updateProductForm.dropId}
							>
								<option value="">No drop</option>
								{#each data.drops as drop (drop.id)}
									<option value={drop.id}>{drop.name} ({formatLabel(drop.status)})</option>
								{/each}
							</AdminSelect>

							<AdminButton
								href={resolve('/app/drops')}
								variant="outline"
								size="sm"
								class="self-end"
							>
								<Layers size={14} aria-hidden="true" />
								New Drop
							</AdminButton>

							{#if dropTierWithoutDrop}
								<p
									class="flex items-start gap-2 border border-red-400/30 bg-red-950/20 px-4 py-3 font-sans text-xs text-red-300 md:col-span-3"
								>
									<AlertTriangle size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
									Please assign a drop to make this drop product active.
								</p>
							{/if}
						{/if}

						<AdminSelect
							label="Gender"
							name="gender"
							bind:value={$updateProductForm.gender}
						>
							{#each data.genderOptions as option (option.value)}
								<option value={option.value}>{formatLabel(option.label)}</option>
							{/each}
						</AdminSelect>

						<AdminSelect
							label="Fit"
							name="fit"
							bind:value={$updateProductForm.fit}
						>
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
							bind:value={$updateProductForm.shortDescription}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
							{...$updateProductConstraints.shortDescription}
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
							bind:value={$updateProductForm.description}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
							{...$updateProductConstraints.description}
						></textarea>
					</label>

					<!-- Custom Toggle Switches for States -->
					<div class="grid gap-4 border border-ash/20 bg-void p-4 sm:grid-cols-3">
						<AdminToggle
							label="Active Status"
							description="Visible to shoppers"
							name="isActive"
							bind:checked={$updateProductForm.isActive}
							disabled={dropTierWithoutDrop}
						/>

						<AdminToggle
							label="Featured"
							description="Feature on homepage"
							name="isFeatured"
							bind:checked={$updateProductForm.isFeatured}
							class="border-t border-ash/10 pt-3 sm:border-t-0 sm:border-l sm:border-ash/10 sm:pt-0 sm:pl-4"
						/>

						<AdminToggle
							label="New Arrival"
							description="Display tag badge"
							name="isNewArrival"
							bind:checked={$updateProductForm.isNewArrival}
							class="border-t border-ash/10 pt-3 sm:border-t-0 sm:border-l sm:border-ash/10 sm:pt-0 sm:pl-4"
						/>
					</div>
				</div>
			</AdminCard>

			<AdminCard
				title="Colors & Sizes"
				border="border border-ash/15"
				class="shadow-sm"
			>
				{#snippet headerActions()}
					<div class="flex items-center gap-3">
						<button
							type="button"
							onclick={collapseAllColorCards}
							class="font-sans text-[11px] text-ash transition-colors hover:text-volt"
						>
							Collapse All
						</button>
						<span class="text-ash/40">|</span>
						<button
							type="button"
							onclick={expandAllColorCards}
							class="font-sans text-[11px] text-ash transition-colors hover:text-volt"
						>
							Expand All
						</button>
						<AdminButton
							type="button"
							onclick={addVariantColor}
							variant="outline"
							size="sm"
						>
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
											<h3 class="flex items-center gap-2 font-sans text-sm font-semibold text-bone">
												{card.color || `Variant Color ${index + 1}`}
												{#if card.isNew}
													<span
														class="border border-volt/25 bg-volt/15 px-1 font-sans text-[9px] font-bold text-volt uppercase"
														>New</span
													>
												{/if}
											</h3>
											<p class="mt-0.5 font-sans text-xs text-ash">
												Sizes: {card.sizes.join(', ') || 'None'} • Selling: {formatMoney(
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
									{@const originalIndex = localVariants.findIndex(v => v.id === card.id)}
									<div class="grid gap-4 border-t border-ash/10 bg-charcoal/10 p-4">
										<div class="grid gap-4 md:grid-cols-2">
											<AdminInput
												label="Color Variant Name"
												name="color"
												bind:value={localVariants[originalIndex].color}
												placeholder="e.g. Acid Volt"
												required
											/>

											<AdminHexInput
												label="Color Hex"
												name="colorHex"
												bind:value={localVariants[originalIndex].colorHex}
												clientId={card.id}
											/>
										</div>

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
														<button
															type="button"
															onclick={() => toggleSize(card.id, sizeOpt.value)}
															class="min-h-10 cursor-pointer border px-4 font-sans text-xs font-semibold uppercase transition-all {hasSize
																? 'border-volt bg-volt text-void hover:border-bone hover:bg-bone'
																: 'border-ash/30 bg-void text-ash hover:border-volt hover:text-volt'}"
															title={hasSize ? 'Click to remove size' : 'Click to add size'}
														>
															{sizeOpt.label}
														</button>
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
															accept="image/*"
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
																<button
																	type="button"
																	onclick={() => openVariantImagePreview(img.id)}
																	class="block cursor-pointer"
																>
																	<img src={img.imageUrl} alt="" class="h-20 w-20 object-cover" />
																</button>
																{#if img.isPrimary}
																	<span
																		class="absolute top-1 left-1 bg-volt px-1 py-0.5 font-sans text-[8px] leading-none font-bold text-void uppercase"
																		>Primary</span
																	>
																{/if}
																<button
																	type="button"
																	onclick={() => removeImage(img.id)}
																	class="absolute -top-1.5 -right-1.5 hidden h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-red-600 text-[10px] text-white shadow group-hover:flex hover:bg-red-500"
																	title="Delete image"
																>
																	×
																</button>
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
												<button
													type="button"
													onclick={() => deleteVariantColor(card.id)}
													class="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 border border-red-500/30 bg-void px-4 font-sans text-xs font-semibold text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
												>
													<Trash2 size={13} aria-hidden="true" />
													Delete Variant
												</button>
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

			<AdminCard
				title="Product Tags"
				border="border border-ash/15"
				class="shadow-sm"
			>

				<div class="mt-4 grid gap-4">
					{#if selectedTags.length > 0 || $updateProductForm.newTagNames.length > 0}
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
							{#each $updateProductForm.newTagNames as tagName (tagName)}
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
							class="min-h-11 w-11 shrink-0 p-0 flex items-center justify-center"
							aria-label="Add tag"
						>
							<Plus size={15} aria-hidden="true" />
						</AdminButton>
					</div>
				</div>
			</AdminCard>

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
							bind:value={$updateProductForm.material}
							placeholder="e.g. 100% Organic Heavyweight Cotton"
							{...$updateProductConstraints.material}
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
							bind:value={$updateProductForm.careInstructions}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone outline-none focus:border-volt"
							{...$updateProductConstraints.careInstructions}
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
						bind:value={$updateProductForm.metaTitle}
						placeholder="Leave empty to use product name"
						{...$updateProductConstraints.metaTitle}
					/>

					<label class="grid gap-1">
						<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
							>Meta Description</span
						>
						<textarea
							name="metaDescription"
							rows="3"
							placeholder="Leave empty to use product summary"
							bind:value={$updateProductForm.metaDescription}
							class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone outline-none focus:border-volt"
							{...$updateProductConstraints.metaDescription}
						></textarea>
					</label>
				</div>
			</details>

			<div class="hidden items-center gap-3 lg:flex">
				<AdminButton
					type="button"
					onclick={discardChanges}
					variant="outline"
					size="lg"
				>
					Discard changes
				</AdminButton>
				<AdminButton
					type="submit"
					disabled={$updateProductSubmitting}
					variant="volt"
					size="lg"
					class="flex-1"
				>
					<Save size={15} aria-hidden="true" />
					{$updateProductSubmitting ? 'Saving...' : 'Save Product'}
				</AdminButton>
			</div>
		</div>

		<aside class="grid gap-6 xl:sticky xl:top-8 xl:self-start">
			<div class="border border-ash/15 bg-charcoal">
				{#if carouselImage}
					<div class="relative group">
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
									class="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
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
								class="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center bg-void/80 border border-ash/20 text-bone hover:border-volt hover:text-volt transition-colors cursor-pointer select-none"
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
								class="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center bg-void/80 border border-ash/20 text-bone hover:border-volt hover:text-volt transition-colors cursor-pointer select-none"
								aria-label="Next image"
							>
								&rarr;
							</button>
						{/if}
					</div>
				{:else}
					<div
						class="grid aspect-[4/5] place-items-center border-b border-ash/15 bg-void text-ash/40"
					>
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
								{$updateProductForm.name || 'Untitled product'}
							</h2>
						</div>
						<span
							class="shrink-0 border px-2 py-1 font-mono text-[9px] tracking-widest uppercase {$updateProductForm.isActive
								? 'border-volt/30 bg-volt/10 text-volt'
								: 'border-red-500/25 bg-red-950/20 text-red-300'}"
						>
							{$updateProductForm.isActive ? 'Live' : 'Draft'}
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
							{$updateProductForm.shortDescription || 'Short product description will appear here.'}
						</p>
					</div>

					{#if activeLocalVariants.length > 0}
						<div class="mt-5 border-t border-ash/10 pt-4">
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
								Color: {snapshotVariant?.color ?? 'Select'}
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each activeLocalVariants as variant (variant.id)}
									<button
										type="button"
										onclick={() => selectSnapshotVariant(variant.id)}
										class="inline-flex min-h-10 cursor-pointer items-center gap-2 border px-3 font-sans text-xs font-semibold transition-colors {snapshotVariant?.id ===
										variant.id
											? 'border-volt bg-volt text-void'
											: 'border-ash/30 bg-void text-ash hover:border-volt hover:text-volt'}"
										aria-pressed={snapshotVariant?.id === variant.id}
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
								{#each snapshotVariant.sizes as size (size)}
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
							<span class="font-medium text-ash">Tier</span>
							<span class="text-right text-bone uppercase"
								>{formatLabel($updateProductForm.tier ?? '')}</span
							>
						</div>
						<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
							<span class="font-medium text-ash">Gender / Fit</span>
							<span class="text-right text-bone uppercase">
								{formatLabel($updateProductForm.gender ?? '')} / {formatLabel(
									$updateProductForm.fit ?? ''
								)}
							</span>
						</div>
						<div class="flex justify-between gap-4 border-b border-ash/5 pb-2">
							<span class="font-medium text-ash">Images</span>
							<span class="text-right text-bone">{activeLocalImages.length}</span>
						</div>
						{#if selectedTags.length > 0 || $updateProductForm.newTagNames.length > 0}
							<div class="flex flex-wrap gap-1.5 pt-1">
								{#each selectedTags as tag (tag.id)}
									<span
										class="border border-ash/20 px-2 py-1 font-mono text-[9px] text-ash uppercase"
									>
										{tag.name}
									</span>
								{/each}
								{#each $updateProductForm.newTagNames as tagName (tagName)}
									<span
										class="border border-ash/20 px-2 py-1 font-mono text-[9px] text-ash uppercase"
									>
										{tagName}
									</span>
								{/each}
							</div>
						{/if}
					</div>

					{#if snapshotWarnings.length > 0}
						<div class="mt-4 border border-yellow-500/20 bg-yellow-950/15 p-3">
							<p
								class="flex items-center gap-1.5 font-sans text-[11px] font-bold tracking-wide text-yellow-400 uppercase"
							>
								<AlertTriangle size={13} /> Merchandising Warnings
							</p>
							<ul class="m-0 mt-2 grid list-none gap-1 p-0">
								{#each snapshotWarnings as warning (warning)}
									<li
										class="flex items-start gap-1 font-sans text-[11px] leading-normal text-ash/85"
									>
										<span class="mt-0.5 text-yellow-500/60">•</span>
										<span>{warning}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>
		</aside>
	</form>
</section>

<div
	class="fixed right-0 bottom-0 left-0 z-40 flex flex-col gap-2.5 border-t border-ash/15 bg-void/95 p-4 shadow-[0_-8px_24px_rgb(0,0,0,0.6)] backdrop-blur sm:flex-row sm:gap-3 lg:hidden"
>
	<AdminButton
		type="button"
		onclick={discardChanges}
		variant="outline"
		class="flex-1"
	>
		Discard changes
	</AdminButton>
	<AdminButton
		type="button"
		onclick={() => {
			const f = document.getElementById('update-product-form') as HTMLFormElement;
			f?.requestSubmit();
		}}
		disabled={$updateProductSubmitting}
		variant="volt"
		class="flex-1"
	>
		{$updateProductSubmitting ? 'Saving...' : 'Save Product'}
	</AdminButton>
</div>

{#if activeImage && activeImageId !== null}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/90 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
	>
		<section
			class="mx-auto my-auto grid w-full max-w-5xl min-w-0 border border-ash/25 bg-void shadow-2xl lg:max-h-[90vh] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
		>
			<div class="relative flex min-h-0 min-w-0 items-center overflow-hidden bg-charcoal/40 group w-full">
				<img
					src={activeImage.imageUrl}
					alt={activeImage.altText ?? ''}
					class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[92vh]"
				/>

				{#if activeVariantImages.length > 1}
					<button
						type="button"
						onclick={() => navigateActiveImage(-1)}
						class="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center bg-void/80 border border-ash/20 text-bone hover:border-volt hover:text-volt transition-colors cursor-pointer select-none"
						aria-label="Previous image"
					>
						&larr;
					</button>
					<button
						type="button"
						onclick={() => navigateActiveImage(1)}
						class="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center bg-void/80 border border-ash/20 text-bone hover:border-volt hover:text-volt transition-colors cursor-pointer select-none"
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
					<button
						type="button"
						onclick={() => (activeImageId = null)}
						class="grid h-9 w-9 shrink-0 cursor-pointer place-items-center border border-ash/30 text-ash transition-colors hover:border-volt hover:text-volt"
						aria-label="Close detail modal"
					>
						<X size={15} aria-hidden="true" />
					</button>
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
		</section>
	</div>
{/if}

<AdminUnsavedChangesModal
	bind:isOpen={showUnsavedModal}
	title="Save before leaving?"
	description="You have unsaved changes. You can save your changes before leaving, or discard them."
	saveLabel="Save Product"
	discardLabel="Discard changes"
	onsave={async () => {
		showUnsavedModal = false;
		if (formElement) {
			formElement.requestSubmit();
		}
	}}
	ondiscard={async () => {
		showUnsavedModal = false;
		await goto(resolve('/app/products'));
	}}
/>
