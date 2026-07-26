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
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	function initialValue<T>(getValue: () => T): T {
		return getValue();
	}
	const SAVE_TIMEOUT_MS = 60_000;
	let saveTimeoutId: ReturnType<typeof setTimeout> | undefined;
	let saveTimeoutMessage = $state<string | null>(null);
	function clearSaveTimeout() {
		if (saveTimeoutId !== undefined) {
			clearTimeout(saveTimeoutId);
			saveTimeoutId = undefined;
		}
	}
	const sf = superForm(
		initialValue(() => data.updateForm),
		{
			resetForm: false,
			onSubmit({ controller }) {
				clearSaveTimeout();
				saveTimeoutMessage = null;
				saveTimeoutId = setTimeout(() => {
					saveTimeoutMessage =
						'Saving took too long. The request was stopped; refresh once before trying again.';
					controller.abort();
				}, SAVE_TIMEOUT_MS);
			},
			onResult() {
				clearSaveTimeout();
			},
			onError() {
				clearSaveTimeout();
				saveTimeoutMessage ??= 'Unable to finish saving. Check your connection and try again.';
			}
		}
	);
	const { form, errors, enhance, message, submitting } = sf;
	let desktopPreview = $state(
		initialValue(() => data.section.media.find((item) => item.role === 'desktop')?.imageUrl ?? null)
	);
	let mobilePreview = $state(
		initialValue(() => data.section.media.find((item) => item.role === 'mobile')?.imageUrl ?? null)
	);
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
		if (!file) return;
		const value = URL.createObjectURL(file);
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
		clearSaveTimeout();
		revokePreview(desktopPreview);
		revokePreview(mobilePreview);
	});
</script>

