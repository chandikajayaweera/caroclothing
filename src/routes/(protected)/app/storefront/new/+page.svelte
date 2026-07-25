<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		AlertTriangle,
		CheckCircle2,
		ImageIcon,
		LayoutTemplate,
		Monitor,
		Smartphone,
		Upload,
		X
	} from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminDateTimePicker from '$lib/components/admin/controls/AdminDateTimePicker.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminUnsavedChangesGuard from '$lib/components/admin/forms/AdminUnsavedChangesGuard.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type SectionType =
		| 'hero'
		| 'product_grid'
		| 'product_spotlight'
		| 'category_showcase'
		| 'promotion_campaign'
		| 'service_strip'
		| 'review_rail';
	type SourceType =
		| 'manual'
		| 'new_arrivals'
		| 'featured_products'
		| 'category_products'
		| 'root_categories'
		| 'promotion'
		| 'shipping'
		| 'recent_reviews';
	type PreviewMode = 'desktop' | 'mobile';

	const sectionTypeOptions = [
		{
			value: 'hero',
			label: 'Hero banner',
			description: 'Large campaign-led opening section with optional media and calls to action.'
		},
		{
			value: 'product_grid',
			label: 'Product grid',
			description: 'Merchandise new arrivals, featured products, or one category.'
		},
		{
			value: 'product_spotlight',
			label: 'Product spotlight',
			description: 'Give one product more editorial space and a focused story.'
		},
		{
			value: 'category_showcase',
			label: 'Category showcase',
			description: 'Guide shoppers into selected or top-level categories.'
		},
		{
			value: 'promotion_campaign',
			label: 'Promotion campaign',
			description: 'Present one existing promotion without duplicating discount rules.'
		},
		{
			value: 'service_strip',
			label: 'Service strip',
			description: 'Show a concise shipping or customer-service promise.'
		},
		{
			value: 'review_rail',
			label: 'Review rail',
			description: 'Build trust with recently approved customer reviews.'
		}
	] as const satisfies ReadonlyArray<{
		value: SectionType;
		label: string;
		description: string;
	}>;

	const layoutOptions = [
		{ value: 'full_bleed', label: 'Full bleed' },
		{ value: 'split', label: 'Split' },
		{ value: 'grid_2', label: '2-column grid' },
		{ value: 'grid_3', label: '3-column grid' },
		{ value: 'grid_4', label: '4-column grid' },
		{ value: 'rail', label: 'Horizontal rail' },
		{ value: 'compact', label: 'Compact' }
	] as const;

	const sourceOptionsByType: Record<SectionType, readonly SourceType[]> = {
		hero: ['manual', 'promotion'],
		product_grid: ['new_arrivals', 'featured_products', 'category_products'],
		product_spotlight: ['manual'],
		category_showcase: ['manual', 'root_categories'],
		promotion_campaign: ['promotion'],
		service_strip: ['manual', 'shipping'],
		review_rail: ['recent_reviews']
	};

	const sourceLabels: Record<SourceType, string> = {
		manual: 'Manual selection',
		new_arrivals: 'New arrivals',
		featured_products: 'Featured products',
		category_products: 'Products from category',
		root_categories: 'All root categories',
		promotion: 'Existing promotion',
		shipping: 'Shipping method',
		recent_reviews: 'Recent approved reviews'
	};

	const sourceDescriptions: Record<SourceType, string> = {
		manual: 'You control the copy, media, and any required item selection.',
		new_arrivals: 'Products marked as new arrivals are resolved when the homepage loads.',
		featured_products: 'Products marked as featured are resolved when the homepage loads.',
		category_products: 'Active products are pulled from one selected category.',
		root_categories: 'Active top-level categories are resolved automatically.',
		promotion: 'Public campaign data stays owned by the selected promotion.',
		shipping: 'Service messaging is backed by the selected shipping method.',
		recent_reviews: 'Recently approved reviews are resolved automatically.'
	};

	function initialValue<T>(getValue: () => T): T {
		return getValue();
	}

	const sf = superForm(
		initialValue(() => data.createForm),
		{ resetForm: false }
	);
	const { form, errors, enhance, message, submitting, tainted } = sf;

	let formElement = $state<HTMLFormElement | null>(null);
	let desktopInput = $state<HTMLInputElement | null>(null);
	let mobileInput = $state<HTMLInputElement | null>(null);
	let desktopPreview = $state<string | null>(null);
	let mobilePreview = $state<string | null>(null);
	let desktopFile = $state<File | null>(null);
	let mobileFile = $state<File | null>(null);
	let previewMode = $state<PreviewMode>('desktop');

	const sourceOptions = $derived(sourceOptionsByType[$form.type]);
	const selectedType = $derived(
		sectionTypeOptions.find((item) => item.value === $form.type) ?? sectionTypeOptions[0]
	);
	const selectedLayout = $derived(
		layoutOptions.find((item) => item.value === $form.layoutVariant)?.label ?? 'Layout'
	);
	const showsItemLimit = $derived(
		$form.type === 'product_grid' ||
			$form.type === 'category_showcase' ||
			$form.type === 'review_rail'
	);
	const currentPreview = $derived(previewMode === 'desktop' ? desktopPreview : mobilePreview);
	const currentPreviewAlt = $derived(
		previewMode === 'desktop'
			? $form.desktopAltText || 'Desktop section preview'
			: $form.mobileAltText || 'Mobile section preview'
	);
	const hasUnsavedChanges = $derived(
		Boolean($tainted) || desktopFile !== null || mobileFile !== null
	);
	const desktopImageError = $derived(firstError($errors.desktopImage));
	const mobileImageError = $derived(firstError($errors.mobileImage));

	const selectedReference = $derived.by(() => {
		if ($form.type === 'product_spotlight' && $form.productId) {
			return data.options.products.find((item) => item.id === $form.productId)?.name ?? 'Product';
		}
		if ($form.sourceType === 'category_products' && $form.categoryId) {
			return (
				data.options.categories.find((item) => item.id === $form.categoryId)?.name ?? 'Category'
			);
		}
		if ($form.sourceType === 'promotion' && $form.promotionId) {
			return (
				data.options.promotions.find((item) => item.id === $form.promotionId)?.name ?? 'Promotion'
			);
		}
		if ($form.sourceType === 'shipping' && $form.shippingMethodId) {
			return (
				data.options.shippingMethods.find((item) => item.id === $form.shippingMethodId)?.name ??
				'Shipping method'
			);
		}
		if ($form.type === 'category_showcase' && $form.sourceType === 'manual') {
			return `${$form.categoryIds.length} selected ${$form.categoryIds.length === 1 ? 'category' : 'categories'}`;
		}
		return 'Resolved automatically';
	});

	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$form.adminName?.trim()) warnings.push('Add an internal admin name');
		if ($form.type === 'product_spotlight' && !$form.productId) warnings.push('Choose a product');
		if ($form.sourceType === 'category_products' && !$form.categoryId)
			warnings.push('Choose a category');
		if ($form.sourceType === 'promotion' && !$form.promotionId) warnings.push('Choose a promotion');
		if ($form.sourceType === 'shipping' && !$form.shippingMethodId)
			warnings.push('Choose a shipping method');
		if (
			$form.type === 'category_showcase' &&
			$form.sourceType === 'manual' &&
			$form.categoryIds.length === 0
		) {
			warnings.push('Choose at least one category');
		}
		if (Boolean($form.primaryCtaLabel) !== Boolean($form.primaryCtaUrl))
			warnings.push('Complete both primary CTA fields');
		if (Boolean($form.secondaryCtaLabel) !== Boolean($form.secondaryCtaUrl))
			warnings.push('Complete both secondary CTA fields');
		if ($form.startsAt && $form.endsAt && $form.endsAt <= $form.startsAt)
			warnings.push('End time must follow start time');
		return warnings;
	});

	function handleTypeChange(event: Event) {
		const nextType = (event.currentTarget as HTMLSelectElement).value as SectionType;
		$form.type = nextType;
		const allowedSources = sourceOptionsByType[nextType];
		if (!allowedSources.includes($form.sourceType)) $form.sourceType = allowedSources[0];
		clearUnusedReferences();
	}

	function handleSourceChange(event: Event) {
		$form.sourceType = (event.currentTarget as HTMLSelectElement).value as SourceType;
		clearUnusedReferences();
	}

	function clearUnusedReferences() {
		if ($form.type !== 'product_spotlight') $form.productId = null;
		if ($form.sourceType !== 'category_products') $form.categoryId = null;
		if ($form.sourceType !== 'promotion') $form.promotionId = null;
		if ($form.sourceType !== 'shipping') $form.shippingMethodId = null;
		if (!($form.type === 'category_showcase' && $form.sourceType === 'manual')) {
			$form.categoryIds = [];
		}
	}

	function updatePreview(event: Event, role: PreviewMode) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		setMediaFile(role, file);
		if (file) previewMode = role;
	}

	function setMediaFile(role: PreviewMode, file: File | null) {
		const nextPreview = file ? URL.createObjectURL(file) : null;
		if (role === 'desktop') {
			revokePreview(desktopPreview);
			desktopPreview = nextPreview;
			desktopFile = file;
			return;
		}
		revokePreview(mobilePreview);
		mobilePreview = nextPreview;
		mobileFile = file;
	}

	function removeMedia(role: PreviewMode) {
		setMediaFile(role, null);
		const input = role === 'desktop' ? desktopInput : mobileInput;
		if (input) input.value = '';
	}

	function revokePreview(value: string | null) {
		if (value?.startsWith('blob:')) URL.revokeObjectURL(value);
	}

	function firstError(value: unknown): string | null {
		if (typeof value === 'string') return value;
		if (!Array.isArray(value)) return null;
		return value.find((item): item is string => typeof item === 'string') ?? null;
	}

	function formatFileSize(file: File | null): string | null {
		if (!file) return null;
		if (file.size >= 1_048_576) return `${(file.size / 1_048_576).toFixed(1)} MB`;
		return `${Math.max(1, Math.round(file.size / 1024))} KB`;
	}

	onDestroy(() => {
		revokePreview(desktopPreview);
		revokePreview(mobilePreview);
	});
