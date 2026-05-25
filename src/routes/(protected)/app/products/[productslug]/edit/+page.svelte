<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertTriangle, ArrowLeft, ImageOff, Plus, Save, Star, Trash2, Upload, X } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

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
		submitting: updateProductSubmitting
	} = superForm(
		initialForm(() => data.updateProductForm),
		{
			resetForm: false
		}
	);

	const {
		form: createVariantForm,
		errors: createVariantErrors,
		constraints: createVariantConstraints,
		message: createVariantMessage,
		enhance: createVariantEnhance,
		submitting: createVariantSubmitting
	} = superForm(initialForm(() => data.createVariantForm));

	const {
		form: updateVariantForm,
		constraints: updateVariantConstraints,
		message: updateVariantMessage,
		enhance: updateVariantEnhance,
		submitting: updateVariantSubmitting
	} = superForm(
		initialForm(() => data.updateVariantForm),
		{
			resetForm: false
		}
	);

	const {
		message: deleteVariantMessage,
		enhance: deleteVariantEnhance,
		submitting: deleteVariantSubmitting
	} = superForm(initialForm(() => data.deleteVariantForm));

	const {
		form: addImageForm,
		errors: addImageErrors,
		constraints: addImageConstraints,
		message: addImageMessage,
		enhance: addImageEnhance,
		submitting: addImageSubmitting
	} = superForm(initialForm(() => data.addImageForm));

	const {
		message: setPrimaryImageMessage,
		enhance: setPrimaryImageEnhance,
		submitting: setPrimaryImageSubmitting
	} = superForm(initialForm(() => data.setPrimaryImageForm));

	const {
		message: deleteImageMessage,
		enhance: deleteImageEnhance,
		submitting: deleteImageSubmitting
	} = superForm(initialForm(() => data.deleteImageForm));

	const {
		message: reorderImagesMessage,
		enhance: reorderImagesEnhance,
		submitting: reorderImagesSubmitting
	} = superForm(
		initialForm(() => data.reorderImagesForm),
		{
			resetForm: false
		}
	);

	const {
		enhance: createVariantColorEnhance,
		submitting: createVariantColorSubmitting
	} = superForm(initialForm(() => data.createVariantColorForm));

	const {
		enhance: updateVariantColorEnhance,
		submitting: updateVariantColorSubmitting
	} = superForm(initialForm(() => data.updateVariantColorForm));

	const {
		enhance: deleteVariantColorEnhance,
		submitting: deleteVariantColorSubmitting
	} = superForm(initialForm(() => data.deleteVariantColorForm));

	const product = $derived(data.product);
	const uniqueColors = $derived(
		Array.from(
			new Map(
				product.variants.map((v) => [
					v.variantColorId,
					{ id: v.variantColorId, name: v.color, hex: v.colorHex }
				])
			).values()
		)
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

	let newTagDraft = $state('');
	const dropTierWithoutDrop = $derived(
		$updateProductForm.tier === 'drop' && !$updateProductForm.dropId
	);
	const primaryImage = $derived(
		product.images.find((image) => image.isPrimary) ?? product.images[0] ?? null
	);
	const activeVariantCount = $derived(
		product.variants.filter((variant) => variant.isActive).length
	);
	const actionMessage = $derived(actionData?.form?.message);

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

	function variantLabel(variant: PageData['product']['variants'][number]): string {
		return `${variant.size} / ${variant.color}`;
	}

	function variantSortOptions(includeNext = false): number[] {
		const length = product.variants.length + (includeNext ? 1 : 0);
		return Array.from({ length: Math.max(1, length) }, (_, index) => index + 1);
	}

	function addNewTag(): void {
		const value = newTagDraft.trim();
		if (!value || $updateProductForm.newTagNames.includes(value)) return;

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

	$effect(() => {
		if (dropTierWithoutDrop) {
			$updateProductForm.isActive = false;
		}
	});

	function imagesForColorCard(variantColorId: string) {
		return product.images.filter((image) => image.variantId === variantColorId);
	}
</script>

<svelte:head>
	<title>{product.name} | Products | Caro Admin</title>
	<meta
		name="description"
		content="Edit product details, variants, images, merchandising flags, and product publishing state."
	/>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

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
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Product edit</p>
				<h1
					class="mt-2 truncate font-display text-5xl leading-none text-bone uppercase md:text-7xl"
				>
					{product.name}
				</h1>
				<p class="mt-2 truncate font-mono text-[10px] tracking-widest text-ash uppercase">
					{product.slug}
				</p>
			</div>

			<div class="mt-5 grid grid-cols-2 gap-3 text-right md:mt-0 md:grid-cols-4">
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">State</p>
					<p
						class="mt-1 font-display text-3xl uppercase {product.isActive
							? 'text-volt'
							: 'text-red-300'}"
					>
						{product.isActive ? 'Live' : 'Off'}
					</p>
				</div>
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Price</p>
					<p class="mt-1 font-display text-3xl text-bone uppercase">
						{formatMoney(product.basePrice).replace('LKR ', '')}
					</p>
				</div>
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Variants</p>
					<p class="mt-1 font-display text-3xl text-bone uppercase">{activeVariantCount}</p>
				</div>
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Images</p>
					<p class="mt-1 font-display text-3xl text-bone uppercase">{product.images.length}</p>
				</div>
			</div>
		</div>
	</div>

	{#if actionMessage || $updateProductMessage || $createVariantMessage || $updateVariantMessage || $deleteVariantMessage || $addImageMessage || $setPrimaryImageMessage || $deleteImageMessage || $reorderImagesMessage}
		<div class="mt-6 grid gap-2">
			{#each [actionMessage, $updateProductMessage, $createVariantMessage, $updateVariantMessage, $addImageMessage, $setPrimaryImageMessage, $reorderImagesMessage].filter(Boolean) as message (message)}
				<p
					class="border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
				>
					{message}
				</p>
			{/each}
			{#each [$deleteVariantMessage, $deleteImageMessage].filter(Boolean) as message (message)}
				<p
					class="border border-red-400/30 bg-red-950/20 px-4 py-3 font-mono text-[10px] tracking-widest text-red-300 uppercase"
				>
					{message}
				</p>
			{/each}
		</div>
	{/if}

	<div class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
		<form
			method="POST"
			action="?/updateProduct"
			use:updateProductEnhance
			class="border border-charcoal bg-charcoal/25 p-5"
		>
			{#each $updateProductForm.newTagNames as tagName (tagName)}
				<input type="hidden" name="newTagNames" value={tagName} />
			{/each}

			<div class="border-b border-charcoal pb-4">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Core</p>
				<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Product Data</h2>
			</div>

			<div class="mt-5 grid gap-5">
				<div class="grid gap-4 md:grid-cols-2">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Name</span>
						<input
							name="name"
							bind:value={$updateProductForm.name}
							aria-invalid={$updateProductErrors.name ? 'true' : undefined}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$updateProductConstraints.name}
						/>
					</label>
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Slug</span>
						<input
							name="slug"
							bind:value={$updateProductForm.slug}
							aria-invalid={$updateProductErrors.slug ? 'true' : undefined}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$updateProductConstraints.slug}
						/>
					</label>
				</div>
				{#if $updateProductErrors.name}
					<p class="font-mono text-[10px] text-red-300">{$updateProductErrors.name[0]}</p>
				{/if}
				{#if $updateProductErrors.slug}
					<p class="font-mono text-[10px] text-red-300">{$updateProductErrors.slug[0]}</p>
				{/if}

				<div class="grid gap-4 md:grid-cols-3">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Category</span>
						<select
							name="categoryId"
							bind:value={$updateProductForm.categoryId}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						>
							<option value="">No category</option>
							{#each data.categories as category (category.id)}
								<option value={category.id}>{category.name}</option>
							{/each}
						</select>
					</label>
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Tier</span>
						<select
							name="tier"
							bind:value={$updateProductForm.tier}
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
							bind:value={$updateProductForm.gender}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						>
							{#each data.genderOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
				</div>

				{#if $updateProductForm.tier === 'drop'}
					<div class="grid gap-3 border border-charcoal bg-void/40 p-4">
						<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
							<label class="grid flex-1 gap-1">
								<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Drop</span>
								<select
									name="dropId"
									bind:value={$updateProductForm.dropId}
									class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								>
									<option value="">No drop</option>
									{#each data.drops as drop (drop.id)}
										<option value={drop.id}>{drop.name} / {drop.status}</option>
									{/each}
								</select>
							</label>
							<a
								href={resolve('/app/drops')}
								class="inline-flex min-h-11 items-center justify-center gap-2 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
							>
								<Plus size={13} aria-hidden="true" />
								Create drop
							</a>
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
				{/if}

				<div class="grid gap-4">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Fit</span>
						<select
							name="fit"
							bind:value={$updateProductForm.fit}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						>
							{#each data.fitOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
				</div>

				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
						>Short description</span
					>
					<textarea
						name="shortDescription"
						rows="3"
						bind:value={$updateProductForm.shortDescription}
						class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						{...$updateProductConstraints.shortDescription}
					></textarea>
				</label>

				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Description</span>
					<textarea
						name="description"
						rows="6"
						bind:value={$updateProductForm.description}
						class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						{...$updateProductConstraints.description}
					></textarea>
				</label>

				<details class="border border-charcoal bg-void/40 p-4">
					<summary class="cursor-pointer font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
						Secondary and SEO
					</summary>
					<div class="mt-4 grid gap-4">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Material</span>
							<input
								name="material"
								bind:value={$updateProductForm.material}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateProductConstraints.material}
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
								>Care instructions</span
							>
							<textarea
								name="careInstructions"
								rows="3"
								bind:value={$updateProductForm.careInstructions}
								class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateProductConstraints.careInstructions}
							></textarea>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
								>Meta title</span
							>
							<input
								name="metaTitle"
								bind:value={$updateProductForm.metaTitle}
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateProductConstraints.metaTitle}
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
								>Meta description</span
							>
							<textarea
								name="metaDescription"
								rows="3"
								bind:value={$updateProductForm.metaDescription}
								class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateProductConstraints.metaDescription}
							></textarea>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Tags</span>
							<select
								name="tagIds"
								multiple
								bind:value={$updateProductForm.tagIds}
								class="min-h-32 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								{#each data.tags as tag (tag.id)}
									<option value={tag.id}>{tag.name}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">New tags</span>
							<div class="flex gap-2">
								<input
									bind:value={newTagDraft}
									onkeydown={handleNewTagKeydown}
									class="min-h-11 flex-1 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
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
						{#if $updateProductForm.newTagNames.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each $updateProductForm.newTagNames as tagName (tagName)}
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
					</div>
				</details>

				<div class="flex flex-wrap items-center gap-x-6 gap-y-3 border border-charcoal bg-void/40 p-3 md:p-4">
					<label
						class="flex items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase cursor-pointer hover:text-bone {dropTierWithoutDrop
							? 'opacity-50 cursor-not-allowed'
							: ''}"
					>
						<input
							type="checkbox"
							name="isActive"
							bind:checked={$updateProductForm.isActive}
							disabled={dropTierWithoutDrop}
							class="h-4 w-4 border-charcoal bg-void text-volt outline-none focus:ring-0 cursor-pointer"
						/>
						Active
					</label>
					<label
						class="flex items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase cursor-pointer hover:text-bone"
					>
						<input
							type="checkbox"
							name="isFeatured"
							bind:checked={$updateProductForm.isFeatured}
							class="h-4 w-4 border-charcoal bg-void text-volt outline-none focus:ring-0 cursor-pointer"
						/>
						Featured
					</label>
					<label
						class="flex items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase cursor-pointer hover:text-bone"
					>
						<input
							type="checkbox"
							name="isNewArrival"
							bind:checked={$updateProductForm.isNewArrival}
							class="h-4 w-4 border-charcoal bg-void text-volt outline-none focus:ring-0 cursor-pointer"
						/>
						New arrival
					</label>
				</div>

				<button
					type="submit"
					disabled={$updateProductSubmitting}
					class="min-h-11 bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-volt disabled:opacity-50"
				>
					{$updateProductSubmitting ? 'Saving...' : 'Save product'}
				</button>
			</div>
		</form>

		<aside class="grid gap-4 xl:sticky xl:top-8 xl:self-start">
			<div class="border border-charcoal bg-void">
				{#if primaryImage}
					<img
						src={primaryImage.imageUrl}
						alt={primaryImage.altText ?? ''}
						class="aspect-[4/5] w-full object-cover"
					/>
				{:else}
					<div
						class="grid aspect-[4/5] place-items-center border-b border-charcoal bg-charcoal/30 text-ash"
					>
						<ImageOff size={28} aria-hidden="true" />
					</div>
				{/if}
				<div class="p-5">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Snapshot</p>
					<div class="mt-4 grid gap-3 font-mono text-[10px] uppercase">
						<div class="flex justify-between gap-4">
							<span class="text-ash">Category</span>
							<span class="text-right text-bone">{product.category?.name ?? 'No category'}</span>
						</div>
						<div class="flex justify-between gap-4">
							<span class="text-ash">Tier</span>
							<span class="text-right text-bone">{formatLabel(product.tier)}</span>
						</div>
						<div class="flex justify-between gap-4">
							<span class="text-ash">Gender / Fit</span>
							<span class="text-right text-bone">
								{formatLabel(product.gender)} / {formatLabel(product.fit)}
							</span>
						</div>
						<div class="flex justify-between gap-4">
							<span class="text-ash">Images</span>
							<span class="text-right text-bone">{product.images.length}</span>
						</div>
					</div>
				</div>
			</div>

			<div class="border border-charcoal bg-charcoal/25 p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Flags</p>
				<div class="mt-4 flex flex-wrap gap-2">
					<span
						class="border border-charcoal px-3 py-2 font-mono text-[10px] tracking-widest uppercase {product.isActive
							? 'text-volt'
							: 'text-red-300'}"
					>
						{product.isActive ? 'Active' : 'Inactive'}
					</span>
					{#if product.isFeatured}
						<span
							class="border border-charcoal px-3 py-2 font-mono text-[10px] tracking-widest text-bone uppercase"
						>
							Featured
						</span>
					{/if}
					{#if product.isNewArrival}
						<span
							class="border border-charcoal px-3 py-2 font-mono text-[10px] tracking-widest text-ash uppercase"
						>
							New arrival
						</span>
					{/if}
				</div>
			</div>
		</aside>
	</div>

	<div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
		<section class="grid gap-4 xl:col-span-2">
			<div class="border border-charcoal bg-charcoal/25 p-5">
				<div class="border-b border-charcoal pb-4">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Variants</p>
					<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Colors & Sizes</h2>
				</div>

				{#if colorCards.length > 0}
					<div class="mt-4 grid gap-4">
						{#each colorCards as card, index (card.variantColorId)}
							<article class="border border-charcoal bg-void p-4">
								<form
									method="POST"
									action="?/updateProductVariantColor"
									use:updateVariantColorEnhance
									class="grid gap-4"
								>
									<div class="flex items-center justify-between gap-3 border-b border-charcoal pb-3 mb-2">
										<h3 class="font-display text-2xl text-bone uppercase">
											Color Variant: {card.color || `Variant ${index + 1}`}
										</h3>
										<input type="hidden" name="variantColorId" value={card.variantColorId} />
										<button
											type="submit"
											disabled={$updateVariantColorSubmitting}
											class="inline-flex min-h-9 items-center justify-center gap-1.5 border border-ash/30 px-3 font-mono text-[9px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt cursor-pointer"
										>
											<Save size={12} aria-hidden="true" />
											Save Details
										</button>
									</div>

									<div class="grid gap-4 md:grid-cols-3">
										<label class="grid gap-1">
											<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color Name</span>
											<input
												name="color"
												value={card.color}
												placeholder="e.g. Void Black"
												required
												class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
											/>
										</label>

										<label class="grid gap-1">
											<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color Hex</span>
											<div class="grid grid-cols-[minmax(0,1fr)_44px]">
												<input
													name="colorHex"
													value={card.colorHex ?? ''}
													placeholder="#000000"
													class="min-h-11 min-w-0 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
												/>
												<span
													class="grid min-h-11 place-items-center border border-l-0 border-charcoal bg-charcoal/40"
													aria-hidden="true"
												>
													{#if isValidHex(card.colorHex)}
														<span
															class="h-5 w-5 border border-ash/30"
															style:background={card.colorHex}
														></span>
													{/if}
												</span>
											</div>
										</label>

										<label class="grid gap-1">
											<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Sort Order</span>
											<select
												name="sortOrder"
												value={card.variants[0]?.sortOrder ?? index + 1}
												class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
											>
												{#each Array.from({ length: colorCards.length }, (_, i) => i + 1) as sortValue}
													<option value={sortValue}>{sortValue}</option>
												{/each}
											</select>
										</label>
									</div>

									<div class="grid gap-4 md:grid-cols-2">
										<label class="grid gap-1">
											<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Base Price</span>
											<input
												type="number"
												name="basePrice"
												value={card.basePrice}
												required
												class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
											/>
										</label>

										<label class="grid gap-1">
											<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Discounted Price / Compare At</span>
											<input
												type="number"
												name="compareAtPrice"
												value={card.compareAtPrice ?? ''}
												class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
											/>
										</label>
									</div>
								</form>

								<div class="mt-4 border-t border-charcoal/40 pt-4">
									<div class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Sizes Available (Click to Toggle)</span>
										<div class="flex flex-wrap gap-2 mt-1">
											{#each data.sizeOptions as sizeOpt}
												{@const existingVar = card.variants.find((v) => v.size === sizeOpt.value)}
												{#if existingVar}
													<form
														method="POST"
														action="?/deleteProductVariant"
														use:deleteVariantEnhance
														class="inline"
													>
														<input type="hidden" name="variantId" value={existingVar.id} />
														<button
															type="submit"
															disabled={$deleteVariantSubmitting}
															class="min-h-9 px-3 font-mono text-[10px] tracking-wider border transition-all uppercase bg-volt border-volt text-void font-bold cursor-pointer hover:bg-bone hover:border-bone"
															title="Click to remove size"
														>
															{sizeOpt.label}
														</button>
													</form>
												{:else}
													<form
														method="POST"
														action="?/createProductVariant"
														use:createVariantEnhance
														class="inline"
													>
														<input type="hidden" name="size" value={sizeOpt.value} />
														<input type="hidden" name="variantColorId" value={card.variantColorId} />
														<input type="hidden" name="isActive" value="true" />
														<input type="hidden" name="sortOrder" value={card.variants.length + 1} />
														<button
															type="submit"
															disabled={$createVariantSubmitting}
															class="min-h-9 px-3 font-mono text-[10px] tracking-wider border transition-all uppercase bg-void border-charcoal text-ash hover:border-volt hover:text-volt cursor-pointer"
															title="Click to add size"
														>
															{sizeOpt.label}
														</button>
													</form>
												{/if}
											{/each}
										</div>
									</div>
								</div>

								<div class="mt-4 border-t border-charcoal/40 pt-4">
									<div class="grid gap-1">
										<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Variant-specific Images ({imagesForColorCard(card.variantColorId).length})</span>
										
										<div class="flex items-center gap-3 mt-2">
											<form
												method="POST"
												action="?/addProductImage"
												enctype="multipart/form-data"
												use:addImageEnhance
											>
												<input type="hidden" name="productId" value={product.id} />
												<input type="hidden" name="variantId" value={card.variantColorId} />
												<input type="hidden" name="position" value={imagesForColorCard(card.variantColorId).length + 1} />
												<input type="hidden" name="isPrimary" value={imagesForColorCard(card.variantColorId).length === 0 ? 'true' : 'false'} />
												<label
													class="relative inline-flex min-h-11 items-center justify-center gap-2 border border-dashed border-ash/30 bg-void px-4 font-mono text-[10px] tracking-widest text-ash uppercase cursor-pointer hover:border-volt hover:text-volt"
												>
													<input
														type="file"
														name="image"
														accept="image/*"
														onchange={(e) => e.currentTarget.form?.requestSubmit()}
														class="hidden"
													/>
													<Upload size={14} class="text-volt" aria-hidden="true" />
													Upload variant image
												</label>
											</form>
										</div>

										{#if imagesForColorCard(card.variantColorId).length > 0}
											<div class="flex flex-wrap gap-3 mt-3">
												{#each imagesForColorCard(card.variantColorId) as img}
													{@const imgIndex = product.images.indexOf(img)}
													<div class="relative block group border border-charcoal hover:border-volt">
														<button
															type="button"
															onclick={() => (activeImageIndex = imgIndex)}
															class="block cursor-pointer"
														>
															<img src={img.imageUrl} alt="" class="h-16 w-16 object-cover" />
														</button>
														{#if img.isPrimary}
															<span class="absolute top-1 left-1 bg-volt text-void px-1 py-0.5 text-[6px] font-mono leading-none uppercase">Primary</span>
														{/if}
														<form
															method="POST"
															action="?/deleteProductImage"
															use:deleteImageEnhance
															class="absolute -top-1 -right-1 hidden group-hover:block"
														>
															<input type="hidden" name="imageId" value={img.id} />
															<button
																type="submit"
																disabled={$deleteImageSubmitting}
																class="grid h-4 w-4 place-items-center bg-red-600 text-white rounded-full text-[8px] cursor-pointer hover:bg-red-500"
																title="Delete image"
															>
																×
															</button>
														</form>
													</div>
												{/each}
											</div>
										{:else}
											<p class="font-mono text-[9px] tracking-wider text-ash/60 uppercase mt-1">
												No images uploaded for this color variant.
											</p>
										{/if}
									</div>
								</div>

								{#if colorCards.length > 1}
									<div class="mt-4 border-t border-charcoal/40 pt-4 flex justify-end">
										<form
											method="POST"
											action="?/deleteProductVariantColor"
											use:deleteVariantColorEnhance
										>
											<input type="hidden" name="variantColorId" value={card.variantColorId} />
											<button
												type="submit"
												disabled={$deleteVariantColorSubmitting}
												class="inline-flex min-h-9 items-center justify-center gap-1.5 border border-red-400/40 px-3 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200 cursor-pointer"
											>
												<Trash2 size={12} aria-hidden="true" />
												Delete Color Card
											</button>
										</form>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{:else}
					<p class="mt-4 border border-charcoal bg-void/40 px-4 py-5 font-mono text-[10px] tracking-widest text-ash uppercase">
						No variants added.
					</p>
				{/if}
			</div>

			<form
				method="POST"
				action="?/createProductVariantColor"
				use:createVariantColorEnhance
				class="border border-charcoal bg-charcoal/25 p-5 mt-4"
			>
				<h3 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Add Color Swatch</h3>
				<div class="mt-5 grid gap-3">
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color Name</span>
							<input
								name="color"
								placeholder="e.g. Void Black"
								required
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color Hex</span>
							<input
								name="colorHex"
								placeholder="e.g. #0A0A0A"
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							/>
						</label>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Base Price</span>
							<input
								type="number"
								name="basePrice"
								required
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Discounted Price / Compare At</span>
							<input
								type="number"
								name="compareAtPrice"
								class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							/>
						</label>
					</div>
					<button
						type="submit"
						disabled={$createVariantColorSubmitting}
						class="min-h-11 bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt disabled:opacity-50 cursor-pointer"
					>
						{$createVariantColorSubmitting ? 'Saving...' : 'Add Color Swatch'}
					</button>
				</div>
			</form>
		</section>
	</div>

	<div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
		<section class="border border-charcoal bg-charcoal/25">
			<div class="border-b border-charcoal p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Media</p>
				<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Images</h2>
			</div>

			{#if product.images.length > 0}
				<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each product.images as image, idx (image.id)}
						<button
							type="button"
							onclick={() => (activeImageIndex = idx)}
							class="border border-charcoal bg-void text-left block hover:border-volt transition-colors w-full cursor-pointer"
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
								<p class="truncate font-mono text-[10px] text-ash uppercase">
									{image.altText ?? 'No alt text'}
								</p>
								<p class="mt-1 font-mono text-[9px] tracking-widest text-ash/60 uppercase">
									Position {image.position} / {#if image.variantId}
										{@const variantColor = uniqueColors.find(c => c.id === image.variantId)}
										<span class="text-volt">{variantColor?.name ?? 'Color Variant'}</span>
									{:else}
										Product-wide
									{/if}
								</p>
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<div class="p-10 text-center">
					<ImageOff size={28} class="mx-auto text-ash/50" aria-hidden="true" />
					<p class="mt-4 font-display text-4xl text-bone uppercase">No images</p>
					<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
						Upload product photography before launch.
					</p>
				</div>
			{/if}

			<form
				method="POST"
				action="?/reorderProductImages"
				use:reorderImagesEnhance
				class="border-t border-charcoal p-5"
			>
				<input type="hidden" name="productId" value={product.id} />
				{#each product.images as image (image.id)}
					<input type="hidden" name="imageIdsInOrder" value={image.id} />
				{/each}
				<button
					type="submit"
					disabled={$reorderImagesSubmitting || product.images.length === 0}
					class="min-h-11 border border-ash/30 px-5 py-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt disabled:opacity-40 cursor-pointer"
				>
					Save current order
				</button>
			</form>
		</section>

		<form
			method="POST"
			action="?/addProductImage"
			enctype="multipart/form-data"
			use:addImageEnhance
			class="border border-charcoal bg-void p-5 xl:sticky xl:top-8 xl:self-start"
		>
			<input type="hidden" name="productId" value={product.id} />
			<h3 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Add image</h3>
			<div class="mt-5 grid gap-3">
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Variant Link</span>
					<select
						name="variantId"
						bind:value={$addImageForm.variantId}
						class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
					>
						<option value="">Product image</option>
						{#each uniqueColors as colorCard (colorCard.id)}
							<option value={colorCard.id}>{colorCard.name}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Image</span>
					<input
						name="image"
						type="file"
						accept="image/*"
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-ash file:mr-4 file:border-0 file:bg-bone file:px-3 file:py-2 file:font-mono file:text-[10px] file:text-void file:uppercase cursor-pointer"
						{...$addImageConstraints.image}
					/>
				</label>
				{#if $addImageErrors.image}
					<p class="font-mono text-[10px] text-red-300">{$addImageErrors.image[0]}</p>
				{/if}
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Alt text</span>
					<input
						name="altText"
						bind:value={$addImageForm.altText}
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						{...$addImageConstraints.altText}
					/>
				</label>
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Display order</span>
					<select
						name="position"
						bind:value={$addImageForm.position}
						class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
					>
						{#each Array.from({ length: product.images.length + 1 }, (_, index) => index + 1) as positionValue (positionValue)}
							<option value={positionValue}>{positionValue}</option>
						{/each}
					</select>
				</label>
				<label
					class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase cursor-pointer"
				>
					<input type="checkbox" name="isPrimary" bind:checked={$addImageForm.isPrimary} />
					Primary
				</label>
				<button
					type="submit"
					disabled={$addImageSubmitting}
					class="inline-flex min-h-11 items-center justify-center gap-2 bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt disabled:opacity-50 cursor-pointer"
				>
					<Upload size={14} aria-hidden="true" />
					{$addImageSubmitting ? 'Uploading...' : 'Add image'}
				</button>
			</div>
		</form>
	</div>
</section>

{#if activeImage && activeImageIndex !== null}
	<div
		class="fixed inset-0 z-50 overflow-y-auto bg-void/85 px-3 py-4 sm:px-4 sm:py-6 flex justify-center items-start"
	>
		<section
			class="my-auto mx-auto grid w-full max-w-5xl min-w-0 border border-charcoal bg-void shadow-2xl lg:max-h-[90vh] lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]"
		>
			<div class="min-h-0 min-w-0 overflow-hidden bg-charcoal/40">
				<img
					src={activeImage.imageUrl}
					alt={activeImage.altText ?? ''}
					class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[92vh]"
				/>
			</div>
			<div
				class="grid min-w-0 content-start gap-4 p-4 sm:p-5"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Image detail</p>
						<h2
							class="mt-2 font-display text-3xl leading-none wrap-break-words text-bone uppercase sm:text-4xl"
						>
							{activeImage.altText ?? 'Product Image'}
						</h2>
						{#if activeImage.variantId}
							{@const variantColor = uniqueColors.find(c => c.id === activeImage.variantId)}
							<p class="mt-2 font-mono text-[10px] tracking-widest text-volt uppercase">
								Linked to: {variantColor?.name ?? 'Color swatch'}
							</p>
						{:else}
							<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
								Product-wide image
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => (activeImageIndex = null)}
						class="grid h-10 w-10 shrink-0 place-items-center border border-ash/30 text-ash hover:border-volt hover:text-volt cursor-pointer"
						aria-label="Close image detail"
					>
						<X size={15} aria-hidden="true" />
					</button>
				</div>

				<div class="border-t border-charcoal/40 pt-4 flex flex-wrap gap-2">
					<form method="POST" action="?/setPrimaryProductImage" use:setPrimaryImageEnhance class="w-full">
						<input type="hidden" name="imageId" value={activeImage.id} />
						<button
							type="submit"
							onclick={() => (activeImageIndex = null)}
							disabled={$setPrimaryImageSubmitting || activeImage.isPrimary}
							class="inline-flex min-h-11 w-full items-center justify-center gap-2 border px-4 font-mono text-[10px] tracking-widest uppercase disabled:opacity-40 {activeImage.isPrimary
								? 'border-volt bg-volt text-void font-bold'
								: 'border-ash/30 text-ash hover:border-volt hover:text-volt cursor-pointer'}"
						>
							<Star size={14} fill={activeImage.isPrimary ? 'currentColor' : 'none'} aria-hidden="true" />
							{activeImage.isPrimary ? 'Primary Image' : 'Set as primary'}
						</button>
					</form>

					<form method="POST" action="?/deleteProductImage" use:deleteImageEnhance class="w-full">
						<input type="hidden" name="imageId" value={activeImage.id} />
						<button
							type="submit"
							onclick={() => (activeImageIndex = null)}
							disabled={$deleteImageSubmitting}
							class="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-red-400/40 px-4 text-center font-mono text-[10px] leading-4 tracking-widest uppercase text-red-300 hover:border-red-300 hover:text-red-200 cursor-pointer"
						>
							<Trash2 size={14} aria-hidden="true" />
							Delete Image
						</button>
					</form>
				</div>
			</div>
		</section>
	</div>
{/if}
