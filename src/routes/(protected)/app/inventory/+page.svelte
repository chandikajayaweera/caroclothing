<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Info, Plus, Settings, TrendingUp } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import { fade, fly } from 'svelte/transition';
	import type { PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminDrawer from '$lib/components/admin/overlays/AdminDrawer.svelte';
	import AdminInventoryAdjustmentReviewDialog from '$lib/components/admin/inventory/AdminInventoryAdjustmentReviewDialog.svelte';
	import AdminTabs from '$lib/components/admin/controls/AdminTabs.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminFilterToggle from '$lib/components/admin/filters/AdminFilterToggle.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminCopyButton from '$lib/components/admin/data-display/AdminCopyButton.svelte';
	import { inventoryStatusVariant } from '$lib/shared/admin/status';
	import { formatAdminDateTime } from '$lib/shared/admin/format';

	let { data }: { data: PageData } = $props();

	const inventoryItems = $derived(
		data.inventoryResult.items.map((item) => ({
			...item,
			id: item.variantId
		}))
	);

	type InventoryItem = (typeof inventoryItems)[number];
	type InventoryFilters = PageData['filters'];
	type DrawerTab = 'restock' | 'adjust' | 'settings' | 'history';
	const drawerTabs: DrawerTab[] = ['restock', 'adjust', 'settings', 'history'];

	// Summary Cards Calculations
	const stats = $derived(data.summary);

	// Table Headers
	const tableHeaders = [
		{ label: 'Product' },
		{ label: 'Variant' },
		{ label: 'Stock Status' },
		{ label: 'Total Stock' },
		{ label: 'Reserved' },
		{ label: 'Available' },
		{ label: 'Config' },
		{ label: 'Actions', class: 'text-right' }
	];

	// Filter states
	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let trackInventoryFilter = $state(false);
	let allowBackorderFilter = $state(false);
	let showFilters = $state(false);

	let lastSyncedFilters = $state<InventoryFilters | null>(null);

	$effect(() => {
		const filters = data.filters;
		if (JSON.stringify(filters) !== JSON.stringify(lastSyncedFilters)) {
			searchQuery = filters.query;
			selectedStatus = filters.stockStatus || 'all';
			trackInventoryFilter = filters.trackInventory === 'true';
			allowBackorderFilter = filters.allowBackorder === 'true';
			lastSyncedFilters = $state.snapshot(filters);
		}
	});

	// Drawer state
	let drawerOpen = $state(false);
	let drawerTab = $state<DrawerTab>('restock');
	let adjustmentReviewOpen = $state(false);
	let adjustmentConfirmed = $state(false);
	let adjustFormElement = $state<HTMLFormElement | null>(null);

	// Local state for stock adjustments (prevents negative entry input UX)
	let adjustAmount = $state<number | undefined>(undefined);
	let adjustType = $state<'add' | 'remove'>('add');
	const adjustmentDelta = $derived((adjustAmount ?? 0) * (adjustType === 'add' ? 1 : -1));
	const currentPhysicalQuantity = $derived(data.activeDetail?.inventory?.quantity ?? 0);
	const currentReservedQuantity = $derived(data.activeDetail?.inventory?.reservedQuantity ?? 0);
	const projectedPhysicalQuantity = $derived(currentPhysicalQuantity + adjustmentDelta);
	const projectedAvailableQuantity = $derived(
		data.activeDetail?.inventory?.trackInventory
			? projectedPhysicalQuantity - currentReservedQuantity
			: null
	);
	const removalExceedsAvailable = $derived(
		adjustType === 'remove' && projectedPhysicalQuantity < currentReservedQuantity
	);

	$effect(() => {
		if (adjustAmount !== undefined) {
			$adjustForm.quantityDelta = adjustType === 'add' ? adjustAmount : -adjustAmount;
		} else {
			$adjustForm.quantityDelta = undefined as unknown as number;
		}
	});

	// Superforms setup
	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');

	let initializeHasError = $state(false);
	let updateSettingsHasError = $state(false);
	let restockHasError = $state(false);
	let adjustHasError = $state(false);

	const initializeSuperform = superForm(
		initialForm(() => data.initializeForm),
		{
			resetForm: true,
			id: 'initializeInventory',
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Inventory initialized.';
					toastType = 'success';
					initializeHasError = false;
					closeDrawer();
				} else {
					const fieldErrors = Object.entries(form.errors)
						.filter(([, errs]) => errs && errs.length > 0)
						.map(([field, errs]) => `${field}: ${errs.join(', ')}`)
						.join('; ');
					toastMessage =
						form.message ??
						(fieldErrors.length > 0 ? fieldErrors : 'Failed to initialize inventory.');
					toastType = 'error';
					initializeHasError = true;
				}
			},
			onError({ result }) {
				toastMessage = result.error.message ?? 'A server error occurred.';
				toastType = 'error';
				initializeHasError = true;
			}
		}
	);
	const {
		form: initializeForm,
		errors: initializeErrors,
		enhance: initializeEnhance,
		submitting: initializeSubmitting,
		message: initializeMessage
	} = initializeSuperform;

	// Safe initial defaults to prevent Svelte 5 props_invalid_value on mount
	$initializeForm.trackInventory = true;
	$initializeForm.allowBackorder = false;

	const updateSettingsSuperform = superForm(
		initialForm(() => data.updateSettingsForm),
		{
			resetForm: false,
			id: 'updateInventorySettings',
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Inventory settings updated.';
					toastType = 'success';
					updateSettingsHasError = false;
					void invalidateAll();
				} else {
					const fieldErrors = Object.entries(form.errors)
						.filter(([, errs]) => errs && errs.length > 0)
						.map(([field, errs]) => `${field}: ${errs.join(', ')}`)
						.join('; ');
					toastMessage =
						form.message ?? (fieldErrors.length > 0 ? fieldErrors : 'Failed to save settings.');
					toastType = 'error';
					updateSettingsHasError = true;
				}
			},
			onError({ result }) {
				toastMessage = result.error.message ?? 'A server error occurred.';
				toastType = 'error';
				updateSettingsHasError = true;
			}
		}
	);
	const {
		form: updateSettingsForm,
		errors: updateSettingsErrors,
		enhance: updateSettingsEnhance,
		submitting: updateSettingsSubmitting,
		message: updateSettingsMessage
	} = updateSettingsSuperform;

	const restockSuperform = superForm(
		initialForm(() => data.restockForm),
		{
			resetForm: true,
			id: 'restockInventory',
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Stock replenished.';
					toastType = 'success';
					restockHasError = false;
				} else {
					const fieldErrors = Object.entries(form.errors)
						.filter(([, errs]) => errs && errs.length > 0)
						.map(([field, errs]) => `${field}: ${errs.join(', ')}`)
						.join('; ');
					toastMessage =
						form.message ?? (fieldErrors.length > 0 ? fieldErrors : 'Failed to replenish stock.');
					toastType = 'error';
					restockHasError = true;
				}
			},
			onError({ result }) {
				toastMessage = result.error.message ?? 'A server error occurred.';
				toastType = 'error';
				restockHasError = true;
			}
		}
	);
	const {
		form: restockForm,
		errors: restockErrors,
		enhance: restockEnhance,
		submitting: restockSubmitting,
		message: restockMessage
	} = restockSuperform;

	const adjustSuperform = superForm(
		initialForm(() => data.adjustForm),
		{
			resetForm: true,
			id: 'adjustInventory',
			onSubmit({ cancel }) {
				if (!adjustmentConfirmed) {
					cancel();
					if (adjustFormElement?.reportValidity() && !removalExceedsAvailable) {
						adjustmentReviewOpen = true;
					}
					return;
				}

				adjustmentConfirmed = false;
			},
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Stock level adjusted.';
					toastType = 'success';
					adjustHasError = false;
					adjustmentReviewOpen = false;
					adjustmentConfirmed = false;
				} else {
					const fieldErrors = Object.entries(form.errors)
						.filter(([, errs]) => errs && errs.length > 0)
						.map(([field, errs]) => `${field}: ${errs.join(', ')}`)
						.join('; ');
					toastMessage =
						form.message ??
						(fieldErrors.length > 0 ? fieldErrors : 'Failed to adjust stock level.');
					toastType = 'error';
					adjustHasError = true;
				}
			},
			onError({ result }) {
				toastMessage = result.error.message ?? 'A server error occurred.';
				toastType = 'error';
				adjustHasError = true;
			}
		}
	);
	const {
		form: adjustForm,
		errors: adjustErrors,
		enhance: adjustEnhance,
		submitting: adjustSubmitting,
		message: adjustMessage
	} = adjustSuperform;

	// Sync active variant to drawer forms
	$effect(() => {
		if (data.activeDetail) {
			const detail = data.activeDetail;
			initializeHasError = false;
			updateSettingsHasError = false;
			restockHasError = false;
			adjustHasError = false;

			if (detail.inventory) {
				$updateSettingsForm.lowStockThreshold = detail.inventory.lowStockThreshold;
				$updateSettingsForm.trackInventory = detail.inventory.trackInventory;
				$updateSettingsForm.allowBackorder = detail.inventory.allowBackorder;

				// Reset form inputs to avoid stale inputs when switching variants
				$restockForm.quantity = undefined as unknown as number;
				$adjustForm.quantityDelta = undefined as unknown as number;
				$restockForm.note = '';
				$adjustForm.note = '';

				if (detail.inventory.quantity === 0 && drawerTab === 'adjust') {
					drawerTab = 'restock';
				}

				adjustAmount = undefined;
				adjustType = 'add';

				// Sync initialize form defaults from existing inventory
				$initializeForm.quantity = 0;
				$initializeForm.lowStockThreshold = detail.inventory.lowStockThreshold;
				$initializeForm.trackInventory = detail.inventory.trackInventory;
				$initializeForm.allowBackorder = detail.inventory.allowBackorder;
				$initializeForm.note = '';
			} else {
				$initializeForm.quantity = 0;
				$initializeForm.lowStockThreshold = 5;
				$initializeForm.trackInventory = true;
				$initializeForm.allowBackorder = false;
				$initializeForm.note = '';

				// Sync updateSettings defaults for uninitialized variants
				$updateSettingsForm.lowStockThreshold = 5;
				$updateSettingsForm.trackInventory = true;
				$updateSettingsForm.allowBackorder = false;
			}
		}
		drawerOpen = !!data.activeDetail;
	});

	function openDrawer(variantId: string, initialTab: DrawerTab = 'restock') {
		drawerTab = initialTab;
		const url = new URL(page.url);
		url.searchParams.set('open', variantId);
		// Dynamic query string is appended to the resolved admin route.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/app/inventory')}${url.search}`, {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	function closeDrawer() {
		adjustmentReviewOpen = false;
		adjustmentConfirmed = false;
		drawerOpen = false;
		const url = new URL(page.url);
		url.searchParams.delete('open');
		// Dynamic query string is appended to the resolved admin route.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/app/inventory')}${url.search}`, {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	function confirmStockAdjustment() {
		adjustmentConfirmed = true;
		adjustmentReviewOpen = false;
		adjustFormElement?.requestSubmit();
	}

	function getStatusLabel(item: InventoryItem): string {
		if (!item.hasInventory) return 'Missing';
		if (!item.inventory?.trackInventory) return 'Untracked';
		if (item.inventory.availableQuantity <= 0) return 'Out of stock';
		if (item.inventory.isLowStock) return 'Low stock';
		return 'Available';
	}
	function getMovementDotClass(move: { type: string; quantityDelta: number }) {
		switch (move.type) {
			case 'restock':
				return 'bg-volt border-volt/20 shadow-[0_0_8px_rgba(200,255,0,0.4)]';
			case 'sale':
				return 'bg-red-500 border-red-500/20';
			case 'return':
			case 'cancelled':
				return 'bg-amber-400 border-amber-400/20';
			case 'adjustment':
				return move.quantityDelta > 0
					? 'bg-volt border-volt/20 shadow-[0_0_8px_rgba(200,255,0,0.4)]'
					: 'bg-red-500 border-red-500/20';
			case 'reserved':
				return 'bg-blue-400 border-blue-400/20';
			case 'released':
				return 'bg-ash/40 border-ash/20';
			default:
				return 'bg-ash border-charcoal';
		}
	}

	const hasActiveFilters = $derived(
		data.filters.query !== '' ||
			(data.filters.stockStatus !== '' && data.filters.stockStatus !== 'all') ||
			data.filters.trackInventory === 'true' ||
			data.filters.allowBackorder === 'true'
	);

	function clearAllFilters() {
		goto(resolve('/app/inventory'));
	}

	// Pagination variables
	const limit = $derived(data.filters.limit);
	const offset = $derived(data.filters.offset);
	const totalItems = $derived(data.inventoryResult.total);
