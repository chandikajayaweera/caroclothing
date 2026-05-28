<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { generateSlug } from '$lib/shared/slug';
	import { FolderOpen, Save, Trash2, Upload, X, Plus } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { superForm, filesProxy } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminUnsavedChangesModal from '$lib/components/admin/AdminUnsavedChangesModal.svelte';
	import AdminFormLayout from '$lib/components/admin/AdminFormLayout.svelte';

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
		submitting: createCategorySubmitting,
		isTainted: isCreateCategoryTainted
	} = createCategorySuperform;

	const imagesProxy = filesProxy(createCategorySuperform, 'images');

	let slugManuallyEdited = $state(false);
	let showUnsavedModal = $state(false);
	let pendingRedirect = $state<any>(null);
	let selectedFile = $state<File | null>(null);
	let imagePreviewUrl = $state<string | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	// Child categories states
	let childImages = $state<string[]>([]);
	let childFiles = $state<(File | null)[]>([]);
	let activePreviewChildIndex = $state<number | null>(null);

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

	const updateCategoryEnhance: SubmitFunction = () => {
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
		const parentId = $createCategoryForm.parentId;
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

	// Single category image upload
	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			selectedFile = files[0];
			if (imagePreviewUrl) {
				URL.revokeObjectURL(imagePreviewUrl);
			}
			imagePreviewUrl = URL.createObjectURL(selectedFile);
			syncSingleFileToForm();
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
		syncSingleFileToForm();
	}

	function syncSingleFileToForm() {
		if (selectedFile) {
			$imagesProxy = createFileList([selectedFile]);
		} else {
			$imagesProxy = createFileList([]);
		}
	}

	// Multiple child categories upload
	function addChildCategory() {
		const clientId = `child-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		$createCategoryForm.children = [
			...$createCategoryForm.children,
			{
				clientId,
				name: '',
				slug: '',
				description: '',
				sortOrder: $createCategoryForm.children.length + 1,
				isActive: true,
				imageIndex: null
			}
		];
		childImages = [...childImages, ''];
		childFiles = [...childFiles, null];
	}

	function removeChildCategory(index: number) {
		$createCategoryForm.children = $createCategoryForm.children.filter((_, i) => i !== index);
		if (childImages[index]) {
			URL.revokeObjectURL(childImages[index]);
		}
		childImages = childImages.filter((_, i) => i !== index);
		childFiles = childFiles.filter((_, i) => i !== index);
		syncFilesToForm();
	}

	function handleChildNameInput(index: number, event: Event) {
		const target = event.target as HTMLInputElement;
		const child = $createCategoryForm.children[index];
		if (child) {
			child.name = target.value;
			child.slug = generateSlug(target.value);
			$createCategoryForm.children = [...$createCategoryForm.children];
		}
	}

	function handleChildFileChange(index: number, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			childFiles[index] = files[0];
			if (childImages[index]) {
				URL.revokeObjectURL(childImages[index]);
			}
			childImages[index] = URL.createObjectURL(files[0]);
		} else {
			childFiles[index] = null;
			if (childImages[index]) {
				URL.revokeObjectURL(childImages[index]);
				childImages[index] = '';
			}
		}
		syncFilesToForm();
	}

	function removeChildFile(index: number) {
		childFiles[index] = null;
		if (childImages[index]) {
			URL.revokeObjectURL(childImages[index]);
			childImages[index] = '';
		}
		const input = document.getElementById(`child-image-input-${index}`) as HTMLInputElement;
		if (input) {
			input.value = '';
		}
		syncFilesToForm();
	}

	function syncFilesToForm() {
		// Filter out null files to form a dense array for upload
		const denseFiles = childFiles.filter((f): f is File => f !== null);

		// Update children's imageIndex references
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

	function handleParentIdChange(): void {
		if ($createCategoryForm.parentId) {
			// Clear single category file preview if they set a parent category
			if (selectedFile) {
				selectedFile = null;
				if (imagePreviewUrl) {
					URL.revokeObjectURL(imagePreviewUrl);
					imagePreviewUrl = null;
				}
				const input = document.getElementById('category-image-input') as HTMLInputElement;
				if (input) input.value = '';
			}

			// Initialize child category if empty
			if ($createCategoryForm.children.length === 0) {
				addChildCategory();
			}
		} else {
			// Reset child categories lists if parenting is cleared
			$createCategoryForm.children = [];
			childImages.forEach((url) => {
				if (url) URL.revokeObjectURL(url);
			});
			childImages = [];
			childFiles = [];
		}
	}

	$effect(() => {
		if ($createCategoryForm.children.length > 0) {
			if (
				activePreviewChildIndex === null ||
				activePreviewChildIndex >= $createCategoryForm.children.length
			) {
				activePreviewChildIndex = 0;
			}
		} else {
			activePreviewChildIndex = null;
		}
	});

	function handleNameInput(): void {
		if (!slugManuallyEdited) {
			$createCategoryForm.slug = generateSlug($createCategoryForm.name ?? '');
		}
	}

	function handleSlugInput(): void {
		slugManuallyEdited = true;
	}

	function hasDirtyDraft(): boolean {
		return (
			!!isCreateCategoryTainted() ||
			selectedFile !== null ||
			$createCategoryForm.name !== '' ||
			$createCategoryForm.children.length > 0
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
		if ($createCategoryForm.parentId) {
			if ($createCategoryForm.children.length === 0) {
				warnings.push('Add at least one child category');
			} else {
				$createCategoryForm.children.forEach((c, idx) => {
					if (!c.name) warnings.push(`Child category #${idx + 1} is missing a name`);
					if (!c.slug) warnings.push(`Child category #${idx + 1} is missing a slug`);
				});
			}
		} else {
			if (!$createCategoryForm.name) warnings.push('Category name is required');
			if (!$createCategoryForm.slug) warnings.push('Slug is required');
			if (!selectedFile) warnings.push('No category image selected');
		}
		return warnings;
	});

	const parentCategoryName = $derived.by(() => {
		if (!$createCategoryForm.parentId) return 'Root';
		const parent = data.allCategories.find((c) => c.id === $createCategoryForm.parentId);
		return parent ? parent.name : 'Unknown';
	});

	onDestroy(() => {
		if (imagePreviewUrl) {
			URL.revokeObjectURL(imagePreviewUrl);
		}
		childImages.forEach((url) => {
			if (url) URL.revokeObjectURL(url);
		});
	});
