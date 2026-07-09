<script lang="ts">
	import { generateSlug } from '$lib/shared/slug';
	import { FolderOpen, Upload, X } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { superForm } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data }: { data: PageData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const updateCategorySuperform = superForm(
		initialForm(() => data.updateCategoryForm),
		{
			resetForm: false
		}
	);

	const {
		form: updateCategoryForm,
		errors: updateCategoryErrors,
		constraints: updateCategoryConstraints,
		message: updateCategoryMessage,
		enhance: updateCategoryEnhance,
		submitting: updateCategorySubmitting
	} = updateCategorySuperform;

	let slugManuallyEdited = $state(false);
	let selectedFile = $state<File | null>(null);
	let imagePreviewUrl = $state<string | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);
	let toastMessage = $state<string | null>(null);

	$effect(() => {
		if ($updateCategoryMessage) toastMessage = $updateCategoryMessage;
	});

	const hasChildren = $derived(data.allCategories.some((c) => c.parentId === data.category.id));

	type TreeNode = {
		id: string;
		name: string;
		slug: string;
		description: string | null;
		imageUrl: string | null;
		sortOrder: number;
		isActive: boolean;
		parentId: string | null;
		children: TreeNode[];
	};

	let selectedNode = $state<TreeNode | null>(null);
	let showNodeModal = $state(false);
	let showImagePreviewPopup = $state(false);

	let editName = $state('');
	let editFile = $state<File | null>(null);
	let editPreviewUrl = $state<string | null>(null);
	let editError = $state<string | null>(null);
	let editSubmitting = $state(false);

	$effect(() => {
		if (selectedNode) {
			editName = selectedNode.name;
			editFile = null;
			if (editPreviewUrl) {
				URL.revokeObjectURL(editPreviewUrl);
				editPreviewUrl = null;
			}
			editError = null;
		}
	});

	function handleEditFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			editFile = files[0];
			if (editPreviewUrl) {
				URL.revokeObjectURL(editPreviewUrl);
			}
			editPreviewUrl = URL.createObjectURL(editFile);
		}
	}

	const updateCategoryPopupEnhance: SubmitFunction = () => {
		editSubmitting = true;
		editError = null;
		return async ({ result, update }) => {
			editSubmitting = false;
			if (result.type === 'success') {
				showNodeModal = false;
				selectedNode = null;
				await update();
			} else if (result.type === 'failure') {
				editError =
					(result.data as { message?: string })?.message ?? 'An error occurred while saving.';
			} else {
				editError = 'An unexpected error occurred.';
			}
		};
	};

	const categoryTree = $derived.by(() => {
		const parentId = $updateCategoryForm.parentId;
		if (!parentId) return null;

		const parent = data.allCategories.find((c) => c.id === parentId);
		if (!parent) return null;

		function buildNode(cat: (typeof data.allCategories)[number]): TreeNode {
			const children = data.allCategories.filter((c) => c.parentId === cat.id).map(buildNode);
			return {
				id: cat.id,
				name: cat.name,
				slug: cat.slug,
				description: cat.description,
				imageUrl: cat.imageUrl,
				sortOrder: cat.sortOrder,
				isActive: cat.isActive,
				parentId: cat.parentId,
				children
			};
		}

		return buildNode(parent);
	});

	function openNodeDetails(node: TreeNode) {
		selectedNode = node;
		showNodeModal = true;
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			selectedFile = files[0];
			if (imagePreviewUrl) {
				URL.revokeObjectURL(imagePreviewUrl);
			}
			imagePreviewUrl = URL.createObjectURL(selectedFile);
			$updateCategoryForm.removeImage = false; // Uploading overrides removeImage
		} else {
			selectedFile = null;
			if (imagePreviewUrl) {
				URL.revokeObjectURL(imagePreviewUrl);
				imagePreviewUrl = null;
			}
		}
	}

	function removeSelectedFile(event: MouseEvent) {
		event.preventDefault();
		selectedFile = null;
		if (imagePreviewUrl) {
			URL.revokeObjectURL(imagePreviewUrl);
			imagePreviewUrl = null;
		}
		const input = document.getElementById('category-image-input') as HTMLInputElement;
		if (input) {
			input.value = '';
		}
	}

	function handleNameInput(): void {
		if (!slugManuallyEdited) {
			$updateCategoryForm.slug = generateSlug($updateCategoryForm.name ?? '');
		}
	}

	function handleSlugInput(): void {
		slugManuallyEdited = true;
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$updateCategoryForm.name) warnings.push('Category name is required');
		if (!$updateCategoryForm.slug) warnings.push('Slug is required');
		if (!data.category.imageUrl && !selectedFile) warnings.push('No category image uploaded');
		if ($updateCategoryForm.removeImage && !selectedFile)
			warnings.push('Image is scheduled for deletion');
		return warnings;
	});

	const parentCategoryName = $derived.by(() => {
		if (!$updateCategoryForm.parentId) return 'Root';
		const parent = data.categories.find((c) => c.id === $updateCategoryForm.parentId);
		return parent ? parent.name : 'Unknown';
	});

	onDestroy(() => {
		if (imagePreviewUrl) {
			URL.revokeObjectURL(imagePreviewUrl);
		}
		if (editPreviewUrl) {
			URL.revokeObjectURL(editPreviewUrl);
		}
	});