</script>

<svelte:head>
	<title>Inventory | Caro Admin</title>
</svelte:head>

<AdminListLayout
	title="Inventory"
	kicker="Operations"
	loading={false}
	metrics={[
		{
			label: 'Total Variants',
			value: stats.totalVariants,
			description: `${stats.inventoryRows} initialized`
		},
		{
			label: 'Low Stock Alerts',
			value: stats.lowStockCount,
			description: 'Threshold warning',
			tone: stats.lowStockCount > 0 ? 'warning' : 'neutral'
		},
		{
			label: 'Out Of Stock',
			value: stats.outOfStockCount,
			description: 'Available <= 0',
			tone: stats.outOfStockCount > 0 ? 'danger' : 'neutral'
		},
		{
			label: 'Missing Config',
			value: stats.missingInventoryCount,
			description: 'Needs initialization',
			tone: stats.missingInventoryCount > 0 ? 'warning' : 'neutral'
		},
		{
			label: 'Available Quantity',
			value: stats.totalAvailableQuantity.toLocaleString(),
			description: `${stats.totalReservedQuantity} reserved`,
			tone: 'success'
		}
	]}
	bind:query={searchQuery}
	bind:showFilters
	{hasActiveFilters}
	{totalItems}
	{limit}
	{offset}
	{tableHeaders}
	items={inventoryItems}
	tableClass="hidden overflow-x-auto xl:block"
	onclearfilters={clearAllFilters}
	searchPlaceholder="Search product variant name/slug..."
