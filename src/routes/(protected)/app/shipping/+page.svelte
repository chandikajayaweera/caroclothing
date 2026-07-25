<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Plus, Pencil, Trash2, MapPin, Map as MapIcon } from 'lucide-svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminTabs from '$lib/components/admin/controls/AdminTabs.svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminDrawer from '$lib/components/admin/overlays/AdminDrawer.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminConfirmDialog from '$lib/components/admin/overlays/AdminConfirmDialog.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import { formatAdminDateTime, formatAdminMoney } from '$lib/shared/admin/format';
	import { booleanStatusVariant } from '$lib/shared/admin/status';

	let { data }: { data: PageData } = $props();
	type ShippingMethod = PageData['methods']['items'][number];
	type ShippingZone = PageData['zones']['items'][number];
	type ShippingCarrier = PageData['carriers'][number];
	type ShippingDistrict = PageData['setZoneForm']['data']['district'];

	// ── Tab Management ──
	type ShippingTab = 'methods' | 'zones' | 'carriers';

	function isShippingTab(value: string | null): value is ShippingTab {
		return value === 'methods' || value === 'zones' || value === 'carriers';
	}

	const activeTab = $derived.by<ShippingTab>(() => {
		const tab = page.url.searchParams.get('tab');
		return isShippingTab(tab) ? tab : 'methods';
	});

	function setTab(tab: ShippingTab) {
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
	let editingZoneKey = $state(false);
	let addCarrierOpen = $state(false);
	let editCarrierOpen = $state(false);
	let removeZoneConfirmOpen = $state(false);
	let deleteCarrierConfirmOpen = $state(false);
	let pendingZoneRemoval = $state<{ shippingMethodId: string; district: string } | null>(null);
	let pendingCarrierDelete = $state<ShippingCarrier | null>(null);
	let removeZoneFormElement = $state<HTMLFormElement | null>(null);
	let deleteCarrierFormElement = $state<HTMLFormElement | null>(null);

	// ── Form/Toast Messages ──
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');
	let statusUpdatingId = $state<string | null>(null);

	const enhanceStatusToggle: SubmitFunction = ({ formData }) => {
		statusUpdatingId = String(formData.get('shippingMethodId') ?? formData.get('carrierId') ?? '');
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				toastType = 'success';
				toastMessage = 'Status updated.';
			} else if (result.type === 'failure') {
				const resultData = result.data as { message?: string } | undefined;
				toastType = 'error';
				toastMessage = resultData?.message ?? 'Status update failed.';
			} else {
				toastType = 'error';
				toastMessage = 'Status update failed.';
			}
			statusUpdatingId = null;
		};
	};

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
					toastType = 'success';
					addMethodOpen = false;
					toastMessage = form.message ?? 'Shipping method created.';
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Shipping method could not be created.';
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
					toastType = 'success';
					editMethodOpen = false;
					toastMessage = form.message ?? 'Shipping method updated.';
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Shipping method could not be updated.';
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
					toastType = 'success';
					setZoneOpen = false;
					editingZoneKey = false;
					toastMessage = form.message ?? 'Shipping zone override saved.';
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Shipping zone override could not be saved.';
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
					toastType = 'success';
					toastMessage = form.message ?? 'Shipping zone override removed.';
					pendingZoneRemoval = null;
					removeZoneConfirmOpen = false;
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Shipping zone override could not be removed.';
				}
			}
		}
	);
	const { enhance: removeZoneEnhance, submitting: removeZoneSubmitting } = removeZoneSuperform;

	// 5. Create Carrier
	const createCarrierSuperform = superForm(
		initialForm(() => data.createCarrierForm),
		{
			id: 'createCarrier',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastType = 'success';
					addCarrierOpen = false;
					toastMessage = form.message ?? 'Carrier created.';
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Carrier could not be created.';
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
					toastType = 'success';
					editCarrierOpen = false;
					toastMessage = form.message ?? 'Carrier updated.';
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Carrier could not be updated.';
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
					toastType = 'success';
					toastMessage = form.message ?? 'Carrier deleted.';
					pendingCarrierDelete = null;
					deleteCarrierConfirmOpen = false;
				} else {
					toastType = 'error';
					toastMessage = form.message ?? 'Carrier could not be deleted.';
				}
			}
		}
	);
	const { enhance: deleteCarrierEnhance, submitting: deleteCarrierSubmitting } =
		deleteCarrierSuperform;

	// (templates superforms removed)

	// ── Formatting Helpers ──
	// ── Mappings & Derived Stats ──
	const methodNamesById = $derived(
		new Map(data.methodOptions.map((method: ShippingMethod) => [method.id, method.name]))
	);

	const carriersById = $derived(
		new Map(
			data.carriers.map((c: ShippingCarrier) => [
				c.id,
				`${c.name} (${c.urlTemplate ? 'Auto' : 'Manual'})`
			])
		)
	);

	const methodMetrics = $derived([
		{ label: 'Filtered Methods', value: data.methods.total },
		{
			label: 'Active on Page',
			value: data.methods.items.filter((method: ShippingMethod) => method.isActive).length,
			tone: 'success' as const
		},
		{
			label: 'Inactive on Page',
			value: data.methods.items.filter((method: ShippingMethod) => !method.isActive).length
		}
	]);

	const zoneMetrics = $derived([
		{ label: 'Filtered Overrides', value: data.zones.total },
		{
			label: 'Available on Page',
			value: data.zones.items.filter((zone: ShippingZone) => zone.isAvailable).length,
			tone: 'success' as const
		},
		{
			label: 'Unavailable on Page',
			value: data.zones.items.filter((zone: ShippingZone) => !zone.isAvailable).length,
			tone: 'warning' as const
		}
	]);

	const carrierMetrics = $derived([
		{ label: 'Carriers', value: data.carriers.length },
		{
			label: 'Active',
			value: data.carriers.filter((carrier: ShippingCarrier) => carrier.isActive).length,
			tone: 'success' as const
		},
		{
			label: 'Inactive',
			value: data.carriers.filter((carrier: ShippingCarrier) => !carrier.isActive).length
		}
	]);

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

	function openAddMethod(): void {
		addMethodOpen = true;
	}

	function openSetZone(): void {
		$setZoneFormState.shippingMethodId = '';
		$setZoneFormState.district = '' as ShippingDistrict;
		$setZoneFormState.priceOverride = 0;
		$setZoneFormState.estimatedDaysMin = 1;
		$setZoneFormState.estimatedDaysMax = 3;
		$setZoneFormState.isAvailable = true;
		$setZoneFormState.carrierIdOverride = '';
		editingZoneKey = false;
		setZoneOpen = true;
	}

	function openAddCarrier(): void {
		$createCarrierFormState.name = '';
		$createCarrierFormState.code = '';
		$createCarrierFormState.notes = '';
		$createCarrierFormState.isActive = true;
		addCarrierOpen = true;
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
		editingZoneKey = true;
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

	function requestZoneRemoval(zone: ShippingZone) {
		pendingZoneRemoval = {
			shippingMethodId: zone.shippingMethodId,
			district: zone.district
		};
		removeZoneConfirmOpen = true;
	}

	function requestCarrierDelete(carrier: ShippingCarrier) {
		pendingCarrierDelete = carrier;
		deleteCarrierConfirmOpen = true;
	}

	function confirmZoneRemoval() {
		removeZoneFormElement?.requestSubmit();
	}

	function confirmCarrierDelete() {
		deleteCarrierFormElement?.requestSubmit();
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

<AdminToast message={toastMessage} type={toastType} onclose={() => (toastMessage = null)} />

{#snippet tabControls()}
	<AdminTabs
		label="Shipping views"
		value={activeTab}
		items={[
			{ value: 'methods', label: 'Methods', count: data.methods.total },
			{ value: 'zones', label: 'Zones', count: data.zones.total },
			{ value: 'carriers', label: 'Carriers', count: data.carriers.length }
		]}
		onchange={(tab) => setTab(tab as ShippingTab)}
		class="w-full md:w-auto"
	/>
{/snippet}

{#snippet shippingHeaderActions()}
	<AdminActionToolbar ariaLabel="Shipping page actions">
		{#snippet views()}
			{@render tabControls()}
		{/snippet}
		{#snippet primary()}
			{#if activeTab === 'methods'}
				<AdminButton type="button" variant="volt" onclick={openAddMethod}>
					<Plus size={14} aria-hidden="true" />
					Add method
				</AdminButton>
			{:else if activeTab === 'zones'}
				<AdminButton type="button" variant="volt" onclick={openSetZone}>
					<Plus size={14} aria-hidden="true" />
					Set override
				</AdminButton>
			{:else}
				<AdminButton type="button" variant="volt" onclick={openAddCarrier}>
					<Plus size={14} aria-hidden="true" />
					Add carrier
				</AdminButton>
			{/if}
		{/snippet}
	</AdminActionToolbar>
{/snippet}

<div onsubmit={handleFormSubmit}>
	{#if activeTab === 'methods'}
		<AdminListLayout
			title="Shipping Methods"
			kicker="Operations"
			actionMessage={null}
			metrics={methodMetrics}
			totalItems={data.methods.total}
			limit={data.methods.limit}
			offset={data.methods.offset}
			tableHeaders={methodHeaders}
			items={data.methods.items}
			preserveParams={['tab']}
			query={data.filters.query}
			searchPlaceholder="Search shipping methods..."
			hasActiveFilters={!!data.filters.status || !!data.filters.query}
			onclearfilters={clearMethodFilters}
		>
			{#snippet headerActions()}
				{@render shippingHeaderActions()}
			{/snippet}

			{#snippet advancedFilters()}
				<AdminFilterBar cols={2}>
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
				</AdminFilterBar>
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
									class="max-w-60 truncate font-sans text-xs text-ash/80"
									title={method.description}
								>
									{method.description}
								</span>
							{/if}
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{formatAdminMoney(method.price)}
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{formatAdminMoney(method.freeShippingThreshold, 0, 'Never')}
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
						{method.etaText}
					</td>
					<td class="px-5 py-4">
						<span class="font-mono text-xs text-bone">
							{carriersById.get(method.carrierId || '') ?? 'None'}
						</span>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<span class="flex items-center gap-1.5">
							<MapIcon size={12} class="text-volt" />
							{method.zones?.length ?? 0} zone overrides
						</span>
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash">
						{formatAdminDateTime(method.updatedAt, '—')}
					</td>
					<td class="px-5 py-4">
						<form
							method="POST"
							action="?/updateMethod"
							use:enhance={enhanceStatusToggle}
							class="flex justify-end"
						>
							<input type="hidden" name="shippingMethodId" value={method.id} />
							<input type="hidden" name="isActive" value={method.isActive ? 'false' : 'true'} />
							<AdminButton
								type="submit"
								variant="outline"
								size="sm"
								disabled={statusUpdatingId === method.id}
							>
								{statusUpdatingId === method.id
									? 'Updating...'
									: method.isActive
										? 'Deactivate'
										: 'Activate'}
							</AdminButton>
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
				<AdminEntityCard>
					{#snippet header()}
						<div class="flex items-start justify-between gap-4">
							<div>
								<h3 class="mt-1 font-display text-2xl leading-none text-bone uppercase">
									{method.name}
								</h3>
							</div>
							<span class="font-mono text-xs text-volt uppercase">{method.etaText}</span>
						</div>
					{/snippet}

					{#snippet metadata()}
						<AdminMetaGrid>
							<div>
								<p class="text-ash/60">Base Price</p>
								<p class="mt-0.5 text-bone">{formatAdminMoney(method.price)}</p>
							</div>
							<div>
								<p class="text-ash/60">Free Over</p>
								<p class="mt-0.5 text-bone">
									{formatAdminMoney(method.freeShippingThreshold, 0, 'Never')}
								</p>
							</div>
							<div class="min-[430px]:col-span-2">
								<p class="text-ash/60">Zone Overrides</p>
								<p class="mt-0.5 text-bone">{method.zones?.length ?? 0}</p>
							</div>
						</AdminMetaGrid>
					{/snippet}

					{#snippet actions()}
						<AdminRowActions cols={2} ariaLabel={`Actions for ${method.name}`}>
							<form method="POST" action="?/updateMethod" use:enhance={enhanceStatusToggle}>
								<input type="hidden" name="shippingMethodId" value={method.id} />
								<input type="hidden" name="isActive" value={method.isActive ? 'false' : 'true'} />
								<AdminButton
									type="submit"
									variant="outline"
									size="sm"
									disabled={statusUpdatingId === method.id}
								>
									{statusUpdatingId === method.id
										? 'Updating...'
										: method.isActive
											? 'Deactivate'
											: 'Activate'}
								</AdminButton>
							</form>

							<AdminButton variant="outline" size="sm" onclick={(e) => startEditMethod(e, method)}>
								Edit
							</AdminButton>
						</AdminRowActions>
					{/snippet}
				</AdminEntityCard>
			{/snippet}

			{#snippet emptyState()}
				<AdminEmptyState
					title="No shipping methods found"
					description="Add a method to support checkout delivery options."
				/>
			{/snippet}
		</AdminListLayout>
	{:else if activeTab === 'zones'}
		<!-- ZONES OVERRIDES TAB -->
		<AdminListLayout
			title="District Overrides"
			kicker="Operations"
			actionMessage={null}
			metrics={zoneMetrics}
			totalItems={data.zones.total}
			limit={data.zones.limit}
			offset={data.zones.offset}
			paginationOffsetParam="zoneOffset"
			filterLimitParam="zoneLimit"
			filterOffsetParam="zoneOffset"
			tableHeaders={zoneHeaders}
			items={data.zones.items}
			preserveParams={['tab']}
			showSearch={false}
			hasActiveFilters={!!data.filters.shippingMethodId || !!data.filters.district}
			onclearfilters={clearZoneFilters}
		>
			{#snippet headerActions()}
				{@render shippingHeaderActions()}
			{/snippet}

			{#snippet advancedFilters()}
				<AdminFilterBar cols={2}>
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
						{#each data.methodOptions as method (method.id)}
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
				</AdminFilterBar>
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
						{formatAdminMoney(zone.priceOverride)}
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
						{zone.etaText}
					</td>
					<td class="px-5 py-4">
						<AdminBadge variant={booleanStatusVariant(zone.isAvailable)}>
							{zone.isAvailable ? 'AVAILABLE' : 'BLOCKED'}
						</AdminBadge>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{carriersById.get(zone.carrierIdOverride || '') ?? 'Default'}
					</td>
					<td class="px-5 py-4">
						<div class="flex items-center justify-end gap-3">
							<AdminButton variant="charcoal" size="sm" onclick={(e) => startEditZone(e, zone)}>
								Edit
							</AdminButton>

							<AdminButton
								type="button"
								variant="danger"
								size="sm"
								onclick={() => requestZoneRemoval(zone)}
							>
								Remove
							</AdminButton>
						</div>
					</td>
				</tr>
			{/snippet}

			{#snippet card(zone)}
				<AdminEntityCard>
					{#snippet header()}
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
					{/snippet}

					{#snippet metadata()}
						<AdminMetaGrid>
							<div>
								<p class="text-ash/60">Method</p>
								<p class="mt-0.5 text-bone">
									{methodNamesById.get(zone.shippingMethodId) ?? zone.shippingMethodId}
								</p>
							</div>
							<div>
								<p class="text-ash/60">Override Price</p>
								<p class="mt-0.5 text-bone">{formatAdminMoney(zone.priceOverride)}</p>
							</div>
							<div class="min-[430px]:col-span-2">
								<p class="text-ash/60">Availability</p>
								<AdminBadge variant={booleanStatusVariant(zone.isAvailable)} size="xs">
									{zone.isAvailable ? 'Available' : 'Blocked'}
								</AdminBadge>
							</div>
						</AdminMetaGrid>
					{/snippet}

					{#snippet actions()}
						<AdminRowActions cols={2} ariaLabel={`Actions for ${zone.district}`}>
							<AdminButton variant="outline" size="sm" onclick={(e) => startEditZone(e, zone)}>
								Edit
							</AdminButton>

							<AdminButton
								type="button"
								variant="danger"
								size="sm"
								onclick={() => requestZoneRemoval(zone)}
							>
								Remove
							</AdminButton>
						</AdminRowActions>
					{/snippet}
				</AdminEntityCard>
			{/snippet}

			{#snippet emptyState()}
				<AdminEmptyState
					title="No district overrides configured"
					description="Add an override for district-specific delivery rules."
				/>
			{/snippet}
		</AdminListLayout>
	{/if}

	{#if activeTab === 'carriers'}
		<!-- CARRIERS TAB -->
		<AdminListLayout
			title="Carriers"
			kicker="Operations"
			actionMessage={null}
			metrics={carrierMetrics}
			totalItems={data.carriers.length}
			limit={50}
			offset={0}
			tableHeaders={carrierHeaders}
			items={data.carriers}
			preserveParams={['tab']}
			showSearch={false}
			hasActiveFilters={false}
		>
			{#snippet headerActions()}
				{@render shippingHeaderActions()}
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
							use:enhance={enhanceStatusToggle}
							class="flex justify-end"
						>
							<input type="hidden" name="carrierId" value={carrierRow.id} />
							<input type="hidden" name="isActive" value={carrierRow.isActive ? 'false' : 'true'} />
							<AdminButton
								type="submit"
								variant="outline"
								size="sm"
								disabled={statusUpdatingId === carrierRow.id}
							>
								{statusUpdatingId === carrierRow.id
									? 'Updating...'
									: carrierRow.isActive
										? 'Deactivate'
										: 'Activate'}
							</AdminButton>
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

							<AdminButton
								type="button"
								variant="danger"
								size="sm"
								onclick={() => requestCarrierDelete(carrierRow)}
							>
								<Trash2 size={11} aria-hidden="true" />
								Delete
							</AdminButton>
						</div>
					</td>
				</tr>
			{/snippet}

			{#snippet card(carrierRow)}
				<AdminEntityCard>
					{#snippet header()}
						<div class="flex items-start justify-between gap-4">
							<div>
								<p class="font-mono text-[9px] tracking-wider text-ash/60 uppercase">
									{carrierRow.code}
								</p>
								<h3 class="mt-1 font-display text-2xl leading-none text-bone uppercase">
									{carrierRow.name}
								</h3>
							</div>
							<AdminBadge variant={booleanStatusVariant(carrierRow.isActive)}>
								{carrierRow.isActive ? 'Active' : 'Inactive'}
							</AdminBadge>
						</div>
					{/snippet}

					{#snippet metadata()}
						<AdminMetaGrid cols={1}>
							<div>
								<p class="text-ash/60">Notes</p>
								<p class="mt-0.5 text-bone">{carrierRow.notes ?? '—'}</p>
							</div>
						</AdminMetaGrid>
					{/snippet}

					{#snippet actions()}
						<AdminRowActions cols={3} ariaLabel={`Actions for ${carrierRow.name}`}>
							<form method="POST" action="?/updateCarrier" use:enhance={enhanceStatusToggle}>
								<input type="hidden" name="carrierId" value={carrierRow.id} />
								<input
									type="hidden"
									name="isActive"
									value={carrierRow.isActive ? 'false' : 'true'}
								/>
								<AdminButton
									type="submit"
									variant="outline"
									size="sm"
									disabled={statusUpdatingId === carrierRow.id}
								>
									{statusUpdatingId === carrierRow.id
										? 'Updating...'
										: carrierRow.isActive
											? 'Deactivate'
											: 'Activate'}
								</AdminButton>
							</form>

							<AdminButton
								variant="outline"
								size="sm"
								onclick={(e) => startEditCarrier(e, carrierRow)}
							>
								Edit
							</AdminButton>

							<AdminButton
								type="button"
								variant="danger"
								size="sm"
								onclick={() => requestCarrierDelete(carrierRow)}
							>
								Delete
							</AdminButton>
						</AdminRowActions>
					{/snippet}
				</AdminEntityCard>
			{/snippet}

			{#snippet emptyState()}
				<AdminEmptyState
					title="No carriers configured"
					description="Add a carrier for tracking and fulfilment operations."
				/>
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

		<AdminTextarea
			label="Description"
			name="description"
			bind:value={$createForm.description}
			placeholder="Displayed to customers at checkout..."
			rows={3}
			error={$createErrors.description}
		/>

		<div class="grid gap-4 sm:grid-cols-2">
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

		<div class="grid gap-4 sm:grid-cols-2">
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

		<div class="grid gap-4 sm:grid-cols-2">
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

{#if pendingZoneRemoval}
	<form bind:this={removeZoneFormElement} method="POST" action="?/removeZone" use:removeZoneEnhance>
		<input type="hidden" name="shippingMethodId" value={pendingZoneRemoval.shippingMethodId} />
		<input type="hidden" name="district" value={pendingZoneRemoval.district} />
	</form>
{/if}

{#if pendingCarrierDelete}
	<form
		bind:this={deleteCarrierFormElement}
		method="POST"
		action="?/deleteCarrier"
		use:deleteCarrierEnhance
	>
		<input type="hidden" name="carrierId" value={pendingCarrierDelete.id} />
	</form>
{/if}

<AdminConfirmDialog
	bind:open={removeZoneConfirmOpen}
	title="Remove district override"
	message={`Remove the override for ${pendingZoneRemoval?.district ?? 'this district'}?`}
	confirmLabel="Remove override"
	loading={$removeZoneSubmitting}
	onconfirm={confirmZoneRemoval}
/>

<AdminConfirmDialog
	bind:open={deleteCarrierConfirmOpen}
	title="Delete carrier"
	message={`Delete ${pendingCarrierDelete?.name ?? 'this carrier'}?`}
	confirmLabel="Delete carrier"
	loading={$deleteCarrierSubmitting}
	onconfirm={confirmCarrierDelete}
/>

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

		<AdminTextarea
			label="Description"
			name="description"
			bind:value={$updateForm.description}
			placeholder="Displayed to customers at checkout..."
			rows={3}
			error={$updateErrors.description}
		/>

		<div class="grid gap-4 sm:grid-cols-2">
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

		<div class="grid gap-4 sm:grid-cols-2">
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

		<div class="grid gap-4 sm:grid-cols-2">
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
	onOpenChange={(open) => {
		if (!open) editingZoneKey = false;
	}}
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
			disabled={editingZoneKey}
			bind:value={$setZoneFormState.shippingMethodId}
			error={$setZoneErrors.shippingMethodId}
		>
			<option value="">Select shipping method</option>
			{#each data.methodOptions as method (method.id)}
				<option value={method.id}
					>{method.name}{method.carrier ? ` (${method.carrier})` : ''}</option
				>
			{/each}
		</AdminSelect>
		{#if editingZoneKey}
			<input type="hidden" name="shippingMethodId" value={$setZoneFormState.shippingMethodId} />
		{/if}

		<AdminSelect
			label="Sri Lanka District"
			name="district"
			required
			disabled={editingZoneKey}
			bind:value={$setZoneFormState.district}
			error={$setZoneErrors.district}
		>
			<option value="">Select district</option>
			{#each data.districts as dist (dist.value)}
				<option value={dist.value}>{dist.label}</option>
			{/each}
		</AdminSelect>
		{#if editingZoneKey}
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

		<div class="grid gap-4 sm:grid-cols-2">
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

		<AdminTextarea
			label="Notes / Contact Info"
			name="notes"
			bind:value={$createCarrierFormState.notes}
			placeholder="Internal operational notes or support contact details..."
			rows={3}
			error={$createCarrierErrors.notes}
		/>

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

		<AdminTextarea
			label="Notes / Contact Info"
			name="notes"
			bind:value={$updateCarrierFormState.notes}
			placeholder="..."
			rows={3}
			error={$updateCarrierErrors.notes}
		/>

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
