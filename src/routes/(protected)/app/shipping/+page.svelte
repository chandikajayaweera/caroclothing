<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Plus, Pencil, Trash2, MapPin, Map as MapIcon } from 'lucide-svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';

	let { data }: { data: PageData } = $props();
	type ShippingMethod = PageData['methods']['items'][number];
	type ShippingZone = PageData['zones']['items'][number];
	type ShippingCarrier = PageData['carriers'][number];
	type ShippingDistrict = PageData['setZoneForm']['data']['district'];

	// ── Tab Management ──
	let activeTab = $state<'methods' | 'zones' | 'carriers'>(
		(page.url.searchParams.get('tab') as 'methods' | 'zones' | 'carriers') || 'methods'
	);

	function setTab(tab: 'methods' | 'zones' | 'carriers') {
		activeTab = tab;
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		url.searchParams.delete('offset'); // Reset pagination offset on tab change
		goto(resolve(`${url.pathname}${url.search}` as '/'), {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	// ── Modal Dialog States ──
	let addMethodOpen = $state(false);
	let editMethodOpen = $state(false);
	let setZoneOpen = $state(false);
	let addCarrierOpen = $state(false);
	let editCarrierOpen = $state(false);

	// ── Form/Toast Messages ──
	let toastMessage = $state<string | null>(null);

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// ── Superforms Hookups ──

	// 1. Create Method
	const createMethodSuperform = superForm(
		initialForm(() => data.createMethodForm),
		{
			id: 'createShippingMethod',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					addMethodOpen = false;
					toastMessage = form.message ?? 'Shipping method created.';
				}
			}
		}
	);
	const {
		form: createForm,
		errors: createErrors,
		enhance: createEnhance,
		submitting: createSubmitting
	} = createMethodSuperform;

	// 2. Update Method
	const updateMethodSuperform = superForm(
		initialForm(() => data.updateMethodForm),
		{
			id: 'updateShippingMethod',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) {
					editMethodOpen = false;
					toastMessage = form.message ?? 'Shipping method updated.';
				}
			}
		}
	);
	const {
		form: updateForm,
		errors: updateErrors,
		enhance: updateEnhance,
		submitting: updateSubmitting
	} = updateMethodSuperform;

	// 3. Set Zone
	const setZoneSuperform = superForm(
		initialForm(() => data.setZoneForm),
		{
			id: 'setShippingZone',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					setZoneOpen = false;
					toastMessage = form.message ?? 'Shipping zone override saved.';
				}
			}
		}
	);
	const {
		form: setZoneFormState,
		errors: setZoneErrors,
		enhance: setZoneEnhance,
		submitting: setZoneSubmitting
	} = setZoneSuperform;

	// 4. Remove Zone
	const removeZoneSuperform = superForm(
		initialForm(() => data.removeZoneForm),
		{
			id: 'removeShippingZone',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Shipping zone override removed.';
				}
			}
		}
	);
	const { enhance: removeZoneEnhance } = removeZoneSuperform;

	// 5. Create Carrier
	const createCarrierSuperform = superForm(
		initialForm(() => data.createCarrierForm),
		{
			id: 'createCarrier',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					addCarrierOpen = false;
					toastMessage = form.message ?? 'Carrier created.';
				}
			}
		}
	);
	const {
		form: createCarrierFormState,
		errors: createCarrierErrors,
		enhance: createCarrierEnhance,
		submitting: createCarrierSubmitting
	} = createCarrierSuperform;

	// 6. Update Carrier
	const updateCarrierSuperform = superForm(
		initialForm(() => data.updateCarrierForm),
		{
			id: 'updateCarrier',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) {
					editCarrierOpen = false;
					toastMessage = form.message ?? 'Carrier updated.';
				}
			}
		}
	);
	const {
		form: updateCarrierFormState,
		errors: updateCarrierErrors,
		enhance: updateCarrierEnhance,
		submitting: updateCarrierSubmitting
	} = updateCarrierSuperform;

	// 7. Delete Carrier
	const deleteCarrierSuperform = superForm(
		initialForm(() => data.deleteCarrierForm),
		{
			id: 'deleteCarrier',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Carrier deleted.';
				}
			}
		}
	);
	const { enhance: deleteCarrierEnhance } = deleteCarrierSuperform;

	// (templates superforms removed)

	// ── Formatting Helpers ──
	function formatMoney(value: number | null): string {
		if (value === null) return 'Never';
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	// ── Mappings & Derived Stats ──
	const methodNamesById = $derived(
		new Map(data.methods.items.map((method: ShippingMethod) => [method.id, method.name]))
	);

	const carriersById = $derived(
		new Map(
			data.carriers.map((c: ShippingCarrier) => [
				c.id,
				`${c.name} (${c.urlTemplate ? 'Auto' : 'Manual'})`
			])
		)
	);

	const methodStats = $derived({
		total: data.methods.total,
		active: data.methods.items.filter((m: ShippingMethod) => m.isActive).length,
		inactive: data.methods.items.filter((m: ShippingMethod) => !m.isActive).length
	});

	const zoneStats = $derived({
		total: data.zones.total,
		active: data.zones.total,
		inactive: 0
	});

	const carrierStats = $derived({
		total: data.carriers.length,
		active: data.carriers.filter((c: ShippingCarrier) => c.isActive).length,
		inactive: data.carriers.filter((c: ShippingCarrier) => !c.isActive).length
	});

	// ── Action Starters ──
	function startEditMethod(event: MouseEvent, method: ShippingMethod) {
		event.stopPropagation();
		$updateForm.shippingMethodId = method.id;
		$updateForm.name = method.name;
		$updateForm.description = method.description ?? '';
		$updateForm.price = method.price;
		$updateForm.freeShippingThreshold = method.freeShippingThreshold ?? null;
		$updateForm.estimatedDaysMin = method.estimatedDaysMin;
		$updateForm.estimatedDaysMax = method.estimatedDaysMax;
		$updateForm.sortOrder = method.sortOrder;
		$updateForm.carrierId = method.carrierId ?? '';
		$updateForm.isActive = method.isActive;
		editMethodOpen = true;
	}

	function startEditZone(event: MouseEvent, zone: ShippingZone) {
		event.stopPropagation();
		$setZoneFormState.shippingMethodId = zone.shippingMethodId;
		$setZoneFormState.district = zone.district;
		$setZoneFormState.priceOverride = zone.priceOverride;
		$setZoneFormState.estimatedDaysMin = zone.estimatedDaysMin;
		$setZoneFormState.estimatedDaysMax = zone.estimatedDaysMax;
		$setZoneFormState.isAvailable = zone.isAvailable;
		$setZoneFormState.carrierIdOverride = zone.carrierIdOverride ?? '';
		setZoneOpen = true;
	}

	function startEditCarrier(event: MouseEvent, carrierRow: ShippingCarrier) {
		event.stopPropagation();
		$updateCarrierFormState.carrierId = carrierRow.id;
		$updateCarrierFormState.name = carrierRow.name;
		$updateCarrierFormState.code = carrierRow.code;
		$updateCarrierFormState.urlTemplate = carrierRow.urlTemplate ?? '';
		$updateCarrierFormState.notes = carrierRow.notes ?? '';
		$updateCarrierFormState.isActive = carrierRow.isActive;
		editCarrierOpen = true;
	}

	// ── Filters & Form Interception ──
	function clearMethodFilters() {
		goto(resolve('?tab=methods' as '/'), { invalidateAll: true });
	}

	function clearZoneFilters() {
		goto(resolve('?tab=zones' as '/'), { invalidateAll: true });
	}

	function handleFormSubmit(event: SubmitEvent) {
		const form = event.target as HTMLFormElement;
		if (form.method.toLowerCase() === 'get') {
			event.preventDefault();
			const formData = new FormData(form);
			const url = new URL(form.action || window.location.href);

			url.searchParams.forEach((_, key) => {
				url.searchParams.delete(key);
			});

			url.searchParams.set('tab', activeTab);
			url.searchParams.set('offset', '0');

			for (const [key, value] of formData.entries()) {
				if (value) {
					url.searchParams.set(key, String(value));
				}
			}

			goto(resolve(`${url.pathname}${url.search}` as '/'), {
				keepFocus: true,
				noScroll: true,
				invalidateAll: true
			});
		}
	}

	// Table headers setup
	const methodHeaders = [
		{ label: 'Method' },
		{ label: 'Base Price' },
		{ label: 'Free Over' },
		{ label: 'ETA' },
		{ label: 'Carrier Template' },
		{ label: 'Zones' },
		{ label: 'Updated' },
		{ label: 'Status', class: 'text-right' },
		{ label: 'Actions', class: 'text-right' }
	];

	const zoneHeaders = [
		{ label: 'District' },
		{ label: 'Shipping Method' },
		{ label: 'Price Override' },
		{ label: 'ETA' },
		{ label: 'Availability' },
		{ label: 'Tracking Override' },
		{ label: 'Actions', class: 'text-right' }
	];

	const carrierHeaders = [
		{ label: 'Carrier' },
		{ label: 'Carrier Code' },
		{ label: 'Notes' },
		{ label: 'Status', class: 'text-right' },
		{ label: 'Actions', class: 'text-right' }
	];
</script>

<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />

<div onsubmit={handleFormSubmit}>
	{#if activeTab === 'methods'}
		<AdminListLayout
			title="Shipping Methods"
			kicker="Operations"
			actionMessage={null}
			stats={methodStats}
			totalItems={data.methods.total}
			limit={data.methods.limit}
			offset={data.methods.offset}
			tableHeaders={methodHeaders}
			items={data.methods.items}
			query={data.filters.query}
			searchPlaceholder="Search shipping methods..."
			hasActiveFilters={!!data.filters.status || !!data.filters.query}
			onclearfilters={clearMethodFilters}
		>
			{#snippet headerActions()}
				<div class="mt-5 flex items-center gap-2 md:mt-0">
					<!-- Tab Buttons -->
					<div class="mr-2 flex border border-charcoal bg-void p-1">
						<button
							type="button"
							onclick={() => setTab('methods')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'methods'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Methods
						</button>
						<button
							type="button"
							onclick={() => setTab('zones')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'zones'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Zones
						</button>
						<button
							type="button"
							onclick={() => setTab('carriers')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'carriers'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Carriers
						</button>
					</div>

					<AdminButton
						type="button"
						variant="volt"
						size="md"
						onclick={(e) => {
							e.stopPropagation();
							addMethodOpen = true;
						}}
					>
						<Plus size={14} aria-hidden="true" />
						Add Method
					</AdminButton>
				</div>
			{/snippet}

			{#snippet advancedFilters()}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<AdminSelect
						label="Status"
						name="status"
						value={data.filters.status}
						onchange={(e) => {
							const form = (e.currentTarget as HTMLElement).closest('form');
							if (form) form.requestSubmit();
						}}
					>
						<option value="">All statuses</option>
						<option value="active">Active only</option>
						<option value="inactive">Inactive only</option>
					</AdminSelect>
				</div>
			{/snippet}

			{#snippet row(method)}
				<tr
					class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10"
				>
					<td class="px-5 py-4">
						<div class="flex flex-col gap-1">
							<span class="font-mono text-xs font-semibold text-bone uppercase">{method.name}</span>
							{#if method.description}
								<span
									class="max-w-[240px] truncate font-sans text-xs text-ash/80"
									title={method.description}
								>
									{method.description}
								</span>
							{/if}
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{formatMoney(method.price)}
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{formatMoney(method.freeShippingThreshold)}
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
						{method.etaText}
					</td>
					<td class="px-5 py-4">
						<span class="font-mono text-xs text-bone">
							{carriersById.get(method.carrierId) ?? 'None'}
						</span>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<span class="flex items-center gap-1.5">
							<MapIcon size={12} class="text-volt" />
							{method.zones?.length ?? 0} zone overrides
						</span>
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash">
						{formatDate(method.updatedAt)}
					</td>
					<td class="px-5 py-4">
						<form
							method="POST"
							action="?/updateMethod"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										toastMessage = 'Status updated.';
									}
								};
							}}
							class="flex justify-end"
						>
							<input type="hidden" name="shippingMethodId" value={method.id} />
							<input type="hidden" name="isActive" value={method.isActive ? 'false' : 'true'} />
							<button
								type="submit"
								class="font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors {method.isActive
									? 'text-volt hover:text-red-400'
									: 'text-ash/60 hover:text-volt'}"
							>
								{method.isActive ? 'Active' : 'Inactive'}
							</button>
						</form>
					</td>
					<td class="px-5 py-4">
						<div class="flex items-center justify-end gap-2">
							<AdminButton variant="charcoal" size="sm" onclick={(e) => startEditMethod(e, method)}>
								<Pencil size={11} aria-hidden="true" />
								Edit
							</AdminButton>
						</div>
					</td>
				</tr>
			{/snippet}

			{#snippet card(method)}
				<AdminCard class="relative">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h3 class="mt-1 font-display text-2xl leading-none text-bone uppercase">
								{method.name}
							</h3>
						</div>
						<span class="font-mono text-xs text-volt uppercase">{method.etaText}</span>
					</div>

					<div
						class="mt-4 grid grid-cols-2 gap-3 border-t border-ash/10 pt-3 font-mono text-[10px] text-ash"
					>
						<div>
							<p class="text-[9px] uppercase">Base Price</p>
							<p class="mt-0.5 text-bone">{formatMoney(method.price)}</p>
						</div>
						<div>
							<p class="text-[9px] uppercase">Free Over</p>
							<p class="mt-0.5 text-bone">{formatMoney(method.freeShippingThreshold)}</p>
						</div>
					</div>

					<div class="mt-4 flex items-center justify-between border-t border-ash/10 pt-3">
						<div class="font-mono text-[10px] text-ash">
							Zones: <span class="text-bone">{method.zones?.length ?? 0}</span>
						</div>
						<div class="flex items-center gap-3">
							<form
								method="POST"
								action="?/updateMethod"
								use:enhance={() => {
									return async ({ result }) => {
										if (result.type === 'success') {
											toastMessage = 'Status updated.';
										}
									};
								}}
							>
								<input type="hidden" name="shippingMethodId" value={method.id} />
								<input type="hidden" name="isActive" value={method.isActive ? 'false' : 'true'} />
								<button
									type="submit"
									class="font-mono text-[9px] tracking-wider uppercase {method.isActive
										? 'text-volt'
										: 'text-ash/60'}"
								>
									{method.isActive ? 'Active' : 'Inactive'}
								</button>
							</form>

							<AdminButton variant="charcoal" size="sm" onclick={(e) => startEditMethod(e, method)}>
								Edit
							</AdminButton>
						</div>
					</div>
				</AdminCard>
			{/snippet}

			{#snippet emptyState()}
				<p class="font-display text-4xl text-bone uppercase">No shipping methods found</p>
				<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
					Add a shipping method to support order checkout queries.
				</p>
			{/snippet}
		</AdminListLayout>
	{:else if activeTab === 'zones'}
		<!-- ZONES OVERRIDES TAB -->
		<AdminListLayout
			title="District Overrides"
			kicker="Operations"
			actionMessage={null}
			stats={zoneStats}
			totalItems={data.zones.total}
			limit={data.zones.limit}
			offset={data.zones.offset}
			tableHeaders={zoneHeaders}
			items={data.zones.items}
			query=""
			searchPlaceholder=""
			hasActiveFilters={!!data.filters.shippingMethodId || !!data.filters.district}
			onclearfilters={clearZoneFilters}
		>
			{#snippet headerActions()}
				<div class="mt-5 flex items-center gap-2 md:mt-0">
					<!-- Tab Buttons -->
					<div class="mr-2 flex border border-charcoal bg-void p-1">
						<button
							type="button"
							onclick={() => setTab('methods')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'methods'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Methods
						</button>
						<button
							type="button"
							onclick={() => setTab('zones')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'zones'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Zones
						</button>
						<button
							type="button"
							onclick={() => setTab('carriers')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'carriers'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Carriers
						</button>
					</div>

					<AdminButton
						type="button"
						variant="volt"
						size="md"
						onclick={(e) => {
							e.stopPropagation();
							$setZoneFormState.shippingMethodId = '';
							$setZoneFormState.district = '' as ShippingDistrict;
							$setZoneFormState.priceOverride = 0;
							$setZoneFormState.estimatedDaysMin = 1;
							$setZoneFormState.estimatedDaysMax = 3;
							$setZoneFormState.isAvailable = true;
							$setZoneFormState.carrierIdOverride = '';
							setZoneOpen = true;
						}}
					>
						<Plus size={14} aria-hidden="true" />
						Set Zone Override
					</AdminButton>
				</div>
			{/snippet}

			{#snippet advancedFilters()}
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminSelect
						label="Shipping Method"
						name="shippingMethodId"
						value={data.filters.shippingMethodId}
						onchange={(e) => {
							const form = (e.currentTarget as HTMLElement).closest('form');
							if (form) form.requestSubmit();
						}}
					>
						<option value="">All Methods</option>
						{#each data.methods.items as method (method.id)}
							<option value={method.id}>{method.name}</option>
						{/each}
					</AdminSelect>

					<AdminSelect
						label="District"
						name="district"
						value={data.filters.district}
						onchange={(e) => {
							const form = (e.currentTarget as HTMLElement).closest('form');
							if (form) form.requestSubmit();
						}}
					>
						<option value="">All Districts</option>
						{#each data.districts as district (district.value)}
							<option value={district.value}>{district.label}</option>
						{/each}
					</AdminSelect>
				</div>
			{/snippet}

			{#snippet row(zone)}
				<tr
					class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10"
				>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<span class="flex items-center gap-2">
							<MapPin size={13} class="text-volt" />
							{zone.district}
						</span>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{methodNamesById.get(zone.shippingMethodId) ?? zone.shippingMethodId}
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{formatMoney(zone.priceOverride)}
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
						{zone.etaText}
					</td>
					<td class="px-5 py-4">
						<span
							class="font-mono text-xs font-semibold {zone.isAvailable
								? 'text-volt'
								: 'text-red-400'}"
						>
							{zone.isAvailable ? 'AVAILABLE' : 'BLOCKED'}
						</span>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{carriersById.get(zone.carrierIdOverride) ?? 'Default'}
					</td>
					<td class="px-5 py-4">
						<div class="flex items-center justify-end gap-3">
							<AdminButton variant="charcoal" size="sm" onclick={(e) => startEditZone(e, zone)}>
								Edit
							</AdminButton>

							<form
								method="POST"
								action="?/removeZone"
								use:removeZoneEnhance
								onsubmit={(e) => {
									if (
										!confirm(`Are you sure you want to remove the override for ${zone.district}?`)
									) {
										e.preventDefault();
									}
								}}
							>
								<input type="hidden" name="shippingMethodId" value={zone.shippingMethodId} />
								<input type="hidden" name="district" value={zone.district} />
								<AdminButton type="submit" variant="danger" size="sm">Remove</AdminButton>
							</form>
						</div>
					</td>
				</tr>
			{/snippet}

			{#snippet card(zone)}
				<AdminCard>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="font-mono text-[9px] tracking-wider text-ash/60 uppercase">
								District Override
							</p>
							<h3 class="mt-1 font-display text-2xl leading-none text-bone uppercase">
								{zone.district}
							</h3>
						</div>
						<span class="font-mono text-xs text-volt uppercase">{zone.etaText}</span>
					</div>

					<div class="mt-4 border-t border-ash/10 pt-3">
						<div class="flex justify-between font-mono text-[10px] text-ash">
							<span>Method:</span>
							<span class="text-bone"
								>{methodNamesById.get(zone.shippingMethodId) ?? zone.shippingMethodId}</span
							>
						</div>
						<div class="mt-1 flex justify-between font-mono text-[10px] text-ash">
							<span>Override Price:</span>
							<span class="text-bone">{formatMoney(zone.priceOverride)}</span>
						</div>
						<div class="mt-1 flex justify-between font-mono text-[10px] text-ash">
							<span>Availability:</span>
							<span class="{zone.isAvailable ? 'text-volt' : 'text-red-400'} font-semibold"
								>{zone.isAvailable ? 'Available' : 'Blocked'}</span
							>
						</div>
					</div>

					<div class="mt-4 flex items-center justify-end gap-2 border-t border-ash/10 pt-3">
						<AdminButton variant="charcoal" size="sm" onclick={(e) => startEditZone(e, zone)}>
							Edit
						</AdminButton>

						<form
							method="POST"
							action="?/removeZone"
							use:removeZoneEnhance
							onsubmit={(e) => {
								if (!confirm(`Are you sure you want to remove override for ${zone.district}?`)) {
									e.preventDefault();
								}
							}}
						>
							<input type="hidden" name="shippingMethodId" value={zone.shippingMethodId} />
							<input type="hidden" name="district" value={zone.district} />
							<AdminButton type="submit" variant="danger" size="sm">Remove</AdminButton>
						</form>
					</div>
				</AdminCard>
			{/snippet}

			{#snippet emptyState()}
				<p class="font-display text-4xl text-bone uppercase">No district overrides configured</p>
			{/snippet}
		</AdminListLayout>
	{/if}

	{#if activeTab === 'carriers'}
		<!-- CARRIERS TAB -->
		<AdminListLayout
			title="Carriers"
			kicker="Operations"
			actionMessage={null}
			stats={carrierStats}
			totalItems={data.carriers.length}
			limit={50}
			offset={0}
			tableHeaders={carrierHeaders}
			items={data.carriers}
			query=""
			searchPlaceholder=""
			hasActiveFilters={false}
			onclearfilters={() => {}}
		>
			{#snippet headerActions()}
				<div class="mt-5 flex items-center gap-2 md:mt-0">
					<!-- Tab Buttons -->
					<div class="mr-2 flex border border-charcoal bg-void p-1">
						<button
							type="button"
							onclick={() => setTab('methods')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'methods'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Methods
						</button>
						<button
							type="button"
							onclick={() => setTab('zones')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'zones'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Zones
						</button>
						<button
							type="button"
							onclick={() => setTab('carriers')}
							class="px-4 py-1.5 font-mono text-[9px] tracking-wider uppercase transition-colors {activeTab ===
							'carriers'
								? 'bg-charcoal text-volt'
								: 'text-ash hover:text-bone'}"
						>
							Carriers
						</button>
					</div>

					<AdminButton
						type="button"
						variant="volt"
						size="md"
						onclick={(e) => {
							e.stopPropagation();
							$createCarrierFormState.name = '';
							$createCarrierFormState.code = '';
							$createCarrierFormState.notes = '';
							$createCarrierFormState.isActive = true;
							addCarrierOpen = true;
						}}
					>
						<Plus size={14} aria-hidden="true" />
						Add Carrier
					</AdminButton>
				</div>
			{/snippet}

			{#snippet row(carrierRow)}
				<tr
					class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10"
				>
					<td class="px-5 py-4 font-mono text-xs font-semibold text-bone uppercase">
						{carrierRow.name}
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{carrierRow.code}
					</td>
					<td class="px-5 py-4 font-sans text-xs text-ash/85">
						{carrierRow.notes ?? '—'}
					</td>
					<td class="px-5 py-4">
						<form
							method="POST"
							action="?/updateCarrier"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										toastMessage = 'Status updated.';
									}
								};
							}}
							class="flex justify-end"
						>
							<input type="hidden" name="carrierId" value={carrierRow.id} />
							<input type="hidden" name="isActive" value={carrierRow.isActive ? 'false' : 'true'} />
							<button
								type="submit"
								class="font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors {carrierRow.isActive
									? 'text-volt hover:text-red-400'
									: 'text-ash/60 hover:text-volt'}"
							>
								{carrierRow.isActive ? 'Active' : 'Inactive'}
							</button>
						</form>
					</td>
					<td class="px-5 py-4">
						<div class="flex items-center justify-end gap-2">
							<AdminButton
								variant="charcoal"
								size="sm"
								onclick={(e) => startEditCarrier(e, carrierRow)}
							>
								<Pencil size={11} aria-hidden="true" />
								Edit
							</AdminButton>

							<form
								method="POST"
								action="?/deleteCarrier"
								use:deleteCarrierEnhance
								class="inline-block"
							>
								<input type="hidden" name="carrierId" value={carrierRow.id} />
								<AdminButton type="submit" variant="danger" size="sm">
									<Trash2 size={11} aria-hidden="true" />
									Delete
								</AdminButton>
							</form>
						</div>
					</td>
				</tr>
			{/snippet}

			{#snippet card(carrierRow)}
				<AdminCard>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="font-mono text-[9px] tracking-wider text-ash/60 uppercase">
								{carrierRow.code}
							</p>
							<h3 class="mt-1 font-display text-2xl leading-none text-bone uppercase">
								{carrierRow.name}
							</h3>
						</div>
					</div>

					<div class="mt-4 border-t border-ash/10 pt-3 font-mono text-[10px] text-ash">
						<p class="text-[9px] uppercase">Notes</p>
						<p class="mt-0.5 text-bone">{carrierRow.notes ?? '—'}</p>
					</div>

					<div class="mt-4 flex items-center justify-end gap-2 border-t border-ash/10 pt-3">
						<form
							method="POST"
							action="?/updateCarrier"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										toastMessage = 'Status updated.';
									}
								};
							}}
						>
							<input type="hidden" name="carrierId" value={carrierRow.id} />
							<input type="hidden" name="isActive" value={carrierRow.isActive ? 'false' : 'true'} />
							<button
								type="submit"
								class="font-mono text-[9px] tracking-wider uppercase {carrierRow.isActive
									? 'text-volt'
									: 'text-ash/60'}"
							>
								{carrierRow.isActive ? 'Active' : 'Inactive'}
							</button>
						</form>

						<AdminButton
							variant="charcoal"
							size="sm"
							onclick={(e) => startEditCarrier(e, carrierRow)}
						>
							Edit
						</AdminButton>
					</div>
				</AdminCard>
			{/snippet}

			{#snippet emptyState()}
				<p class="font-display text-4xl text-bone uppercase">No carriers configured</p>
			{/snippet}
		</AdminListLayout>
	{/if}
</div>

<!-- 1. ADD METHOD DRAWER -->
<AdminDrawer
	bind:open={addMethodOpen}
	title="Add Shipping Method"
	description="Configure pricing and transit metrics for a new shipping service."
>
	<form
		id="addMethodForm"
		method="POST"
		action="?/createMethod"
		use:createEnhance
		class="flex flex-col gap-5"
	>
		<AdminInput
			label="Method Name"
			name="name"
			required
			placeholder="e.g. Standard Delivery"
			bind:value={$createForm.name}
			error={$createErrors.name}
		/>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Description</span>
			<textarea
				name="description"
				bind:value={$createForm.description}
				placeholder="Displayed to customers at checkout..."
				class="min-h-[80px] w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			></textarea>
			{#if $createErrors.description}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$createErrors.description[0]}
				</span>
			{/if}
		</label>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Base Price (LKR)"
				name="price"
				type="number"
				min="0"
				required
				bind:value={$createForm.price}
				error={$createErrors.price}
			/>

			<AdminInput
				label="Free Over Threshold (LKR)"
				name="freeShippingThreshold"
				type="number"
				min="0"
				placeholder="Never free if empty"
				bind:value={$createForm.freeShippingThreshold}
				error={$createErrors.freeShippingThreshold}
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Min Days"
				name="estimatedDaysMin"
				type="number"
				min="0"
				required
				bind:value={$createForm.estimatedDaysMin}
				error={$createErrors.estimatedDaysMin}
			/>

			<AdminInput
				label="Max Days"
				name="estimatedDaysMax"
				type="number"
				min="0"
				required
				bind:value={$createForm.estimatedDaysMax}
				error={$createErrors.estimatedDaysMax}
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Sort Order"
				name="sortOrder"
				type="number"
				min="0"
				bind:value={$createForm.sortOrder}
				error={$createErrors.sortOrder}
			/>

			<AdminSelect
				label="Shipping Carrier"
				name="carrierId"
				bind:value={$createForm.carrierId}
				error={$createErrors.carrierId}
			>
				<option value="">No tracking integration</option>
				{#each data.carriers as carrier (carrier.id)}
					<option value={carrier.id}>{carrier.name}</option>
				{/each}
			</AdminSelect>
		</div>

		<AdminToggle
			label="Method Is Active"
			description="Make this method selectable by customers on checkout."
			name="isActive"
			bind:checked={$createForm.isActive}
		/>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="addMethodForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$createSubmitting}
		>
			{#if $createSubmitting}Saving...{:else}Save Method{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (addMethodOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- 2. EDIT METHOD DRAWER -->
<AdminDrawer
	bind:open={editMethodOpen}
	title="Edit Method"
	description="Modify parameters for this shipping method configurations."
>
	<form
		id="editMethodForm"
		method="POST"
		action="?/updateMethod"
		use:updateEnhance
		class="flex flex-col gap-5"
	>
		<input type="hidden" name="shippingMethodId" value={$updateForm.shippingMethodId} />

		<AdminInput
			label="Method Name"
			name="name"
			required
			bind:value={$updateForm.name}
			error={$updateErrors.name}
		/>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Description</span>
			<textarea
				name="description"
				bind:value={$updateForm.description}
				placeholder="Displayed to customers at checkout..."
				class="min-h-[80px] w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			></textarea>
			{#if $updateErrors.description}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$updateErrors.description[0]}
				</span>
			{/if}
		</label>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Base Price (LKR)"
				name="price"
				type="number"
				min="0"
				required
				bind:value={$updateForm.price}
				error={$updateErrors.price}
			/>

			<AdminInput
				label="Free Over Threshold (LKR)"
				name="freeShippingThreshold"
				type="number"
				min="0"
				placeholder="Never free if empty"
				bind:value={$updateForm.freeShippingThreshold}
				error={$updateErrors.freeShippingThreshold}
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Min Days"
				name="estimatedDaysMin"
				type="number"
				min="0"
				required
				bind:value={$updateForm.estimatedDaysMin}
				error={$updateErrors.estimatedDaysMin}
			/>

			<AdminInput
				label="Max Days"
				name="estimatedDaysMax"
				type="number"
				min="0"
				required
				bind:value={$updateForm.estimatedDaysMax}
				error={$updateErrors.estimatedDaysMax}
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Sort Order"
				name="sortOrder"
				type="number"
				min="0"
				bind:value={$updateForm.sortOrder}
				error={$updateErrors.sortOrder}
			/>

			<AdminSelect
				label="Shipping Carrier"
				name="carrierId"
				bind:value={$updateForm.carrierId}
				error={$updateErrors.carrierId}
			>
				<option value="">No tracking integration</option>
				{#each data.carriers as carrier (carrier.id)}
					<option value={carrier.id}>{carrier.name}</option>
				{/each}
			</AdminSelect>
		</div>

		<AdminToggle
			label="Method Is Active"
			description="Make this method selectable by customers on checkout."
			name="isActive"
			bind:checked={$updateForm.isActive}
		/>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="editMethodForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$updateSubmitting}
		>
			{#if $updateSubmitting}Saving...{:else}Update Method{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (editMethodOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- 3. SET ZONE OVERRIDE DRAWER -->
<AdminDrawer
	bind:open={setZoneOpen}
	title="Zone Override"
	description="Add or edit shipping rate and delivery estimate overrides for specific districts."
>
	<form
		id="setZoneForm"
		method="POST"
		action="?/setZone"
		use:setZoneEnhance
		class="flex flex-col gap-5"
	>
		<AdminSelect
			label="Shipping Method"
			name="shippingMethodId"
			required
			disabled={!!$setZoneFormState.shippingMethodId}
			bind:value={$setZoneFormState.shippingMethodId}
			error={$setZoneErrors.shippingMethodId}
		>
			<option value="">Select shipping method</option>
			{#each data.methods.items as method (method.id)}
				<option value={method.id}
					>{method.name}{method.carrier ? ` (${method.carrier})` : ''}</option
				>
			{/each}
		</AdminSelect>
		{#if $setZoneFormState.shippingMethodId}
			<input type="hidden" name="shippingMethodId" value={$setZoneFormState.shippingMethodId} />
		{/if}

		<AdminSelect
			label="Sri Lanka District"
			name="district"
			required
			disabled={!!$setZoneFormState.district}
			bind:value={$setZoneFormState.district}
			error={$setZoneErrors.district}
		>
			<option value="">Select district</option>
			{#each data.districts as dist (dist.value)}
				<option value={dist.value}>{dist.label}</option>
			{/each}
		</AdminSelect>
		{#if $setZoneFormState.district}
			<input type="hidden" name="district" value={$setZoneFormState.district} />
		{/if}

		<AdminInput
			label="Price Override (LKR)"
			name="priceOverride"
			type="number"
			min="0"
			required
			bind:value={$setZoneFormState.priceOverride}
			error={$setZoneErrors.priceOverride}
		/>

		<div class="grid grid-cols-2 gap-4">
			<AdminInput
				label="Override Min Days"
				name="estimatedDaysMin"
				type="number"
				min="0"
				required
				bind:value={$setZoneFormState.estimatedDaysMin}
				error={$setZoneErrors.estimatedDaysMin}
			/>

			<AdminInput
				label="Override Max Days"
				name="estimatedDaysMax"
				type="number"
				min="0"
				required
				bind:value={$setZoneFormState.estimatedDaysMax}
				error={$setZoneErrors.estimatedDaysMax}
			/>
		</div>

		<AdminSelect
			label="Carrier Override"
			name="carrierIdOverride"
			bind:value={$setZoneFormState.carrierIdOverride}
			error={$setZoneErrors.carrierIdOverride}
		>
			<option value="">Use Method Default</option>
			{#each data.carriers as carrier (carrier.id)}
				<option value={carrier.id}>{carrier.name}</option>
			{/each}
		</AdminSelect>

		<AdminToggle
			label="District Availability"
			description="Uncheck to block this shipping method for this district."
			name="isAvailable"
			bind:checked={$setZoneFormState.isAvailable}
		/>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="setZoneForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$setZoneSubmitting}
		>
			{#if $setZoneSubmitting}Saving Override...{:else}Save Override{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (setZoneOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- 4. ADD CARRIER DRAWER -->
<AdminDrawer
	bind:open={addCarrierOpen}
	title="Add Carrier"
	description="Define a new shipping courier or delivery service."
>
	<form
		id="addCarrierForm"
		method="POST"
		action="?/createCarrier"
		use:createCarrierEnhance
		class="flex flex-col gap-5"
	>
		<AdminInput
			label="Carrier Name"
			name="name"
			required
			placeholder="e.g. PickMe Flash"
			bind:value={$createCarrierFormState.name}
			error={$createCarrierErrors.name}
		/>

		<AdminInput
			label="Carrier Code"
			name="code"
			required
			placeholder="e.g. PICKME"
			bind:value={$createCarrierFormState.code}
			error={$createCarrierErrors.code}
		/>

		<AdminInput
			label="Tracking URL"
			name="urlTemplate"
			placeholder="e.g. https://domex.lk/track?waybill={'{trackingNumber}'}"
			bind:value={$createCarrierFormState.urlTemplate}
			error={$createCarrierErrors.urlTemplate}
			helpText="Enter the carrier tracking page URL. Use {'{trackingNumber}'} where the package tracking number should be inserted."
		/>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Notes / Contact Info</span
			>
			<textarea
				name="notes"
				bind:value={$createCarrierFormState.notes}
				placeholder="Internal operational notes or support contact details..."
				class="min-h-[80px] w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			></textarea>
			{#if $createCarrierErrors.notes}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$createCarrierErrors.notes[0]}
				</span>
			{/if}
		</label>

		<AdminToggle
			label="Carrier Is Active"
			description="Determine if this carrier can be assigned to active templates."
			name="isActive"
			bind:checked={$createCarrierFormState.isActive}
		/>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="addCarrierForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$createCarrierSubmitting}
		>
			{#if $createCarrierSubmitting}Saving...{:else}Save Carrier{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (addCarrierOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- 5. EDIT CARRIER DRAWER -->
<AdminDrawer
	bind:open={editCarrierOpen}
	title="Edit Carrier"
	description="Modify carrier parameters."
>
	<form
		id="editCarrierForm"
		method="POST"
		action="?/updateCarrier"
		use:updateCarrierEnhance
		class="flex flex-col gap-5"
	>
		<input type="hidden" name="carrierId" value={$updateCarrierFormState.carrierId} />

		<AdminInput
			label="Carrier Name"
			name="name"
			required
			bind:value={$updateCarrierFormState.name}
			error={$updateCarrierErrors.name}
		/>

		<AdminInput
			label="Carrier Code"
			name="code"
			required
			bind:value={$updateCarrierFormState.code}
			error={$updateCarrierErrors.code}
		/>

		<AdminInput
			label="Tracking URL"
			name="urlTemplate"
			placeholder="e.g. https://domex.lk/track?waybill={'{trackingNumber}'}"
			bind:value={$updateCarrierFormState.urlTemplate}
			error={$updateCarrierErrors.urlTemplate}
			helpText="Enter the carrier tracking page URL. Use {'{trackingNumber}'} where the package tracking number should be inserted."
		/>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Notes / Contact Info</span
			>
			<textarea
				name="notes"
				bind:value={$updateCarrierFormState.notes}
				placeholder="..."
				class="min-h-[80px] w-full border border-ash/30 bg-void px-3.5 py-3 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			></textarea>
			{#if $updateCarrierErrors.notes}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$updateCarrierErrors.notes[0]}
				</span>
			{/if}
		</label>

		<AdminToggle
			label="Carrier Is Active"
			description="Determine if this carrier can be assigned to active templates."
			name="isActive"
			bind:checked={$updateCarrierFormState.isActive}
		/>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="editCarrierForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$updateCarrierSubmitting}
		>
			{#if $updateCarrierSubmitting}Saving...{:else}Update Carrier{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (editCarrierOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>
