<script lang="ts">
	import { onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { Plus, X, FolderOpen } from 'lucide-svelte';
	import { nanoid } from 'nanoid';

	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import { generateSlug } from '$lib/shared/slug';

	// ─── Types ───────────────────────────────────────────────────────────────────

	type DraftChild = {
		clientId: string;
		name: string;
		slug: string;
		description?: string | null;
		sortOrder: number;
		isActive: boolean;
		imageIndex?: number | null;
	};

	// ─── Props ────────────────────────────────────────────────────────────────────

	let {
		children = $bindable([]),
		childImages = $bindable([]),
		childFiles = $bindable([]),
		errors,
		onsync
	}: {
		children: DraftChild[];
		childImages: string[];
		childFiles: (File | null)[];
		errors?: any;
		onsync?: () => void;
	} = $props();

	// ─── Add / Remove Children ───────────────────────────────────────────────────

	function addChild() {
		const newChild: DraftChild = {
			clientId: nanoid(),
			name: '',
			slug: '',
			description: null,
			sortOrder: children.length,
			isActive: true,
			imageIndex: null
		};
		children = [...children, newChild];
		childImages = [...childImages, ''];
		childFiles = [...childFiles, null];
	}

	function removeChild(index: number) {
		// Revoke the object URL if present
		if (childImages[index]) {
			URL.revokeObjectURL(childImages[index]);
		}
		children = children.filter((_, i) => i !== index);
		childImages = childImages.filter((_, i) => i !== index);
		childFiles = childFiles.filter((_, i) => i !== index);
		onsync?.();
	}

	// ─── Field Handlers ───────────────────────────────────────────────────────────

	function handleChildNameInput(index: number, event: Event) {
		const value = (event.target as HTMLInputElement).value;
		const slug = generateSlug(value);
		children = children.map((c, i) =>
			i === index ? { ...c, name: value, slug } : c
		);
	}

	function handleChildSlugInput(index: number, event: Event) {
		// Sanitize: lowercase, spaces → hyphens, strip non-slug chars
		const raw = (event.target as HTMLInputElement).value;
		const sanitized = raw
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-{2,}/g, '-');
		// Write sanitized value back to the input
		(event.target as HTMLInputElement).value = sanitized;
		children = children.map((c, i) =>
			i === index ? { ...c, slug: sanitized } : c
		);
	}

	function handleChildFileChange(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (!file) return;

		// Revoke any existing URL
		if (childImages[index]) {
			URL.revokeObjectURL(childImages[index]);
		}

		const url = URL.createObjectURL(file);
		childFiles[index] = file;
		childImages[index] = url;
		onsync?.();

		// Reset the input so the same file can be re-selected
		input.value = '';
	}

	function removeChildFile(index: number) {
		if (childImages[index]) {
			URL.revokeObjectURL(childImages[index]);
		}
		childFiles[index] = null;
		childImages[index] = '';
		onsync?.();
	}

	// ─── Cleanup ──────────────────────────────────────────────────────────────────

	onDestroy(() => {
		for (const url of childImages) {
			if (url) URL.revokeObjectURL(url);
		}
	});

	// ─── Derived error helpers ────────────────────────────────────────────────────

	function childError(index: number, field: string): string | undefined {
		const row = errors?.[index];
		if (!row) return undefined;
		const val = row[field];
		return Array.isArray(val) ? val[0] : typeof val === 'string' ? val : undefined;
	}
</script>