</script>

<svelte:head>
	<title>New Category | Caro Admin</title>
	<meta name="description" content="Create product categories and hierarchies." />
</svelte:head>

<AdminFormLayout
	backHref="/app/categories"
	backLabel="Back to categories"
	title="New Category"
	actionMessage={$createCategoryMessage}
	isSubmitting={$createCategorySubmitting}
	submitLabel="Save Categories"
	oncancel={() => handleNavigate('/app/categories')}
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
		<input
			id="hidden-category-images-input"
			name="images"
			type="file"
			multiple
			bind:files={$imagesProxy}
			class="hidden"
		/>

		<!-- Left Main Content Area -->
		<div class="grid gap-6">
			<!-- Hierarchy & Sorting -->
			<AdminCard title="Hierarchy & Sort" border="border border-ash/15" class="shadow-sm">
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminSelect
						label="Parent Category"
						name="parentId"
						bind:value={$createCategoryForm.parentId}
						onchange={handleParentIdChange}
						error={$createCategoryErrors.parentId}
					>
						<option value="">No parent (Root Category)</option>
						{#each data.categories as category (category.id)}
							<option value={category.id}>{category.name}</option>
						{/each}
					</AdminSelect>

					<!-- Only show sortOrder at root if creating root category -->
					{#if !$createCategoryForm.parentId}
						<AdminInput
							label="Sort Order"
							name="sortOrder"
							type="number"
							min="0"
							bind:value={$createCategoryForm.sortOrder}
							error={$createCategoryErrors.sortOrder}
							helpText="Higher numbers sort lower in menus"
						/>
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
						class="flex min-h-[100px] flex-col gap-2 overflow-x-auto border border-ash/15 bg-void/30 p-4"
					>
						{@render renderNode(categoryTree, 0)}
					</div>
				</AdminCard>
			{/if}

			<!-- CONDITIONAL PATHWAYS -->
			{#if !$createCategoryForm.parentId}
				<!-- SINGLE ROOT CATEGORY CREATION PATHWAY -->
				<!-- Basic Information Card -->
				<AdminCard
					title="Basic Info (Root Category)"
					border="border border-ash/15"
					class="shadow-sm"
				>
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
							helpText="Must be alphanumeric lowercase with hyphens"
						/>
					</div>

					<div class="grid gap-1.5">
						<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
							>Description</span
						>
						<textarea
							name="description"
							bind:value={$createCategoryForm.description}
							placeholder="Provide details about the designs, silhouettes, and fabric weight featured in this category..."
							class="min-h-32 w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
						></textarea>
						{#if $createCategoryErrors.description}
							<span class="font-sans text-xs text-red-400"
								>{$createCategoryErrors.description[0]}</span
							>
						{/if}
					</div>
				</AdminCard>

				<!-- Media Card -->
				<AdminCard title="Category Image" border="border border-ash/15" class="shadow-sm">
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
								title="Remove selected image"
							>
								<X size={14} />
							</button>
						</div>
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

					<input
						type="file"
						accept="image/*"
						onchange={handleFileChange}
						class="hidden"
						id="category-image-input"
					/>
				</AdminCard>

				<!-- Settings Panel -->
				<AdminCard border="border border-ash/15" class="shadow-sm">
					<AdminToggle
						label="Publish Category"
						description="Active categories appear in storefront filters and menus."
						name="isActive"
						bind:checked={$createCategoryForm.isActive}
					/>
				</AdminCard>
			{:else}
				<!-- MULTIPLE CHILD CATEGORY CREATION PATHWAY -->
				<AdminCard title="Subcategories to Create" border="border border-ash/15" class="shadow-sm">
					{#snippet headerActions()}
						<AdminButton type="button" variant="volt" size="sm" onclick={addChildCategory}>
							<Plus size={14} class="mr-1" /> Add Subcategory
						</AdminButton>
					{/snippet}

					{#if $createCategoryForm.children.length === 0}
						<div class="border border-dashed border-ash/15 py-10 text-center text-ash/40">
							<FolderOpen size={32} class="mx-auto mb-3 text-ash/20" />
							<p class="font-sans text-sm">No subcategories added yet.</p>
							<p class="mt-1 font-sans text-xs text-ash/45">
								Click "Add Subcategory" to add your first child category.
							</p>
						</div>
					{:else}
						<div class="grid gap-6">
							{#each $createCategoryForm.children as child, index (child.clientId)}
								<div class="relative grid gap-4 rounded-sm border border-ash/15 bg-void/50 p-5">
									<input
										type="hidden"
										name={`children[${index}].clientId`}
										bind:value={$createCategoryForm.children[index].clientId}
									/>
									<input
										type="hidden"
										name={`children[${index}].imageIndex`}
										bind:value={$createCategoryForm.children[index].imageIndex}
									/>

									<div class="absolute top-4 right-4 flex items-center gap-3">
										<span class="font-mono text-[9px] text-ash/40">#{index + 1}</span>
										<button
											type="button"
											onclick={() => removeChildCategory(index)}
											class="p-1 text-red-400 transition-colors hover:text-red-300"
											title="Remove subcategory"
										>
											<X size={15} />
										</button>
									</div>

									<div class="mt-4 grid gap-4 sm:mt-2 sm:grid-cols-2">
										<label class="grid gap-1">
											<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">
												Subcategory Name <span class="ml-0.5 text-red-400">*</span>
											</span>
											<input
												type="text"
												name={`children[${index}].name`}
												bind:value={$createCategoryForm.children[index].name}
												oninput={(e) => handleChildNameInput(index, e)}
												placeholder="e.g. Graphic Tees"
												required
												class="min-h-11 border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
											/>
											{#if $createCategoryErrors.children?.[index]?.name}
												<span class="font-sans text-xs text-red-400"
													>{$createCategoryErrors.children[index].name[0]}</span
												>
											{/if}
										</label>

										<label class="grid gap-1">
											<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">
												Slug <span class="ml-0.5 text-red-400">*</span>
											</span>
											<input
												type="text"
												name={`children[${index}].slug`}
												bind:value={$createCategoryForm.children[index].slug}
												placeholder="e.g. graphic-tees"
												required
												class="min-h-11 border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
											/>
											{#if $createCategoryErrors.children?.[index]?.slug}
												<span class="font-sans text-xs text-red-400"
													>{$createCategoryErrors.children[index].slug[0]}</span
												>
											{/if}
										</label>
									</div>

									<div class="grid gap-4 sm:grid-cols-2">
										<label class="grid gap-1">
											<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
												>Description</span
											>
											<textarea
												name={`children[${index}].description`}
												bind:value={$createCategoryForm.children[index].description}
												placeholder="Optional description..."
												class="min-h-11 resize-y border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
											></textarea>
											{#if $createCategoryErrors.children?.[index]?.description}
												<span class="font-sans text-xs text-red-400"
													>{$createCategoryErrors.children[index].description[0]}</span
												>
											{/if}
										</label>

										<label class="grid gap-1">
											<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
												>Sort Order</span
											>
											<input
												type="number"
												name={`children[${index}].sortOrder`}
												min="0"
												bind:value={$createCategoryForm.children[index].sortOrder}
												class="min-h-11 border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
											/>
											{#if $createCategoryErrors.children?.[index]?.sortOrder}
												<span class="font-sans text-xs text-red-400"
													>{$createCategoryErrors.children[index].sortOrder[0]}</span
												>
											{/if}
										</label>
									</div>

									<div
										class="mt-2 flex flex-col justify-between gap-4 border-t border-charcoal/40 pt-4 sm:flex-row sm:items-center"
									>
										<div class="flex items-center gap-3">
											{#if childImages[index]}
												<div
													class="relative h-12 w-16 flex-shrink-0 overflow-hidden border border-charcoal bg-charcoal"
												>
													<img src={childImages[index]} alt="" class="h-full w-full object-cover" />
													<button
														type="button"
														onclick={() => removeChildFile(index)}
														class="absolute top-0.5 right-0.5 rounded-full border border-charcoal bg-void/80 p-0.5 text-red-400 hover:text-red-300"
														title="Remove image"
													>
														<X size={10} />
													</button>
												</div>
											{:else}
												<label
													for="child-image-input-{index}"
													class="cursor-pointer border border-dashed border-ash/25 bg-charcoal/30 px-4 py-2 text-[11px] text-bone transition-colors hover:border-volt hover:bg-void"
												>
													Upload Subcategory Image
												</label>
											{/if}
											<input
												type="file"
												accept="image/*"
												onchange={(e) => handleChildFileChange(index, e)}
												id="child-image-input-{index}"
												class="hidden"
											/>
										</div>

										<div class="flex items-center gap-2">
											<span class="font-sans text-xs text-ash/70">Publish Subcategory</span>
											<AdminToggle
												name={`children[${index}].isActive`}
												bind:checked={$createCategoryForm.children[index].isActive}
												standalone
											/>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</AdminCard>
			{/if}
		</div>
	{/snippet}

	{#snippet sidebarContent()}
		<!-- Category image slot -->
		{#if !$createCategoryForm.parentId}
			<!-- Root category preview image -->
			<button
				type="button"
				onclick={() => {
					if (imagePreviewUrl) showImagePreviewPopup = true;
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
				{:else}
					<FolderOpen size={28} class="text-ash/30" />
				{/if}
			</button>
		{:else}
			<!-- Subcategory preview image selection -->
			<button
				type="button"
				onclick={() => {
					if (activePreviewChildIndex !== null && childImages[activePreviewChildIndex]) {
						showImagePreviewPopup = true;
					}
				}}
				class="group relative flex aspect-video w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden border-b border-charcoal bg-charcoal/20"
				aria-label="View large subcategory image preview"
			>
				{#if activePreviewChildIndex !== null && childImages[activePreviewChildIndex]}
					<img
						src={childImages[activePreviewChildIndex]}
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
		{/if}

		<!-- Details -->
		<div class="p-5">
			{#if !$createCategoryForm.parentId}
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Snapshot</p>
						<h2 class="mt-1 font-sans text-base leading-snug font-semibold text-bone uppercase">
							{$createCategoryForm.name || 'Unnamed Category'}
						</h2>
					</div>
					<span
						class="shrink-0 border px-2 py-1 font-mono text-[9px] tracking-widest uppercase {$createCategoryForm.isActive
							? 'border-volt/30 bg-volt/10 text-volt'
							: 'border-red-500/25 bg-red-950/20 text-red-300'}"
					>
						{$createCategoryForm.isActive ? 'Live' : 'Draft'}
					</span>
				</div>
				<p class="mt-1.5 truncate font-mono text-[10px] text-ash">
					/{$createCategoryForm.slug || 'no-slug'}
				</p>

				<div class="mt-4 border-t border-ash/10 pt-4">
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash/50">Parent:</span>
						<span class="max-w-[150px] truncate text-bone">{parentCategoryName}</span>
					</div>
					<div class="mt-1 flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash/50">Sort Order:</span>
						<span class="text-bone">{$createCategoryForm.sortOrder}</span>
					</div>
				</div>
			{:else}
				<!-- Display Parent category details with subcategories list -->
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Snapshot</p>
						<h2 class="mt-1 font-sans text-base leading-snug font-semibold text-bone uppercase">
							{parentCategoryName}
						</h2>
					</div>
					<span
						class="shrink-0 border border-volt/30 bg-volt/10 px-2 py-1 font-mono text-[9px] tracking-widest text-volt uppercase"
					>
						Parent
					</span>
				</div>
				<p class="mt-1.5 font-mono text-[10px] text-ash">Creating Subcategories</p>

				<!-- Show subcategories list in Live Overview -->
				<p
					class="mt-4 border-t border-ash/10 pt-4 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
				>
					Subcategories ({$createCategoryForm.children.length})
				</p>
				<div class="mt-2 flex max-h-36 flex-col gap-1.5 overflow-y-auto pr-0.5">
					{#each $createCategoryForm.children as child, index (child.clientId)}
						<button
							type="button"
							onclick={() => (activePreviewChildIndex = index)}
							class="flex cursor-pointer items-center justify-between border px-3 py-2 text-left font-mono text-[10px] text-bone transition-colors {activePreviewChildIndex ===
							index
								? 'border-volt bg-volt/5 font-semibold text-volt'
								: 'border-charcoal bg-void/50 text-ash hover:border-volt/40'}"
						>
							<span class="truncate pr-2">{child.name || 'Unnamed Subcategory'}</span>
							{#if childFiles[index]}
								<span
									class="flex-shrink-0 border border-volt/20 px-1 text-[8px] text-volt select-none"
									>Img</span
								>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
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
				disabled={$createCategorySubmitting}
			>
				<Save size={14} class="mr-1" />
				{$createCategorySubmitting ? 'Saving...' : 'Save Categories'}
			</AdminButton>
		</div>
	{/snippet}
</AdminFormLayout>

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
				use:enhance={updateCategoryEnhance}
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
{#if showImagePreviewPopup && (selectedFile || (activePreviewChildIndex !== null && childFiles[activePreviewChildIndex]))}
	{@const activeUrl = !$createCategoryForm.parentId
		? imagePreviewUrl
		: activePreviewChildIndex !== null
			? childImages[activePreviewChildIndex]
			: null}
	{@const activeFile = !$createCategoryForm.parentId
		? selectedFile
		: activePreviewChildIndex !== null
			? childFiles[activePreviewChildIndex]
			: null}
	<div
		class="bg-opacity-95 fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/90 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
	>
		<section
			class="mx-auto my-auto grid w-full max-w-4xl min-w-0 border border-ash/25 bg-void shadow-2xl lg:max-h-[90vh] lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden"
		>
			<div
				class="group relative flex min-h-0 w-full min-w-0 items-center overflow-hidden bg-charcoal/40"
			>
				{#if activeUrl}
					<img
						src={activeUrl}
						alt=""
						class="mx-auto max-h-[58vh] w-full min-w-0 object-contain sm:max-h-[64vh] lg:max-h-[85vh]"
					/>
				{/if}
			</div>
			<div
				class="grid min-w-0 content-start gap-4 overflow-x-hidden border-t border-ash/15 bg-charcoal p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l"
			>
				<div class="flex items-start justify-between gap-4 border-b border-charcoal/80 pb-3">
					<div class="min-w-0">
						<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Media Info</p>
						<h2 class="wrap-break-words mt-1 font-sans text-sm font-semibold text-bone">
							{activeFile ? activeFile.name : 'Unknown filename'}
						</h2>
						{#if activeFile}
							<p class="mt-1 font-mono text-[10px] text-ash/60">
								{formatFileSize(activeFile.size)}
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => {
							showImagePreviewPopup = false;
							if (!$createCategoryForm.parentId) {
								removeSelectedFile({ preventDefault: () => {} } as MouseEvent);
							} else if (activePreviewChildIndex !== null) {
								removeChildFile(activePreviewChildIndex);
							}
						}}
						class="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-red-500/25 text-red-400 transition-colors hover:border-red-400 hover:text-red-300"
						title="Remove image"
					>
						<Trash2 size={14} aria-hidden="true" />
					</button>
				</div>

				<div class="mt-4 space-y-2 font-mono text-[10px] uppercase">
					{#if activeFile}
						<div class="flex justify-between">
							<span class="text-ash/50">Format:</span>
							<span class="text-bone">{activeFile.type}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-ash/50">Modified:</span>
							<span class="text-bone">{new Date(activeFile.lastModified).toLocaleDateString()}</span
							>
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
