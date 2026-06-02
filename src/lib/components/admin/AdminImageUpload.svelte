<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Upload, X, ImageOff } from 'lucide-svelte';

	interface Props {
		id: string;
		previewUrl?: string | null;
		file?: File | null;
		accept?: string;
		maxSizeMb?: number;
		onchange?: (file: File | null) => void;
		error?: string;
		class?: string;
	}

	let {
		id,
		previewUrl = $bindable(null),
		file = $bindable(null),
		accept = 'image/*',
		maxSizeMb = 5,
		onchange,
		error = '',
		class: className = ''
	}: Props = $props();

	// ── Internal state ─────────────────────────────────────────────────────────
	let dragActive = $state(false);
	let internalError = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);

	// Track object URLs we created so we can revoke them
	let ownedObjectUrl: string | null = null;

	// ── Derived ────────────────────────────────────────────────────────────────
	const displayError = $derived(error || internalError);

	const fileMeta = $derived.by(() => {
		if (!file) return null;
		const bytes = file.size;
		if (bytes >= 1_048_576) {
			return { name: file.name, size: `${(bytes / 1_048_576).toFixed(1)} MB` };
		}
		return { name: file.name, size: `${(bytes / 1024).toFixed(0)} KB` };
	});

	// ── Helpers ────────────────────────────────────────────────────────────────
	function revokeOwned() {
		if (ownedObjectUrl) {
			URL.revokeObjectURL(ownedObjectUrl);
			ownedObjectUrl = null;
		}
	}

	function processFile(incoming: File | null) {
		internalError = '';

		if (!incoming) {
			revokeOwned();
			file = null;
			previewUrl = null;
			onchange?.(null);
			return;
		}

		const maxBytes = maxSizeMb * 1_048_576;
		if (incoming.size > maxBytes) {
			internalError = `File exceeds ${maxSizeMb} MB limit.`;
			revokeOwned();
			file = null;
			previewUrl = null;
			onchange?.(null);
			return;
		}

		revokeOwned();
		const url = URL.createObjectURL(incoming);
		ownedObjectUrl = url;

		file = incoming;
		previewUrl = url;
		onchange?.(incoming);
	}

	// ── Event handlers ─────────────────────────────────────────────────────────
	function handleInputChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		processFile(target.files?.[0] ?? null);
		// Reset input so the same file can be re-selected after removal
		target.value = '';
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave(event: DragEvent) {
		// Only deactivate if leaving the zone entirely (not entering a child)
		const related = event.relatedTarget as Node | null;
		if (!(event.currentTarget as HTMLElement).contains(related)) {
			dragActive = false;
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		const dropped = event.dataTransfer?.files?.[0] ?? null;
		processFile(dropped);
	}

	function handleRemove(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		processFile(null);
		if (inputEl) inputEl.value = '';
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────
	onDestroy(() => {
		revokeOwned();
	});
</script>

<div class="flex flex-col gap-2 {className}">
	<!-- Drop zone / preview wrapper -->
	<div
		class="relative aspect-video w-full overflow-hidden rounded-lg border transition-all duration-200
			{dragActive
				? 'border-volt bg-volt/5'
				: previewUrl
					? 'border-ash/20 bg-void/50'
					: 'border-dashed border-ash/20 bg-void/50 hover:border-volt/60 hover:bg-void/80'}"
		role="presentation"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		{#if previewUrl}
			<!-- ── Preview state ── -->
			<label for={id} class="block h-full w-full cursor-pointer">
				<img
					src={previewUrl}
					alt={file?.name ?? 'Uploaded image'}
					class="h-full w-full object-cover"
				/>
			</label>

			<!-- Remove button -->
			<button
				type="button"
				onclick={handleRemove}
				aria-label="Remove image"
				class="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-md
					border border-red-400/30 bg-void/80 text-red-300
					transition-colors duration-150
					hover:bg-red-500/20 hover:text-red-200
					focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
			>
				<X size={14} strokeWidth={2.5} />
			</button>
		{:else}
			<!-- ── Empty / drag state ── -->
			<label
				for={id}
				class="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 px-6 py-8 text-center select-none"
			>
				<span
					class="flex h-14 w-14 items-center justify-center rounded-full
						border border-ash/20 bg-charcoal
						transition-colors duration-200
						{dragActive ? 'border-volt/40 bg-volt/10 text-volt' : 'text-ash'}"
				>
					{#if dragActive}
						<Upload size={28} strokeWidth={1.75} />
					{:else}
						<ImageOff size={28} strokeWidth={1.5} />
					{/if}
				</span>

				<span class="flex flex-col gap-1">
					<span class="font-sans text-sm font-semibold text-bone/90 leading-tight">
						{dragActive ? 'Release to upload' : 'Drop image here or click to browse'}
					</span>
					<span class="font-mono text-xs text-ash/70 tracking-wide uppercase">
						JPG · PNG · WEBP · MAX {maxSizeMb}MB
					</span>
				</span>
			</label>
		{/if}
	</div>

	<!-- Hidden file input -->
	<input
		bind:this={inputEl}
		{id}
		type="file"
		{accept}
		class="sr-only"
		onchange={handleInputChange}
	/>

	<!-- File metadata (shown when a file is selected) -->
	{#if fileMeta}
		<div class="flex items-center gap-2 px-1">
			<Upload size={12} class="shrink-0 text-ash/50" />
			<span class="font-mono text-xs text-ash/70 truncate" title={fileMeta.name}>
				{fileMeta.name}
			</span>
			<span class="font-mono text-xs text-ash/40 ml-auto shrink-0">
				{fileMeta.size}
			</span>
		</div>
	{/if}

	<!-- Error message -->
	{#if displayError}
		<p class="font-sans text-xs text-red-400 px-1">{displayError}</p>
	{/if}
</div>
