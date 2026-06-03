<script lang="ts">
	import { generateSlug } from '$lib/shared/slug';
	import { ImageOff, Zap, Clock, CalendarDays } from 'lucide-svelte';
	import { superForm, filesProxy } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import { slide } from 'svelte/transition';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import AdminDateTimePicker from '$lib/components/admin/AdminDateTimePicker.svelte';
	import AdminImageUpload from '$lib/components/admin/AdminImageUpload.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data }: { data: PageData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const createDropSuperform = superForm(
		initialForm(() => data.createDropForm),
		{
			resetForm: false
		}
	);

	const {
		form: createDropForm,
		errors: createDropErrors,
		message: createDropMessage,
		enhance: createDropEnhance,
		submitting: createDropSubmitting
	} = createDropSuperform;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const heroImageProxy = filesProxy(createDropSuperform as any, 'heroImage' as any);

	// ── Image state ───────────────────────────────────────────────────────
	let heroPreviewUrl = $state<string | null>(null);
	let heroFile = $state<File | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	// ── Toast ─────────────────────────────────────────────────────────────
	let toastMessage = $state<string | null>(null);

	$effect(() => {
		if ($createDropMessage) toastMessage = $createDropMessage;
	});

	// ── Slug ──────────────────────────────────────────────────────────────
	let slugManuallyEdited = $state(false);

	function handleNameInput() {
		if (!slugManuallyEdited) {
			$createDropForm.slug = generateSlug($createDropForm.name ?? '');
		}
	}

	// ── Hero image sync ───────────────────────────────────────────────────
	function handleHeroImageChange(file: File | null) {
		heroFile = file;
		if (file) {
			const dt = new DataTransfer();
			dt.items.add(file);
			$heroImageProxy = dt.files;
		} else {
			const dt = new DataTransfer();
			$heroImageProxy = dt.files;
		}
	}

	// ── Formatting helpers ────────────────────────────────────────────────
	function formatDateTime(ts: number | null | undefined): string {
		if (!ts) return 'TBC';
		const d = new Date(ts);
		if (isNaN(d.getTime())) return 'TBC';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// ── Drop window status ────────────────────────────────────────────────
	const dropWindowSummary = $derived.by(() => {
		const launch = $createDropForm.launchAt;
		const end = $createDropForm.endAt;
		if (!launch) return 'No schedule set';
		if (!end) return `Launches ${formatDateTime(launch)} · No close window`;
		const durationMs = end - launch;
		const hours = Math.round(durationMs / (1000 * 60 * 60));
		return `${hours}h flash window`;
	});

	// ── Snapshot warnings ─────────────────────────────────────────────────
	const snapshotWarnings = $derived.by(() => {
		const warnings: string[] = [];
		if (!$createDropForm.name) warnings.push('Drop name is required');
		if (!$createDropForm.slug) warnings.push('Slug is required');
		if (!heroFile) warnings.push('Hero image not set — teaser will show a placeholder');
		if (!$createDropForm.launchAt) warnings.push('No launch time set');
		return warnings;
	});

	// ── Date constraints ─────────────────────────────────────────────────
	const todayStartMs = (() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	})();

	const endAtMinMs = $derived($createDropForm.launchAt ?? todayStartMs);
</script>

<AdminFormLayout
	kicker="Operations"
	title="New Drop"
	backHref="/app/drops"
	backLabel="Back to drops"
	isSubmitting={$createDropSubmitting}
	actionMessage={null}
	enhanceAction={createDropEnhance}
	submitLabel="Create Teaser"
	oncancel={() => history.back()}
	bind:formElement
	formAttrs={{
		method: 'POST',
		action: '?/createDrop',
		enctype: 'multipart/form-data',
		novalidate: true
	}}
