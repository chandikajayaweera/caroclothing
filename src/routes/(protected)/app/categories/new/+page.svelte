<script lang="ts">
	import { generateSlug } from '$lib/shared/slug';
	import { FolderOpen, AlertTriangle } from 'lucide-svelte';
	import { filesProxy, superForm } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import { slide } from 'svelte/transition';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import AdminImageUpload from '$lib/components/admin/AdminImageUpload.svelte';
	import AdminChildCategoryList from '$lib/components/admin/AdminChildCategoryList.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data }: { data: PageData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const createCategorySuperform = superForm(
		initialForm(() => data.createCategoryForm),
		{
			dataType: 'json',
			resetForm: false
		}
	);

	const {
		form: createCategoryForm,
		errors: createCategoryErrors,
		message: createCategoryMessage,
		enhance: createCategoryEnhance,
		submitting: createCategorySubmitting
	} = createCategorySuperform;

	const imagesProxy = filesProxy(createCategorySuperform, 'images');

	// ── Image upload state ───────────────────────────────────────────────
	let rootImagePreviewUrl = $state<string | null>(null);
	let rootImageFile = $state<File | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	// ── Child categories state ────────────────────────────────────────────
	let childImages = $state<string[]>([]);
	let childFiles = $state<(File | null)[]>([]);

	// ── Toast state ───────────────────────────────────────────────────────
	let toastMessage = $state<string | null>(null);

	// ── Slug management ───────────────────────────────────────────────────
	let slugManuallyEdited = $state(false);

	function handleNameInput(): void {
		if (!slugManuallyEdited) {
			$createCategoryForm.slug = generateSlug($createCategoryForm.name ?? '');
		}
	}

	function handleSlugInput(): void {
		slugManuallyEdited = true;
	}

	// ── Root image sync ───────────────────────────────────────────────────
	function handleRootImageChange(file: File | null) {
		rootImageFile = file;
		rootImagePreviewUrl = file ? URL.createObjectURL(file) : null;
		syncSingleFileToForm();
	}

	function syncSingleFileToForm() {
		if (rootImageFile) {
			$imagesProxy = createFileList([rootImageFile]);
		} else {
			$imagesProxy = createFileList([]);
		}
	}

	// ── Parent category change ────────────────────────────────────────────
	function handleParentIdChange(): void {
		// When switching to child mode, clear root image
		if ($createCategoryForm.parentId) {
			rootImageFile = null;
			if (rootImagePreviewUrl) {
				URL.revokeObjectURL(rootImagePreviewUrl);
				rootImagePreviewUrl = null;
			}
			syncSingleFileToForm();
		} else {
			// Switching back to root mode: clear child categories
			$createCategoryForm.children = [];
			childImages.forEach((url) => {
				if (url) URL.revokeObjectURL(url);
			});
			childImages = [];
			childFiles = [];
			syncFilesToForm();
		}
	}

	// ── Child file sync ───────────────────────────────────────────────────
	function syncFilesToForm() {
		const denseFiles = childFiles.filter((f): f is File => f !== null);

		$createCategoryForm.children.forEach((child, i) => {
			const file = childFiles[i];
			if (file) {
				child.imageIndex = denseFiles.indexOf(file);
			} else {
				child.imageIndex = null;
			}
		});

		$imagesProxy = createFileList(denseFiles);
	}

	function createFileList(files: File[]): FileList {
		const transfer = new DataTransfer();
		for (const file of files) transfer.items.add(file);
		return transfer.files;
	}

	// ── Snapshot / Warnings ───────────────────────────────────────────────
	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if ($createCategoryForm.parentId) {
			if ($createCategoryForm.children.length === 0) {
				warnings.push('Add at least one child category');
			} else {
				$createCategoryForm.children.forEach((c, idx) => {
					if (!c.name) warnings.push(`Child #${idx + 1} is missing a name`);
					if (!c.slug) warnings.push(`Child #${idx + 1} is missing a slug`);
				});
			}
		} else {
			if (!$createCategoryForm.name) warnings.push('Category name is required');
			if (!$createCategoryForm.slug) warnings.push('Slug is required');
		}
		return warnings;
	});

	const parentCategoryName = $derived.by(() => {
		if (!$createCategoryForm.parentId) return 'Root';
		const parent = data.allCategories.find((c) => c.id === $createCategoryForm.parentId);
		return parent ? parent.name : 'Unknown';
	});

	// ── Server error toast ────────────────────────────────────────────────
	$effect(() => {
		if ($createCategoryMessage) {
			toastMessage = $createCategoryMessage;
		}
	});

	function formatFileSize(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<AdminFormLayout
	backHref="/app/categories"
	backLabel="Back to categories"
	kicker="Catalog"
	title="New Category"
	actionMessage={null}
	isSubmitting={$createCategorySubmitting}
	submitLabel="Save Category"
	oncancel={() => history.back()}
	enhanceAction={createCategoryEnhance}
	bind:formElement
	formAttrs={{
		method: 'POST',
		action: '?/createCategory',
		enctype: 'multipart/form-data',
		novalidate: true
	}}
>
	{#snippet mainContent()}
		<!-- ── Hidden superforms file input ──────────────────────────── -->
		<input
			id="hidden-category-images-input"
			name="images"
			type="file"
			multiple
			bind:files={$imagesProxy}
			class="hidden"
		/>
		<!-- ── Hierarchy & Settings ──────────────────────────────────── -->
		<AdminCard kicker="Step 1" title="Hierarchy" border="border border-ash/15">
			<div class="grid gap-4 sm:grid-cols-2">
				<AdminSelect
					label="Parent Category"
					name="parentId"
					bind:value={$createCategoryForm.parentId}
					onchange={handleParentIdChange}
					error={$createCategoryErrors.parentId}
					placeholder="No parent (Root Category)"
				>
					<option value="">No parent (Root Category)</option>
					{#each data.categories as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</AdminSelect>

				{#if !$createCategoryForm.parentId}
					<AdminInput
						label="Sort Order"
						name="sortOrder"
						type="number"
						min="0"
						bind:value={$createCategoryForm.sortOrder}
						error={$createCategoryErrors.sortOrder}
						helpText="Lower number = higher priority in menus"
					/>
				{/if}
			</div>
		</AdminCard>

		<!-- ── Basic Info (root mode only) ──────────────────────────── -->
		{#if !$createCategoryForm.parentId}
			<AdminCard kicker="Step 2" title="Basic Info" border="border border-ash/15">
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminInput
						label="Category Name"
						name="name"
						bind:value={$createCategoryForm.name}
						required
						oninput={handleNameInput}
						error={$createCategoryErrors.name}
						placeholder="e.g. Heavyweight Tees"
					/>

					<AdminInput
						label="Slug"
						name="slug"
						bind:value={$createCategoryForm.slug}
						required
						oninput={handleSlugInput}
						error={$createCategoryErrors.slug}
						placeholder="e.g. heavyweight-tees"
						helpText="Lowercase letters, numbers, and hyphens only"
					/>
				</div>

				<div class="mt-4 grid gap-1.5">
					<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Description</span>
					<textarea
						name="description"
						bind:value={$createCategoryForm.description}
						placeholder="Describe the designs, silhouettes, and fabric weight featured in this category..."
						class="min-h-28 w-full resize-y border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					></textarea>
					{#if $createCategoryErrors.description}
						<span class="font-sans text-xs text-red-400"
							>{$createCategoryErrors.description[0]}</span
						>
					{/if}
				</div>
			</AdminCard>

			<!-- ── Category Image ──────────────────────────────────────── -->
			<AdminCard kicker="Step 3" title="Category Image" border="border border-ash/15">
				<AdminImageUpload
					id="root-category-image"
					bind:previewUrl={rootImagePreviewUrl}
					bind:file={rootImageFile}
					onchange={handleRootImageChange}
					accept="image/jpeg,image/png,image/webp,image/avif"
					maxSizeMb={5}
				/>
			</AdminCard>

			<!-- ── Publish Settings ────────────────────────────────────── -->
			<AdminCard border="border border-ash/15">
				<AdminToggle
					label="Publish Category"
					description="Active categories appear in storefront filters and menus."
					name="isActive"
					bind:checked={$createCategoryForm.isActive}
				/>
			</AdminCard>
		{:else}
			<!-- ── Child Categories (parent mode) ──────────────────────── -->
			<AdminCard kicker="Step 2" title="Child Categories" border="border border-ash/15">
				<AdminChildCategoryList
					bind:children={$createCategoryForm.children}
					bind:childImages
					bind:childFiles
					errors={$createCategoryErrors.children}
					onsync={syncFilesToForm}
				/>
			</AdminCard>
		{/if}
	{/snippet}

	{#snippet sidebarContent()}
		<!-- ── Image Preview ─────────────────────────────────────────── -->
		<div
			class="relative aspect-video w-full overflow-hidden border-b border-charcoal bg-charcoal/20"
		>
			{#if rootImagePreviewUrl && !$createCategoryForm.parentId}
				<img
					src={rootImagePreviewUrl}
					alt="Category preview"
					class="h-full w-full object-cover transition-transform duration-300"
				/>
			{:else}
				<div class="flex h-full items-center justify-center">
					<FolderOpen size={28} class="text-ash/25" />
				</div>
			{/if}
		</div>

		<!-- ── Snapshot Details ──────────────────────────────────────── -->
		<div class="p-5">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Snapshot</p>

			{#if !$createCategoryForm.parentId}
				<div class="mt-2 flex items-start justify-between gap-3">
					<h2
						class="min-w-0 truncate font-sans text-base leading-snug font-semibold text-bone uppercase"
					>
						{$createCategoryForm.name || 'Unnamed Category'}
					</h2>
					<span
						class="shrink-0 border px-2 py-1 font-mono text-[9px] tracking-widest uppercase {$createCategoryForm.isActive
							? 'border-volt/30 bg-volt/10 text-volt'
							: 'border-red-500/25 bg-red-950/20 text-red-300'}"
					>
						{$createCategoryForm.isActive ? 'Live' : 'Draft'}
					</span>
				</div>
				<p class="mt-1 truncate font-mono text-[10px] text-ash">
					/{$createCategoryForm.slug || 'no-slug'}
				</p>

				<div class="mt-4 space-y-1 border-t border-ash/10 pt-4">
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash/50">Parent:</span>
						<span class="text-bone">Root</span>
					</div>
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash/50">Sort Order:</span>
						<span class="text-bone">{$createCategoryForm.sortOrder ?? 0}</span>
					</div>
					{#if rootImageFile}
						<div class="flex justify-between font-mono text-[10px] uppercase">
							<span class="text-ash/50">Image:</span>
							<span class="text-volt">{formatFileSize(rootImageFile.size)}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="mt-2">
					<div class="flex items-center justify-between gap-3">
						<h2
							class="min-w-0 truncate font-sans text-base leading-snug font-semibold text-bone uppercase"
						>
							{parentCategoryName}
						</h2>
						<span
							class="shrink-0 border border-volt/30 bg-volt/10 px-2 py-1 font-mono text-[9px] tracking-widest text-volt uppercase"
						>
							Parent
						</span>
					</div>
					<p class="mt-1 font-mono text-[10px] text-ash">Creating subcategories</p>
				</div>

				<!-- Subcategory mini-list -->
				{#if $createCategoryForm.children.length > 0}
					<div class="mt-4 border-t border-ash/10 pt-4">
						<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
							Subcategories ({$createCategoryForm.children.length})
						</p>
						<div class="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
							{#each $createCategoryForm.children as child, i (child.clientId)}
								<div class="flex items-center gap-2 border border-charcoal bg-void/50 px-3 py-2">
									{#if childImages[i]}
										<img
											src={childImages[i]}
											alt={child.name}
											class="h-7 w-5 shrink-0 object-cover"
										/>
									{/if}
									<span class="min-w-0 truncate font-mono text-[10px] text-bone"
										>{child.name || 'Unnamed'}</span
									>
									{#if child.slug}
										<span class="ml-auto shrink-0 font-mono text-[8px] text-ash/40"
											>/{child.slug}</span
										>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- ── Warnings ──────────────────────────────────────────────── -->
		{#if snapshotWarnings.length > 0}
			<div
				transition:slide={{ duration: 200 }}
				class="mx-5 mb-4 border border-amber-300/20 bg-amber-300/5 p-3.5"
			>
				<p
					class="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
				>
					<AlertTriangle size={12} />
					Attention ({snapshotWarnings.length})
				</p>
				<ul class="mt-2 list-disc space-y-1 pl-4 font-sans text-xs text-ash/70">
					{#each snapshotWarnings as warning (warning)}
						<li>{warning}</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/snippet}
</AdminFormLayout>

<!-- ── Server Error Toast ──────────────────────────────────────────── -->
<AdminToast
	message={toastMessage}
	type="error"
	duration={6000}
	onclose={() => (toastMessage = null)}
/>