</script>

<svelte:head>
	<title>Edit Category | {data.category.name} | Caro Admin</title>
	<meta name="description" content="Edit category details, sorting, and image." />
</svelte:head>

<AdminFormLayout
	backHref={`/app/categories/${data.category.slug}`}
	backLabel="Back to details"
	title="Edit Category"
	kicker={`Catalog / Categories / ${data.category.name}`}
	isSubmitting={$updateCategorySubmitting}
	submitLabel="Save Changes"
	oncancel={() => history.back()}
	enhanceAction={updateCategoryEnhance}
	bind:formElement
	formAttrs={{
		method: 'POST',
		action: '?/updateCategory',
		enctype: 'multipart/form-data',
		novalidate: true
	}}
>
	{#snippet mainContent()}
		<!-- Hierarchy & Sorting -->
		<AdminCard title="Hierarchy & Sort" border="border border-ash/15" class="shadow-sm">
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col">
					<AdminSelect
						label="Parent Category"
						name="parentId"
						bind:value={$updateCategoryForm.parentId}
						error={$updateCategoryErrors.parentId}
						disabled={hasChildren}
					>
						<option value="">No parent (Root Category)</option>
						{#each data.categories as category (category.id)}
							<option value={category.id}>{category.name}</option>
						{/each}
					</AdminSelect>
					{#if hasChildren}
						<span class="mt-1 font-sans text-[10px] text-ash/60">
							This category contains subcategories and must remain a root category.
						</span>
					{/if}
				</div>

				<AdminInput
					label="Sort Order"
					name="sortOrder"
					type="number"
					min="0"
					bind:value={$updateCategoryForm.sortOrder}
					error={$updateCategoryErrors.sortOrder}
					helpText="Higher numbers sort lower in menus"
				/>
			</div>
		</AdminCard>

		<!-- Basic Information Card -->
		<AdminCard title="Basic Info" border="border border-ash/15" class="shadow-sm">
			<div class="grid gap-4 sm:grid-cols-2">
				<AdminInput
					label="Category Name"
					name="name"
					bind:value={$updateCategoryForm.name}
					required
					oninput={handleNameInput}
					error={$updateCategoryErrors.name}
					placeholder="e.g. Heavyweight Tees"
				/>

				<AdminInput
					label="Slug"
					name="slug"
					bind:value={$updateCategoryForm.slug}
					required
					oninput={handleSlugInput}
					error={$updateCategoryErrors.slug}
					placeholder="e.g. heavyweight-tees"
					helpText="Must be alphanumeric lowercase with hyphens"
				/>
			</div>

			<div class="grid gap-1.5">
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Description</span>
				<textarea
					name="description"
					bind:value={$updateCategoryForm.description}
					placeholder="Provide details about the designs, silhouettes, and fabric weight featured in this category..."
					class="min-h-32 w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				></textarea>
				{#if $updateCategoryErrors.description}
					<span class="font-sans text-xs text-red-400">{$updateCategoryErrors.description[0]}</span>
				{/if}
			</div>
		</AdminCard>

		<!-- Parent Hierarchy Tree Preview -->
		{#if categoryTree}
			<AdminCard title="Hierarchy Tree Preview" border="border border-ash/15" class="shadow-sm">
				<p class="mb-4 font-sans text-xs text-ash/60">
					Current subcategory hierarchy under the selected parent. Click on any category node to
					inspect its configurations.
				</p>

				<div
					class="flex min-h-25 flex-col gap-2 overflow-x-auto border border-ash/15 bg-void/30 p-4"
				>
					{@render renderNode(categoryTree, 0)}
				</div>
			</AdminCard>
		{/if}

		<!-- Media Card -->
		<AdminCard title="Category Image" border="border border-ash/15" class="shadow-sm">
			<div class="grid gap-4">
				{#if data.category.imageUrl && !$updateCategoryForm.removeImage && !imagePreviewUrl}
					<div
						class="relative flex items-center justify-between gap-4 border border-charcoal bg-void p-3"
					>
						<div class="flex min-w-0 items-center gap-3">
							<div class="h-16 w-16 shrink-0 overflow-hidden border border-charcoal bg-charcoal">
								<img src={data.category.imageUrl} alt="" class="h-full w-full object-cover" />
							</div>
							<div class="min-w-0">
								<p class="truncate font-mono text-xs text-bone">Current Image</p>
								<p class="mt-0.5 font-mono text-[10px] text-ash">Stored in Cloudflare R2</p>
							</div>
						</div>
						<button
							type="button"
							onclick={() => {
								$updateCategoryForm.removeImage = true;
							}}
							class="flex h-8 w-8 items-center justify-center border border-red-400/30 text-red-300 transition-colors hover:bg-red-400 hover:text-void"
							title="Delete existing image"
						>
							<X size={14} />
						</button>
					</div>
				{:else if imagePreviewUrl}
					<div
						class="relative flex items-center justify-between gap-4 border border-charcoal bg-void p-3"
					>
						<div class="flex min-w-0 items-center gap-3">
							<div class="h-16 w-16 shrink-0 overflow-hidden border border-charcoal bg-charcoal">
								<img src={imagePreviewUrl} alt="Preview" class="h-full w-full object-cover" />
							</div>
							<div class="min-w-0">
								<p class="truncate font-mono text-xs text-bone">{selectedFile?.name}</p>
								<p class="mt-0.5 font-mono text-[10px] text-ash">
									{selectedFile ? formatFileSize(selectedFile.size) : ''}
								</p>
							</div>
						</div>
						<button
							type="button"
							onclick={removeSelectedFile}
							class="flex h-8 w-8 items-center justify-center border border-red-400/30 text-red-300 transition-colors hover:bg-red-400 hover:text-void"
							title="Cancel new image"
						>
							<X size={14} />
						</button>
					</div>
				{:else if $updateCategoryForm.removeImage}
					<div
						class="flex items-center justify-between border border-dashed border-red-400/20 bg-red-950/5 p-4"
					>
						<p class="font-sans text-xs text-red-300">Existing image marked for removal.</p>
						<button
							type="button"
							onclick={() => {
								$updateCategoryForm.removeImage = false;
							}}
							class="border border-ash/30 px-3 py-1.5 font-mono text-[9px] tracking-wider text-ash uppercase hover:border-volt hover:text-volt"
						>
							Undo Removal
						</button>
					</div>
					<label
						for="category-image-input"
						class="mt-3 flex cursor-pointer flex-col items-center justify-center border border-dashed border-ash/20 bg-void/50 py-10 transition-colors hover:border-volt hover:bg-void"
					>
						<Upload size={24} class="mb-3 text-ash/50" />
						<span class="font-sans text-xs font-medium text-bone"
							>Click to upload replacement image</span
						>
						<span class="mt-1 font-mono text-[9px] tracking-wider text-ash/50 uppercase">
							JPG, PNG, WEBP · MAX 5MB
						</span>
					</label>
				{:else}
					<label
						for="category-image-input"
						class="flex cursor-pointer flex-col items-center justify-center border border-dashed border-ash/20 bg-void/50 py-10 transition-colors hover:border-volt hover:bg-void"
					>
						<Upload size={24} class="mb-3 text-ash/50" />
						<span class="font-sans text-xs font-medium text-bone"
							>Click to upload category image</span
						>
						<span class="mt-1 font-mono text-[9px] tracking-wider text-ash/50 uppercase">
							JPG, PNG, WEBP · MAX 5MB
						</span>
					</label>
				{/if}
			</div>

			<input
				name="image"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/avif"
				onchange={handleFileChange}
				class="hidden"
				id="category-image-input"
				{...$updateCategoryConstraints.image}
			/>

			<input
				type="hidden"
				name="removeImage"
				value={$updateCategoryForm.removeImage ? 'true' : 'false'}
			/>

			{#if $updateCategoryErrors.image}
				<span class="font-sans text-xs text-red-400">{$updateCategoryErrors.image[0]}</span>
			{/if}
		</AdminCard>

		<!-- Settings Panel -->
		<AdminCard border="border border-ash/15" class="shadow-sm">
			<AdminToggle
				label="Publish Category"
				description="Active categories appear in storefront filters and menus."
				name="isActive"
				bind:checked={$updateCategoryForm.isActive}
			/>
		</AdminCard>
	{/snippet}

	{#snippet sidebarContent()}
		<!-- Live Preview Overview -->
		<div class="border-b border-ash/15 p-4">
			<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Live Overview</p>
		</div>
		<div class="p-4">
			<div class="overflow-hidden border border-charcoal bg-void">
				<!-- Category image slot -->
				<button
					type="button"
					onclick={() => {
						if (imagePreviewUrl || (data.category.imageUrl && !$updateCategoryForm.removeImage)) {
							showImagePreviewPopup = true;
						}
					}}
					class="group relative flex aspect-video w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden border-b border-charcoal bg-charcoal/20"
					aria-label="View large image preview"
				>
					{#if imagePreviewUrl}
						<img
							src={imagePreviewUrl}
							alt=""
							class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						/>
						<div
							class="absolute inset-0 flex items-center justify-center bg-void/50 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<span
								class="border border-volt/30 bg-void/90 px-3 py-1 font-mono text-[10px] tracking-widest text-volt uppercase"
								>Zoom</span
							>
						</div>
					{:else if data.category.imageUrl && !$updateCategoryForm.removeImage}
						<img
							src={data.category.imageUrl}
							alt=""
							class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						/>
						<div
							class="absolute inset-0 flex items-center justify-center bg-void/50 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<span
								class="border border-volt/30 bg-void/90 px-3 py-1 font-mono text-[10px] tracking-widest text-volt uppercase"
								>Zoom</span
							>
						</div>
					{:else}
						<FolderOpen size={28} class="text-ash/30" />
					{/if}
				</button>

				<!-- Details -->
				<div class="p-4">
					<div class="flex min-w-0 items-start justify-between gap-2">
						<h3 class="truncate font-mono text-sm font-semibold tracking-wider text-bone uppercase">
							{$updateCategoryForm.name || 'Unnamed Category'}
						</h3>
						<span
							class="shrink-0 font-mono text-[9px] tracking-widest uppercase {$updateCategoryForm.isActive
								? 'text-volt'
								: 'text-red-300'}"
						>
							{$updateCategoryForm.isActive ? 'Active' : 'Draft'}
						</span>
					</div>
					<p class="mt-0.5 truncate font-mono text-[10px] text-ash">
						/{$updateCategoryForm.slug || 'no-slug'}
					</p>

					<div class="mt-4 border-t border-charcoal/60 pt-3">
						<div class="flex justify-between font-mono text-[10px] uppercase">
							<span class="text-ash/50">Parent:</span>
							<span class="max-w-37.5 truncate text-bone">{parentCategoryName}</span>
						</div>
						<div class="mt-1 flex justify-between font-mono text-[10px] uppercase">
							<span class="text-ash/50">Sort Order:</span>
							<span class="text-bone">{$updateCategoryForm.sortOrder}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Warning items list -->
			{#if snapshotWarnings.length > 0}
				<div class="mt-5 border border-amber-300/20 bg-amber-300/5 p-3.5">
					<p class="font-mono text-[9px] font-semibold tracking-wider text-amber-300 uppercase">
						Attention Required ({snapshotWarnings.length})
					</p>
					<ul class="mt-2 list-disc space-y-1 pl-3 font-sans text-xs text-ash/80">
						{#each snapshotWarnings as warning (warning)}
							<li>{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/snippet}
</AdminFormLayout>

<!-- Server Error Toast -->
<AdminToast
	message={toastMessage}
	type="error"
	duration={6000}
	onclose={() => (toastMessage = null)}
/>

<!-- Recursive Node Tree Snippet -->
{#snippet renderNode(node: TreeNode, depth: number)}
	<div class="flex flex-col gap-1">
		<div class="flex items-center gap-2" style="padding-left: {depth * 1.5}rem">
			{#if depth > 0}
				<span class="font-mono text-xs text-ash/35 select-none">└──</span>
			{/if}
			<button
				type="button"
				onclick={() => openNodeDetails(node)}
				class="flex cursor-pointer items-center gap-2 border border-charcoal/50 bg-void/45 px-3 py-1.5 font-mono text-xs text-bone transition-colors hover:border-volt"
			>
				<span class="h-1.5 w-1.5 rounded-full {node.isActive ? 'bg-volt' : 'bg-red-400'}"></span>
				<span>{node.name}</span>
				<span class="text-[9px] text-ash/40">/{node.slug}</span>
			</button>
		</div>

		{#if node.children && node.children.length > 0}
			<div class="mt-1 flex flex-col gap-1">
				{#each node.children as child (child.id)}
					{@render renderNode(child, depth + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<!-- Category Node Details Modal -->
{#if showNodeModal && selectedNode}
	<div class="fixed inset-0 z-50 grid place-items-center bg-void/85 px-4 backdrop-blur-sm">
		<section
			class="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-ash/20 bg-charcoal p-6 shadow-2xl"
		>
			<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Category Details</p>
			<h2 class="mt-1 font-display text-3xl leading-none text-bone uppercase">
				{selectedNode.name}
			</h2>

			<!-- Image Section -->
			<div
				class="mt-4 flex flex-col items-center gap-3 rounded-sm border border-charcoal bg-void/30 p-4"
			>
				<span class="self-start font-sans text-xs font-semibold tracking-wide text-ash/90 uppercase"
					>Category Image</span
				>
				<div
					class="relative flex aspect-video w-full max-w-70 items-center justify-center overflow-hidden border border-charcoal bg-charcoal/20"
				>
					{#if editPreviewUrl}
						<img src={editPreviewUrl} alt="Preview" class="h-full w-full object-cover" />
					{:else if selectedNode.imageUrl}
						<img src={selectedNode.imageUrl} alt="" class="h-full w-full object-cover" />
					{:else}
						<FolderOpen size={32} class="text-ash/30" />
					{/if}
				</div>
			</div>

			<form
				method="POST"
				action="?/updateCategoryFromPopup"
				enctype="multipart/form-data"
				use:enhance={updateCategoryPopupEnhance}
				class="mt-4 grid gap-4"
			>
				<input type="hidden" name="id" value={selectedNode.id} />

				<!-- Edit controls -->
				<label class="grid gap-1">
					<span class="font-sans text-xs font-semibold tracking-wide text-volt uppercase"
						>Category Name</span
					>
					<input
						type="text"
						name="name"
						bind:value={editName}
						required
						class="min-h-11 border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					/>
				</label>

				<div class="grid gap-1">
					<span class="font-sans text-xs font-semibold tracking-wide text-volt uppercase"
						>Upload Replacement Image</span
					>
					<input
						type="file"
						name="image"
						accept="image/jpeg,image/png,image/webp,image/avif"
						onchange={handleEditFileChange}
						class="w-full border border-ash/30 bg-void px-4 py-2.5 font-mono text-xs text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
					/>
				</div>

				{#if editError}
					<p class="font-mono text-xs text-red-400 uppercase">{editError}</p>
				{/if}

				<div class="mt-4 flex justify-end gap-3">
					<AdminButton
						type="button"
						variant="charcoal"
						size="sm"
						onclick={() => {
							showNodeModal = false;
							selectedNode = null;
						}}
					>
						Cancel
					</AdminButton>
					<AdminButton type="submit" variant="volt" size="sm" disabled={editSubmitting}>
						{editSubmitting ? 'Saving...' : 'Save Category'}
					</AdminButton>
				</div>
			</form>
		</section>
	</div>
{/if}

<!-- Zoom image modal -->
{#if showImagePreviewPopup}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-void/90 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="relative max-h-[90vh] max-w-[90vw] overflow-hidden border border-charcoal bg-charcoal"
		>
			<button
				type="button"
				onclick={() => (showImagePreviewPopup = false)}
				class="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center border border-ash/30 bg-void text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label="Close zoom preview"
			>
				<X size={18} />
			</button>
			{#if imagePreviewUrl}
				<img src={imagePreviewUrl} alt="" class="max-h-[85vh] max-w-[85vw] object-contain" />
			{:else if data.category.imageUrl}
				<img src={data.category.imageUrl} alt="" class="max-h-[85vh] max-w-[85vw] object-contain" />
			{/if}
		</div>
	</div>
{/if}