>
	{#snippet mainContent()}
		<!-- ── Hidden heroImage file input (required for superforms file submission) ── -->
		<input
			type="file"
			name="heroImage"
			accept="image/*"
			class="sr-only"
			bind:files={$heroImageProxy}
		/>
		<!-- ── Drop Identity ──────────────────────────────────────────── -->
		<AdminCard kicker="Step 1" title="Drop Identity" border="border border-ash/15">
			<div class="grid gap-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminInput
						label="Drop Name"
						name="name"
						bind:value={$createDropForm.name}
						error={$createDropErrors.name?.[0]}
						required
						placeholder="e.g. DROP 001"
						oninput={handleNameInput}
					/>

					<AdminInput
						label="URL Slug"
						name="slug"
						bind:value={$createDropForm.slug}
						error={$createDropErrors.slug?.[0]}
						required
						placeholder="e.g. drop-001"
						helpText="Auto-generated from name"
						oninput={() => (slugManuallyEdited = true)}
					/>
				</div>

				<AdminInput
					label="Teaser Tagline"
					name="tagline"
					bind:value={$createDropForm.tagline}
					error={$createDropErrors.tagline?.[0]}
					placeholder="Short line shown on the homepage countdown banner"
				/>

				<div class="grid gap-1.5">
					<label
						for="drop-description"
						class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>
						Description
						<span class="ml-1 font-normal text-ash/40">(Markdown supported)</span>
					</label>
					<textarea
						id="drop-description"
						name="description"
						bind:value={$createDropForm.description}
						rows={5}
						placeholder="Long-form story copy, material details, sizing callouts..."
						class="w-full resize-y border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					></textarea>
					{#if $createDropErrors.description?.[0]}
						<p class="font-sans text-xs text-red-400">{$createDropErrors.description[0]}</p>
					{/if}
				</div>
			</div>
		</AdminCard>

		<!-- ── Hero Image ─────────────────────────────────────────────── -->
		<AdminCard kicker="Step 2" title="Hero Image" border="border border-ash/15">
			<p class="mb-4 font-sans text-xs text-ash/60">
				Full-bleed banner displayed on the homepage teaser and the drop landing page.
			</p>
			<AdminImageUpload
				id="drop-hero-image"
				bind:previewUrl={heroPreviewUrl}
				bind:file={heroFile}
				onchange={handleHeroImageChange}
				accept="image/*"
				maxSizeMb={8}
				error={$createDropErrors.heroImage?.[0]}
			/>
		</AdminCard>

		<!-- ── Launch Schedule ───────────────────────────────────────── -->
		<AdminCard kicker="Step 3" title="Launch Schedule" border="border border-ash/15">
			<p class="mb-4 font-sans text-xs text-ash/60">
				Set the live release time and optional flash-sale end window.
			</p>
			<div class="grid gap-4 sm:grid-cols-2">
				<AdminDateTimePicker
					label="Launch Time"
					name="launchAt"
					bind:value={$createDropForm.launchAt}
					minValue={todayStartMs}
					error={$createDropErrors.launchAt?.[0]}
				/>

				<AdminDateTimePicker
					label="End Time (optional flash window)"
					name="endAt"
					bind:value={$createDropForm.endAt}
					minValue={endAtMinMs}
					error={$createDropErrors.endAt?.[0]}
				/>
			</div>

			{#if $createDropForm.launchAt && $createDropForm.endAt}
				{@const valid = $createDropForm.endAt > $createDropForm.launchAt}
				<div
					transition:slide={{ duration: 200 }}
					class="mt-4 flex items-center gap-2 border px-3.5 py-2.5 font-mono text-[10px] tracking-widest uppercase {valid
						? 'border-volt/20 bg-volt/5 text-volt'
						: 'border-red-400/20 bg-red-950/20 text-red-300'}"
				>
					<Clock size={12} class="shrink-0" />
					{valid ? dropWindowSummary : 'End time must be after launch time'}
				</div>
			{/if}
		</AdminCard>

		<!-- ── Sort & Settings ──────────────────────────────────────── -->
		<AdminCard border="border border-ash/15">
			<div class="grid gap-4 sm:grid-cols-2">
				<AdminInput
					label="Sort Order"
					name="sortOrder"
					type="number"
					bind:value={$createDropForm.sortOrder}
					error={$createDropErrors.sortOrder?.[0]}
					placeholder="0"
					helpText="Lower number = higher priority"
				/>

				<div class="grid gap-1">
					<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
						>Initial Status</span
					>
					<div
						class="flex min-h-11 items-center border border-ash/15 bg-void/50 px-3.5 font-mono text-xs tracking-widest text-ash/70 uppercase"
					>
						Teaser
					</div>
					<p class="font-sans text-[11px] text-ash/45">
						All drops start as teasers. Transition to Live from the edit page.
					</p>
				</div>
			</div>
		</AdminCard>
	{/snippet}

	{#snippet sidebarContent()}
		<!-- ── Live teaser preview ───────────────────────────────────── -->
		<div
			class="relative aspect-video w-full overflow-hidden border-b border-charcoal bg-charcoal/20"
		>
			{#if heroPreviewUrl}
				<img src={heroPreviewUrl} alt="Drop hero preview" class="h-full w-full object-cover" />
				<!-- Teaser overlay simulation -->
				<div
					class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-void/80 via-void/20 to-transparent p-4"
				>
					<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
						{$createDropForm.tagline || 'COMING SOON'}
					</p>
					<h2 class="mt-1 font-display text-xl leading-none text-bone uppercase">
						{$createDropForm.name || 'New Drop'}
					</h2>
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center gap-2">
					<ImageOff size={24} class="text-ash/25" />
					<p class="font-mono text-[9px] tracking-widest text-ash/30 uppercase">No hero image</p>
				</div>
			{/if}
		</div>

		<!-- ── Snapshot details ──────────────────────────────────────── -->
		<div class="p-5">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Snapshot</p>

			<div class="mt-2 flex items-start justify-between gap-3">
				<h2
					class="min-w-0 truncate font-sans text-base leading-snug font-semibold text-bone uppercase"
				>
					{$createDropForm.name || 'Untitled Drop'}
				</h2>
				<span
					class="shrink-0 border border-amber-300/30 bg-amber-300/10 px-2 py-1 font-mono text-[9px] tracking-widest text-amber-200 uppercase"
				>
					Teaser
				</span>
			</div>

			{#if $createDropForm.tagline}
				<p class="mt-1 font-mono text-[10px] text-volt">{$createDropForm.tagline}</p>
			{/if}

			<p class="mt-1 truncate font-mono text-[10px] text-ash">
				/{$createDropForm.slug || 'no-slug'}
			</p>

			<!-- Schedule summary -->
			<div class="mt-4 space-y-1.5 border-t border-ash/10 pt-4">
				<div class="flex items-center gap-2 font-mono text-[10px] uppercase">
					<Zap size={10} class="shrink-0 text-volt" />
					<span class="text-ash/50">Launch:</span>
					<span class="ml-auto text-right text-bone">
						{formatDateTime($createDropForm.launchAt)}
					</span>
				</div>
				<div class="flex items-center gap-2 font-mono text-[10px] uppercase">
					<CalendarDays size={10} class="shrink-0 text-ash/40" />
					<span class="text-ash/50">Closes:</span>
					<span class="ml-auto text-right text-bone">
						{formatDateTime($createDropForm.endAt)}
					</span>
				</div>
			</div>
		</div>

		<!-- ── Warnings ──────────────────────────────────────────────── -->
		{#if snapshotWarnings.length > 0}
			<div
				transition:slide={{ duration: 200 }}
				class="mx-5 mb-4 border border-amber-300/20 bg-amber-300/5 p-3.5"
			>
				<p class="font-mono text-[9px] font-semibold tracking-wider text-amber-300 uppercase">
					Before you save ({snapshotWarnings.length})
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

<!-- ── Server error toast ─────────────────────────────────────────── -->
<AdminToast
	message={toastMessage}
	type="error"
	duration={6000}
	onclose={() => (toastMessage = null)}
/>
