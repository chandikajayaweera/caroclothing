<script lang="ts">
	import { generateSlug } from '$lib/shared/slug';
	import { FolderPlus } from 'lucide-svelte';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import type {
		ProductBasicsConstraints,
		ProductBasicsErrors,
		ProductBasicsForm,
		ProductUiCategory,
		ProductUiOption
	} from './product-ui.types';

	let {
		form = $bindable(),
		errors,
		constraints,
		categories,
		genderOptions,
		fitOptions,
		slugManuallyEdited = $bindable(false),
		imagePreviews = []
	}: {
		form: ProductBasicsForm;
		errors: ProductBasicsErrors;
		constraints: ProductBasicsConstraints;
		categories: ProductUiCategory[];
		genderOptions: ProductUiOption[];
		fitOptions: ProductUiOption[];
		slugManuallyEdited?: boolean;
		imagePreviews?: unknown[];
	} = $props();

	let categorySearch = $state('');
	let categoryDropdownOpen = $state(false);

	const filteredCategories = $derived.by(() => {
		const q = categorySearch.toLowerCase().trim();
		if (!q) return categories;
		return categories.filter((c) => c.name.toLowerCase().includes(q));
	});

	$effect(() => {
		const currentCategory = categories.find((category) => category.id === form.categoryId);
		categorySearch = currentCategory ? currentCategory.name : '';
	});

	function handleNameInput(): void {
		if (!slugManuallyEdited) {
			form.slug = generateSlug(form.name ?? '');
		}
		if (imagePreviews.length > 0 && form.imageMetadata) {
			form.imageMetadata = form.imageMetadata.map((metadata) =>
				metadata.altText ? metadata : { ...metadata, altText: form.name || null }
			);
		}
	}

	function formatLabel(value: string | undefined): string {
		return (value ?? '').replace(/_/g, ' ');
	}
</script>

<AdminCard title="Product Basics" border="border border-ash/15" class="shadow-sm">
	<div class="grid gap-5">
		<div class="grid gap-4 md:grid-cols-2">
			<AdminInput
				label="Product Name"
				name="name"
				placeholder="e.g. Classic Volt Oversized Tee"
				bind:value={form.name}
				oninput={handleNameInput}
				required
				error={errors.name}
				{...constraints.name}
			/>

			<AdminInput
				label="Slug"
				name="slug"
				bind:value={form.slug}
				oninput={() => (slugManuallyEdited = true)}
				required
				error={errors.slug}
				helpText="Auto-generated from name. Edit to customize."
				{...constraints.slug}
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
				<input type="hidden" name="categoryId" bind:value={form.categoryId} />

				{#if categoryDropdownOpen}
					<div
						class="absolute top-[calc(100%+4px)] left-0 z-45 max-h-60 w-full overflow-y-auto border border-ash/20 bg-void shadow-xl"
					>
						<button
							type="button"
							onclick={() => {
								form.categoryId = null;
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
									form.categoryId = category.id;
									categorySearch = category.name;
									categoryDropdownOpen = false;
								}}
								class="w-full px-4 py-2.5 text-left font-sans text-sm text-bone transition-colors hover:bg-charcoal hover:text-volt"
							>
								{category.name}
							</button>
						{:else}
							<div class="px-4 py-2.5 font-sans text-xs text-ash/60">No matching categories</div>
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
			<AdminSelect label="Gender" name="gender" bind:value={form.gender}>
				{#each genderOptions as option (option.value)}
					<option value={option.value}>{formatLabel(option.label)}</option>
				{/each}
			</AdminSelect>

			<AdminSelect label="Fit" name="fit" bind:value={form.fit}>
				{#each fitOptions as option (option.value)}
					<option value={option.value}>{formatLabel(option.label)}</option>
				{/each}
			</AdminSelect>
		</div>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Product Summary</span>
			<textarea
				name="shortDescription"
				rows="2"
				placeholder="A short card description (max 150 characters)..."
				bind:value={form.shortDescription}
				class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
				{...constraints.shortDescription}
			></textarea>
		</label>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Full Description</span
			>
			<textarea
				name="description"
				rows="5"
				placeholder="Detailed sizing, styling guidelines, and specs..."
				bind:value={form.description}
				class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
				{...constraints.description}
			></textarea>
		</label>

		<div class="grid gap-4 border border-ash/20 bg-void p-4 sm:grid-cols-3">
			<AdminToggle
				label="Active Status"
				description="Visible to shoppers"
				name="isActive"
				bind:checked={form.isActive}
			/>

			<AdminToggle
				label="Featured"
				description="Feature on homepage"
				name="isFeatured"
				bind:checked={form.isFeatured}
				class="border-t border-ash/10 pt-3 sm:border-t-0 sm:border-l sm:border-ash/10 sm:pt-0 sm:pl-4"
			/>

			<AdminToggle
				label="New Arrival"
				description="Display tag badge"
				name="isNewArrival"
				bind:checked={form.isNewArrival}
				class="border-t border-ash/10 pt-3 sm:border-t-0 sm:border-l sm:border-ash/10 sm:pt-0 sm:pl-4"
			/>
		</div>
	</div>
</AdminCard>
