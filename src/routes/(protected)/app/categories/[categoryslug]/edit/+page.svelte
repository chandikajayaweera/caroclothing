<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { generateSlug } from '$lib/shared/slug';
	import { ArrowLeft, FolderOpen, Save, Trash2, Upload, X } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { superForm } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminUnsavedChangesModal from '$lib/components/admin/AdminUnsavedChangesModal.svelte';

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
		submitting: updateCategorySubmitting,
		isTainted: isUpdateCategoryTainted
	} = updateCategorySuperform;

	let slugManuallyEdited = $state(false);
	let showUnsavedModal = $state(false);
	let pendingRedirect = $state<any>(null);
	let selectedFile = $state<File | null>(null);
	let imagePreviewUrl = $state<string | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

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

	function getCategoryPath(catId: string | null): string {
		if (!catId) return 'Root';
		const path: string[] = [];
		let currentId: string | null = catId;
		const visited = new SvelteSet<string>();

		while (currentId && !visited.has(currentId)) {
			visited.add(currentId);
			const current = data.allCategories.find((c) => c.id === currentId);
			if (current) {
				path.unshift(current.name);
				currentId = current.parentId;
			} else {
				break;
			}
		}
		return ['Root', ...path].join(' > ');
	}

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

	function hasDirtyDraft(): boolean {
		return (
			!!isUpdateCategoryTainted() || selectedFile !== null || !!$updateCategoryForm.removeImage
		);
	}

	async function handleNavigate(target: any): Promise<void> {
		if (hasDirtyDraft()) {
			pendingRedirect = target;
			showUnsavedModal = true;
			return;
		}
		await goto(resolve(target));
	}

	async function confirmNavigate(): Promise<void> {
		showUnsavedModal = false;
		if (pendingRedirect) {
			await goto(resolve(pendingRedirect));
		}
	}

	async function saveAndRedirect(): Promise<void> {
		showUnsavedModal = false;
		if (formElement) {
			formElement.requestSubmit();
		}
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
	<title>Edit Category | Caro Admin</title>
	<meta name="description" content="Edit category details, sorting, and image." />
</svelte:head>

<section class="mx-auto max-w-7xl pb-24">
	<!-- Top Navigation Bar -->
	<div class="flex items-center justify-between border-b border-charcoal pb-5">
		<div class="flex items-center gap-4">
			<button
				type="button"
				onclick={() => handleNavigate(`/app/categories/${data.category.slug}`)}
				class="group flex h-10 w-10 items-center justify-center border border-charcoal bg-void text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label="Back to details"
			>
				<ArrowLeft size={16} class="transition-transform group-hover:-translate-x-0.5" />
			</button>
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
					Catalog / Categories / {data.category.name}
				</p>
				<h1 class="font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					Edit Category
				</h1>
			</div>
		</div>
	</div>

	{#if $updateCategoryMessage}
		<p
			class="mt-6 border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
		>
			{$updateCategoryMessage}
		</p>
	{/if}

	<form
		bind:this={formElement}
		method="POST"
		action="?/updateCategory"
		enctype="multipart/form-data"
		use:updateCategoryEnhance
		class="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]"
	>
		<!-- Left Main Content Area -->
		<div class="grid gap-6">
			<!-- Hierarchy & Sorting (Moved to top) -->
			<AdminCard bg="bg-charcoal" border="border border-charcoal" class="grid gap-5 p-5 sm:p-6">
				<h2
					class="border-b border-charcoal/85 pb-3 font-display text-xl tracking-wider text-bone uppercase"
				>
					Hierarchy & Sort
				</h2>

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
			<AdminCard bg="bg-charcoal" border="border border-charcoal" class="grid gap-5 p-5 sm:p-6">
				<h2
					class="border-b border-charcoal/85 pb-3 font-display text-xl tracking-wider text-bone uppercase"
				>
					Basic Info
				</h2>

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
						<span class="font-sans text-xs text-red-400"
							>{$updateCategoryErrors.description[0]}</span
						>
					{/if}
				</div>
			</AdminCard>

			<!-- Parent Hierarchy Tree Preview -->
			{#if categoryTree}
				<AdminCard bg="bg-charcoal" border="border border-charcoal" class="grid gap-5 p-5 sm:p-6">
					<h2
						class="border-b border-charcoal/85 pb-3 font-display text-xl tracking-wider text-bone uppercase"
					>
						Hierarchy Tree Preview
					</h2>
					<p class="font-sans text-xs text-ash/60">
						Current subcategory hierarchy under the selected parent. Click on any category node to
						inspect its configurations.
					</p>

					<div
						class="flex min-h-[100px] flex-col gap-2 overflow-x-auto border border-charcoal bg-void/30 p-4"
					>
						{@render renderNode(categoryTree, 0)}
					</div>
				</AdminCard>
			{/if}

			<!-- Media Card -->
			<AdminCard bg="bg-charcoal" border="border border-charcoal" class="grid gap-5 p-5 sm:p-6">
				<h2
					class="border-b border-charcoal/85 pb-3 font-display text-xl tracking-wider text-bone uppercase"
				>
					Category Image
				</h2>

				<div class="grid gap-4">
					{#if data.category.imageUrl && !$updateCategoryForm.removeImage && !imagePreviewUrl}
						<div
							class="relative flex items-center justify-between gap-4 border border-charcoal bg-void p-3"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="h-16 w-16 flex-shrink-0 overflow-hidden border border-charcoal bg-charcoal"
								>
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
					{:else if $updateCategoryForm.removeImage || imagePreviewUrl}
						{#if imagePreviewUrl}
							<div
								class="relative flex items-center justify-between gap-4 border border-charcoal bg-void p-3"
							>
								<div class="flex min-w-0 items-center gap-3">
									<div
										class="h-16 w-16 flex-shrink-0 overflow-hidden border border-charcoal bg-charcoal"
									>
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
						{:else}
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
						{/if}
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
					accept="image/*"
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
			<AdminCard bg="bg-charcoal" border="border border-charcoal" class="p-5 sm:p-6">
				<AdminToggle
					label="Publish Category"
					description="Active categories appear in storefront filters and menus."
					name="isActive"
					bind:checked={$updateCategoryForm.isActive}
				/>
			</AdminCard>
		</div>

		<!-- Right Sidebar (Sticky Preview Overview) -->
		<div>
			<div class="sticky top-6 grid gap-6">
				<!-- Category Snapshot -->
				<AdminCard border="border border-charcoal" bg="bg-charcoal" padding="p-5">
					<p
						class="border-b border-charcoal/80 pb-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
					>
						Live Overview
					</p>

					<div class="mt-4 overflow-hidden border border-charcoal bg-void">
						<!-- Category image slot -->
						<button
							type="button"
							onclick={() => {
								if (
									imagePreviewUrl ||
									(data.category.imageUrl && !$updateCategoryForm.removeImage)
								) {
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
								<h3
									class="truncate font-mono text-sm font-semibold tracking-wider text-bone uppercase"
								>
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
									<span class="max-w-[150px] truncate text-bone">{parentCategoryName}</span>
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

					<!-- Desktop Action Button -->
					<div class="mt-5 hidden sm:block">
						<AdminButton
							type="submit"
							variant="volt"
							size="md"
							class="w-full"
							disabled={$updateCategorySubmitting}
						>
							<Save size={14} class="mr-1" />
							{$updateCategorySubmitting ? 'Saving...' : 'Save Changes'}
						</AdminButton>
					</div>
				</AdminCard>
			</div>
		</div>

		<!-- Mobile/Tablet Sticky Bottom Bar -->
		<div class="fixed right-0 bottom-0 left-0 z-40 border-t border-charcoal bg-void p-4 sm:hidden">
			<div class="mx-auto flex max-w-7xl justify-end gap-3">
				<AdminButton
					type="button"
					variant="charcoal"
					size="md"
					onclick={() => handleNavigate(`/app/categories/${data.category.slug}`)}
				>
					Cancel
				</AdminButton>
				<AdminButton type="submit" variant="volt" size="md" disabled={$updateCategorySubmitting}>
					<Save size={14} class="mr-1" />
					{$updateCategorySubmitting ? 'Saving...' : 'Save'}
				</AdminButton>
			</div>
		</div>
	</form>
</section>

<!-- Unsaved changes notification modal -->
<AdminUnsavedChangesModal
	bind:isOpen={showUnsavedModal}
	title="Save before leaving?"
	description="You have unsaved changes. You can save your changes before leaving, or discard them."
	onsave={saveAndRedirect}
	ondiscard={confirmNavigate}
	oncancel={() => {
		pendingRedirect = null;
		showUnsavedModal = false;
	}}
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
					class="relative flex aspect-video w-full max-w-[280px] items-center justify-center overflow-hidden border border-charcoal bg-charcoal/20"
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
						>Upload New Image</span
					>
					<label
						class="block cursor-pointer border border-dashed border-ash/25 bg-void px-4 py-2.5 text-center font-mono text-[11px] tracking-wider text-bone uppercase transition-colors hover:border-volt hover:bg-void/50"
					>
						Choose Image File
						<input
							type="file"
							name="image"
							accept="image/*"
							onchange={handleEditFileChange}
							class="hidden"
						/>
					</label>
					{#if editFile}
						<span
							class="mt-1 block truncate text-center font-mono text-[9px] tracking-wide text-ash"
						>
							Selected: {editFile.name} ({formatFileSize(editFile.size)})
						</span>
					{/if}
				</div>

				<div
					class="mt-2 grid gap-3 rounded-sm border border-charcoal bg-void/40 p-4 font-mono text-xs uppercase"
				>
					<div class="flex justify-between">
						<span class="text-ash/50">Status:</span>
						<span class={selectedNode.isActive ? 'text-volt' : 'text-red-300'}>
							{selectedNode.isActive ? 'Active' : 'Draft'}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-ash/50">Slug:</span>
						<span class="text-bone">/{selectedNode.slug}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-ash/50">Hierarchy:</span>
						<span
							class="max-w-[240px] truncate text-right text-volt"
							title={getCategoryPath(selectedNode.id)}
						>
							{getCategoryPath(selectedNode.id)}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-ash/50">Sort Order:</span>
						<span class="text-bone">{selectedNode.sortOrder}</span>
					</div>
					<div class="mt-2 flex flex-col gap-1 border-t border-charcoal/60 pt-3">
						<span class="text-ash/50">Description:</span>
						<p class="font-sans text-xs leading-relaxed text-ash/80 normal-case">
							{selectedNode.description || 'No description provided.'}
						</p>
					</div>
					<div class="mt-2 flex flex-col gap-1 border-t border-charcoal/60 pt-3">
						<span class="text-ash/50">Direct Subcategories ({selectedNode.children.length}):</span>
						{#if selectedNode.children.length > 0}
							<div class="mt-1 flex flex-wrap gap-1.5">
								{#each selectedNode.children as child (child.id)}
									<span
										class="border border-charcoal bg-charcoal/30 px-2 py-0.5 font-mono text-[10px] text-bone"
									>
										{child.name}
									</span>
								{/each}
							</div>
						{:else}
							<span class="text-[10px] text-ash/40">No subcategories</span>
						{/if}
					</div>
				</div>

				{#if editError}
					<p
						class="border border-red-400/30 bg-red-950/20 px-4 py-2.5 font-mono text-[10px] tracking-widest text-red-300 uppercase"
					>
						{editError}
					</p>
				{/if}

				<div class="mt-4 flex gap-3">
					<button
						type="button"
						onclick={() => {
							showNodeModal = false;
							selectedNode = null;
						}}
						class="flex-1 cursor-pointer border border-ash/30 px-5 py-2.5 text-center font-mono text-[10px] tracking-widest text-bone uppercase transition-colors hover:border-volt hover:text-volt"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={editSubmitting}
						class="flex-1 cursor-pointer border border-volt bg-volt px-5 py-2.5 text-center font-mono text-[10px] font-semibold tracking-widest text-void uppercase transition-colors hover:border-bone hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
					>
						{editSubmitting ? 'Saving...' : 'Save Category'}
					</button>
				</div>
			</form>
		</section>
	</div>
{/if}

<!-- Category Image Preview Modal -->
{#if showImagePreviewPopup && (selectedFile || (data.category.imageUrl && !$updateCategoryForm.removeImage))}
	{@const activeUrl = imagePreviewUrl || data.category.imageUrl}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/90 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
	>
		<section
			class="mx-auto my-auto grid w-full max-w-4xl min-w-0 border border-ash/25 bg-void shadow-2xl lg:max-h-[90vh] lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden"
		>
			<div
				class="group relative flex min-h-0 w-full min-w-0 items-center overflow-hidden bg-charcoal/40"
			>
				<img
					src={activeUrl}
					alt=""
					class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[85vh]"
				/>
			</div>
			<div
				class="grid min-w-0 content-start gap-4 overflow-x-hidden border-t border-ash/15 bg-charcoal p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l"
			>
				<div class="flex items-start justify-between gap-4 border-b border-charcoal/80 pb-3">
					<div class="min-w-0">
						<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Media Info</p>
						<h2 class="wrap-break-words mt-1 font-sans text-sm font-semibold text-bone">
							{selectedFile ? selectedFile.name : 'Stored Category Image'}
						</h2>
						{#if selectedFile}
							<p class="mt-1 font-mono text-[10px] text-ash/60">
								{formatFileSize(selectedFile.size)}
							</p>
						{:else}
							<p class="mt-1 font-mono text-[10px] text-ash/60">Cloudflare R2 Stored Object</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => {
							showImagePreviewPopup = false;
							if (selectedFile) {
								removeSelectedFile({ preventDefault: () => {} } as MouseEvent);
							} else {
								$updateCategoryForm.removeImage = true;
							}
						}}
						class="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-red-500/25 text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
						title="Remove image"
					>
						<Trash2 size={14} aria-hidden="true" />
					</button>
				</div>

				<div class="mt-4 space-y-2 font-mono text-[10px] uppercase">
					{#if selectedFile}
						<div class="flex justify-between">
							<span class="text-ash/50">Format:</span>
							<span class="text-bone">{selectedFile.type}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-ash/50">Modified:</span>
							<span class="text-bone"
								>{new Date(selectedFile.lastModified).toLocaleDateString()}</span
							>
						</div>
					{:else}
						<div class="flex justify-between">
							<span class="text-ash/50">Source:</span>
							<span class="text-bone">External R2 Object</span>
						</div>
					{/if}
				</div>

				<AdminButton
					type="button"
					onclick={() => (showImagePreviewPopup = false)}
					variant="outline"
					class="mt-6 w-full"
				>
					Close Preview
				</AdminButton>
			</div>
		</section>
	</div>
{/if}
