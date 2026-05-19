<script lang="ts">
	import { resolve } from '$app/paths';
	import { AlertTriangle, ArrowLeft, ImageOff, Plus, Star, Upload, X } from 'lucide-svelte';
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
		errors: updateVariantErrors,
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

	const product = $derived(data.product);
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

	function variantLabel(variant: PageData['product']['variants'][number]): string {
		return `${variant.sku} / ${variant.size} / ${variant.color}`;
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

				<div class="grid gap-4 md:grid-cols-3">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Base price</span>
						<input
							name="basePrice"
							type="number"
							bind:value={$updateProductForm.basePrice}
							aria-invalid={$updateProductErrors.basePrice ? 'true' : undefined}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$updateProductConstraints.basePrice}
						/>
					</label>
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Compare at</span>
						<input
							name="compareAtPrice"
							type="number"
							bind:value={$updateProductForm.compareAtPrice}
							aria-invalid={$updateProductErrors.compareAtPrice ? 'true' : undefined}
							class="min-h-11 border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$updateProductConstraints.compareAtPrice}
						/>
					</label>
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
				{#if $updateProductErrors.basePrice}
					<p class="font-mono text-[10px] text-red-300">{$updateProductErrors.basePrice[0]}</p>
				{/if}
				{#if $updateProductErrors.compareAtPrice}
					<p class="font-mono text-[10px] text-red-300">{$updateProductErrors.compareAtPrice[0]}</p>
				{/if}

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

				<div class="grid gap-3 border border-charcoal bg-void/40 p-4 md:grid-cols-3">
					<label
						class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase {dropTierWithoutDrop
							? 'opacity-50'
							: ''}"
					>
						<input
							type="checkbox"
							name="isActive"
							bind:checked={$updateProductForm.isActive}
							disabled={dropTierWithoutDrop}
						/>
						Active
					</label>
					<label
						class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<input type="checkbox" name="isFeatured" bind:checked={$updateProductForm.isFeatured} />
						Featured
					</label>
					<label
						class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<input
							type="checkbox"
							name="isNewArrival"
							bind:checked={$updateProductForm.isNewArrival}
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
		<section class="border border-charcoal bg-charcoal/25">
			<div class="border-b border-charcoal p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Variants</p>
				<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Stock Options</h2>
			</div>

			{#if product.variants.length > 0}
				<div class="divide-y divide-charcoal md:hidden">
					{#each product.variants as variant (variant.id)}
						<article class="p-4">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="font-mono text-xs tracking-widest text-bone uppercase">{variant.sku}</p>
									<p class="mt-1 font-mono text-[10px] text-ash uppercase">
										{variant.size} / {variant.color}
									</p>
								</div>
								<span
									class="font-mono text-[10px] tracking-widest uppercase {variant.isActive
										? 'text-volt'
										: 'text-red-300'}"
								>
									{variant.isActive ? 'Active' : 'Off'}
								</span>
							</div>
							<div class="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase">
								<span class="text-bone">{formatMoney(variant.effectivePrice)}</span>
								<span class="text-ash">{variant.weight ? `${variant.weight}kg` : 'No weight'}</span>
							</div>
							<form
								method="POST"
								action="?/deleteProductVariant"
								use:deleteVariantEnhance
								class="mt-4"
							>
								<input type="hidden" name="variantId" value={variant.id} />
								<button
									type="submit"
									disabled={$deleteVariantSubmitting}
									class="min-h-11 border border-red-400/40 px-4 font-mono text-[10px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200 disabled:opacity-50"
								>
									Delete variant
								</button>
							</form>
						</article>
					{/each}
				</div>

				<div class="hidden overflow-x-auto md:block">
					<table class="w-full min-w-[760px] text-left">
						<thead class="border-b border-charcoal">
							<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
								<th class="px-5 py-4 font-normal">SKU</th>
								<th class="px-5 py-4 font-normal">Size</th>
								<th class="px-5 py-4 font-normal">Color</th>
								<th class="px-5 py-4 font-normal">Price</th>
								<th class="px-5 py-4 font-normal">State</th>
								<th class="px-5 py-4 text-right font-normal">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each product.variants as variant (variant.id)}
								<tr class="border-b border-charcoal/70 last:border-b-0">
									<td class="px-5 py-4 font-mono text-xs text-bone">{variant.sku}</td>
									<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">{variant.size}</td>
									<td class="px-5 py-4">
										<div class="flex items-center gap-2">
											{#if variant.colorHex}
												<span
													class="h-4 w-4 border border-charcoal"
													style:background={variant.colorHex}
													aria-hidden="true"
												></span>
											{/if}
											<span class="font-mono text-[10px] text-ash uppercase">{variant.color}</span>
										</div>
									</td>
									<td class="px-5 py-4 font-mono text-xs text-bone">
										{formatMoney(variant.effectivePrice)}
									</td>
									<td class="px-5 py-4">
										<span
											class="font-mono text-[10px] tracking-widest uppercase {variant.isActive
												? 'text-volt'
												: 'text-red-300'}"
										>
											{variant.isActive ? 'Active' : 'Off'}
										</span>
									</td>
									<td class="px-5 py-4">
										<form
											method="POST"
											action="?/deleteProductVariant"
											use:deleteVariantEnhance
											class="flex justify-end"
										>
											<input type="hidden" name="variantId" value={variant.id} />
											<button
												type="submit"
												disabled={$deleteVariantSubmitting}
												class="font-mono text-[10px] tracking-widest text-red-300 uppercase hover:text-red-200 disabled:opacity-50"
											>
												Delete
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-10 text-center">
					<p class="font-display text-4xl text-bone uppercase">No variants</p>
					<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
						Add sizes and colors before publishing.
					</p>
				</div>
			{/if}
		</section>

		<aside class="grid gap-4">
			<form
				method="POST"
				action="?/createProductVariant"
				use:createVariantEnhance
				class="border border-charcoal bg-void p-5"
			>
				<h3 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Create variant</h3>
				<div class="mt-5 grid gap-3">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">SKU</span>
						<input
							name="sku"
							bind:value={$createVariantForm.sku}
							aria-invalid={$createVariantErrors.sku ? 'true' : undefined}
							class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$createVariantConstraints.sku}
						/>
					</label>
					{#if $createVariantErrors.sku}
						<p class="font-mono text-[10px] text-red-300">{$createVariantErrors.sku[0]}</p>
					{/if}
					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Size</span>
							<select
								name="size"
								bind:value={$createVariantForm.size}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								{#each data.sizeOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color</span>
							<input
								name="color"
								bind:value={$createVariantForm.color}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createVariantConstraints.color}
							/>
						</label>
					</div>
					{#if $createVariantErrors.color}
						<p class="font-mono text-[10px] text-red-300">{$createVariantErrors.color[0]}</p>
					{/if}
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color hex</span
							>
							<input
								name="colorHex"
								bind:value={$createVariantForm.colorHex}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createVariantConstraints.colorHex}
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Override</span>
							<input
								name="priceOverride"
								type="number"
								bind:value={$createVariantForm.priceOverride}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createVariantConstraints.priceOverride}
							/>
						</label>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Weight</span>
							<input
								name="weight"
								type="number"
								step="0.01"
								bind:value={$createVariantForm.weight}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createVariantConstraints.weight}
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Sort</span>
							<input
								name="sortOrder"
								type="number"
								bind:value={$createVariantForm.sortOrder}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$createVariantConstraints.sortOrder}
							/>
						</label>
					</div>
					<label
						class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<input type="checkbox" name="isActive" bind:checked={$createVariantForm.isActive} />
						Active
					</label>
					<button
						type="submit"
						disabled={$createVariantSubmitting}
						class="min-h-11 bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt disabled:opacity-50"
					>
						{$createVariantSubmitting ? 'Saving...' : 'Create variant'}
					</button>
				</div>
			</form>

			<form
				method="POST"
				action="?/updateProductVariant"
				use:updateVariantEnhance
				class="border border-charcoal bg-void p-5"
			>
				<h3 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Update variant</h3>
				<div class="mt-5 grid gap-3">
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Variant</span>
						<select
							name="variantId"
							bind:value={$updateVariantForm.variantId}
							class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						>
							{#each product.variants as variant (variant.id)}
								<option value={variant.id}>{variantLabel(variant)}</option>
							{/each}
						</select>
					</label>
					<label class="grid gap-1">
						<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">SKU</span>
						<input
							name="sku"
							bind:value={$updateVariantForm.sku}
							class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							{...$updateVariantConstraints.sku}
						/>
					</label>
					{#if $updateVariantErrors.sku}
						<p class="font-mono text-[10px] text-red-300">{$updateVariantErrors.sku[0]}</p>
					{/if}
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Size</span>
							<select
								name="size"
								bind:value={$updateVariantForm.size}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								<option value="">Do not change</option>
								{#each data.sizeOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color</span>
							<input
								name="color"
								bind:value={$updateVariantForm.color}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateVariantConstraints.color}
							/>
						</label>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Color hex</span
							>
							<input
								name="colorHex"
								bind:value={$updateVariantForm.colorHex}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateVariantConstraints.colorHex}
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Override</span>
							<input
								name="priceOverride"
								type="number"
								bind:value={$updateVariantForm.priceOverride}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateVariantConstraints.priceOverride}
							/>
						</label>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Weight</span>
							<input
								name="weight"
								type="number"
								step="0.01"
								bind:value={$updateVariantForm.weight}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateVariantConstraints.weight}
							/>
						</label>
						<label class="grid gap-1">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Sort</span>
							<input
								name="sortOrder"
								type="number"
								bind:value={$updateVariantForm.sortOrder}
								class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
								{...$updateVariantConstraints.sortOrder}
							/>
						</label>
					</div>
					<label
						class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
					>
						<input type="checkbox" name="isActive" bind:checked={$updateVariantForm.isActive} />
						Active
					</label>
					<button
						type="submit"
						disabled={$updateVariantSubmitting}
						class="min-h-11 border border-ash/30 px-5 py-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt disabled:opacity-50"
					>
						{$updateVariantSubmitting ? 'Saving...' : 'Update variant'}
					</button>
				</div>
			</form>
		</aside>
	</div>

	<div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
		<section class="border border-charcoal bg-charcoal/25">
			<div class="border-b border-charcoal p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Media</p>
				<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Images</h2>
			</div>

			{#if product.images.length > 0}
				<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each product.images as image (image.id)}
						<article class="border border-charcoal bg-void">
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
							<div class="grid gap-3 p-4">
								<p class="min-h-5 truncate font-mono text-[10px] text-ash uppercase">
									{image.altText ?? 'No alt text'}
								</p>
								<p class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
									Position {image.position} / {image.variantId ?? 'Product'}
								</p>
								<div class="flex flex-wrap gap-2">
									<form method="POST" action="?/setPrimaryProductImage" use:setPrimaryImageEnhance>
										<input type="hidden" name="imageId" value={image.id} />
										<button
											type="submit"
											disabled={$setPrimaryImageSubmitting || image.isPrimary}
											class="min-h-10 border border-ash/30 px-3 font-mono text-[9px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt disabled:opacity-40"
										>
											Set primary
										</button>
									</form>
									<form method="POST" action="?/deleteProductImage" use:deleteImageEnhance>
										<input type="hidden" name="imageId" value={image.id} />
										<button
											type="submit"
											disabled={$deleteImageSubmitting}
											class="min-h-10 border border-red-400/40 px-3 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200 disabled:opacity-50"
										>
											Delete
										</button>
									</form>
								</div>
							</div>
						</article>
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
					class="min-h-11 border border-ash/30 px-5 py-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt disabled:opacity-40"
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
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Variant</span>
					<select
						name="variantId"
						bind:value={$addImageForm.variantId}
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
					>
						<option value="">Product image</option>
						{#each product.variants as variant (variant.id)}
							<option value={variant.id}>{variantLabel(variant)}</option>
						{/each}
					</select>
				</label>
				<label class="grid gap-1">
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Image</span>
					<input
						name="image"
						type="file"
						accept="image/*"
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-ash file:mr-4 file:border-0 file:bg-bone file:px-3 file:py-2 file:font-mono file:text-[10px] file:text-void file:uppercase"
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
					<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Position</span>
					<input
						name="position"
						type="number"
						bind:value={$addImageForm.position}
						class="min-h-11 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone outline-none focus:border-volt"
						{...$addImageConstraints.position}
					/>
				</label>
				<label
					class="flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase"
				>
					<input type="checkbox" name="isPrimary" bind:checked={$addImageForm.isPrimary} />
					Primary
				</label>
				<button
					type="submit"
					disabled={$addImageSubmitting}
					class="inline-flex min-h-11 items-center justify-center gap-2 bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt disabled:opacity-50"
				>
					<Upload size={14} aria-hidden="true" />
					{$addImageSubmitting ? 'Uploading...' : 'Add image'}
				</button>
			</div>
		</form>
	</div>
</section>