<!-- ─── Header Row ─────────────────────────────────────────────────────────── -->
<div class="flex items-center justify-between gap-3 pb-1">
	<span class="font-sans text-xs font-semibold tracking-wide text-ash/70 uppercase">
		Subcategories
		{#if children.length > 0}
			<span class="ml-1.5 rounded-full bg-charcoal px-2 py-0.5 font-mono text-[10px] text-ash">
				{children.length}
			</span>
		{/if}
	</span>

	<AdminButton variant="outline" size="sm" type="button" onclick={addChild}>
		<Plus class="h-3.5 w-3.5" />
		Add Subcategory
	</AdminButton>
</div>

<!-- ─── Empty State ───────────────────────────────────────────────────────── -->
{#if children.length === 0}
	<div
		class="flex flex-col items-center gap-3 rounded-sm border border-dashed border-ash/15 bg-void/30 px-6 py-10 text-center"
		transition:slide={{ duration: 180 }}
	>
		<FolderOpen class="h-8 w-8 text-ash/30" strokeWidth={1.5} />
		<p class="font-sans text-xs text-ash/50">
			No subcategories added yet. Click <span class="text-ash/80">"+ Add Subcategory"</span> to begin.
		</p>
	</div>
{/if}

<!-- ─── Child Rows ─────────────────────────────────────────────────────────── -->
<div class="flex flex-col gap-3">
	{#each children as child, i (child.clientId)}
		<div
			class="relative rounded-sm border border-ash/15 bg-void/50 p-5"
			animate:flip={{ duration: 240 }}
			transition:slide={{ duration: 200 }}
		>
			<!-- Numbered badge -->
			<div class="mb-4 flex items-center justify-between gap-2">
				<span
					class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-charcoal px-1.5 font-mono text-[10px] text-ash"
				>
					#{i + 1}
				</span>

				<!-- Remove row button -->
				<button
					type="button"
					aria-label="Remove subcategory {i + 1}"
					onclick={() => removeChild(i)}
					class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-sm border border-red-500/20 text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/10 hover:text-red-300"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>

			<!-- Name + Slug -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<!-- Name -->
				<div class="grid gap-1">
					<label
						for="child-name-{child.clientId}"
						class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
					>
						Name
						<span class="ml-0.5 text-red-400" title="Required">*</span>
					</label>
					<input
						id="child-name-{child.clientId}"
						type="text"
						name="children[{i}].name"
						value={child.name}
						placeholder="e.g. Summer Collection"
						oninput={(e) => handleChildNameInput(i, e)}
						class="min-h-11 border bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt {childError(i, 'name') ? 'border-red-400/50 focus:border-red-400' : 'border-ash/30'}"
					/>
					{#if childError(i, 'name')}
						<span class="font-sans text-xs text-red-400">{childError(i, 'name')}</span>
					{/if}
				</div>

				<!-- Slug -->
				<div class="grid gap-1">
					<label
						for="child-slug-{child.clientId}"
						class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
					>
						Slug
						<span class="ml-0.5 text-red-400" title="Required">*</span>
					</label>
					<input
						id="child-slug-{child.clientId}"
						type="text"
						name="children[{i}].slug"
						value={child.slug}
						placeholder="auto-generated"
						oninput={(e) => handleChildSlugInput(i, e)}
						class="min-h-11 border bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt {childError(i, 'slug') ? 'border-red-400/50 focus:border-red-400' : 'border-ash/30'}"
					/>
					{#if childError(i, 'slug')}
						<span class="font-sans text-xs text-red-400">{childError(i, 'slug')}</span>
					{/if}
				</div>
			</div>

			<!-- Description -->
			<div class="mt-4 grid gap-1">
				<label
					for="child-desc-{child.clientId}"
					class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>
					Description
					<span class="ml-1 font-normal text-ash/40">(optional)</span>
				</label>
				<textarea
					id="child-desc-{child.clientId}"
					name="children[{i}].description"
					rows={3}
					placeholder="Brief description of this subcategory…"
					value={child.description ?? ''}
					oninput={(e) => {
						const val = (e.target as HTMLTextAreaElement).value;
						children[i] = { ...children[i], description: val || null };
					}}
					class="min-h-20 resize-y border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 outline-none transition-colors hover:border-ash/60 focus:border-volt {childError(i, 'description') ? 'border-red-400/50 focus:border-red-400' : 'border-ash/30'}"
				></textarea>
				{#if childError(i, 'description')}
					<span class="font-sans text-xs text-red-400">{childError(i, 'description')}</span>
				{/if}
			</div>

			<!-- Sort Order + Image upload -->
			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
				<!-- Sort Order -->
				<div class="grid gap-1">
					<label
						for="child-sort-{child.clientId}"
						class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>
						Sort Order
					</label>
					<input
						id="child-sort-{child.clientId}"
						type="number"
						name="children[{i}].sortOrder"
						bind:value={child.sortOrder}
						min={0}
						class="min-h-11 border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 outline-none transition-colors hover:border-ash/60 focus:border-volt {childError(i, 'sortOrder') ? 'border-red-400/50 focus:border-red-400' : 'border-ash/30'}"
					/>
					{#if childError(i, 'sortOrder')}
						<span class="font-sans text-xs text-red-400">{childError(i, 'sortOrder')}</span>
					{/if}
				</div>

				<!-- Image Upload -->
				<div class="grid gap-1">
					<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">
						Image
						<span class="ml-1 font-normal text-ash/40">(optional)</span>
					</span>

					<div class="flex items-start gap-3">
						{#if childImages[i]}
							<!-- Thumbnail -->
							<div class="relative h-16 w-12 shrink-0 overflow-hidden border border-charcoal">
								<img
									src={childImages[i]}
									alt="Child {i + 1} preview"
									class="h-full w-full object-cover"
								/>
								<!-- Remove image button -->
								<button
									type="button"
									aria-label="Remove image for subcategory {i + 1}"
									onclick={() => removeChildFile(i)}
									class="absolute top-0.5 right-0.5 inline-flex h-5 w-5 items-center justify-center bg-void/80 text-red-400 transition-colors hover:text-red-300"
								>
									<X class="h-3 w-3" />
								</button>
							</div>
						{/if}

						<!-- Hidden file input + label trigger -->
						<label
							class="inline-flex cursor-pointer items-center self-start border border-dashed border-ash/25 bg-charcoal/30 px-3 py-2 font-sans text-[11px] text-bone transition-colors hover:border-volt"
						>
							Upload Image
							<input
								type="file"
								accept="image/*"
								class="sr-only"
								onchange={(e) => handleChildFileChange(i, e)}
							/>
						</label>
					</div>
				</div>
			</div>

			<!-- Active toggle -->
			<div
				class="mt-2 flex items-center justify-between border-t border-charcoal/40 pt-4"
			>
				<div class="grid">
					<span class="font-sans text-sm font-semibold text-bone">Active</span>
					<span class="font-sans text-xs text-ash/60">Visible to shoppers</span>
				</div>
				<AdminToggle standalone bind:checked={child.isActive} />
			</div>
		</div>
	{/each}
</div>
