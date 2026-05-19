<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { generateSlug } from '$lib/shared/slug';
	import {
		AlertTriangle,
		ArrowLeft,
		FolderPlus,
		Layers,
		Plus,
		Save,
		Star,
		Upload,
		X
	} from 'lucide-svelte';
	import { onDestroy, tick } from 'svelte';
	import { filesProxy, superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CreateProductData = PageData['createProductForm']['data'];
	type DraftVariant = CreateProductData['variants'][number];
	type ImageMetadata = CreateProductData['imageMetadata'][number];
	type RedirectTarget = 'products' | 'categories' | 'drops';
	type RedirectPath = '/app/products' | '/app/categories' | '/app/drops';
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
		isTainted: isCreateProductTainted
	} = createProductSuperform;

	const imageFiles = filesProxy(createProductSuperform, 'images');

	let formElement = $state<HTMLFormElement | null>(null);
	let slugManuallyEdited = $state(false);
	let newTagDraft = $state('');
	let pendingRedirect = $state<RedirectTarget | null>(null);
	let activeImageIndex = $state<number | null>(null);
	let imagePreviews = $state<ImagePreview[]>([]);

	const actionMessage = $derived(actionData?.form?.message);
	const dropTierWithoutDrop = $derived(
		$createProductForm.tier === 'drop' && !$createProductForm.dropId
	);
	const selectedDrop = $derived(
		data.drops.find((drop) => drop.id === $createProductForm.dropId) ?? null
	);
	const selectedTags = $derived(
		data.tags.filter((tag) => $createProductForm.tagIds.includes(tag.id))
	);
	const availableTags = $derived(
		data.tags.filter((tag) => !$createProductForm.tagIds.includes(tag.id))
	);
	const activeImage = $derived(
		activeImageIndex === null ? null : (imagePreviews[activeImageIndex] ?? null)
	);

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

	function targetPath(target: RedirectTarget): RedirectPath {
		if (target === 'products') return '/app/products';
		if (target === 'categories') return '/app/categories';
		return '/app/drops';
	}

	function hasDirtyDraft(): boolean {
		return (
			isCreateProductTainted() ||
			imagePreviews.length > 0 ||
			$createProductForm.variants.length > 0 ||
			$createProductForm.tagIds.length > 0 ||
			$createProductForm.newTagNames.length > 0 ||
			newTagDraft.trim().length > 0
		);
	}

	async function handleNavigate(target: RedirectTarget): Promise<void> {
		if (hasDirtyDraft()) {
			pendingRedirect = target;
			return;
		}

		await goto(resolve(targetPath(target)));
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
		const alreadyAdded = $createProductForm.newTagNames.some(
			(tagName) => tagName.toLowerCase() === value.toLowerCase()
		);

		if (!value || alreadyAdded) return;

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

	function handleTierChange(): void {
		if (
			$createProductForm.tier === 'drop' &&
			($createProductForm.basePrice < 3000 || $createProductForm.basePrice > 4500)
		) {
			$createProductForm.basePrice = 3000;
		}

		if (
			$createProductForm.tier === 'core' &&
			($createProductForm.basePrice < 2500 || $createProductForm.basePrice > 3200)
		) {
			$createProductForm.basePrice = 2500;
		}

		if ($createProductForm.tier === 'drop' && !$createProductForm.dropId) {
			$createProductForm.isActive = false;
		}
	}

	function handleDropChange(): void {
		if ($createProductForm.tier === 'drop' && !$createProductForm.dropId) {
			$createProductForm.isActive = false;
		}
	}

	function createVariantDraft(): DraftVariant {
		return {
			clientId: `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			sku: '',
			size: (data.sizeOptions[1]?.value ??
				data.sizeOptions[0]?.value ??
				'M') as DraftVariant['size'],
			color: '',
			colorHex: null,
			priceOverride: null,
			weight: null,
			isActive: true,
			sortOrder: $createProductForm.variants.length
		};
	}

	function addVariant(): void {
		$createProductForm.variants = [...$createProductForm.variants, createVariantDraft()];
	}

	function removeVariant(clientId: string): void {
		$createProductForm.variants = $createProductForm.variants.filter(
			(variant) => variant.clientId !== clientId
		);
		$createProductForm.imageMetadata = $createProductForm.imageMetadata.map((metadata) =>
			metadata.variantClientId === clientId ? { ...metadata, variantClientId: null } : metadata
		);
		normalizePrimaryImageScopes();
	}

	function variantLabel(clientId: string | null | undefined): string {
		if (!clientId) return 'Product image';

		const variant = $createProductForm.variants.find((entry) => entry.clientId === clientId);
		if (!variant) return 'Removed variant';

		const summary = [variant.sku, variant.size, variant.color].filter(Boolean).join(' / ');
		return summary || `Variant ${$createProductForm.variants.indexOf(variant) + 1}`;
	}

	function createDefaultImageMetadata(index: number): ImageMetadata {
		return {
			variantClientId: null,
			altText: $createProductForm.name || null,
			position: index,
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

	function handleImageChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		syncImagePreviews(input.files);
	}

	function syncImagePreviews(files: FileList | null): void {
		const previousMetadata = $createProductForm.imageMetadata;
		revokeImagePreviews();

		imagePreviews = Array.from(files ?? []).map((file) => ({
			url: URL.createObjectURL(file),
			name: file.name,
			size: file.size
		}));
		$createProductForm.imageMetadata = imagePreviews.map((_, index) => ({
			...createDefaultImageMetadata(index),
			...(previousMetadata[index] ?? {})
		}));

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

	function handleImageVariantChange(index: number, event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		updateImageMetadata(index, { variantClientId: value || null });
	}

	function handleImageAltInput(index: number, event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).value.trim();
		updateImageMetadata(index, { altText: value || null });
	}

	function handleImagePositionInput(index: number, event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		updateImageMetadata(index, { position: Number.isFinite(value) ? value : index });
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

	function handleActiveImageVariantChange(event: Event): void {
		if (activeImageIndex === null) return;
		handleImageVariantChange(activeImageIndex, event);
	}

	function handleActiveImageAltInput(event: Event): void {
		if (activeImageIndex === null) return;
		handleImageAltInput(activeImageIndex, event);
	}

	function handleActiveImagePositionInput(event: Event): void {
		if (activeImageIndex === null) return;
		handleImagePositionInput(activeImageIndex, event);
	}

	function markActiveImagePrimary(): void {
		if (activeImageIndex === null) return;
		markPrimaryImage(activeImageIndex);
	}

	function normalizePrimaryImageScopes(preferredIndex?: number): void {
		let metadata = imagePreviews.map((_, index) => ({
			...createDefaultImageMetadata(index),
			...($createProductForm.imageMetadata[index] ?? {})
		}));

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
		const files = Array.from($imageFiles ?? []);
		const transfer = new DataTransfer();

		for (const [fileIndex, file] of files.entries()) {
			if (fileIndex !== index) transfer.items.add(file);
		}

		$imageFiles = transfer.files;
		$createProductForm.imageMetadata = $createProductForm.imageMetadata.filter(
			(_, metadataIndex) => metadataIndex !== index
		);
		activeImageIndex = activeImageIndex === index ? null : activeImageIndex;
		syncImagePreviews(transfer.files);
	}

	async function saveDraftAndRedirect(): Promise<void> {
		if (!pendingRedirect || !formElement) return;

		$createProductForm.redirectTo = pendingRedirect;
		$createProductForm.isActive = false;

		if (pendingRedirect === 'drops') {
			$createProductForm.tier = 'drop';
			$createProductForm.dropId = null;

			if ($createProductForm.basePrice < 3000 || $createProductForm.basePrice > 4500) {
				$createProductForm.basePrice = 3000;
			}
		}

		await tick();
		formElement.requestSubmit();
		pendingRedirect = null;
	}

	async function leaveUnsaved(): Promise<void> {
		if (!pendingRedirect) return;

		await goto(resolve(targetPath(pendingRedirect)));
	}
</script>

<svelte:head>
	<title>New Product | Caro Admin</title>
	<meta
		name="description"
		content="Create a Caro product with media, variants, tags, tier, and drop state."
	/>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<section class="mx-auto max-w-7xl">
	<div class="border-b border-charcoal pb-6 md:pb-8">
		<button
			type="button"
			onclick={() => handleNavigate('products')}
			class="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt"
		>
			<ArrowLeft size={14} aria-hidden="true" />
			Products
		</button>

		<div class="mt-4 min-w-0">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Catalog</p>
			<h1 class="mt-2 font-display text-5xl leading-none text-bone uppercase md:text-7xl">
				New Product
			</h1>
		</div>
	</div>

	{#if actionMessage || $createProductMessage}
		<div class="mt-6 grid gap-2">
			{#each [actionMessage, $createProductMessage].filter(Boolean) as message (message)}
				<p
					class="border border-red-400/30 bg-red-950/20 px-4 py-3 font-mono text-[10px] tracking-widest text-red-300 uppercase"
				>
					{message}
				</p>
			{/each}
		</div>
	{/if}

	<form
		bind:this={formElement}
		method="POST"
		action="?/createProduct"
		enctype="multipart/form-data"
		use:createProductEnhance
		novalidate
		class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
	>
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

		<div class="grid gap-4">
			<section class="border border-charcoal bg-charcoal/25 p-4 sm:p-5">
				<div class="border-b border-charcoal pb-4">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Product</p>
					<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Core Data</h2>
				</div>

				<div class="mt-5 grid gap-5">
					<div class="grid gap-4 md:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Name</span>
							<input
								name="name"
								bind:value={$createProductForm.name}
								oninput={handleNameInput}
								aria-invalid={$createProductErrors.name ? 'true' : undefined}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createProductConstraints.name}
							/>
							{#if $createProductErrors.name}
								<span class="font-mono text-[10px] text-red-300">
									{$createProductErrors.name[0]}
								</span>
							{/if}
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Slug</span>
							<input
								name="slug"
								bind:value={$createProductForm.slug}
								oninput={() => (slugManuallyEdited = true)}
								aria-invalid={$createProductErrors.slug ? 'true' : undefined}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createProductConstraints.slug}
							/>
							{#if $createProductErrors.slug}
								<span class="font-mono text-[10px] text-red-300">
									{$createProductErrors.slug[0]}
								</span>
							{/if}
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Category</span>
							<select
								name="categoryId"
								bind:value={$createProductForm.categoryId}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								<option value="">No category</option>
								{#each data.categories as category (category.id)}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</label>
						<button
							type="button"
							onclick={() => handleNavigate('categories')}
							class="inline-flex min-h-11 items-center justify-center gap-2 self-end border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
						>
							<FolderPlus size={14} aria-hidden="true" />
							Create category
						</button>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Tier</span>
							<select
								name="tier"
								bind:value={$createProductForm.tier}
								onchange={handleTierChange}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								{#each data.tierOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Gender</span>
							<select
								name="gender"
								bind:value={$createProductForm.gender}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								{#each data.genderOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Fit</span>
							<select
								name="fit"
								bind:value={$createProductForm.fit}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								{#each data.fitOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
					</div>

					<div class="grid gap-3 border border-charcoal bg-void/40 p-4">
						<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
							<label class="grid gap-1">
								<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Drop</span>
								<select
									name="dropId"
									bind:value={$createProductForm.dropId}
									onchange={handleDropChange}
									disabled={$createProductForm.tier !== 'drop'}
									class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt disabled:opacity-50"
								>
									<option value="">No drop</option>
									{#each data.drops as drop (drop.id)}
										<option value={drop.id}>{drop.name} / {drop.status}</option>
									{/each}
								</select>
							</label>
							<button
								type="button"
								onclick={() => handleNavigate('drops')}
								class="inline-flex min-h-11 items-center justify-center gap-2 self-end border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
							>
								<Layers size={14} aria-hidden="true" />
								Create drop
							</button>
						</div>
						{#if dropTierWithoutDrop}
							<p
								class="flex items-start gap-2 border border-red-400/30 bg-red-950/20 px-4 py-3 font-mono text-[10px] leading-5 tracking-widest text-red-300 uppercase"
							>
								<AlertTriangle size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
								Add a drop or switch tier to make this product active.
							</p>
						{/if}
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
								>Base price</span
							>
							<input
								name="basePrice"
								type="number"
								bind:value={$createProductForm.basePrice}
								aria-invalid={$createProductErrors.basePrice ? 'true' : undefined}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createProductConstraints.basePrice}
							/>
							{#if $createProductErrors.basePrice}
								<span class="font-mono text-[10px] text-red-300">
									{$createProductErrors.basePrice[0]}
								</span>
							{/if}
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
								>Compare at</span
							>
							<input
								name="compareAtPrice"
								type="number"
								bind:value={$createProductForm.compareAtPrice}
								aria-invalid={$createProductErrors.compareAtPrice ? 'true' : undefined}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createProductConstraints.compareAtPrice}
							/>
							{#if $createProductErrors.compareAtPrice}
								<span class="font-mono text-[10px] text-red-300">
									{$createProductErrors.compareAtPrice[0]}
								</span>
							{/if}
						</label>
					</div>

					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
							>Short description</span
						>
						<textarea
							name="shortDescription"
							rows="3"
							bind:value={$createProductForm.shortDescription}
							class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createProductConstraints.shortDescription}
						></textarea>
					</label>

					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Description</span
						>
						<textarea
							name="description"
							rows="6"
							bind:value={$createProductForm.description}
							class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createProductConstraints.description}
						></textarea>
					</label>

					<div class="grid gap-3 border border-charcoal bg-void/40 p-4 md:grid-cols-3">
						<label
							class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase {dropTierWithoutDrop
								? 'opacity-50'
								: ''}"
						>
							<input
								type="checkbox"
								name="isActive"
								bind:checked={$createProductForm.isActive}
								disabled={dropTierWithoutDrop}
							/>
							Active
						</label>
						<label
							class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
						>
							<input
								type="checkbox"
								name="isFeatured"
								bind:checked={$createProductForm.isFeatured}
							/>
							Featured
						</label>
						<label
							class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
						>
							<input
								type="checkbox"
								name="isNewArrival"
								bind:checked={$createProductForm.isNewArrival}
							/>
							New arrival
						</label>
					</div>
				</div>
			</section>

			<section class="border border-charcoal bg-charcoal/25 p-4 sm:p-5">
				<div
					class="flex flex-col gap-3 border-b border-charcoal pb-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Variants</p>
						<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">
							Sizes & Colors
						</h2>
					</div>
					<button
						type="button"
						onclick={addVariant}
						class="inline-flex min-h-11 items-center justify-center gap-2 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
					>
						<Plus size={14} aria-hidden="true" />
						Add variant
					</button>
				</div>

				{#if $createProductForm.variants.length > 0}
					<div class="mt-4 grid gap-3">
						{#each $createProductForm.variants as variant, index (variant.clientId)}
							<article class="border border-charcoal bg-void p-4">
								<div class="flex items-center justify-between gap-3">
									<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
										Variant {index + 1}
									</p>
									<button
										type="button"
										onclick={() => removeVariant(variant.clientId)}
										class="grid h-9 w-9 place-items-center border border-red-400/40 text-red-300 hover:border-red-300 hover:text-red-200"
										aria-label={`Remove variant ${index + 1}`}
									>
										<X size={14} aria-hidden="true" />
									</button>
								</div>

								<div class="mt-4 grid gap-3 md:grid-cols-3">
									<input
										type="hidden"
										name={`variants[${index}].clientId`}
										bind:value={variant.clientId}
									/>
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">SKU</span
										>
										<input
											name={`variants[${index}].sku`}
											bind:value={variant.sku}
											aria-invalid={$createProductErrors.variants?.[index]?.sku
												? 'true'
												: undefined}
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										/>
										{#if $createProductErrors.variants?.[index]?.sku}
											<span class="font-mono text-[10px] text-red-300">
												{$createProductErrors.variants[index]?.sku?.[0]}
											</span>
										{/if}
									</label>
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
											>Size</span
										>
										<select
											name={`variants[${index}].size`}
											bind:value={variant.size}
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										>
											{#each data.sizeOptions as option (option.value)}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									</label>
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
											>Color</span
										>
										<input
											name={`variants[${index}].color`}
											bind:value={variant.color}
											aria-invalid={$createProductErrors.variants?.[index]?.color
												? 'true'
												: undefined}
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										/>
										{#if $createProductErrors.variants?.[index]?.color}
											<span class="font-mono text-[10px] text-red-300">
												{$createProductErrors.variants[index]?.color?.[0]}
											</span>
										{/if}
									</label>
								</div>

								<div class="mt-3 grid gap-3 md:grid-cols-4">
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Hex</span
										>
										<input
											name={`variants[${index}].colorHex`}
											bind:value={variant.colorHex}
											placeholder="#0A0A0A"
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										/>
									</label>
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
											>Override</span
										>
										<input
											name={`variants[${index}].priceOverride`}
											type="number"
											bind:value={variant.priceOverride}
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										/>
									</label>
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
											>Weight</span
										>
										<input
											name={`variants[${index}].weight`}
											type="number"
											step="0.01"
											bind:value={variant.weight}
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										/>
									</label>
									<label class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
											>Sort</span
										>
										<input
											name={`variants[${index}].sortOrder`}
											type="number"
											bind:value={variant.sortOrder}
											class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
										/>
									</label>
								</div>

								<label
									class="mt-3 flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
								>
									<input
										type="checkbox"
										name={`variants[${index}].isActive`}
										bind:checked={variant.isActive}
									/>
									Active
								</label>
							</article>
						{/each}
					</div>
				{:else}
					<p
						class="mt-4 border border-charcoal bg-void/40 px-4 py-5 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						No variants added.
					</p>
				{/if}
			</section>

			<section class="border border-charcoal bg-charcoal/25 p-4 sm:p-5">
				<div class="border-b border-charcoal pb-4">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Images</p>
					<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">
						Upload & Preview
					</h2>
				</div>

				<label
					class="mt-5 grid min-h-32 cursor-pointer place-items-center border border-dashed border-ash/30 bg-void p-5 text-center hover:border-volt"
				>
					<input
						name="images"
						type="file"
						accept="image/*"
						multiple
						bind:files={$imageFiles}
						onchange={handleImageChange}
						class="sr-only"
					/>
					<span class="grid justify-items-center gap-3">
						<Upload size={22} class="text-volt" aria-hidden="true" />
						<span class="font-mono text-[10px] tracking-widest text-ash uppercase">
							Upload images
						</span>
					</span>
				</label>
				{#if $createProductErrors.images}
					<p class="mt-3 font-mono text-[10px] text-red-300">{$createProductErrors.images[0]}</p>
				{/if}
				{#if $createProductErrors.imageMetadata?._errors}
					<p class="mt-3 font-mono text-[10px] text-red-300">
						{$createProductErrors.imageMetadata._errors[0]}
					</p>
				{/if}

				{#if imagePreviews.length > 0}
					<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3">
						{#each imagePreviews as image, index (image.url)}
							{@const metadata = getImageMetadata(index)}
							<article class="border border-charcoal bg-void">
								<button
									type="button"
									onclick={() => (activeImageIndex = index)}
									class="relative block w-full text-left"
									aria-label={`Open ${image.name}`}
								>
									<img
										src={image.url}
										alt={metadata.altText ?? ''}
										class="aspect-[4/5] w-full object-cover"
									/>
									{#if metadata.isPrimary}
										<span
											class="absolute top-2 left-2 inline-flex min-h-7 items-center gap-1 bg-volt px-2 font-mono text-[8px] tracking-widest text-void uppercase"
										>
											<Star size={11} fill="currentColor" aria-hidden="true" />
											Primary
										</span>
									{/if}
								</button>

								<div class="grid gap-2 p-3">
									<p class="truncate font-mono text-[9px] text-ash uppercase">{image.name}</p>
									<label class="grid gap-1">
										<span class="font-mono text-[8px] tracking-[0.2em] text-ash uppercase"
											>Variant</span
										>
										<select
											name={`imageMetadata[${index}].variantClientId`}
											value={metadata.variantClientId ?? ''}
											onchange={(event) => handleImageVariantChange(index, event)}
											class="min-h-9 border border-charcoal bg-charcoal/30 px-2 font-mono text-[9px] text-bone outline-none focus:border-volt"
										>
											<option value="">Product</option>
											{#each $createProductForm.variants as variant (variant.clientId)}
												<option value={variant.clientId}>{variantLabel(variant.clientId)}</option>
											{/each}
										</select>
									</label>
									<div class="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
										<label class="grid gap-1">
											<span class="font-mono text-[8px] tracking-[0.2em] text-ash uppercase"
												>Alt</span
											>
											<input
												name={`imageMetadata[${index}].altText`}
												value={metadata.altText ?? ''}
												oninput={(event) => handleImageAltInput(index, event)}
												class="min-h-9 min-w-0 border border-charcoal bg-charcoal/30 px-2 font-mono text-[9px] text-bone outline-none focus:border-volt"
											/>
										</label>
										<label class="grid gap-1">
											<span class="font-mono text-[8px] tracking-[0.2em] text-ash uppercase"
												>Pos</span
											>
											<input
												name={`imageMetadata[${index}].position`}
												type="number"
												value={metadata.position}
												oninput={(event) => handleImagePositionInput(index, event)}
												class="min-h-9 min-w-0 border border-charcoal bg-charcoal/30 px-2 font-mono text-[9px] text-bone outline-none focus:border-volt"
											/>
										</label>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<button
											type="button"
											onclick={() => markPrimaryImage(index)}
											aria-pressed={metadata.isPrimary}
											class="inline-flex min-h-9 items-center justify-center gap-1 border px-2 font-mono text-[8px] tracking-widest uppercase {metadata.isPrimary
												? 'border-volt bg-volt text-void'
												: 'border-ash/30 text-ash hover:border-volt hover:text-volt'}"
										>
											<Star
												size={11}
												fill={metadata.isPrimary ? 'currentColor' : 'none'}
												aria-hidden="true"
											/>
											Primary
										</button>
										<button
											type="button"
											onclick={() => removeImage(index)}
											class="inline-flex min-h-9 items-center justify-center gap-1 border border-red-400/40 px-2 font-mono text-[8px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200"
										>
											<X size={11} aria-hidden="true" />
											Remove
										</button>
									</div>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<section class="grid gap-4 border border-charcoal bg-charcoal/25 p-4 sm:p-5">
				<div class="border-b border-charcoal pb-4">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Tags</p>
					<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Product Tags</h2>
				</div>

				{#if selectedTags.length > 0 || $createProductForm.newTagNames.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each selectedTags as tag (tag.id)}
							<button
								type="button"
								onclick={() => removeExistingTag(tag.id)}
								class="inline-flex min-h-9 items-center gap-2 border border-volt bg-volt px-3 font-mono text-[10px] tracking-widest text-void uppercase"
							>
								{tag.name}
								<X size={12} aria-hidden="true" />
							</button>
						{/each}
						{#each $createProductForm.newTagNames as tagName (tagName)}
							<button
								type="button"
								onclick={() => removeNewTag(tagName)}
								class="inline-flex min-h-9 items-center gap-2 border border-charcoal px-3 font-mono text-[10px] tracking-widest text-bone uppercase hover:border-red-400 hover:text-red-300"
							>
								{tagName}
								<X size={12} aria-hidden="true" />
							</button>
						{/each}
					</div>
				{/if}

				<div class="grid gap-2">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Existing tags</span
					>
					{#if availableTags.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each availableTags as tag (tag.id)}
								<button
									type="button"
									onclick={() => addExistingTag(tag.id)}
									class="inline-flex min-h-9 items-center border border-ash/30 px-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
								>
									{tag.name}
								</button>
							{/each}
						</div>
					{:else}
						<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
							All existing tags selected.
						</p>
					{/if}
				</div>

				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">New tags</span>
					<div class="flex gap-2">
						<input
							bind:value={newTagDraft}
							onkeydown={handleNewTagKeydown}
							class="min-h-11 min-w-0 flex-1 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						/>
						<button
							type="button"
							onclick={addNewTag}
							class="inline-flex min-h-11 w-11 items-center justify-center border border-ash/30 text-ash hover:border-volt hover:text-volt"
							aria-label="Add tag"
						>
							<Plus size={15} aria-hidden="true" />
						</button>
					</div>
				</label>
			</section>

			<details class="border border-charcoal bg-charcoal/25 p-4 sm:p-5">
				<summary class="cursor-pointer font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
					Material & Care
				</summary>
				<div class="mt-4 grid gap-4">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Material</span>
						<input
							name="material"
							bind:value={$createProductForm.material}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createProductConstraints.material}
						/>
					</label>
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Care</span>
						<textarea
							name="careInstructions"
							rows="4"
							bind:value={$createProductForm.careInstructions}
							class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createProductConstraints.careInstructions}
						></textarea>
					</label>
				</div>
			</details>

			<details class="border border-charcoal bg-charcoal/25 p-4 sm:p-5">
				<summary class="cursor-pointer font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
					SEO
				</summary>
				<div class="mt-4 grid gap-4">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Meta title</span>
						<input
							name="metaTitle"
							bind:value={$createProductForm.metaTitle}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createProductConstraints.metaTitle}
						/>
					</label>
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
							>Meta description</span
						>
						<textarea
							name="metaDescription"
							rows="4"
							bind:value={$createProductForm.metaDescription}
							class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createProductConstraints.metaDescription}
						></textarea>
					</label>
				</div>
			</details>

			<button
				type="submit"
				disabled={$createProductSubmitting}
				class="inline-flex min-h-12 items-center justify-center gap-2 bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone disabled:opacity-50"
			>
				<Save size={14} aria-hidden="true" />
				{$createProductSubmitting ? 'Saving...' : 'Create product'}
			</button>
		</div>

		<aside class="grid gap-4 xl:sticky xl:top-8 xl:self-start">
			<div class="border border-charcoal bg-void p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Snapshot</p>
				<div class="mt-4 grid gap-3 font-mono text-[10px] uppercase">
					<div class="flex justify-between gap-4">
						<span class="text-ash">Price</span>
						<span class="text-right text-bone">{formatMoney($createProductForm.basePrice)}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">Tier</span>
						<span class="text-right text-bone">{formatLabel($createProductForm.tier)}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">Drop</span>
						<span class="text-right text-bone">{selectedDrop?.name ?? 'None'}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">Variants</span>
						<span class="text-right text-bone">{$createProductForm.variants.length}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">Images</span>
						<span class="text-right text-bone">{imagePreviews.length}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">State</span>
						<span class="text-right {$createProductForm.isActive ? 'text-volt' : 'text-red-300'}">
							{$createProductForm.isActive ? 'Active' : 'Inactive'}
						</span>
					</div>
				</div>
			</div>
		</aside>
	</form>
</section>

{#if activeImage && activeImageIndex !== null}
	{@const metadata = getImageMetadata(activeImageIndex)}
	<div class="fixed inset-0 z-50 grid place-items-center bg-void/85 px-4 py-6">
		<section
			class="grid max-h-[92vh] w-full max-w-5xl overflow-hidden border border-charcoal bg-void shadow-2xl lg:grid-cols-[minmax(0,1fr)_340px]"
		>
			<div class="min-h-0 overflow-auto bg-charcoal/40">
				<img
					src={activeImage.url}
					alt={metadata.altText ?? ''}
					class="mx-auto max-h-[92vh] w-full object-contain"
				/>
			</div>
			<div class="grid content-start gap-4 overflow-auto p-5">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Image detail</p>
						<h2 class="mt-2 truncate font-display text-4xl leading-none text-bone uppercase">
							{activeImage.name}
						</h2>
						<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
							{formatFileSize(activeImage.size)}
						</p>
					</div>
					<button
						type="button"
						onclick={() => (activeImageIndex = null)}
						class="grid h-10 w-10 place-items-center border border-ash/30 text-ash hover:border-volt hover:text-volt"
						aria-label="Close image detail"
					>
						<X size={15} aria-hidden="true" />
					</button>
				</div>

				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Variant</span>
					<select
						value={metadata.variantClientId ?? ''}
						onchange={handleActiveImageVariantChange}
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
					>
						<option value="">Product image</option>
						{#each $createProductForm.variants as variant (variant.clientId)}
							<option value={variant.clientId}>{variantLabel(variant.clientId)}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Alt text</span>
					<input
						value={metadata.altText ?? ''}
						oninput={handleActiveImageAltInput}
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
					/>
				</label>
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Position</span>
					<input
						type="number"
						value={metadata.position}
						oninput={handleActiveImagePositionInput}
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
					/>
				</label>
				<button
					type="button"
					onclick={markActiveImagePrimary}
					class="inline-flex min-h-11 items-center justify-center gap-2 border px-4 font-mono text-[10px] tracking-widest uppercase {metadata.isPrimary
						? 'border-volt bg-volt text-void'
						: 'border-ash/30 text-ash hover:border-volt hover:text-volt'}"
				>
					<Star size={14} fill={metadata.isPrimary ? 'currentColor' : 'none'} aria-hidden="true" />
					Primary for {variantLabel(metadata.variantClientId)}
				</button>
			</div>
		</section>
	</div>
{/if}

{#if pendingRedirect}
	<div class="fixed inset-0 z-50 grid place-items-center bg-void/80 px-4">
		<section class="w-full max-w-lg border border-charcoal bg-void p-5 shadow-2xl">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Leave product</p>
			<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Save inactive?</h2>
			<p class="mt-4 text-sm leading-6 text-ash">
				Create an inactive product before opening {pendingRedirect === 'products'
					? 'products'
					: pendingRedirect === 'drops'
						? 'drops'
						: 'categories'}, or leave this product unsaved.
			</p>
			<div class="mt-6 grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					onclick={saveDraftAndRedirect}
					class="inline-flex min-h-11 items-center justify-center gap-2 bg-volt px-4 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
				>
					<Save size={14} aria-hidden="true" />
					Save inactive
				</button>
				<button
					type="button"
					onclick={leaveUnsaved}
					class="min-h-11 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
				>
					Leave unsaved
				</button>
			</div>
			<button
				type="button"
				onclick={() => (pendingRedirect = null)}
				class="mt-3 min-h-11 w-full border border-charcoal px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-bone"
			>
				Cancel
			</button>
		</section>
	</div>
{/if}