<form method="POST" action="?/update" enctype="multipart/form-data" use:enhance>
	<input type="hidden" name="sectionId" value={$form.sectionId} />
	<input type="hidden" name="pageKey" value="home" />
	<input type="hidden" name="sortOrder" value={$form.sortOrder} />
	<AdminFormLayout
		backHref="/app/storefront"
		backLabel="Homepage sections"
		kicker="Storefront"
		title={`Edit ${data.section.adminName}`}
		description="Update bounded content without changing its order here."
		actionMessage={saveTimeoutMessage ?? $message ?? actionData?.form?.message}
		isSubmitting={$submitting}
		submitLabel="Save section"
		oncancel={() => goto(resolve('/app/storefront'))}
	>
		{#snippet mainContent()}
			<AdminSection
				title="Section identity"
				description="Type, source, and layout are bounded to implemented renderers."
			>
				<div class="grid gap-4 md:grid-cols-2">
					<AdminInput
						label="Admin name"
						name="adminName"
						bind:value={$form.adminName}
						error={$errors.adminName}
						required
					/>
					<AdminSelect label="Section type" name="type" bind:value={$form.type} error={$errors.type}
						>{#each ['hero', 'product_grid', 'product_spotlight', 'category_showcase', 'promotion_campaign', 'service_strip', 'review_rail'] as item (item)}<option
								value={item}>{item.replaceAll('_', ' ')}</option
							>{/each}</AdminSelect
					>
					<AdminSelect
						label="Content source"
						name="sourceType"
						bind:value={$form.sourceType}
						error={$errors.sourceType}
						>{#each sourceOptions as item (item)}<option value={item}
								>{item.replaceAll('_', ' ')}</option
							>{/each}</AdminSelect
					>
					<AdminSelect
						label="Layout"
						name="layoutVariant"
						bind:value={$form.layoutVariant}
						error={$errors.layoutVariant}
						>{#each ['full_bleed', 'split', 'grid_2', 'grid_3', 'grid_4', 'rail', 'compact'] as item (item)}<option
								value={item}>{item.replaceAll('_', ' ')}</option
							>{/each}</AdminSelect
					>
				</div>
			</AdminSection>
			<AdminSection
				title="Copy and calls to action"
				description="Plain text and validated internal or HTTPS links only."
			>
				<div class="grid gap-4 md:grid-cols-2">
					<AdminInput
						label="Eyebrow"
						name="eyebrow"
						bind:value={$form.eyebrow}
						error={$errors.eyebrow}
					/><AdminInput
						label="Heading"
						name="title"
						bind:value={$form.title}
						error={$errors.title}
					/>
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
					/><AdminInput
						label="Primary CTA URL"
						name="primaryCtaUrl"
						bind:value={$form.primaryCtaUrl}
						error={$errors.primaryCtaUrl}
					/>
					<AdminInput
						label="Secondary CTA label"
						name="secondaryCtaLabel"
						bind:value={$form.secondaryCtaLabel}
						error={$errors.secondaryCtaLabel}
					/><AdminInput
						label="Secondary CTA URL"
						name="secondaryCtaUrl"
						bind:value={$form.secondaryCtaUrl}
						error={$errors.secondaryCtaUrl}
					/>
				</div>
			</AdminSection>
			<AdminSection
				title="Source selection"
				description="References are validated against their owning domain."
			>
				<div class="grid gap-4 md:grid-cols-2">
					{#if $form.type === 'product_spotlight'}<AdminSelect
							label="Product"
							name="productId"
							bind:value={$form.productId}
							error={$errors.productId}
							><option value="">Choose product</option
							>{#each data.options.products as item (item.id)}<option value={item.id}
									>{item.name}</option
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
				{#if $form.type === 'category_showcase' && $form.sourceType === 'manual'}<fieldset
						class="mt-5 grid gap-2 sm:grid-cols-2"
					>
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
					</fieldset>{/if}
			</AdminSection>
			<AdminSection
				title="Responsive media"
				description="Upload a replacement or explicitly remove the current role."
			>
				<div class="grid gap-5 md:grid-cols-2">
					<div class="grid gap-2">
						{#if desktopPreview}<img
								src={desktopPreview}
								alt="Desktop preview"
								class="aspect-video w-full object-cover"
							/>{/if}<label class="text-xs font-semibold text-ash"
							>Desktop replacement<input
								name="desktopImage"
								type="file"
								accept="image/jpeg,image/png,image/webp,image/avif"
								onchange={(event) => previewFile(event, 'desktop')}
								class="mt-2 min-h-11 w-full border border-ash/30 bg-void p-2 text-sm text-bone"
							/></label
						>
						{#if $errors.desktopImage?.[0]}
							<p class="text-xs text-red-400">{$errors.desktopImage[0]}</p>
						{/if}
						<AdminInput
							label="Desktop alt text"
							name="desktopAltText"
							bind:value={$form.desktopAltText}
							error={$errors.desktopAltText}
						/><label class="text-xs text-ash"
							><input type="hidden" name="removeDesktopImage" value="false" /><input
								type="checkbox"
								name="removeDesktopImage"
								value="true"
								bind:checked={$form.removeDesktopImage}
							/> Remove desktop image</label
						>
					</div>
					<div class="grid gap-2">
						{#if mobilePreview}<img
								src={mobilePreview}
								alt="Mobile preview"
								class="aspect-3/4 w-full object-cover"
							/>{/if}<label class="text-xs font-semibold text-ash"
							>Mobile replacement<input
								name="mobileImage"
								type="file"
								accept="image/jpeg,image/png,image/webp,image/avif"
								onchange={(event) => previewFile(event, 'mobile')}
								class="mt-2 min-h-11 w-full border border-ash/30 bg-void p-2 text-sm text-bone"
							/></label
						>
						{#if $errors.mobileImage?.[0]}
							<p class="text-xs text-red-400">{$errors.mobileImage[0]}</p>
						{/if}
						<AdminInput
							label="Mobile alt text"
							name="mobileAltText"
							bind:value={$form.mobileAltText}
							error={$errors.mobileAltText}
						/><label class="text-xs text-ash"
							><input type="hidden" name="removeMobileImage" value="false" /><input
								type="checkbox"
								name="removeMobileImage"
								value="true"
								bind:checked={$form.removeMobileImage}
							/> Remove mobile image</label
						>
					</div>
				</div>
			</AdminSection>
			<AdminSection
				title="Publishing window"
				description="A section renders only when enabled and inside this window."
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
						description="Allow rendering when scheduled."
						name="enabled"
						bind:checked={$form.enabled}
					/>
				</div>
			</AdminSection>
			<div class="border border-red-500/20 bg-red-500/5 p-5">
				<h2 class="font-mono text-[10px] tracking-widest text-red-400 uppercase">Danger zone</h2>
				<p class="mt-2 text-xs text-ash">Deletion removes section state and its R2 media.</p>
				<AdminButton type="submit" formaction="?/delete" variant="danger" class="mt-4"
					>Delete section</AdminButton
				>
			</div>
		{/snippet}
		{#snippet sidebarContent()}
			<div class="p-5">
				<p class="font-mono text-[10px] tracking-widest text-volt uppercase">Preview</p>
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
							{$form.title || $form.adminName}
						</h2>
						<p class="mt-2 text-xs text-ash">{$form.body || 'Section body preview'}</p>
					</div>
				</div>
				<div class="mt-4 flex justify-between font-mono text-[9px] tracking-widest uppercase">
					<span class="text-ash">Status</span><span class={$form.enabled ? 'text-volt' : 'text-ash'}
						>{$form.enabled ? 'enabled' : 'disabled'}</span
					>
				</div>
			</div>
		{/snippet}
	</AdminFormLayout>
</form>
