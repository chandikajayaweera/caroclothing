<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Info, Plus, Settings, TrendingUp, X } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Dialog } from 'bits-ui';
	import { fade, fly } from 'svelte/transition';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminFilterToggle from '$lib/components/admin/AdminFilterToggle.svelte';

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

	// Local state for stock adjustments (prevents negative entry input UX)
	let adjustAmount = $state<number | undefined>(undefined);
	let adjustType = $state<'add' | 'remove'>('add');

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
						.filter(([_, errs]) => errs && errs.length > 0)
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
				} else {
					const fieldErrors = Object.entries(form.errors)
						.filter(([_, errs]) => errs && errs.length > 0)
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

	// Safe initial defaults to prevent Svelte 5 props_invalid_value on mount
	$updateSettingsForm.trackInventory = true;
	$updateSettingsForm.allowBackorder = false;

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
						.filter(([_, errs]) => errs && errs.length > 0)
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
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Stock level adjusted.';
					toastType = 'success';
					adjustHasError = false;
				} else {
					const fieldErrors = Object.entries(form.errors)
						.filter(([_, errs]) => errs && errs.length > 0)
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
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/app/inventory')}${url.search}`, {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	function closeDrawer() {
		drawerOpen = false;
		const url = new URL(page.url);
		url.searchParams.delete('open');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/app/inventory')}${url.search}`, {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	function getStatusClass(item: InventoryItem): string {
		if (!item.hasInventory) return 'text-ash/60 border border-ash/15 bg-ash/5';
		if (!item.inventory?.trackInventory) return 'text-ash border border-ash/20 bg-ash/5';
		if (item.inventory.availableQuantity <= 0)
			return 'text-red-400 border border-red-400/20 bg-red-400/5';
		if (item.inventory.isLowStock) return 'text-volt border border-volt/20 bg-volt/5';
		return 'text-volt border border-volt/10 bg-volt/5';
	}

	function getStatusLabel(item: InventoryItem): string {
		if (!item.hasInventory) return 'Missing';
		if (!item.inventory?.trackInventory) return 'Untracked';
		if (item.inventory.availableQuantity <= 0) return 'Out of stock';
		if (item.inventory.isLowStock) return 'Low stock';
		return 'Available';
	}

	function formatDateTime(date: Date | string | null | undefined): string {
		if (!date) return '-';
		const d = new Date(date);
		if (isNaN(d.getTime())) return '-';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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
	{#snippet statsSnippet()}
		<div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
			<AdminCard padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Total Variants
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{stats.totalVariants}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash/60">
					{stats.inventoryRows} initialized
				</p>
			</AdminCard>

			<AdminCard padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Low Stock Alerts
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
					{stats.lowStockCount}
				</p>
				<p class="mt-1 font-mono text-[9px] text-volt/60">Threshold warning</p>
			</AdminCard>

			<AdminCard padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Out Of Stock
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-red-400 uppercase sm:text-4xl">
					{stats.outOfStockCount}
				</p>
				<p class="mt-1 font-mono text-[9px] text-red-400/60">Available &lt;= 0</p>
			</AdminCard>

			<AdminCard padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Missing Config
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-ash/80 uppercase sm:text-4xl">
					{stats.missingInventoryCount}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash/40">Needs initialization</p>
			</AdminCard>

			<AdminCard padding="p-4 sm:p-5" class="col-span-2 sm:col-span-1">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Available Quantity
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{stats.totalAvailableQuantity.toLocaleString()}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash/60">
					{stats.totalReservedQuantity} reserved
				</p>
			</AdminCard>
		</div>
	{/snippet}

	{#snippet advancedFilters()}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
		</div>
	{/snippet}

	{#snippet card(item: InventoryItem)}
		<article class="flex flex-col justify-between border border-charcoal bg-void/50 p-4">
			<div>
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h4 class="truncate font-mono text-xs font-bold text-bone uppercase">
							{item.product.name}
						</h4>
						<p class="mt-0.5 truncate font-mono text-[8px] text-ash/50">
							{item.product.slug}
						</p>
					</div>
					<span
						class="shrink-0 rounded px-2 py-0.5 font-mono text-[8px] font-bold tracking-widest uppercase {getStatusClass(
							item
						)}"
					>
						{getStatusLabel(item)}
					</span>
				</div>

				<div class="mt-3 flex items-center gap-2">
					<span
						class="py-0.2 border border-charcoal bg-void/60 px-1.5 font-mono text-[9px] text-bone"
					>
						{item.variant.size}
					</span>
					<span class="min-w-0 truncate font-mono text-[9px] text-ash uppercase">
						{item.variant.color}
					</span>
				</div>

				<!-- Qty grid -->
				{#if item.hasInventory}
					<div class="mt-4 grid grid-cols-3 gap-2 border-t border-charcoal/40 pt-3 text-center">
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
					</div>
				{/if}
			</div>

			<div class="mt-4 flex justify-end border-t border-charcoal/45 pt-3">
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
							onclick={() => openDrawer(item.variantId, 'restock')}
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
		</article>
	{/snippet}

	{#snippet row(item: InventoryItem)}
		<tr class="hover:bg-charcoal/10">
			<!-- Product Info -->
			<td class="min-w-[220px] px-5 py-3.5">
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
					<span
						class="border border-charcoal bg-void/60 px-2 py-0.5 font-mono text-[10px] text-bone"
					>
						{item.variant.size}
					</span>
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
				<span
					class="rounded px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase {getStatusClass(
						item
					)}"
				>
					{getStatusLabel(item)}
				</span>
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
							<span class="border border-volt/20 bg-volt/5 px-1.5 py-0.5 text-volt">Tracked</span>
						{:else}
							<span class="border border-charcoal bg-void px-1.5 py-0.5 text-ash/40">Untracked</span
							>
						{/if}

						{#if item.inventory?.allowBackorder}
							<span class="border border-amber-300/20 bg-amber-300/5 px-1.5 py-0.5 text-amber-300"
								>Backorder</span
							>
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
							onclick={() => openDrawer(item.variantId, 'restock')}
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
		<p class="font-display text-3xl text-bone uppercase">No inventory records found</p>
		<p class="mt-1.5 font-mono text-[9px] tracking-widest text-ash uppercase">
			Adjust filters or query parameters.
		</p>
	{/snippet}
</AdminListLayout>

<!-- bits-ui slide-over sheet drawer container -->
<Dialog.Root
	bind:open={drawerOpen}
	onOpenChange={(open) => {
		if (!open) closeDrawer();
	}}
>
	{#if drawerOpen && data.activeDetail}
		{@const detail = data.activeDetail}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<Dialog.Content>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fly={{ duration: 250, x: 400 }}
						class="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-charcoal bg-charcoal shadow-2xl outline-none sm:max-w-md"
					>
						<!-- Drawer Header -->
						<div class="flex items-start justify-between border-b border-charcoal/50 p-5">
							<div>
								<span class="font-mono text-[8px] tracking-[0.25em] text-volt uppercase"
									>Variant detail</span
								>
								<h2
									class="mt-1 max-w-[280px] truncate font-display text-2xl leading-none text-bone uppercase"
								>
									{detail.product.name}
								</h2>
								<p class="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-ash">
									<span>Size {detail.variant.size}</span>
									<span
										class="inline-block h-2 w-2 rounded-full"
										style="background-color: {detail.variant.colorHex ?? '#000'}"
									></span>
									<span class="uppercase">{detail.variant.color}</span>
								</p>
							</div>
							<button
								type="button"
								onclick={closeDrawer}
								class="text-ash transition-colors hover:text-bone"
								aria-label="Close panel"
							>
								<X size={18} />
							</button>
						</div>

						<!-- Drawer Scrollable Content -->
						<div class="flex-1 space-y-6 overflow-y-auto p-5">
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
												This variant does not have an active inventory tracking row. Initialize
												stock values to make it available for sale.
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

									<div class="flex flex-col gap-1.5">
										<label for="init-note" class="font-sans text-xs text-ash">Audit note</label>
										<textarea
											id="init-note"
											name="note"
											bind:value={$initializeForm.note}
											rows="3"
											placeholder="Opening stock audit copy..."
											class="w-full border border-ash/30 bg-void px-3.5 py-2.5 font-sans text-xs text-bone outline-none hover:border-ash/60 focus:border-volt"
										></textarea>
										{#if $initializeErrors.note?.[0]}
											<p class="font-sans text-xs text-red-400">{$initializeErrors.note[0]}</p>
										{/if}
									</div>

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
								<div
									class="grid grid-cols-3 gap-3 border border-charcoal bg-void/50 p-4 text-center"
								>
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
											{detail.inventory?.trackInventory
												? detail.inventory.availableQuantity
												: 'Any'}
										</p>
									</div>
								</div>

								<!-- TAB HEADER SELECTORS -->
								<div class="flex border-b border-charcoal/50">
									{#each drawerTabs as tab (tab)}
										<button
											type="button"
											onclick={() => (drawerTab = tab)}
											disabled={tab === 'adjust' && detail.inventory?.quantity === 0}
											class="flex-1 border-b-2 py-2.5 font-mono text-[9px] tracking-widest uppercase transition-colors {drawerTab ===
											tab
												? 'border-volt bg-charcoal/20 text-volt'
												: 'border-transparent text-ash hover:text-bone'} disabled:cursor-not-allowed disabled:opacity-30"
											title={tab === 'adjust' && detail.inventory?.quantity === 0
												? 'Cannot adjust stock when physical count is 0'
												: ''}
										>
											{tab}
										</button>
									{/each}
								</div>

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

											<div class="flex flex-col gap-1.5">
												<label for="restock-note" class="font-sans text-xs text-ash"
													>Audit Log Note</label
												>
												<textarea
													id="restock-note"
													name="note"
													bind:value={$restockForm.note}
													rows="3"
													placeholder="Supplier restock invoice #, box delivery..."
													class="w-full border border-ash/30 bg-void px-3.5 py-2.5 font-sans text-xs text-bone outline-none hover:border-ash/60 focus:border-volt"
												></textarea>
												{#if $restockErrors.note?.[0]}
													<p class="font-sans text-xs text-red-400">{$restockErrors.note[0]}</p>
												{/if}
											</div>

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
										<form method="POST" action="?/adjust" use:adjustEnhance class="space-y-4">
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

											<div class="flex gap-1 rounded border border-charcoal bg-void p-1">
												<button
													type="button"
													onclick={() => (adjustType = 'add')}
													class="flex-1 py-1.5 text-center font-mono text-[9px] tracking-widest uppercase transition-colors {adjustType ===
													'add'
														? 'bg-volt font-bold text-void'
														: 'text-ash hover:text-bone'}"
												>
													Add Stock (+)
												</button>
												<button
													type="button"
													onclick={() => (adjustType = 'remove')}
													class="flex-1 py-1.5 text-center font-mono text-[9px] tracking-widest uppercase transition-colors {adjustType ===
													'remove'
														? 'bg-red-500 font-bold text-bone'
														: 'text-ash hover:text-bone'}"
												>
													Remove Stock (-)
												</button>
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

											<div class="flex flex-col gap-1.5">
												<label for="adjust-note" class="font-sans text-xs text-ash"
													>Reason / Note</label
												>
												<textarea
													id="adjust-note"
													name="note"
													bind:value={$adjustForm.note}
													rows="3"
													required
													placeholder="Damaged in transit, manual stocktake correction..."
													class="w-full border border-ash/30 bg-void px-3.5 py-2.5 font-sans text-xs text-bone outline-none hover:border-ash/60 focus:border-volt"
												></textarea>
												{#if $adjustErrors.note?.[0]}
													<p class="font-sans text-xs text-red-400">{$adjustErrors.note[0]}</p>
												{/if}
											</div>

											<AdminButton
												type="submit"
												variant="volt"
												class="w-full justify-center pt-3"
												disabled={$adjustSubmitting}
											>
												{$adjustSubmitting ? 'Updating...' : 'Apply Adjustment'}
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
											<p class="py-5 text-center font-mono text-[10px] text-ash/40 uppercase">
												No movements logged yet
											</p>
										{:else}
											<!-- Timeline list -->
											<div class="relative ml-2 space-y-4 border-l border-charcoal/80 py-2 pl-4">
												{#each detail.movements as move (move.id)}
													<div class="relative min-w-0">
														<!-- Dot icon -->
														<span
															class="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border {getMovementDotClass(
																move
															)}"
														></span>

														<div
															class="flex items-start justify-between gap-2 font-mono text-[9px] tracking-wider"
														>
															<span class="font-bold text-bone uppercase">{move.type}</span>
															<span class="shrink-0 text-ash/40"
																>{formatDateTime(move.createdAt)}</span
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
																<span class="font-normal text-ash/40"
																	>to {move.quantityAfter} total</span
																>
															{/if}
															{#if move.reservedQuantityDelta !== 0}
																<span
																	class={move.reservedQuantityDelta > 0
																		? 'text-amber-300'
																		: 'text-ash'}
																>
																	{move.reservedQuantityDelta > 0
																		? '+'
																		: ''}{move.reservedQuantityDelta} res
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
															<div
																class="mt-1 flex items-center gap-1.5 font-mono text-[8px] text-ash/50"
															>
																<span>Ref:</span>
																<span class="select-all">{move.referenceId}</span>
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
					</div>
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- Global Toast message adapter -->
<AdminToast
	message={toastMessage}
	type={toastType}
	duration={6000}
	onclose={() => (toastMessage = null)}
/>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
