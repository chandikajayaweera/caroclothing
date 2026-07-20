<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import AdminSection from '$lib/components/admin/layout/AdminSection.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminDateTimePicker from '$lib/components/admin/controls/AdminDateTimePicker.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	function initialValue<T>(getValue: () => T): T {
		return getValue();
	}
	const sf = superForm(
		initialValue(() => data.createForm),
		{ resetForm: false }
	);
	const { form, errors, enhance, message, submitting } = sf;
	let desktopPreview = $state<string | null>(null);
	let mobilePreview = $state<string | null>(null);
	const sourceOptions = $derived.by(() => {
		const map = {
			hero: ['manual', 'promotion'],
			product_grid: ['new_arrivals', 'featured_products', 'category_products'],
			product_spotlight: ['manual'],
			category_showcase: ['manual', 'root_categories'],
			promotion_campaign: ['promotion'],
			service_strip: ['manual', 'shipping'],
			review_rail: ['recent_reviews']
		};
		return map[$form.type];
	});
	function previewFile(event: Event, role: 'desktop' | 'mobile') {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		const value = file ? URL.createObjectURL(file) : null;
		if (role === 'desktop') {
			revokePreview(desktopPreview);
			desktopPreview = value;
		} else {
			revokePreview(mobilePreview);
			mobilePreview = value;
		}
	}
	function revokePreview(value: string | null) {
		if (value?.startsWith('blob:')) URL.revokeObjectURL(value);
	}
	onDestroy(() => {
		revokePreview(desktopPreview);
		revokePreview(mobilePreview);
	});
</script>