</script>

<svelte:head>
	<title>New Homepage Section | Caro Admin</title>
	<meta
		name="description"
		content="Create a bounded, responsive homepage section for the Caro storefront."
	/>
</svelte:head>

<form
	method="POST"
	action="?/create"
	enctype="multipart/form-data"
	novalidate
	bind:this={formElement}
	use:enhance
>
	<input type="hidden" name="pageKey" value="home" />
	<input type="hidden" name="sortOrder" value={$form.sortOrder} />

	<AdminFormLayout
		backHref="/app/storefront"
		backLabel="Back to storefront"
		kicker="Storefront"
		title="New Homepage Section"
		description="Build one focused homepage block. Content sources stay tied to their owning catalog or campaign."
		actionMessage={$message ?? actionData?.form?.message}
		isSubmitting={$submitting}
		submitLabel="Create Section"
		mobileSidebarLabel="Preview and launch status"
		oncancel={() => goto(resolve('/app/storefront'))}
	>
		{#snippet mainContent()}
			<AdminCard kicker="Step 1" title="Section setup" border="border border-ash/15">
				<div class="mb-5 flex items-start gap-3 border border-volt/15 bg-volt/5 p-4">
					<LayoutTemplate size={20} class="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
					<div class="min-w-0">
						<p class="font-sans text-sm font-semibold text-bone">{selectedType.label}</p>
						<p class="mt-1 text-xs leading-relaxed text-ash/70">{selectedType.description}</p>
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<AdminInput
						label="Admin name"
						name="adminName"
						bind:value={$form.adminName}
						error={$errors.adminName}
						placeholder="e.g. July drop hero"
						helpText="Internal only. Make it easy to scan in the section list."
						required
					/>
					<AdminSelect
						label="Section type"
						name="type"
						bind:value={$form.type}
						onchange={handleTypeChange}
						error={$errors.type}
						required
					>
						{#each sectionTypeOptions as item (item.value)}
							<option value={item.value}>{item.label}</option>
						{/each}
					</AdminSelect>
					<AdminSelect
						label="Content source"
						name="sourceType"
						bind:value={$form.sourceType}
						onchange={handleSourceChange}
						error={$errors.sourceType}
						helpText={sourceDescriptions[$form.sourceType]}
						required
					>
						{#each sourceOptions as item (item)}
							<option value={item}>{sourceLabels[item]}</option>
						{/each}
					</AdminSelect>
					<AdminSelect
						label="Layout"
						name="layoutVariant"
						bind:value={$form.layoutVariant}
						error={$errors.layoutVariant}
						required
					>
						{#each layoutOptions as item (item.value)}
							<option value={item.value}>{item.label}</option>
						{/each}
					</AdminSelect>
				</div>
			</AdminCard>

			<AdminCard kicker="Step 2" title="Copy and actions" border="border border-ash/15">
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminInput
						label="Eyebrow"
						name="eyebrow"
						bind:value={$form.eyebrow}
						error={$errors.eyebrow}
						placeholder="New drop"
					/>
					<AdminInput
						label="Heading"
						name="title"
						bind:value={$form.title}
						error={$errors.title}
						placeholder="Built for after dark"
					/>
					<div class="sm:col-span-2">
						<AdminTextarea
							label="Body"
							name="body"
							bind:value={$form.body}
							error={$errors.body}
							placeholder="Short, direct storefront copy."
							rows={4}
						/>
					</div>
				</div>

				<div class="mt-5 grid gap-4 md:grid-cols-2">
					<fieldset class="grid min-w-0 gap-4 border border-ash/15 bg-void/35 p-4">
						<legend class="px-1 font-mono text-[10px] tracking-widest text-ash uppercase">
							Primary action
						</legend>
						<AdminInput
							label="Button label"
							name="primaryCtaLabel"
							bind:value={$form.primaryCtaLabel}
							error={$errors.primaryCtaLabel}
							placeholder="Shop the drop"
						/>
						<AdminInput
							label="Destination"
							name="primaryCtaUrl"
							bind:value={$form.primaryCtaUrl}
							error={$errors.primaryCtaUrl}
							placeholder="/shop"
							helpText="Use an internal path or HTTPS URL."
						/>
					</fieldset>

					<fieldset class="grid min-w-0 gap-4 border border-ash/15 bg-void/35 p-4">
						<legend class="px-1 font-mono text-[10px] tracking-widest text-ash uppercase">
							Secondary action
						</legend>
						<AdminInput
							label="Button label"
							name="secondaryCtaLabel"
							bind:value={$form.secondaryCtaLabel}
							error={$errors.secondaryCtaLabel}
							placeholder="View story"
						/>
						<AdminInput
							label="Destination"
							name="secondaryCtaUrl"
							bind:value={$form.secondaryCtaUrl}
							error={$errors.secondaryCtaUrl}
							placeholder="/about"
							helpText="Use an internal path or HTTPS URL."
						/>
					</fieldset>
				</div>
			</AdminCard>

			<AdminCard kicker="Step 3" title="Content source" border="border border-ash/15">
				<div
					class="mb-5 grid gap-2 border border-charcoal bg-void/40 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
				>
					<AdminBadge variant="accent">{sourceLabels[$form.sourceType]}</AdminBadge>
					<p class="text-xs leading-relaxed text-ash/70">
						{sourceDescriptions[$form.sourceType]}
					</p>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					{#if $form.type === 'product_spotlight'}
						<AdminSelect
							label="Product"
							name="productId"
							bind:value={$form.productId}
							error={$errors.productId}
							required
						>
							<option value="">Choose product</option>
							{#each data.options.products as item (item.id)}
								<option value={item.id}>{item.name}{item.isActive ? '' : ' (inactive)'}</option>
							{/each}
						</AdminSelect>
					{/if}

					{#if $form.sourceType === 'category_products'}
						<AdminSelect
							label="Category"
							name="categoryId"
							bind:value={$form.categoryId}
							error={$errors.categoryId}
							required
						>
							<option value="">Choose category</option>
							{#each data.options.categories as item (item.id)}
								<option value={item.id}>{item.name}{item.isActive ? '' : ' (inactive)'}</option>
							{/each}
						</AdminSelect>
					{/if}

					{#if $form.sourceType === 'promotion'}
						<AdminSelect
							label="Promotion"
							name="promotionId"
							bind:value={$form.promotionId}
							error={$errors.promotionId}
							required
						>
							<option value="">Choose promotion</option>
							{#each data.options.promotions as item (item.id)}
								<option value={item.id}>{item.name} / {item.status}</option>
							{/each}
						</AdminSelect>
					{/if}

					{#if $form.sourceType === 'shipping'}
						<AdminSelect
							label="Shipping method"
							name="shippingMethodId"
							bind:value={$form.shippingMethodId}
							error={$errors.shippingMethodId}
							required
						>
							<option value="">Choose method</option>
							{#each data.options.shippingMethods as item (item.id)}
								<option value={item.id}>{item.name}{item.isActive ? '' : ' (inactive)'}</option>
							{/each}
						</AdminSelect>
					{/if}

					{#if showsItemLimit}
						<AdminInput
							label="Item limit"
							name="itemLimit"
							type="number"
							min="1"
							max="12"
							bind:value={$form.itemLimit}
							error={$errors.itemLimit}
							helpText="Between 1 and 12 items."
						/>
					{:else}
						<input type="hidden" name="itemLimit" value={$form.itemLimit} />
					{/if}
				</div>

				{#if $form.type === 'category_showcase' && $form.sourceType === 'manual'}
					<fieldset class="mt-5">
						<legend class="font-sans text-xs font-semibold tracking-wide text-ash/90">
							Curated categories <span class="text-red-400" aria-hidden="true">*</span>
						</legend>
						{#if data.options.categories.length > 0}
							<div class="mt-2 grid gap-2 sm:grid-cols-2">
								{#each data.options.categories as item (item.id)}
									<label
										class="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 border border-ash/20 bg-void/40 px-3 py-2 text-sm text-bone transition-colors hover:border-ash/50 has-checked:border-volt/50 has-checked:bg-volt/5"
									>
										<input
											type="checkbox"
											name="categoryIds"
											value={item.id}
											bind:group={$form.categoryIds}
											class="size-4 shrink-0 accent-volt"
										/>
										<span class="min-w-0 truncate">{item.name}</span>
										{#if !item.isActive}
											<span class="ml-auto shrink-0 font-mono text-[8px] text-ash uppercase">
												Inactive
											</span>
										{/if}
									</label>
								{/each}
							</div>
						{:else}
							<p class="mt-2 border border-ash/15 p-4 text-xs text-ash">
								No categories are available yet.
							</p>
						{/if}
						{#if firstError($errors.categoryIds)}
							<p class="mt-2 text-xs text-red-400">{firstError($errors.categoryIds)}</p>
						{/if}
					</fieldset>
				{/if}
			</AdminCard>

			<AdminCard kicker="Step 4" title="Responsive media" border="border border-ash/15">
				<p class="mb-5 max-w-2xl text-xs leading-relaxed text-ash/70">
					Desktop uses a wide crop. Mobile uses a portrait crop. JPG, PNG, WEBP, or AVIF; max 5 MB
					each.
				</p>

				<div class="grid gap-4 md:grid-cols-2">
					<div class="grid min-w-0 content-start gap-4 border border-ash/15 bg-void/35 p-4">
						<div class="flex min-w-0 items-center justify-between gap-3">
							<div class="flex min-w-0 items-center gap-2">
								<Monitor size={16} class="shrink-0 text-volt" aria-hidden="true" />
								<div class="min-w-0">
									<p class="text-sm font-semibold text-bone">Desktop image</p>
									<p class="font-mono text-[9px] text-ash uppercase">16:9 recommended</p>
								</div>
							</div>
							{#if desktopFile}
								<button
									type="button"
									onclick={() => removeMedia('desktop')}
									class="grid size-11 shrink-0 place-items-center border border-red-400/25 text-red-300 transition-colors hover:bg-red-500/10"
									aria-label="Remove desktop image"
								>
									<X size={16} aria-hidden="true" />
								</button>
							{/if}
						</div>

						<label
							for="desktop-image"
							class="group relative grid aspect-video min-w-0 cursor-pointer place-items-center overflow-hidden border border-dashed border-ash/25 bg-charcoal/25 transition-colors hover:border-volt/60"
						>
							{#if desktopPreview}
								<img
									src={desktopPreview}
									alt="Desktop upload preview"
									class="h-full w-full object-cover"
								/>
								<span
									class="absolute inset-x-0 bottom-0 flex min-h-11 items-center justify-center bg-void/85 px-3 font-mono text-[9px] tracking-widest text-bone uppercase"
								>
									Replace image
								</span>
							{:else}
								<span class="grid justify-items-center gap-2 p-4 text-center">
									<Upload size={24} class="text-ash/60 group-hover:text-volt" aria-hidden="true" />
									<span class="text-xs font-semibold text-bone">Choose desktop image</span>
									<span class="font-mono text-[9px] text-ash uppercase">Wide crop</span>
								</span>
							{/if}
						</label>
						<input
							bind:this={desktopInput}
							id="desktop-image"
							name="desktopImage"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							onchange={(event) => updatePreview(event, 'desktop')}
							class="sr-only"
						/>
						{#if desktopFile}
							<p class="flex min-w-0 justify-between gap-3 font-mono text-[9px] text-ash uppercase">
								<span class="min-w-0 truncate" title={desktopFile.name}>{desktopFile.name}</span>
								<span class="shrink-0 text-volt">{formatFileSize(desktopFile)}</span>
							</p>
						{/if}
						{#if desktopImageError}
							<p class="text-xs text-red-400">{desktopImageError}</p>
						{/if}
						<AdminInput
							label="Desktop alt text"
							name="desktopAltText"
							bind:value={$form.desktopAltText}
							error={$errors.desktopAltText}
							placeholder="Model wearing the new collection"
							helpText="Describe the image for screen-reader users."
						/>
					</div>

					<div class="grid min-w-0 content-start gap-4 border border-ash/15 bg-void/35 p-4">
						<div class="flex min-w-0 items-center justify-between gap-3">
							<div class="flex min-w-0 items-center gap-2">
								<Smartphone size={16} class="shrink-0 text-volt" aria-hidden="true" />
								<div class="min-w-0">
									<p class="text-sm font-semibold text-bone">Mobile image</p>
									<p class="font-mono text-[9px] text-ash uppercase">3:4 recommended</p>
								</div>
							</div>
							{#if mobileFile}
								<button
									type="button"
									onclick={() => removeMedia('mobile')}
									class="grid size-11 shrink-0 place-items-center border border-red-400/25 text-red-300 transition-colors hover:bg-red-500/10"
									aria-label="Remove mobile image"
								>
									<X size={16} aria-hidden="true" />
								</button>
							{/if}
						</div>

						<label
							for="mobile-image"
							class="group relative mx-auto grid aspect-3/4 w-full max-w-56 cursor-pointer place-items-center overflow-hidden border border-dashed border-ash/25 bg-charcoal/25 transition-colors hover:border-volt/60 md:max-w-none"
						>
							{#if mobilePreview}
								<img
									src={mobilePreview}
									alt="Mobile upload preview"
									class="h-full w-full object-cover"
								/>
								<span
									class="absolute inset-x-0 bottom-0 flex min-h-11 items-center justify-center bg-void/85 px-3 font-mono text-[9px] tracking-widest text-bone uppercase"
								>
									Replace image
								</span>
							{:else}
								<span class="grid justify-items-center gap-2 p-4 text-center">
									<Upload size={24} class="text-ash/60 group-hover:text-volt" aria-hidden="true" />
									<span class="text-xs font-semibold text-bone">Choose mobile image</span>
									<span class="font-mono text-[9px] text-ash uppercase">Portrait crop</span>
								</span>
							{/if}
						</label>
						<input
							bind:this={mobileInput}
							id="mobile-image"
							name="mobileImage"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							onchange={(event) => updatePreview(event, 'mobile')}
							class="sr-only"
						/>
						{#if mobileFile}
							<p class="flex min-w-0 justify-between gap-3 font-mono text-[9px] text-ash uppercase">
								<span class="min-w-0 truncate" title={mobileFile.name}>{mobileFile.name}</span>
								<span class="shrink-0 text-volt">{formatFileSize(mobileFile)}</span>
							</p>
						{/if}
						{#if mobileImageError}
							<p class="text-xs text-red-400">{mobileImageError}</p>
						{/if}
						<AdminInput
							label="Mobile alt text"
							name="mobileAltText"
							bind:value={$form.mobileAltText}
							error={$errors.mobileAltText}
							placeholder="Portrait crop of the campaign"
							helpText="Describe meaningful differences from the desktop crop."
						/>
					</div>
				</div>
			</AdminCard>

			<AdminCard kicker="Step 5" title="Publishing window" border="border border-ash/15">
				<div class="mb-5 flex items-start gap-3 border border-charcoal bg-void/40 p-4">
					{#if $form.enabled}
						<CheckCircle2 size={18} class="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
					{:else}
						<AlertTriangle size={18} class="mt-0.5 shrink-0 text-ash" aria-hidden="true" />
					{/if}
					<div class="min-w-0">
						<p class="text-sm font-semibold text-bone">
							{$form.enabled ? 'Section enabled' : 'Draft by default'}
						</p>
						<p class="mt-1 text-xs leading-relaxed text-ash/70">
							{$form.enabled
								? 'It can render when the selected schedule is active.'
								: 'Create safely, review it, then enable it when ready.'}
						</p>
					</div>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<AdminDateTimePicker
						label="Starts at"
						name="startsAt"
						bind:value={$form.startsAt}
						error={$errors.startsAt}
					/>
					<AdminDateTimePicker
						label="Ends at"
						name="endsAt"
						bind:value={$form.endsAt}
						error={$errors.endsAt}
					/>
				</div>
				<div class="mt-5 border border-ash/20 px-4 py-1">
					<AdminToggle
						label="Enable section"
						description="Allow rendering when the publishing window is active."
						name="enabled"
						bind:checked={$form.enabled}
					/>
				</div>
			</AdminCard>
		{/snippet}

		{#snippet sidebarContent()}
			<div class="p-4 sm:p-5">
				<div class="flex items-center justify-between gap-3">
					<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Live snapshot</p>
					<AdminBadge variant={$form.enabled ? 'success' : 'neutral'}>
						{$form.enabled ? 'Enabled' : 'Draft'}
					</AdminBadge>
				</div>

				<div class="mt-4 grid grid-cols-2 border border-ash/15 bg-void p-1">
					<button
						type="button"
						onclick={() => (previewMode = 'desktop')}
						aria-pressed={previewMode === 'desktop'}
						class="flex min-h-11 items-center justify-center gap-2 font-mono text-[9px] tracking-widest uppercase {previewMode ===
						'desktop'
							? 'bg-volt text-void'
							: 'text-ash hover:text-bone'}"
					>
						<Monitor size={14} aria-hidden="true" /> Desktop
					</button>
					<button
						type="button"
						onclick={() => (previewMode = 'mobile')}
						aria-pressed={previewMode === 'mobile'}
						class="flex min-h-11 items-center justify-center gap-2 font-mono text-[9px] tracking-widest uppercase {previewMode ===
						'mobile'
							? 'bg-volt text-void'
							: 'text-ash hover:text-bone'}"
					>
						<Smartphone size={14} aria-hidden="true" /> Mobile
					</button>
				</div>

				<div
					class="mt-3 overflow-hidden border border-ash/15 bg-void {previewMode === 'mobile'
						? 'mx-auto max-w-52'
						: 'w-full'}"
				>
					<div class={previewMode === 'mobile' ? 'aspect-3/4' : 'aspect-video'}>
						{#if currentPreview}
							<img
								src={currentPreview}
								alt={currentPreviewAlt}
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="grid h-full place-items-center bg-charcoal/35 p-4 text-center">
								<div class="grid justify-items-center gap-2">
									<ImageIcon size={26} class="text-ash/30" aria-hidden="true" />
									<span class="font-mono text-[9px] tracking-widest text-ash/50 uppercase">
										No {previewMode} image
									</span>
								</div>
							</div>
						{/if}
					</div>
					<div class="p-4">
						<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
							{selectedType.label} / {sourceLabels[$form.sourceType]}
						</p>
						<h2 class="mt-2 font-display text-3xl leading-none wrap-break-word text-bone uppercase">
							{$form.title || $form.adminName || 'Untitled section'}
						</h2>
						{#if $form.body}
							<p class="mt-2 line-clamp-3 text-xs leading-relaxed text-ash">{$form.body}</p>
						{:else}
							<p class="mt-2 text-xs text-ash/45">Section body preview</p>
						{/if}
						{#if $form.primaryCtaLabel || $form.secondaryCtaLabel}
							<div class="mt-4 flex flex-wrap gap-2">
								{#if $form.primaryCtaLabel}
									<span class="bg-volt px-3 py-2 font-mono text-[8px] text-void uppercase">
										{$form.primaryCtaLabel}
									</span>
								{/if}
								{#if $form.secondaryCtaLabel}
									<span
										class="border border-ash/30 px-3 py-2 font-mono text-[8px] text-bone uppercase"
									>
										{$form.secondaryCtaLabel}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<div class="mt-4 grid gap-2 border-t border-ash/10 pt-4">
					<div class="flex min-w-0 justify-between gap-3 font-mono text-[9px] uppercase">
						<span class="shrink-0 text-ash/50">Layout</span>
						<span class="min-w-0 truncate text-right text-bone">{selectedLayout}</span>
					</div>
					<div class="flex min-w-0 justify-between gap-3 font-mono text-[9px] uppercase">
						<span class="shrink-0 text-ash/50">Source</span>
						<span class="min-w-0 truncate text-right text-bone">{selectedReference}</span>
					</div>
					{#if showsItemLimit}
						<div class="flex justify-between gap-3 font-mono text-[9px] uppercase">
							<span class="text-ash/50">Items</span>
							<span class="text-bone">{$form.itemLimit}</span>
						</div>
					{/if}
				</div>

				{#if snapshotWarnings.length > 0}
					<div class="mt-4 border border-amber-300/20 bg-amber-300/5 p-3.5">
						<p
							class="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
						>
							<AlertTriangle size={12} aria-hidden="true" />
							Attention ({snapshotWarnings.length})
						</p>
						<ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-ash/75">
							{#each snapshotWarnings as warning (warning)}
								<li>{warning}</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div
						class="mt-4 flex items-center gap-2 border border-volt/20 bg-volt/5 p-3 text-xs text-volt"
					>
						<CheckCircle2 size={14} class="shrink-0" aria-hidden="true" />
						Required setup complete.
					</div>
				{/if}
			</div>
		{/snippet}
	</AdminFormLayout>
</form>

<AdminUnsavedChangesGuard
	dirty={hasUnsavedChanges && !$submitting}
	title="Leave new homepage section?"
	description="Section fields and selected media have not been saved."
	onsave={() => formElement?.requestSubmit()}
/>
