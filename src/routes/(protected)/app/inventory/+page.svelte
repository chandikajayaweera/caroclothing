<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		AlertTriangle,
		ArrowRight,
		Boxes,
		CheckCircle2,
		ChevronRight,
		Filter,
		Info,
		Plus,
		RefreshCw,
		Search,
		Settings,
		TrendingUp,
		X
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Dialog } from 'bits-ui';
	import { fade, fly, slide } from 'svelte/transition';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data }: { data: PageData } = $props();

	// Types
	type InventoryItem = typeof data.inventoryResult.items[number];

	// Summary Cards Calculations
	const stats = $derived(data.summary);

	// Table Headers
	const tableHeaders = [
		{ label: 'Product / Variant' },
		{ label: 'Stock Status' },
		{ label: 'Total Stock' },
		{ label: 'Reserved' },
		{ label: 'Available' },
		{ label: 'Config' },
		{ label: 'Actions', class: 'text-right' }
	];

	// Filter states
	let searchQuery = $state('');
	let activeSearchQuery = $state('');
	let selectedStatus = $state('all');
	let trackInventoryFilter = $state(false);
	let allowBackorderFilter = $state(false);
	let showFilters = $state(false);

	$effect(() => {
		const filters = data.filters;
		searchQuery = filters.query;
		activeSearchQuery = filters.query;
		selectedStatus = filters.stockStatus || 'all';
		trackInventoryFilter = filters.trackInventory === 'true';
		allowBackorderFilter = filters.allowBackorder === 'true';
	});

	// Drawer state
	let drawerOpen = $state(false);
	let drawerTab = $state<'restock' | 'adjust' | 'settings' | 'history'>('restock');

	// Local state for stock adjustments (prevents negative entry input UX)
	let adjustAmount = $state<number | undefined>(undefined);
	let adjustType = $state<'add' | 'remove'>('add');

	$effect(() => {
		if (adjustAmount !== undefined) {
			$adjustForm.quantityDelta = adjustType === 'add' ? adjustAmount : -adjustAmount;
		} else {
			$adjustForm.quantityDelta = undefined as any;
		}
	});

	// Superforms setup
	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const initializeSuperform = superForm(initialForm(() => data.initializeForm), {
		resetForm: true,
		id: 'initializeInventory'
	});
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

	const updateSettingsSuperform = superForm(initialForm(() => data.updateSettingsForm), {
		resetForm: false,
		id: 'updateInventorySettings'
	});
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

	const restockSuperform = superForm(initialForm(() => data.restockForm), {
		resetForm: true,
		id: 'restockInventory'
	});
	const {
		form: restockForm,
		errors: restockErrors,
		enhance: restockEnhance,
		submitting: restockSubmitting,
		message: restockMessage
	} = restockSuperform;

	const adjustSuperform = superForm(initialForm(() => data.adjustForm), {
		resetForm: true,
		id: 'adjustInventory'
	});
	const {
		form: adjustForm,
		errors: adjustErrors,
		enhance: adjustEnhance,
		submitting: adjustSubmitting,
		message: adjustMessage
	} = adjustSuperform;

	const actionMessage = $derived(
		$initializeMessage || $updateSettingsMessage || $restockMessage || $adjustMessage
	);

	let toastMessage = $state<string | null>(null);
	$effect(() => {
		if (actionMessage) toastMessage = actionMessage;
	});

	// Sync active variant to drawer forms
	$effect(() => {
		console.log('[effect] activeDetail changed:', data.activeDetail);
		if (data.activeDetail) {
			const detail = data.activeDetail;
			if (detail.inventory) {
				$updateSettingsForm.variantId = detail.variantId;
				$updateSettingsForm.lowStockThreshold = detail.inventory.lowStockThreshold;
				$updateSettingsForm.trackInventory = detail.inventory.trackInventory;
				$updateSettingsForm.allowBackorder = detail.inventory.allowBackorder;

				$restockForm.variantId = detail.variantId;
				$adjustForm.variantId = detail.variantId;

				// Reset form inputs to avoid stale inputs when switching variants
				$restockForm.quantity = undefined as any;
				$adjustForm.quantityDelta = undefined as any;
				$restockForm.note = '';
				$adjustForm.note = '';

				if (detail.inventory.quantity === 0 && drawerTab === 'adjust') {
					drawerTab = 'restock';
				}

				adjustAmount = undefined;
				adjustType = 'add';

				// Also sync initialize form fields to avoid undefined properties
				$initializeForm.variantId = detail.variantId;
				$initializeForm.quantity = 0;
				$initializeForm.lowStockThreshold = detail.inventory.lowStockThreshold;
				$initializeForm.trackInventory = detail.inventory.trackInventory;
				$initializeForm.allowBackorder = detail.inventory.allowBackorder;
				$initializeForm.note = '';
			} else {
				$initializeForm.variantId = detail.variantId;
				$initializeForm.quantity = 0;
				$initializeForm.lowStockThreshold = 5;
				$initializeForm.trackInventory = true;
				$initializeForm.allowBackorder = false;
				$initializeForm.note = '';

				// Also sync updateSettings form fields to avoid undefined properties
				$updateSettingsForm.variantId = detail.variantId;
				$updateSettingsForm.lowStockThreshold = 5;
				$updateSettingsForm.trackInventory = true;
				$updateSettingsForm.allowBackorder = false;
			}
		}
		drawerOpen = !!data.activeDetail;
		console.log('[effect] drawerOpen set to:', drawerOpen);
	});

	// Auto reset search filter when cleared
	$effect(() => {
		if (searchQuery === '' && activeSearchQuery !== '') {
			activeSearchQuery = '';
			applyFilters();
		}
	});

	// Routing helper to apply URL filters
	function applyFilters() {
		const url = new URL(page.url);
		if (activeSearchQuery) {
			url.searchParams.set('query', activeSearchQuery);
		} else {
			url.searchParams.delete('query');
		}

		if (selectedStatus && selectedStatus !== 'all') {
			url.searchParams.set('stockStatus', selectedStatus);
		} else {
			url.searchParams.delete('stockStatus');
		}

		if (trackInventoryFilter) {
			url.searchParams.set('trackInventory', 'true');
		} else {
			url.searchParams.delete('trackInventory');
		}

		if (allowBackorderFilter) {
			url.searchParams.set('allowBackorder', 'true');
		} else {
			url.searchParams.delete('allowBackorder');
		}

		url.searchParams.set('offset', '0');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	function openDrawer(variantId: string, initialTab: 'restock' | 'adjust' | 'settings' | 'history' = 'restock') {
		console.log('[openDrawer] clicked for variantId:', variantId, 'tab:', initialTab);
		drawerTab = initialTab;
		const url = new URL(page.url);
		url.searchParams.set('open', variantId);
		console.log('[openDrawer] navigating to:', url.pathname + url.search);
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	function closeDrawer() {
		console.log('[closeDrawer] close triggered');
		drawerOpen = false;
		const url = new URL(page.url);
		url.searchParams.delete('open');
		console.log('[closeDrawer] navigating to:', url.pathname + url.search);
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	function getStatusClass(item: InventoryItem): string {
		if (!item.hasInventory) return 'text-ash/60 border border-ash/15 bg-ash/5';
		if (!item.inventory?.trackInventory) return 'text-ash border border-ash/20 bg-ash/5';
		if (item.inventory.availableQuantity <= 0) return 'text-red-400 border border-red-400/20 bg-red-450/5';
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
		if (!date) return '—';
		const d = new Date(date);
		if (isNaN(d.getTime())) return '—';
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
		activeSearchQuery !== '' ||
			selectedStatus !== 'all' ||
			trackInventoryFilter ||
			allowBackorderFilter
	);

	function clearAllFilters() {
		searchQuery = '';
		activeSearchQuery = '';
		selectedStatus = 'all';
		trackInventoryFilter = false;
		allowBackorderFilter = false;
		goto(page.url.pathname, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	// Pagination variables
	const limit = $derived(data.filters.limit);
	const offset = $derived(data.filters.offset);
	const totalItems = $derived(data.inventoryResult.total);
	const hasPreviousPage = $derived(offset > 0);
	const hasNextPage = $derived(offset + limit < totalItems);

	function getPageUrl(newOffset: number): string {
		const url = new URL(page.url);
		url.searchParams.set('offset', String(newOffset));
		return url.pathname + url.search;
	}
</script>

<svelte:head>
	<title>Inventory | Caro Admin</title>
</svelte:head>

<section class="mx-auto max-w-7xl overflow-x-hidden px-2 pb-24 md:px-0 lg:pb-10">
	<!-- Page Header -->
	<div class="border-b border-charcoal pb-6">
		<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Operations</p>
		<h1 class="mt-2 font-display text-5xl leading-none text-bone uppercase md:text-7xl">
			Inventory
		</h1>
	</div>

	<!-- Dashboard Overview Metrics Grid -->
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
			<p class="mt-1 font-mono text-[9px] text-volt/60">
				Threshold warning
			</p>
		</AdminCard>

		<AdminCard padding="p-4 sm:p-5">
			<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
				Out Of Stock
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-red-400 uppercase sm:text-4xl">
				{stats.outOfStockCount}
			</p>
			<p class="mt-1 font-mono text-[9px] text-red-400/60">
				Available &lt;= 0
			</p>
		</AdminCard>

		<AdminCard padding="p-4 sm:p-5">
			<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
				Missing Config
			</p>
			<p class="mt-2 font-display text-3xl leading-none text-ash/80 uppercase sm:text-4xl">
				{stats.missingInventoryCount}
			</p>
			<p class="mt-1 font-mono text-[9px] text-ash/40">
				Needs initialization
			</p>
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

	<!-- Filters & Tab Layout Cards -->
	<AdminCard bg="bg-charcoal" border="border border-charcoal" padding="" class="mt-6 overflow-hidden">
		<!-- Search and Settings Toggle Bar -->
		<div class="border-b border-charcoal/50 p-5">
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-3 md:flex-row md:items-center">
					<!-- Search Input Row -->
					<div class="flex flex-1 items-center gap-2">
						<div class="relative flex-1">
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ash/50">
								<Search size={14} aria-hidden="true" />
							</div>
							<input
								type="text"
								placeholder="Search product variant name/slug..."
								bind:value={searchQuery}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										activeSearchQuery = searchQuery.trim();
										applyFilters();
									}
								}}
								class="min-h-11 w-full border border-ash/30 bg-void py-2.5 pr-4 pl-10 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
							/>
						</div>
						<AdminButton
							type="button"
							onclick={() => {
								activeSearchQuery = searchQuery.trim();
								applyFilters();
							}}
							class="min-h-11"
						>
							Search
						</AdminButton>
					</div>

					<!-- Option Toggles -->
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => (showFilters = !showFilters)}
							class="flex min-h-11 items-center gap-2 border px-4 font-mono text-[10px] tracking-widest uppercase transition-colors {showFilters || hasActiveFilters ? 'border-volt bg-volt/10 text-volt' : 'border-ash/30 text-ash hover:border-ash/60'}"
						>
							<Filter size={14} aria-hidden="true" />
							<span>Filters</span>
							{#if hasActiveFilters}
								<span class="ml-1 h-1.5 w-1.5 rounded-full bg-volt"></span>
							{/if}
						</button>

						{#if hasActiveFilters}
							<button
								type="button"
								onclick={clearAllFilters}
								class="flex min-h-11 items-center justify-center border border-red-400/30 bg-void px-4 font-mono text-[10px] tracking-widest text-red-300 uppercase transition-colors hover:bg-red-400/10 hover:text-red-400"
							>
								Clear
							</button>
						{/if}
					</div>
				</div>

				<!-- Advanced Filter Toggles (Dropdown) -->
				{#if showFilters}
					<div class="grid gap-4 border-t border-charcoal/50 pt-4 sm:grid-cols-2" transition:slide={{ duration: 150 }}>
						<AdminToggle
							label="Filter Tracked Inventory Only"
							bind:checked={trackInventoryFilter}
							onclick={() => setTimeout(applyFilters, 0)}
							class="min-h-11 border border-ash/15 bg-void/50 px-3.5"
						/>
						<AdminToggle
							label="Filter Backorders Allowed Only"
							bind:checked={allowBackorderFilter}
							onclick={() => setTimeout(applyFilters, 0)}
							class="min-h-11 border border-ash/15 bg-void/50 px-3.5"
						/>
					</div>
				{/if}
			</div>
		</div>

		<!-- Status Filter Tabs (Sub-tab list) -->
		<div class="flex border-b border-charcoal/30 bg-void/35 overflow-x-auto no-scrollbar scroll-smooth">
			{#each ['all', 'missing', 'low', 'out', 'available', 'untracked'] as status}
				<button
					type="button"
					onclick={() => {
						selectedStatus = status;
						applyFilters();
					}}
					class="px-5 py-3.5 font-mono text-[9px] tracking-widest uppercase border-b-2 whitespace-nowrap transition-colors {selectedStatus === status ? 'border-volt text-volt bg-charcoal/20' : 'border-transparent text-ash hover:text-bone'}"
				>
					{status === 'all' ? 'All Inventory' : `${status} stock`}
				</button>
			{/each}
		</div>

		<!-- Grid/Table Area -->
		{#if data.inventoryResult.items.length > 0}
			<!-- Desktop View Table -->
			<div class="hidden overflow-x-auto lg:block">
				<table class="w-full text-left">
					<thead class="border-b border-charcoal">
						<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
							{#each tableHeaders as header}
								<th class="px-5 py-4 font-normal {header.class || ''}">{header.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-charcoal/50">
						{#each data.inventoryResult.items as item (item.variantId)}
							<tr class="hover:bg-charcoal/10">
								<!-- Product Info -->
								<td class="px-5 py-3.5 min-w-[200px]">
									<p class="font-mono text-xs font-bold text-bone uppercase truncate">
										{item.product.name}
									</p>
									<p class="font-mono text-[8px] text-ash/60 mt-0.5 truncate">
										{item.product.slug}
									</p>
								</td>
								<!-- Variant Info (Size / Color) -->
								<td class="px-5 py-3.5">
									<div class="flex items-center gap-2">
										<span class="border border-charcoal bg-void/60 px-2 py-0.5 font-mono text-[10px] text-bone">
											{item.variant.size}
										</span>
										<span
											class="h-3 w-3 shrink-0 rounded-full border border-charcoal/50"
											style="background-color: {item.variant.colorHex ?? '#0A0A0A'}"
											title={item.variant.color}
										></span>
										<span class="font-mono text-[9px] text-ash truncate uppercase">
											{item.variant.color}
										</span>
									</div>
								</td>
								<!-- Status badge -->
								<td class="px-5 py-3.5">
									<span class="rounded px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase {getStatusClass(item)}">
										{getStatusLabel(item)}
									</span>
								</td>
								<!-- Total Qty / Reserved / Available -->
								<td class="px-5 py-3.5 font-mono text-xs text-bone">
									{item.hasInventory ? item.inventory?.quantity : '—'}
								</td>
								<td class="px-5 py-3.5 font-mono text-xs text-ash">
									{item.hasInventory ? item.inventory?.reservedQuantity : '—'}
								</td>
								<td class="px-5 py-3.5 font-mono text-xs text-volt font-bold">
									{item.hasInventory ? (item.inventory?.trackInventory ? item.inventory.availableQuantity : '∞') : '—'}
								</td>
								<!-- Flags (Track / Backorder) -->
								<td class="px-5 py-3.5">
									<div class="flex items-center gap-2 font-mono text-[8px] text-ash/70 uppercase">
										{#if item.hasInventory}
											{#if item.inventory?.trackInventory}
												<span class="text-volt border border-volt/20 bg-volt/5 px-1.5 py-0.5">Tracked</span>
											{:else}
												<span class="border border-charcoal bg-void px-1.5 py-0.5 text-ash/40">Untracked</span>
											{/if}

											{#if item.inventory?.allowBackorder}
												<span class="text-amber-300 border border-amber-300/20 bg-amber-300/5 px-1.5 py-0.5">Backorder</span>
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
											onclick={() => openDrawer(item.variantId, 'restock')}
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
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Mobile view Grid cards -->
			<div class="grid gap-3 p-4 sm:grid-cols-2 lg:hidden">
				{#each data.inventoryResult.items as item (item.variantId)}
					<div class="border border-charcoal bg-void/50 p-4 flex flex-col justify-between">
						<div>
							<div class="flex items-start justify-between gap-2">
								<h4 class="font-mono text-xs font-bold text-bone uppercase truncate">
									{item.product.name}
								</h4>
								<span class="rounded px-2 py-0.5 font-mono text-[8px] font-bold tracking-widest uppercase {getStatusClass(item)}">
									{getStatusLabel(item)}
								</span>
							</div>
							<p class="font-mono text-[8px] text-ash/50 mt-0.5">{item.product.slug}</p>

							<div class="mt-3 flex items-center gap-2">
								<span class="border border-charcoal bg-void/60 px-1.5 py-0.2 font-mono text-[9px] text-bone">
									{item.variant.size}
								</span>
								<span class="font-mono text-[9px] text-ash uppercase">
									{item.variant.color}
								</span>
							</div>

							<!-- Qty grid -->
							{#if item.hasInventory}
								<div class="mt-4 grid grid-cols-3 gap-2 border-t border-charcoal/40 pt-3 text-center">
									<div>
										<p class="font-mono text-[7px] text-ash uppercase">Total</p>
										<p class="font-mono text-xs text-bone font-semibold mt-0.5">{item.inventory?.quantity}</p>
									</div>
									<div>
										<p class="font-mono text-[7px] text-ash uppercase">Hold</p>
										<p class="font-mono text-xs text-ash mt-0.5">{item.inventory?.reservedQuantity}</p>
									</div>
									<div>
										<p class="font-mono text-[7px] text-ash uppercase">Avail</p>
										<p class="font-mono text-xs text-volt font-bold mt-0.5">
											{item.inventory?.trackInventory ? item.inventory.availableQuantity : '∞'}
										</p>
									</div>
								</div>
							{/if}
						</div>

						<div class="mt-4 border-t border-charcoal/45 pt-3 flex justify-end">
							{#if !item.hasInventory}
								<AdminButton
									type="button"
									onclick={() => openDrawer(item.variantId, 'restock')}
									variant="volt"
									size="sm"
									class="w-full justify-center"
								>
									<Plus size={10} />
									Initialize
								</AdminButton>
							{:else}
								<div class="flex gap-2 w-full">
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
					</div>
				{/each}
			</div>

			<!-- Pagination Footer Panel -->
			<div class="flex flex-col gap-3 border-t border-charcoal p-5 font-mono text-[10px] tracking-widest text-ash uppercase sm:flex-row sm:items-center sm:justify-between">
				<p>
					Showing {offset + 1}-{Math.min(offset + limit, totalItems)} of {totalItems}
				</p>
				<div class="flex gap-2">
					{#if hasPreviousPage}
						<a
							href={getPageUrl(offset - limit)}
							class="border border-ash/30 px-4 py-2 transition-colors hover:border-volt hover:text-volt"
						>
							Previous
						</a>
					{/if}
					{#if hasNextPage}
						<a
							href={getPageUrl(offset + limit)}
							class="border border-ash/30 px-4 py-2 transition-colors hover:border-volt hover:text-volt"
						>
							Next
						</a>
					{/if}
				</div>
			</div>
		{:else}
			<div class="p-12 text-center" transition:fade={{ duration: 150 }}>
				<p class="font-display text-3xl text-bone uppercase">No inventory records found</p>
				<p class="mt-1.5 font-mono text-[9px] tracking-widest text-ash uppercase">
					Adjust filters or query parameters.
				</p>
			</div>
		{/if}
	</AdminCard>
</section>

<!-- bits-ui slide-over sheet drawer container -->
<Dialog.Root bind:open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
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

			<div class="fixed inset-y-0 right-0 z-50 flex max-w-full pl-10">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:fly={{ duration: 250, x: 400 }}
							class="w-screen max-w-md border-l border-charcoal bg-charcoal h-full flex flex-col shadow-2xl outline-none"
						>
							<!-- Drawer Header -->
							<div class="border-b border-charcoal/50 p-5 flex items-start justify-between">
								<div>
									<span class="font-mono text-[8px] tracking-[0.25em] text-volt uppercase">Variant detail</span>
									<h2 class="mt-1 font-display text-2xl text-bone uppercase leading-none truncate max-w-[280px]">
										{detail.product.name}
									</h2>
									<p class="mt-1 font-mono text-[9px] text-ash flex items-center gap-1.5">
										<span>Size {detail.variant.size}</span>
										<span class="inline-block h-2 w-2 rounded-full" style="background-color: {detail.variant.colorHex ?? '#000'}"></span>
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
							<div class="flex-1 overflow-y-auto p-5 space-y-6">
								{#if !detail.hasInventory}
									<!-- INITIALIZATION FORM -->
									<form method="POST" action="?/initialize" use:initializeEnhance class="space-y-4">
										<input type="hidden" name="variantId" value={$initializeForm.variantId} />

										<div class="border border-volt/20 bg-volt/5 p-4 flex gap-3 text-volt">
											<Info size={16} class="shrink-0 mt-0.5" />
											<div>
												<p class="font-mono text-[9px] tracking-wider uppercase font-bold">Uninitialized Stock</p>
												<p class="font-sans text-[11px] text-volt/80 mt-1 leading-relaxed">
													This variant does not have an active inventory tracking row. Initialize stock values to make it available for sale.
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
												label="Allow Backorder (Made-To-Order)"
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
											class="w-full justify-center mt-6"
											disabled={$initializeSubmitting}
										>
											{$initializeSubmitting ? 'Initializing...' : 'Initialize Stock'}
										</AdminButton>
									</form>
								{:else}
									<!-- INITIALIZED STOCK CARD -->
									<div class="grid grid-cols-3 gap-3 border border-charcoal bg-void/50 p-4 text-center">
										<div>
											<p class="font-mono text-[8px] text-ash uppercase">Total Physical</p>
											<p class="mt-1.5 font-display text-2xl text-bone leading-none">{detail.inventory?.quantity}</p>
										</div>
										<div>
											<p class="font-mono text-[8px] text-ash uppercase">Hold / Reserved</p>
											<p class="mt-1.5 font-display text-2xl text-ash leading-none">{detail.inventory?.reservedQuantity}</p>
										</div>
										<div>
											<p class="font-mono text-[8px] text-ash uppercase">Available</p>
											<p class="mt-1.5 font-display text-2xl text-volt leading-none">
												{detail.inventory?.trackInventory ? detail.inventory.availableQuantity : '∞'}
											</p>
										</div>
									</div>

									<!-- TAB HEADER SELECTORS -->
									<div class="flex border-b border-charcoal/50">
										{#each ['restock', 'adjust', 'settings', 'history'] as tab}
											<button
												type="button"
												onclick={() => (drawerTab = tab as any)}
												disabled={tab === 'adjust' && detail.inventory?.quantity === 0}
												class="flex-1 py-2.5 font-mono text-[9px] tracking-widest uppercase border-b-2 transition-colors {drawerTab === tab ? 'border-volt text-volt bg-charcoal/20' : 'border-transparent text-ash hover:text-bone'} disabled:opacity-30 disabled:cursor-not-allowed"
												title={tab === 'adjust' && detail.inventory?.quantity === 0 ? 'Cannot adjust stock when physical count is 0' : ''}
											>
												{tab}
											</button>
										{/each}
									</div>

									<!-- TABS ACTIONS FORMS -->
									{#if drawerTab === 'restock'}
										<div in:fly={{ y: 8, duration: 150, delay: 100 }} out:fade={{ duration: 100 }} class="space-y-4 pt-2">
											<form method="POST" action="?/restock" use:restockEnhance class="space-y-4">
												<input type="hidden" name="variantId" value={$restockForm.variantId} />
												<p class="font-sans text-xs text-ash/70">Increment physical stock levels. Quantity must be a positive integer.</p>

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
													<label for="restock-note" class="font-sans text-xs text-ash">Audit Log Note</label>
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
										<div in:fly={{ y: 8, duration: 150, delay: 100 }} out:fade={{ duration: 100 }} class="space-y-4 pt-2">
											<form method="POST" action="?/adjust" use:adjustEnhance class="space-y-4">
												<input type="hidden" name="variantId" value={$adjustForm.variantId} />
												<input type="hidden" name="quantityDelta" value={$adjustForm.quantityDelta} />
												<p class="font-sans text-xs text-ash/70">Select the adjustment action and specify the quantity to change.</p>

												<div class="flex rounded border border-charcoal bg-void p-1 gap-1">
													<button
														type="button"
														onclick={() => (adjustType = 'add')}
														class="flex-1 py-1.5 text-center font-mono text-[9px] tracking-widest uppercase transition-colors {adjustType === 'add' ? 'bg-volt text-void font-bold' : 'text-ash hover:text-bone'}"
													>
														Add Stock (+)
													</button>
													<button
														type="button"
														onclick={() => (adjustType = 'remove')}
														class="flex-1 py-1.5 text-center font-mono text-[9px] tracking-widest uppercase transition-colors {adjustType === 'remove' ? 'bg-red-500 text-bone font-bold' : 'text-ash hover:text-bone'}"
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
													<label for="adjust-note" class="font-sans text-xs text-ash">Reason / Note</label>
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
										<div in:fly={{ y: 8, duration: 150, delay: 100 }} out:fade={{ duration: 100 }} class="space-y-4 pt-2">
											<form method="POST" action="?/updateSettings" use:updateSettingsEnhance class="space-y-4">
												<input type="hidden" name="variantId" value={$updateSettingsForm.variantId} />
												<p class="font-sans text-xs text-ash/70">Configure stock tracking behavior and flash alert thresholds.</p>

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
										<div in:fly={{ y: 8, duration: 150, delay: 100 }} out:fade={{ duration: 100 }} class="space-y-4 pt-2">
											<div class="flex items-center gap-1.5 font-mono text-[9px] text-volt uppercase font-bold tracking-wider">
												<TrendingUp size={12} />
												<span>Stock Movement Audit Logs</span>
											</div>

											{#if detail.movements.length === 0}
												<p class="font-mono text-[10px] text-ash/40 py-5 text-center uppercase">No movements logged yet</p>
											{:else}
												<!-- Timeline list -->
												<div class="relative border-l border-charcoal/80 pl-4 ml-2 space-y-4 py-2">
													{#each detail.movements as move (move.id)}
														<div class="relative min-w-0">
															<!-- Dot icon -->
															<span class="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border {getMovementDotClass(move)}"></span>
															
															<div class="flex items-start justify-between gap-2 font-mono text-[9px] tracking-wider">
																<span class="font-bold text-bone uppercase">{move.type}</span>
																<span class="text-ash/40 shrink-0">{formatDateTime(move.createdAt)}</span>
															</div>

															<div class="mt-1 font-mono text-xs flex items-center gap-2">
																{#if move.quantityDelta !== 0}
																	<span class={move.quantityDelta > 0 ? 'text-volt font-semibold' : 'text-red-400 font-semibold'}>
																		{move.quantityDelta > 0 ? '+' : ''}{move.quantityDelta} qty
																	</span>
																	<span class="text-ash/40 font-normal">→ {move.quantityAfter} total</span>
																{/if}
																{#if move.reservedQuantityDelta !== 0}
																	<span class={move.reservedQuantityDelta > 0 ? 'text-amber-300' : 'text-ash'}>
																		{move.reservedQuantityDelta > 0 ? '+' : ''}{move.reservedQuantityDelta} res
																	</span>
																	<span class="text-ash/40 font-normal">→ {move.reservedQuantityAfter} reserved</span>
																{/if}
															</div>

															{#if move.note}
																<p class="mt-1.5 font-sans text-xs text-ash bg-void/30 border border-charcoal/30 px-2 py-1.5 whitespace-pre-line rounded">
																	{move.note}
																</p>
															{/if}
															{#if move.referenceId}
																<div class="mt-1 font-mono text-[8px] text-ash/50 flex items-center gap-1.5">
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
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- Global Toast message adapter -->
<AdminToast
	message={toastMessage}
	type="success"
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