<form method="POST" action="?/create" enctype="multipart/form-data" use:enhance>
	<input type="hidden" name="pageKey" value="home" />
	<input type="hidden" name="sortOrder" value={$form.sortOrder} />
	<AdminFormLayout
		backHref="/app/storefront"
		backLabel="Homepage sections"
		kicker="Storefront"
		title="New homepage section"
		description="Choose one bounded section type and one trusted source."
		actionMessage={$message ?? actionData?.form?.message}
		isSubmitting={$submitting}
		submitLabel="Create section"
		oncancel={() => goto(resolve('/app/storefront'))}
	>
		{#snippet mainContent()}
			<AdminSection
				title="Section identity"
				description="Internal label, component type, source, and approved layout."
			>
				<div class="grid gap-4 md:grid-cols-2">
					<AdminInput
						label="Admin name"
						name="adminName"
						bind:value={$form.adminName}
						error={$errors.adminName}
						required
					/>
					<AdminSelect
						label="Section type"
						name="type"
						bind:value={$form.type}
						error={$errors.type}
						required
					>
						{#each ['hero', 'product_grid', 'product_spotlight', 'category_showcase', 'promotion_campaign', 'service_strip', 'review_rail'] as item (item)}<option
								value={item}>{item.replaceAll('_', ' ')}</option
							>{/each}
					</AdminSelect>
					<AdminSelect
						label="Content source"
						name="sourceType"
						bind:value={$form.sourceType}
						error={$errors.sourceType}
						required
					>
						{#each sourceOptions as item (item)}<option value={item}
								>{item.replaceAll('_', ' ')}</option
							>{/each}
					</AdminSelect>
					<AdminSelect
						label="Layout"
						name="layoutVariant"
						bind:value={$form.layoutVariant}
						error={$errors.layoutVariant}
						required
					>
						{#each ['full_bleed', 'split', 'grid_2', 'grid_3', 'grid_4', 'rail', 'compact'] as item (item)}<option
								value={item}>{item.replaceAll('_', ' ')}</option
							>{/each}
					</AdminSelect>
				</div>
			</AdminSection>

			<AdminSection
				title="Copy and calls to action"
				description="Plain text only. No custom HTML or component names."
			>
				<div class="grid gap-4 md:grid-cols-2">
					<AdminInput
						label="Eyebrow"
						name="eyebrow"
						bind:value={$form.eyebrow}
						error={$errors.eyebrow}
					/>
					<AdminInput label="Heading" name="title" bind:value={$form.title} error={$errors.title} />
					<div class="md:col-span-2">
						<AdminTextarea
							label="Body"
							name="body"
							bind:value={$form.body}
							error={$errors.body}
							rows={4}
						/>
					</div>
					<AdminInput
						label="Primary CTA label"
						name="primaryCtaLabel"
						bind:value={$form.primaryCtaLabel}
						error={$errors.primaryCtaLabel}
					/>
					<AdminInput
						label="Primary CTA URL"
						name="primaryCtaUrl"
						bind:value={$form.primaryCtaUrl}
						error={$errors.primaryCtaUrl}
						placeholder="/shop"
					/>
					<AdminInput
						label="Secondary CTA label"
						name="secondaryCtaLabel"
						bind:value={$form.secondaryCtaLabel}
						error={$errors.secondaryCtaLabel}
					/>
					<AdminInput
						label="Secondary CTA URL"
						name="secondaryCtaUrl"
						bind:value={$form.secondaryCtaUrl}
						error={$errors.secondaryCtaUrl}
						placeholder="/about"
					/>
				</div>
			</AdminSection>

			<AdminSection
				title="Source selection"
				description="References stay owned by products, categories, promotions, and shipping."
			>
				<div class="grid gap-4 md:grid-cols-2">
					{#if $form.type === 'product_spotlight'}<AdminSelect
							label="Product"
							name="productId"
							bind:value={$form.productId}
							error={$errors.productId}
							><option value="">Choose product</option
							>{#each data.options.products as item (item.id)}<option value={item.id}
									>{item.name}{item.isActive ? '' : ' (inactive)'}</option
								>{/each}</AdminSelect
						>{/if}
					{#if $form.sourceType === 'category_products'}<AdminSelect
							label="Category"
							name="categoryId"
							bind:value={$form.categoryId}
							error={$errors.categoryId}
							><option value="">Choose category</option
							>{#each data.options.categories as item (item.id)}<option value={item.id}
									>{item.name}</option
								>{/each}</AdminSelect
						>{/if}
					{#if $form.sourceType === 'promotion'}<AdminSelect
							label="Promotion"
							name="promotionId"
							bind:value={$form.promotionId}
							error={$errors.promotionId}
							><option value="">Choose promotion</option
							>{#each data.options.promotions as item (item.id)}<option value={item.id}
									>{item.name} · {item.status}</option
								>{/each}</AdminSelect
						>{/if}
					{#if $form.sourceType === 'shipping'}<AdminSelect
							label="Shipping method"
							name="shippingMethodId"
							bind:value={$form.shippingMethodId}
							error={$errors.shippingMethodId}
							><option value="">Choose method</option
							>{#each data.options.shippingMethods as item (item.id)}<option value={item.id}
									>{item.name}</option
								>{/each}</AdminSelect
						>{/if}
					<AdminInput
						label="Item limit"
						name="itemLimit"
						type="number"
						min="1"
						max="12"
						bind:value={$form.itemLimit}
						error={$errors.itemLimit}
					/>
				</div>
				{#if $form.type === 'category_showcase' && $form.sourceType === 'manual'}
					<fieldset class="mt-5 grid gap-2 sm:grid-cols-2">
						<legend class="mb-2 text-xs font-semibold text-ash">Curated categories</legend
						>{#each data.options.categories as item (item.id)}<label
								class="flex min-h-11 items-center gap-3 border border-ash/20 px-3 text-sm text-bone"
								><input
									type="checkbox"
									name="categoryIds"
									value={item.id}
									bind:group={$form.categoryIds}
								/>
								{item.name}</label
							>{/each}
					</fieldset>
				{/if}
			</AdminSection>

			<AdminSection
				title="Responsive media"
				description="Desktop uses a wide crop. Mobile uses a portrait crop. Original bytes stay in R2."
			>
				<div class="grid gap-5 md:grid-cols-2">
					<label class="grid gap-2 text-xs font-semibold text-ash"
						>Desktop image<input
							name="desktopImage"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							onchange={(event) => previewFile(event, 'desktop')}
							class="min-h-11 border border-ash/30 bg-void p-2 text-sm text-bone"
						/>{#if desktopPreview}<img
								src={desktopPreview}
								alt="Desktop preview"
								class="aspect-video w-full object-cover"
							/>{/if}<AdminInput
							label="Desktop alt text"
							name="desktopAltText"
							bind:value={$form.desktopAltText}
							error={$errors.desktopAltText}
						/></label
					>
					<label class="grid gap-2 text-xs font-semibold text-ash"
						>Mobile image<input
							name="mobileImage"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							onchange={(event) => previewFile(event, 'mobile')}
							class="min-h-11 border border-ash/30 bg-void p-2 text-sm text-bone"
						/>{#if mobilePreview}<img
								src={mobilePreview}
								alt="Mobile preview"
								class="aspect-3/4 w-full object-cover"
							/>{/if}<AdminInput
							label="Mobile alt text"
							name="mobileAltText"
							bind:value={$form.mobileAltText}
							error={$errors.mobileAltText}
						/></label
					>
				</div>
			</AdminSection>

			<AdminSection
				title="Publishing window"
				description="Disabled by default. Scheduling does not activate promotions."
			>
				<div class="grid gap-4 md:grid-cols-2">
					<AdminDateTimePicker
						label="Starts at"
						name="startsAt"
						bind:value={$form.startsAt}
						error={$errors.startsAt}
					/><AdminDateTimePicker
						label="Ends at"
						name="endsAt"
						bind:value={$form.endsAt}
						error={$errors.endsAt}
					/>
				</div>
				<div class="mt-4 border border-ash/20 px-4">
					<AdminToggle
						label="Enabled"
						description="Section can render when inside its schedule."
						name="enabled"
						bind:checked={$form.enabled}
					/>
				</div>
			</AdminSection>
		{/snippet}
		{#snippet sidebarContent()}
			<div class="p-5">
				<p class="font-mono text-[10px] tracking-widest text-volt uppercase">Live shape preview</p>
				<div class="mt-4 overflow-hidden border border-ash/20 bg-void">
					{#if desktopPreview}<img
							src={desktopPreview}
							alt="Preview"
							class="aspect-video w-full object-cover"
						/>{/if}
					<div class="p-5">
						<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
							{$form.type.replaceAll('_', ' ')} · {$form.sourceType.replaceAll('_', ' ')}
						</p>
						<h2 class="mt-2 font-display text-4xl text-bone uppercase">
							{$form.title || $form.adminName || 'Untitled section'}
						</h2>
						<p class="mt-2 text-xs text-ash">{$form.body || 'Section body preview'}</p>
					</div>
				</div>
				<p class="mt-4 text-xs text-ash/60">
					New content remains disabled unless you explicitly enable it.
				</p>
			</div>
		{/snippet}
	</AdminFormLayout>
</form>
