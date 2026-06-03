<script lang="ts">
	import { page } from '$app/state';
	import { generateSlug } from '$lib/shared/slug';
	import {
		Save,
		Upload,
		X,
		ImageOff,
		ShoppingBag,
		Star,
		AlertTriangle,
		Layers,
		Calendar,
		Power,
		Info
	} from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import { superForm, filesProxy } from 'sveltekit-superforms';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import AdminDateTimePicker from '$lib/components/admin/AdminDateTimePicker.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data }: { data: PageData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// 1. General Info Superform
	const updateDropSuperform = superForm(
		initialForm(() => data.updateDropForm),
		{
			resetForm: false
		}
	);

	const {
		form: updateDropForm,
		errors: updateDropErrors,
		message: updateDropMessage,
		enhance: updateDropEnhance,
		submitting: updateDropSubmitting,
		isTainted: isUpdateDropTainted
	} = updateDropSuperform;

	const heroImageProxy = filesProxy(updateDropSuperform as any, 'heroImage' as any);

	// 2. Lineup Products Superform
	const setDropProductsSuperform = superForm(
		initialForm(() => data.setDropProductsForm),
		{
			resetForm: false
		}
	);

	const {
		form: setDropProductsForm,
		errors: setDropProductsErrors,
		message: setDropProductsMessage,
		enhance: setDropProductsEnhance,
		submitting: setDropProductsSubmitting
	} = setDropProductsSuperform;

	// 3. Hero Product Superform
	const setDropHeroProductSuperform = superForm(
		initialForm(() => data.setDropHeroProductForm),
		{
			resetForm: false
		}
	);

	const {
		form: setDropHeroProductForm,
		errors: setDropHeroProductErrors,
		message: setDropHeroProductMessage,
		enhance: setDropHeroProductEnhance,
		submitting: setDropHeroProductSubmitting
	} = setDropHeroProductSuperform;

	// 4. Status Transition Superform
	const transitionDropStatusSuperform = superForm(
		initialForm(() => data.transitionDropStatusForm),
		{
			resetForm: false
		}
	);

	const {
		enhance: transitionDropStatusEnhance,
		submitting: transitionDropStatusSubmitting,
		message: transitionDropStatusMessage
	} = transitionDropStatusSuperform;

	// Reactive combined action messages
	const actionMessage = $derived(
		$updateDropMessage ||
			$setDropProductsMessage ||
			$setDropHeroProductMessage ||
			$transitionDropStatusMessage
	);

	let activeTab = $state<'general' | 'lineup'>(
		page.url.searchParams.get('tab') === 'lineup' ? 'lineup' : 'general'
	);
	let slugManuallyEdited = $state(false);
	let selectedFile = $state<File | null>(null);
	let imagePreviewUrl = $state<string | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);
	let toastMessage = $state<string | null>(null);

	$effect(() => {
		if (actionMessage) toastMessage = actionMessage;
	});

	// Status transition modal states
	let showLaunchConfirm = $state(false);
	let transitionFormEl = $state<HTMLFormElement | null>(null);
	let submitToStatus = $state('');

	function handleTransitionClick(toStatus: 'teaser' | 'live' | 'sold_out' | 'archived') {
		submitToStatus = toStatus;
		if (toStatus === 'live') {
			showLaunchConfirm = true;
		} else {
			setTimeout(() => {
				if (transitionFormEl) transitionFormEl.requestSubmit();
			}, 0);
		}
	}

	function confirmLaunch() {
		showLaunchConfirm = false;
		setTimeout(() => {
			if (transitionFormEl) transitionFormEl.requestSubmit();
		}, 0);
	}

	function getStatusClass(status: string): string {
		switch (status) {
			case 'live':
				return 'text-volt border border-volt/20 bg-volt/5';
			case 'teaser':
				return 'text-ash border border-ash/20 bg-ash/5';
			case 'sold_out':
				return 'text-red-400 border border-red-400/20 bg-red-400/5';
			case 'archived':
				return 'text-ash/60 border border-ash/10 bg-ash/5';
			default:
				return 'text-bone border border-charcoal bg-void';
		}
	}

	function getStatusLabel(status: string): string {
		return (status ?? '').replace('_', ' ');
	}

	function handleNameInput() {
		if (!slugManuallyEdited && data.drop.status === 'teaser') {
			$updateDropForm.slug = generateSlug($updateDropForm.name ?? '');
		}
	}

	function createFileList(files: File[]): FileList {
		const dataTransfer = new DataTransfer();
		for (const file of files) {
			dataTransfer.items.add(file);
		}
		return dataTransfer.files;
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			selectedFile = files[0];
			$heroImageProxy = createFileList([selectedFile]);
			$updateDropForm.removeHeroImage = false;

			if (imagePreviewUrl) {
				URL.revokeObjectURL(imagePreviewUrl);
			}
			imagePreviewUrl = URL.createObjectURL(selectedFile);
		}
	}

	function removeSelectedFile() {
		selectedFile = null;
		$heroImageProxy = createFileList([]);
		if (imagePreviewUrl) {
			URL.revokeObjectURL(imagePreviewUrl);
			imagePreviewUrl = null;
		}
		if (data.drop.heroImageR2Key) {
			$updateDropForm.removeHeroImage = true;
		}
	}

	// Lineup management local states
	let searchProductQuery = $state('');
	let activeSearchQuery = $state('');

	$effect(() => {
		if (searchProductQuery === '') {
			activeSearchQuery = '';
		}
	});

	const filteredDropTierProducts = $derived.by(() => {
		const q = activeSearchQuery;
		if (!q) return data.dropTierProducts;
		return data.dropTierProducts.filter(
			(p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
		);
	});

	function toggleProductInLineup(productId: string) {
		const idx = $setDropProductsForm.productIds.indexOf(productId);
		if (idx >= 0) {
			$setDropProductsForm.productIds = $setDropProductsForm.productIds.filter(
				(id) => id !== productId
			);
		} else {
			$setDropProductsForm.productIds = [...$setDropProductsForm.productIds, productId];
		}
	}

	const currentlyAssignedProducts = $derived.by(() => {
		return data.dropTierProducts.filter((p) => $setDropProductsForm.productIds.includes(p.id));
	});

	function formatDateTime(date: number | string | null | undefined): string {
		if (!date) return 'TBC';
		const d = new Date(date);
		if (isNaN(d.getTime())) return 'TBC';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	onDestroy(() => {
		if (imagePreviewUrl) {
			URL.revokeObjectURL(imagePreviewUrl);
		}
	});
</script>

<form
	method="POST"
	action="?/transitionDropStatus"
	bind:this={transitionFormEl}
	use:transitionDropStatusEnhance
	hidden
>
	<input type="hidden" name="dropId" value={data.drop.id} />
	<input type="hidden" name="toStatus" value={submitToStatus} />
</form>

<!-- Dialog for manual Live Launch confirmation -->
<Dialog.Root bind:open={showLaunchConfirm}>
	{#if showLaunchConfirm}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-50 bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-50 grid place-items-center px-4">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 200, start: 0.95 }}
							class="w-full max-w-lg border border-red-500/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<Dialog.Title class="sr-only">Confirm Drop Launch</Dialog.Title>
							<Dialog.Description class="sr-only">
								Verify you wish to transition drop to Live status.
							</Dialog.Description>

							<div
								class="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
							>
								<AlertTriangle size={12} class="text-volt" />
								<span>DANGER ZONE / LAUNCH SIGNAL</span>
							</div>
							<h2 class="mt-2 font-display text-3xl leading-none text-bone uppercase">
								LAUNCH "{data.drop.name}" LIVE?
							</h2>
							<p class="mt-3 font-sans text-sm leading-relaxed text-ash/80">
								Are you sure you want to transition this drop to <strong class="text-volt uppercase"
									>LIVE</strong
								>? This will instantly trigger the dispatch of notifications (SMS/Email) to all
								waitlist signups. The lineup products will go on sale immediately.
							</p>
							<div class="mt-6 grid gap-3 sm:grid-cols-2">
								<AdminButton type="button" onclick={confirmLaunch} variant="volt">
									<Power size={14} aria-hidden="true" />
									Confirm & Launch
								</AdminButton>
								<AdminButton
									type="button"
									onclick={() => (showLaunchConfirm = false)}
									variant="outline"
								>
									Cancel
								</AdminButton>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<AdminFormLayout
	kicker="Operations"
	title={`Edit Drop: ${data.drop.name}`}
	backHref={`/app/drops/${data.drop.slug}`}
	backLabel="Back to detail"
	isSubmitting={$updateDropSubmitting ||
		$setDropProductsSubmitting ||
		$setDropHeroProductSubmitting ||
		$transitionDropStatusSubmitting}
	showSubmitButton={activeTab === 'general'}
	oncancel={() => history.back()}
	enhanceAction={updateDropEnhance}
	formAttrs={{
		method: 'POST',
		action: '?/updateDrop',
		enctype: 'multipart/form-data',
		novalidate: true
	}}
	bind:formElement
>
	{#snippet mainContent()}
		<!-- Hidden input for heroImage (required for superforms file submission, must stay mounted in DOM) -->
		<input
			type="file"
			name="heroImage"
			accept="image/*"
			class="sr-only"
			bind:files={$heroImageProxy}
		/>

		<!-- Form Tabs -->
		<div class="mb-6 flex border-b border-charcoal">
			<button
				type="button"
				class="border-b-2 px-5 py-3 font-display text-lg tracking-widest uppercase transition-colors {activeTab ===
				'general'
					? 'border-volt bg-charcoal/30 text-volt'
					: 'border-transparent text-ash hover:border-ash/30 hover:text-bone'}"
				onclick={() => (activeTab = 'general')}
			>
				General info
			</button>
			<button
				type="button"
				class="border-b-2 px-5 py-3 font-display text-lg tracking-widest uppercase transition-colors {activeTab ===
				'lineup'
					? 'border-volt bg-charcoal/30 text-volt'
					: 'border-transparent text-ash hover:border-ash/30 hover:text-bone'}"
				onclick={() => (activeTab = 'lineup')}
			>
				Lineup Products
			</button>
		</div>

		{#if activeTab === 'general'}
			<div class="space-y-6">
				<!-- Hidden variables for dates -->
				<input
					type="hidden"
					name="removeHeroImage"
					value={String($updateDropForm.removeHeroImage)}
				/>

				<AdminCard title="General Settings">
					<div class="space-y-4">
						<p class="-mt-3 mb-2 font-sans text-xs text-ash/70">
							Update the core metadata for the drop release.
						</p>

						<div class="grid gap-4 sm:grid-cols-2">
							<AdminInput
								label="Drop Name"
								name="name"
								bind:value={$updateDropForm.name}
								error={$updateDropErrors.name?.[0]}
								required
								oninput={handleNameInput}
							/>

							<!-- URL Slug: teasers can change slug, live releases cannot -->
							<AdminInput
								label="URL Slug"
								name="slug"
								bind:value={$updateDropForm.slug}
								error={$updateDropErrors.slug?.[0]}
								required
								disabled={data.drop.status !== 'teaser'}
								placeholder="e.g. drop-001"
								oninput={() => {
									slugManuallyEdited = true;
								}}
							/>
						</div>

						<AdminInput
							label="Teaser Tagline"
							name="tagline"
							bind:value={$updateDropForm.tagline}
							error={$updateDropErrors.tagline?.[0]}
							placeholder="Short promotional tagline shown on homepage teaser banner"
						/>

						<div class="flex flex-col gap-1.5">
							<label for="description" class="font-sans text-xs text-ash">
								Description (Markdown supported)
							</label>
							<textarea
								id="description"
								name="description"
								bind:value={$updateDropForm.description}
								rows="5"
								class="w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/50 transition-colors outline-none hover:border-ash/60 focus:border-volt"
								placeholder="Markdown stories, fabrics breakdown..."
							></textarea>
							{#if $updateDropErrors.description?.[0]}
								<p class="font-sans text-xs text-red-400">{$updateDropErrors.description[0]}</p>
							{/if}
						</div>
					</div>
				</AdminCard>

				<AdminCard title="Release Timings">
					<div class="space-y-4">
						<p class="-mt-3 mb-2 font-sans text-xs text-ash/70">
							Scheduled launch date and flash closure timing (optional).
						</p>

						<div class="grid gap-4 sm:grid-cols-2">
							<AdminDateTimePicker
								label="Launch Time (Live release)"
								name="launchAt"
								bind:value={$updateDropForm.launchAt}
								error={$updateDropErrors.launchAt?.[0]}
							/>

							<AdminDateTimePicker
								label="End Time (Optional Flash Window)"
								name="endAt"
								bind:value={$updateDropForm.endAt}
								error={$updateDropErrors.endAt?.[0]}
							/>
						</div>
					</div>
				</AdminCard>
			</div>
		{:else if activeTab === 'lineup'}
			<!-- LINEUP TAB CONTROLS -->
			<div class="space-y-6">
				<!-- Assign Products Form -->
				<form method="POST" action="?/setDropProducts" use:setDropProductsEnhance class="space-y-4">
					<input type="hidden" name="dropId" value={$setDropProductsForm.dropId} />
					{#each $setDropProductsForm.productIds as prodId}
						<input type="hidden" name="productIds" value={prodId} />
					{/each}

					<AdminCard title="Product Lineup Management">
						<div class="space-y-4">
							<p class="-mt-5 mb-2 font-sans text-xs text-ash/70">
								Choose active products to feature in this drop event.
							</p>

							<div class="flex gap-2">
								<input
									type="text"
									bind:value={searchProductQuery}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											activeSearchQuery = searchProductQuery.toLowerCase().trim();
										}
									}}
									placeholder="Search drop products by name/slug..."
									class="min-h-11 flex-1 border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/50 transition-colors outline-none hover:border-ash/60 focus:border-volt"
								/>
								<AdminButton
									type="button"
									onclick={() => (activeSearchQuery = searchProductQuery.toLowerCase().trim())}
									variant="outline"
									class="shrink-0"
								>
									Search
								</AdminButton>
								{#if activeSearchQuery}
									<AdminButton
										type="button"
										onclick={() => {
											searchProductQuery = '';
											activeSearchQuery = '';
										}}
										variant="outline"
										class="shrink-0 border-red-400/30 text-red-300 hover:bg-red-500/10"
									>
										Clear
									</AdminButton>
								{/if}
							</div>

							<div class="overflow-hidden border border-charcoal bg-void">
								<div class="max-h-80 divide-y divide-charcoal/50 overflow-y-auto pr-1">
									{#if data.dropTierProducts.length === 0}
										<div class="p-6 text-center">
											<p class="font-mono text-xs text-ash/50 uppercase">
												No drop-tier products available
											</p>
											<p class="mx-auto mt-1.5 max-w-md font-sans text-xs text-ash/60">
												Only products configured with the <strong class="text-volt uppercase"
													>Drop</strong
												> tier can be added to a lineup. Please create or update products to the drop
												tier first under Catalog -> Products.
											</p>
										</div>
									{:else if filteredDropTierProducts.length === 0}
										<p class="p-5 text-center font-mono text-xs text-ash/50 uppercase">
											No products match your search
										</p>
									{:else}
										{#each filteredDropTierProducts as prod (prod.id)}
											{@const isAssigned = $setDropProductsForm.productIds.includes(prod.id)}
											<div class="flex items-center justify-between gap-4 p-3 hover:bg-charcoal/20">
												<div class="flex min-w-0 items-center gap-3">
													<button
														type="button"
														onclick={() => toggleProductInLineup(prod.id)}
														class="grid h-5 w-5 shrink-0 place-items-center border border-ash/40 bg-void transition-colors focus:border-volt focus:outline-none {isAssigned
															? 'border-volt bg-volt text-void'
															: ''}"
													>
														{#if isAssigned}
															<span class="font-mono text-[9px] font-bold">✓</span>
														{/if}
													</button>
													<div
														class="h-10 w-12 shrink-0 overflow-hidden border border-charcoal bg-charcoal/10"
													>
														{#if prod.primaryImageUrl}
															<img
																src={prod.primaryImageUrl}
																alt=""
																class="h-full w-full object-cover"
															/>
														{:else}
															<div class="flex h-full w-full items-center justify-center bg-void">
																<ShoppingBag size={12} class="text-ash/30" />
															</div>
														{/if}
													</div>
													<div class="min-w-0">
														<p class="truncate font-mono text-xs font-semibold text-bone uppercase">
															{prod.name}
														</p>
														<p class="truncate font-mono text-[8px] text-ash">
															{prod.slug}
														</p>
													</div>
												</div>
												<span class="shrink-0 font-mono text-[9px] text-ash uppercase">
													LKR {prod.basePrice.toLocaleString()}
												</span>
											</div>
										{/each}
									{/if}
								</div>
							</div>

							<div class="flex justify-end pt-3">
								<AdminButton type="submit" variant="volt" disabled={$setDropProductsSubmitting}>
									<Save size={14} />
									Save Lineup Changes ({$setDropProductsForm.productIds.length} Selected)
								</AdminButton>
							</div>
						</div>
					</AdminCard>
				</form>

				<!-- Hero Product Selector Form -->
				{#if currentlyAssignedProducts.length > 0}
					<form method="POST" action="?/setDropHeroProduct" use:setDropHeroProductEnhance>
						<input type="hidden" name="dropId" value={$setDropHeroProductForm.dropId} />

						<AdminCard title="Featured Hero Product">
							<div class="space-y-4">
								<p class="-mt-5 mb-2 font-sans text-xs text-ash/70">
									Select a single assigned product to anchor the drop background hero showcase.
								</p>

								<div
									class="divide-y divide-charcoal/50 overflow-hidden border border-charcoal bg-void"
								>
									{#each currentlyAssignedProducts as prod (prod.id)}
										{@const isHero = $setDropHeroProductForm.productId === prod.id}
										<label class="flex cursor-pointer items-center gap-4 p-3 hover:bg-charcoal/20">
											<input
												type="radio"
												name="productId"
												value={prod.id}
												checked={isHero}
												onchange={() => ($setDropHeroProductForm.productId = prod.id)}
												class="h-4 w-4 shrink-0 border border-ash/30 bg-void text-volt focus:ring-volt"
											/>
											<div
												class="h-10 w-12 shrink-0 overflow-hidden border border-charcoal bg-charcoal/10"
											>
												{#if prod.primaryImageUrl}
													<img
														src={prod.primaryImageUrl}
														alt=""
														class="h-full w-full object-cover"
													/>
												{:else}
													<div class="flex h-full w-full items-center justify-center bg-void">
														<ShoppingBag size={12} class="text-ash/30" />
													</div>
												{/if}
											</div>
											<div class="flex min-w-0 flex-1 items-center justify-between">
												<div class="min-w-0">
													<p class="truncate font-mono text-xs font-semibold text-bone uppercase">
														{prod.name}
													</p>
													<p class="truncate font-mono text-[8px] text-ash">
														{prod.slug}
													</p>
												</div>
												{#if isHero}
													<span
														class="flex items-center gap-1 font-mono text-[9px] text-volt uppercase"
													>
														<Star size={10} class="fill-current" />
														<span>Selected hero</span>
													</span>
												{/if}
											</div>
										</label>
									{/each}
								</div>

								<div class="flex justify-end pt-3">
									<AdminButton
										type="submit"
										variant="volt"
										disabled={$setDropHeroProductSubmitting}
									>
										<Star size={14} />
										Set Featured Hero Product
									</AdminButton>
								</div>
							</div>
						</AdminCard>
					</form>
				{/if}
			</div>
		{/if}
	{/snippet}

	{#snippet sidebarContent()}
		<div class="space-y-6">
			<!-- Drop Status / Transition Card -->
			<AdminCard title="Release Status">
				<div class="space-y-4">
					<div class="flex items-center justify-between border-b border-charcoal/50 pb-3">
						<span class="font-mono text-xs text-ash">Active Status</span>
						<span
							class="rounded px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase {getStatusClass(
								data.drop.status
							)}"
						>
							{getStatusLabel(data.drop.status)}
						</span>
					</div>

					<div class="space-y-2">
						{#if data.drop.status === 'teaser'}
							<AdminButton
								type="button"
								onclick={() => handleTransitionClick('live')}
								variant="volt"
								class="w-full justify-center"
								disabled={$transitionDropStatusSubmitting}
							>
								<Power size={14} />
								Force Launch Live
							</AdminButton>
							<AdminButton
								type="button"
								onclick={() => handleTransitionClick('archived')}
								variant="outline"
								class="w-full justify-center"
								disabled={$transitionDropStatusSubmitting}
							>
								Archive Teaser
							</AdminButton>
						{:else if data.drop.status === 'live'}
							<div class="flex gap-2">
								<AdminButton
									type="button"
									onclick={() => handleTransitionClick('sold_out')}
									variant="outline"
									class="flex-1 justify-center border-red-400/40 text-red-300 hover:bg-red-400 hover:text-void"
									disabled={$transitionDropStatusSubmitting}
								>
									Mark Sold Out
								</AdminButton>
								<AdminButton
									type="button"
									onclick={() => handleTransitionClick('archived')}
									variant="outline"
									class="flex-1 justify-center"
									disabled={$transitionDropStatusSubmitting}
								>
									Archive Drop
								</AdminButton>
							</div>
						{:else if data.drop.status === 'sold_out'}
							<AdminButton
								type="button"
								onclick={() => handleTransitionClick('archived')}
								variant="outline"
								class="w-full justify-center"
								disabled={$transitionDropStatusSubmitting}
							>
								Archive Record
							</AdminButton>
						{:else}
							<div
								class="flex items-center gap-2 border border-charcoal bg-void/50 p-3 text-ash/60"
							>
								<Info size={14} />
								<span class="font-sans text-[11px]">This drop is archived and read-only.</span>
							</div>
						{/if}
					</div>
				</div>
			</AdminCard>

			<!-- Hero Image Uploader Card -->
			<AdminCard title="Hero Banner Image">
				<div class="space-y-4">
					<p class="-mt-3 mb-2 font-sans text-xs text-ash/70">
						Upload wallpaper hero visual for homepage teaser panel.
					</p>

					{#if imagePreviewUrl}
						<div
							class="relative aspect-video w-full overflow-hidden border border-charcoal bg-void"
						>
							<img
								src={imagePreviewUrl}
								alt="Hero teaser preview"
								class="h-full w-full object-cover"
							/>
							<button
								type="button"
								onclick={removeSelectedFile}
								class="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full border border-red-400/40 bg-void text-red-400 transition-colors hover:bg-red-400 hover:text-void"
								title="Remove Hero Image"
							>
								<X size={14} />
							</button>
						</div>
					{:else if data.drop.heroImageUrl && !$updateDropForm.removeHeroImage}
						<div
							class="relative aspect-video w-full overflow-hidden border border-charcoal bg-void"
						>
							<img
								src={data.drop.heroImageUrl}
								alt="Hero teaser"
								class="h-full w-full object-cover"
							/>
							<button
								type="button"
								onclick={removeSelectedFile}
								class="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full border border-red-400/40 bg-void text-red-400 transition-colors hover:bg-red-400 hover:text-void"
								title="Delete Existing Image"
							>
								<X size={14} />
							</button>
						</div>
					{:else}
						<label
							class="flex aspect-video w-full cursor-pointer flex-col items-center justify-center border border-dashed border-ash/30 bg-void/50 transition-colors hover:border-volt/60 hover:bg-void"
						>
							<Upload size={20} class="mb-2 text-ash/60" />
							<span class="font-sans text-xs text-ash">Upload replacements banner</span>
							<span class="mt-1 font-mono text-[9px] text-ash/40">JPG, PNG or WEBP (Max 5MB)</span>
							<input type="file" accept="image/*" class="hidden" onchange={handleFileChange} />
						</label>
					{/if}
					{#if $updateDropErrors.heroImage?.[0]}
						<p class="font-sans text-xs text-red-400">{$updateDropErrors.heroImage[0]}</p>
					{/if}
				</div>
			</AdminCard>

			<!-- Sort settings -->
			<AdminCard title="Settings">
				<div>
					<AdminInput
						label="Sort Order"
						name="sortOrder"
						type="number"
						bind:value={$updateDropForm.sortOrder}
						error={$updateDropErrors.sortOrder?.[0]}
					/>
				</div>
			</AdminCard>

			<!-- Snapshot Sidebar card preview -->
			<AdminCard title="Live Teaser Preview">
				<div>
					<div class="border border-charcoal bg-void p-4">
						<div
							class="flex aspect-video w-full items-center justify-center overflow-hidden border border-charcoal bg-charcoal/30"
						>
							{#if imagePreviewUrl}
								<img src={imagePreviewUrl} alt="" class="h-full w-full object-cover" />
							{:else}
								{@const currentHero = data.drop.heroImageUrl}
								{#if currentHero && !$updateDropForm.removeHeroImage}
									<img src={currentHero} alt="" class="h-full w-full object-cover" />
								{:else}
									<ImageOff size={20} class="text-ash/30" />
								{/if}
							{/if}
						</div>
						<h3 class="mt-3 font-mono text-sm font-bold tracking-widest text-bone uppercase">
							{$updateDropForm.name || 'NEW DROP'}
						</h3>
						<p class="mt-1 font-mono text-[9px] tracking-wider text-volt uppercase">
							{$updateDropForm.tagline || 'COMING SOON'}
						</p>
						<div class="mt-4 flex items-center justify-between border-t border-charcoal/50 pt-3">
							<span class="font-mono text-[9px] text-ash">SCHEDULED</span>
							<span class="font-mono text-[9px] text-bone">
								{formatDateTime($updateDropForm.launchAt)}
							</span>
						</div>
					</div>
				</div>
			</AdminCard>
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