>
	{#snippet advancedFilters()}
		<AdminFilterBar cols={4}>
			<AdminSelect
				label="Stock Status"
				name="stockStatus"
				value={selectedStatus}
				options={[
					{ value: 'all', label: 'All Inventory' },
					{ value: 'missing', label: 'Missing Config' },
					{ value: 'low', label: 'Low Stock' },
					{ value: 'out', label: 'Out of Stock' },
					{ value: 'available', label: 'Available' },
					{ value: 'untracked', label: 'Untracked' }
				]}
				onchange={(event: Event) => {
					const form = (event.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>

			<AdminFilterToggle
				label="Track Inventory Only"
				name="trackInventory"
				bind:checked={trackInventoryFilter}
				onclick={(event: MouseEvent) => {
					const button = event.currentTarget as HTMLButtonElement;
					const form = button.closest('form');
					if (form) {
						setTimeout(() => {
							form.requestSubmit();
						}, 0);
					}
				}}
			/>

			<AdminFilterToggle
				label="Allow Backorders Only"
				name="allowBackorder"
				bind:checked={allowBackorderFilter}
				onclick={(event: MouseEvent) => {
					const button = event.currentTarget as HTMLButtonElement;
					const form = button.closest('form');
					if (form) {
						setTimeout(() => {
							form.requestSubmit();
						}, 0);
					}
				}}
			/>
		</AdminFilterBar>
	{/snippet}

	{#snippet card(item: InventoryItem)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h4 class="truncate font-mono text-xs font-bold text-bone uppercase">
							{item.product.name}
						</h4>
						<p class="mt-0.5 truncate font-mono text-[8px] text-ash/50">
							{item.product.slug}
						</p>
					</div>
					<AdminBadge variant={inventoryStatusVariant(item)} size="xs">
						{getStatusLabel(item)}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<div class="mt-3 flex items-center gap-2">
					<AdminBadge variant="neutral" size="xs">{item.variant.size}</AdminBadge>
					<span class="min-w-0 truncate font-mono text-[9px] text-ash uppercase">
						{item.variant.color}
					</span>
				</div>

				<!-- Qty grid -->
				{#if item.hasInventory}
					<AdminMetaGrid cols={3} class="border-t border-charcoal/40 pt-3 text-center">
						<div>
							<p class="font-mono text-[7px] text-ash uppercase">Total</p>
							<p class="mt-0.5 font-mono text-xs font-semibold text-bone">
								{item.inventory?.quantity}
							</p>
						</div>
						<div>
							<p class="font-mono text-[7px] text-ash uppercase">Hold</p>
							<p class="mt-0.5 font-mono text-xs text-ash">
								{item.inventory?.reservedQuantity}
							</p>
						</div>
						<div>
							<p class="font-mono text-[7px] text-ash uppercase">Avail</p>
							<p class="mt-0.5 font-mono text-xs font-bold text-volt">
								{item.inventory?.trackInventory ? item.inventory.availableQuantity : 'Any'}
							</p>
						</div>
					</AdminMetaGrid>
				{/if}
			{/snippet}

			{#snippet actions()}
				<div class="flex justify-end border-t border-charcoal/45 pt-3">
					{#if !item.hasInventory}
						<AdminButton
							type="button"
							onclick={() => openDrawer(item.variantId)}
							variant="volt"
							size="sm"
							class="w-full justify-center"
						>
							<Plus size={10} />
							Initialize
						</AdminButton>
					{:else}
						<div class="grid w-full grid-cols-[1fr_auto] gap-2">
							<AdminButton
								type="button"
								onclick={() => openDrawer(item.variantId, 'adjust')}
								variant="outline"
								size="sm"
								class="flex-1 justify-center"
							>
								Adjust
							</AdminButton>
							<AdminButton
								type="button"
								onclick={() => openDrawer(item.variantId, 'settings')}
								variant="outline"
								size="sm"
							>
								<Settings size={12} />
							</AdminButton>
						</div>
					{/if}
				</div>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(item: InventoryItem)}
		<tr class="hover:bg-charcoal/10">
			<!-- Product Info -->
			<td class="min-w-55 px-5 py-3.5">
				<p class="truncate font-mono text-xs font-bold text-bone uppercase">
					{item.product.name}
				</p>
				<p class="mt-0.5 truncate font-mono text-[8px] text-ash/60">
					{item.product.slug}
				</p>
			</td>
			<!-- Variant Info (Size / Color) -->
			<td class="px-5 py-3.5">
				<div class="flex items-center gap-2">
					<AdminBadge variant="neutral" size="xs">{item.variant.size}</AdminBadge>
					<span
						class="h-3 w-3 shrink-0 rounded-full border border-charcoal/50"
						style="background-color: {item.variant.colorHex ?? '#0A0A0A'}"
						title={item.variant.color}
					></span>
					<span class="truncate font-mono text-[9px] text-ash uppercase">
						{item.variant.color}
					</span>
				</div>
			</td>
			<!-- Status badge -->
			<td class="px-5 py-3.5">
				<AdminBadge variant={inventoryStatusVariant(item)} size="sm">
					{getStatusLabel(item)}
				</AdminBadge>
			</td>
			<!-- Total Qty / Reserved / Available -->
			<td class="px-5 py-3.5 font-mono text-xs text-bone">
				{item.hasInventory ? item.inventory?.quantity : '-'}
			</td>
			<td class="px-5 py-3.5 font-mono text-xs text-ash">
				{item.hasInventory ? item.inventory?.reservedQuantity : '-'}
			</td>
			<td class="px-5 py-3.5 font-mono text-xs font-bold text-volt">
				{item.hasInventory
					? item.inventory?.trackInventory
						? item.inventory.availableQuantity
						: 'Any'
					: '-'}
			</td>
			<!-- Flags (Track / Backorder) -->
			<td class="px-5 py-3.5">
				<div class="flex items-center gap-2 font-mono text-[8px] text-ash/70 uppercase">
					{#if item.hasInventory}
						{#if item.inventory?.trackInventory}
							<AdminBadge variant="success" size="xs">Tracked</AdminBadge>
						{:else}
							<AdminBadge variant="neutral" size="xs">Untracked</AdminBadge>
						{/if}

						{#if item.inventory?.allowBackorder}
							<AdminBadge variant="warning" size="xs">Backorder</AdminBadge>
						{/if}
					{:else}
						<span class="text-ash/40">Not Configured</span>
					{/if}
				</div>
			</td>
			<!-- Actions -->
			<td class="px-5 py-3.5 text-right whitespace-nowrap">
				{#if !item.hasInventory}
					<AdminButton
						type="button"
						onclick={() => openDrawer(item.variantId)}
						variant="volt"
						size="sm"
					>
						<Plus size={10} />
						Initialize
					</AdminButton>
				{:else}
					<div class="flex justify-end gap-1.5">
						<AdminButton
							type="button"
							onclick={() => openDrawer(item.variantId, 'adjust')}
							variant="outline"
							size="sm"
						>
							Adjust
						</AdminButton>
						<AdminButton
							type="button"
							onclick={() => openDrawer(item.variantId, 'settings')}
							variant="outline"
							size="sm"
							title="Settings"
						>
							<Settings size={12} />
						</AdminButton>
					</div>
				{/if}
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState
			title="No inventory records found"
			description="Adjust filters or query parameters."
		/>
	{/snippet}
</AdminListLayout>

{#if data.activeDetail}
	{@const detail = data.activeDetail}
	<AdminDrawer
		bind:open={drawerOpen}
		title={detail.product.name}
		description="Inventory operations for the selected product variant."
		onOpenChange={(open) => {
			if (!open) closeDrawer();
		}}
	>
		<div class="space-y-6">
			<div
				class="flex items-center gap-2 border-b border-charcoal/50 pb-4 font-mono text-[9px] text-ash"
			>
				<span>Size {detail.variant.size}</span>
				<span
					class="h-2 w-2 rounded-full"
					style="background-color: {detail.variant.colorHex ?? '#000'}"
				></span>
				<span class="uppercase">{detail.variant.color}</span>
			</div>
			{#if !detail.hasInventory}
				<!-- INITIALIZATION FORM -->
				<form method="POST" action="?/initialize" use:initializeEnhance class="space-y-4">
					<input type="hidden" name="variantId" value={detail.variantId} />

					{#if $initializeMessage && initializeHasError}
						<div class="border border-red-400/20 bg-red-400/5 p-4 text-red-400">
							<p class="font-sans text-xs">{$initializeMessage}</p>
						</div>
					{/if}

					<div class="flex gap-3 border border-volt/20 bg-volt/5 p-4 text-volt">
						<Info size={16} class="mt-0.5 shrink-0" />
						<div>
							<p class="font-mono text-[9px] font-bold tracking-wider uppercase">
								Uninitialized Stock
							</p>
							<p class="mt-1 font-sans text-[11px] leading-relaxed text-volt/80">
								This variant does not have an active inventory tracking row. Initialize stock values
								to make it available for sale.
							</p>
						</div>
					</div>

					<AdminInput
						label="Initial Quantity"
						name="quantity"
						type="number"
						bind:value={$initializeForm.quantity}
						error={$initializeErrors.quantity?.[0]}
						required
						placeholder="e.g. 100"
					/>

					<AdminInput
						label="Low Stock Alert Threshold"
						name="lowStockThreshold"
						type="number"
						bind:value={$initializeForm.lowStockThreshold}
						error={$initializeErrors.lowStockThreshold?.[0]}
						placeholder="Defaults to 5"
					/>

					<div class="grid gap-4 border border-charcoal bg-void/50 p-4">
						<AdminToggle
							label="Track Stock Levels"
							name="trackInventory"
							bind:checked={$initializeForm.trackInventory}
						/>
						<AdminToggle
							label="Allow Backorder"
							name="allowBackorder"
							bind:checked={$initializeForm.allowBackorder}
						/>
					</div>

					<AdminTextarea
						label="Audit note"
						name="note"
						bind:value={$initializeForm.note}
						placeholder="Opening stock audit copy..."
						error={$initializeErrors.note?.[0]}
					/>

					<AdminButton
						type="submit"
						variant="volt"
						class="mt-6 w-full justify-center"
						disabled={$initializeSubmitting}
					>
						{$initializeSubmitting ? 'Initializing...' : 'Initialize Stock'}
					</AdminButton>
				</form>
			{:else}
				<!-- INITIALIZED STOCK CARD -->
				<AdminMetaGrid cols={3} class="mt-0 border border-charcoal bg-void/50 p-4 text-center">
					<div>
						<p class="font-mono text-[8px] text-ash uppercase">Total Physical</p>
						<p class="mt-1.5 font-display text-2xl leading-none text-bone">
							{detail.inventory?.quantity}
						</p>
					</div>
					<div>
						<p class="font-mono text-[8px] text-ash uppercase">Hold / Reserved</p>
						<p class="mt-1.5 font-display text-2xl leading-none text-ash">
							{detail.inventory?.reservedQuantity}
						</p>
					</div>
					<div>
						<p class="font-mono text-[8px] text-ash uppercase">Available</p>
						<p class="mt-1.5 font-display text-2xl leading-none text-volt">
							{detail.inventory?.trackInventory ? detail.inventory.availableQuantity : 'Any'}
						</p>
					</div>
				</AdminMetaGrid>

				<AdminTabs
					label="Inventory operations"
					value={drawerTab}
					items={drawerTabs.map((tab) => ({ value: tab, label: tab }))}
					onchange={(tab) => (drawerTab = tab as DrawerTab)}
					class="border-b border-charcoal/50 pb-2"
				/>

				<!-- TABS ACTIONS FORMS -->
				{#if drawerTab === 'restock'}
					<div
						in:fly={{ y: 8, duration: 150, delay: 100 }}
						out:fade={{ duration: 100 }}
						class="space-y-4 pt-2"
					>
						<form method="POST" action="?/restock" use:restockEnhance class="space-y-4">
							<input type="hidden" name="variantId" value={detail.variantId} />

							{#if $restockMessage && restockHasError}
								<div class="border border-red-400/20 bg-red-400/5 p-3 text-red-400">
									<p class="font-sans text-xs">{$restockMessage}</p>
								</div>
							{/if}
							<p class="font-sans text-xs text-ash/70">
								Increment physical stock levels. Quantity must be a positive integer.
							</p>

							<AdminInput
								label="Replenish Quantity"
								name="quantity"
								type="number"
								bind:value={$restockForm.quantity}
								error={$restockErrors.quantity?.[0]}
								required
								placeholder="e.g. 50"
							/>

							<AdminTextarea
								label="Audit Log Note"
								name="note"
								bind:value={$restockForm.note}
								placeholder="Supplier restock invoice #, box delivery..."
								error={$restockErrors.note?.[0]}
							/>

							<AdminButton
								type="submit"
								variant="volt"
								class="w-full justify-center pt-3"
								disabled={$restockSubmitting}
							>
								{$restockSubmitting ? 'Updating...' : 'Replenish Inventory'}
							</AdminButton>
						</form>
					</div>
				{:else if drawerTab === 'adjust'}
					<div
						in:fly={{ y: 8, duration: 150, delay: 100 }}
						out:fade={{ duration: 100 }}
						class="space-y-4 pt-2"
					>
						<form
							bind:this={adjustFormElement}
							method="POST"
							action="?/adjust"
							use:adjustEnhance
							class="space-y-4"
						>
							<input type="hidden" name="variantId" value={detail.variantId} />
							<input type="hidden" name="quantityDelta" value={$adjustForm.quantityDelta} />

							{#if $adjustMessage && adjustHasError}
								<div class="border border-red-400/20 bg-red-400/5 p-3 text-red-400">
									<p class="font-sans text-xs">{$adjustMessage}</p>
								</div>
							{/if}
							<p class="font-sans text-xs text-ash/70">
								Select the adjustment action and specify the quantity to change.
							</p>

							<div class="flex gap-1 border border-charcoal bg-void p-1">
								<AdminButton
									type="button"
									onclick={() => (adjustType = 'add')}
									variant={adjustType === 'add' ? 'volt' : 'charcoal'}
									size="sm"
									class="flex-1"
								>
									Add Stock (+)
								</AdminButton>
								<AdminButton
									type="button"
									onclick={() => (adjustType = 'remove')}
									variant={adjustType === 'remove' ? 'danger' : 'charcoal'}
									size="sm"
									class="flex-1"
								>
									Remove Stock (-)
								</AdminButton>
							</div>

							<AdminInput
								label="Adjustment Quantity"
								name="quantityDeltaDisplay"
								type="number"
								min="1"
								bind:value={adjustAmount}
								error={$adjustErrors.quantityDelta?.[0]}
								required
								placeholder="e.g. 5"
							/>

							<AdminTextarea
								label="Reason / Note"
								name="note"
								bind:value={$adjustForm.note}
								required
								placeholder="Damaged in transit, manual stocktake correction..."
								error={$adjustErrors.note?.[0]}
							/>

							<AdminMetaGrid cols={3} class="mt-0 border border-charcoal bg-void/50 p-3">
								<div>
									<p class="font-mono text-[8px] text-ash uppercase">Physical after</p>
									<p
										class="mt-1 font-mono text-sm {removalExceedsAvailable
											? 'text-red-400'
											: 'text-bone'}"
									>
										{projectedPhysicalQuantity}
									</p>
								</div>
								<div>
									<p class="font-mono text-[8px] text-ash uppercase">Reserved</p>
									<p class="mt-1 font-mono text-sm text-ash">{currentReservedQuantity}</p>
								</div>
								<div>
									<p class="font-mono text-[8px] text-ash uppercase">Available after</p>
									<p
										class="mt-1 font-mono text-sm {removalExceedsAvailable
											? 'text-red-400'
											: 'text-volt'}"
									>
										{projectedAvailableQuantity ?? 'Any'}
									</p>
								</div>
							</AdminMetaGrid>

							{#if removalExceedsAvailable}
								<p
									class="border border-red-400/25 bg-red-400/5 p-3 font-sans text-xs text-red-300"
									role="alert"
								>
									Removal cannot reduce physical stock below {currentReservedQuantity} reserved units.
								</p>
							{/if}

							<AdminButton
								type="submit"
								variant={adjustType === 'remove' ? 'danger' : 'volt'}
								class="w-full justify-center pt-3"
								disabled={$adjustSubmitting || !adjustAmount || removalExceedsAvailable}
							>
								{$adjustSubmitting
									? 'Updating...'
									: adjustType === 'remove'
										? 'Review Stock Removal'
										: 'Review Stock Addition'}
							</AdminButton>
						</form>
					</div>
				{:else if drawerTab === 'settings'}
					<div
						in:fly={{ y: 8, duration: 150, delay: 100 }}
						out:fade={{ duration: 100 }}
						class="space-y-4 pt-2"
					>
						<form
							method="POST"
							action="?/updateSettings"
							use:updateSettingsEnhance
							class="space-y-4"
						>
							<input type="hidden" name="variantId" value={detail.variantId} />

							{#if $updateSettingsMessage && updateSettingsHasError}
								<div class="border border-red-400/20 bg-red-400/5 p-3 text-red-400">
									<p class="font-sans text-xs">{$updateSettingsMessage}</p>
								</div>
							{/if}
							<p class="font-sans text-xs text-ash/70">
								Configure stock tracking behavior and flash alert thresholds.
							</p>

							<AdminInput
								label="Low Stock Threshold Warning"
								name="lowStockThreshold"
								type="number"
								bind:value={$updateSettingsForm.lowStockThreshold}
								error={$updateSettingsErrors.lowStockThreshold?.[0]}
								placeholder="Defaults to 5"
							/>

							<div class="grid gap-4 border border-charcoal bg-void/50 p-4">
								<AdminToggle
									label="Enable Inventory Tracking"
									name="trackInventory"
									bind:checked={$updateSettingsForm.trackInventory}
								/>
								<AdminToggle
									label="Allow Backorder Orders"
									name="allowBackorder"
									bind:checked={$updateSettingsForm.allowBackorder}
								/>
							</div>

							<AdminButton
								type="submit"
								variant="volt"
								class="w-full justify-center pt-3"
								disabled={$updateSettingsSubmitting}
							>
								{$updateSettingsSubmitting ? 'Saving...' : 'Save Settings'}
							</AdminButton>
						</form>
					</div>
				{:else if drawerTab === 'history'}
					<div
						in:fly={{ y: 8, duration: 150, delay: 100 }}
						out:fade={{ duration: 100 }}
						class="space-y-4 pt-2"
					>
						<div
							class="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-wider text-volt uppercase"
						>
							<TrendingUp size={12} />
							<span>Stock Movement Audit Logs</span>
						</div>

						{#if detail.movements.length === 0}
							<AdminEmptyState
								title="No movements logged"
								description="Stock movement history is empty."
								size="compact"
							/>
						{:else}
							<!-- Timeline list -->
							<div class="relative ml-2 space-y-4 border-l border-charcoal/80 py-2 pl-4">
								{#each detail.movements as move (move.id)}
									<div class="relative min-w-0">
										<!-- Dot icon -->
										<span
											class="absolute top-1.5 -left-5.25 h-2.5 w-2.5 rounded-full border {getMovementDotClass(
												move
											)}"
										></span>

										<div
											class="flex items-start justify-between gap-2 font-mono text-[9px] tracking-wider"
										>
											<span class="font-bold text-bone uppercase">{move.type}</span>
											<span class="shrink-0 text-ash/40"
												>{formatAdminDateTime(move.createdAt, '-')}</span
											>
										</div>

										<div class="mt-1 flex items-center gap-2 font-mono text-xs">
											{#if move.quantityDelta !== 0}
												<span
													class={move.quantityDelta > 0
														? 'font-semibold text-volt'
														: 'font-semibold text-red-400'}
												>
													{move.quantityDelta > 0 ? '+' : ''}{move.quantityDelta} qty
												</span>
												<span class="font-normal text-ash/40">to {move.quantityAfter} total</span>
											{/if}
											{#if move.reservedQuantityDelta !== 0}
												<span
													class={move.reservedQuantityDelta > 0 ? 'text-amber-300' : 'text-ash'}
												>
													{move.reservedQuantityDelta > 0 ? '+' : ''}{move.reservedQuantityDelta} res
												</span>
												<span class="font-normal text-ash/40"
													>to {move.reservedQuantityAfter} reserved</span
												>
											{/if}
										</div>

										{#if move.note}
											<p
												class="mt-1.5 rounded border border-charcoal/30 bg-void/30 px-2 py-1.5 font-sans text-xs whitespace-pre-line text-ash"
											>
												{move.note}
											</p>
										{/if}
										{#if move.referenceId}
											<div class="mt-2 grid gap-1.5 border-t border-charcoal/40 pt-2">
												<span class="font-mono text-[8px] tracking-wider text-ash/50 uppercase">
													Reference ID
												</span>
												<div class="flex min-w-0 flex-wrap items-center gap-2">
													<span
														class="min-w-0 flex-1 font-mono text-[9px] break-all text-ash select-all"
													>
														{move.referenceId}
													</span>
													<AdminCopyButton
														value={move.referenceId}
														label="Copy"
														copiedLabel="Copied"
														size="sm"
													/>
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</AdminDrawer>
{/if}

<AdminInventoryAdjustmentReviewDialog
	bind:open={adjustmentReviewOpen}
	action={adjustType}
	variantLabel={data.activeDetail
		? `${data.activeDetail.product.name} / ${data.activeDetail.variant.size} / ${data.activeDetail.variant.color}`
		: 'Selected variant'}
	amount={adjustAmount ?? 0}
	physicalBefore={currentPhysicalQuantity}
	physicalAfter={projectedPhysicalQuantity}
	reserved={currentReservedQuantity}
	availableAfter={projectedAvailableQuantity}
	note={$adjustForm.note ?? ''}
	loading={$adjustSubmitting}
	onconfirm={confirmStockAdjustment}
/>

<!-- Global Toast message adapter -->
<AdminToast
	message={toastMessage}
	type={toastType}
	duration={6000}
	onclose={() => (toastMessage = null)}
/>
