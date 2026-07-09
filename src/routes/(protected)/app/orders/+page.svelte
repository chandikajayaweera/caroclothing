<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { goto } from '$app/navigation';
	import { Download, Printer, X, Clock } from 'lucide-svelte';
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	const statusOptions = [
		{ value: '', label: 'All statuses' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'confirmed', label: 'Confirmed' },
		{ value: 'processing', label: 'Processing' },
		{ value: 'shipped', label: 'Shipped' },
		{ value: 'delivered', label: 'Delivered' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'refunded', label: 'Refunded' }
	];
	const paymentStatuses = ['pending', 'authorized', 'captured', 'failed'] as const;
	const paymentMethods = [
		'card',
		'bank_transfer',
		'cash_on_delivery',
		'payhere',
		'ipg',
		'webxpay'
	] as const;

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString()}`;
	}

	function formatDate(value: Date | string | null): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function formatStatus(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function statusClass(status: string): string {
		if (status === 'cancelled' || status === 'refunded' || status === 'failed') {
			return 'text-red-400';
		}
		if (status === 'delivered' || status === 'captured' || status === 'authorized') {
			return 'text-volt';
		}
		return 'text-ash';
	}

	// ── Dialog States ───────────────────────────────────────────────────────
	let fulfillmentModalOpen = $state(false);
	let paymentModalOpen = $state(false);
	let refundModalOpen = $state(false);
	let expiredHoldsModalOpen = $state(false);

	// ── Superforms ──────────────────────────────────────────────────────────

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// 1. Bulk Transition
	const bulkTransitionSuperform = superForm(
		initialForm(() => data.bulkTransitionForm!),
		{
			id: 'bulkTransitionOrderStatus',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					selectedOrderIds = [];
					toastMessage = form.message ?? 'Bulk status updated.';
				}
			}
		}
	);
	const {
		form: bulkForm,
		enhance: bulkEnhance,
		submitting: bulkSubmitting,
		message: bulkMessage
	} = bulkTransitionSuperform;

	// 2. Update Fulfillment
	const updateFulfillmentSuperform = superForm(
		initialForm(() => data.updateFulfillmentForm!),
		{
			id: 'updateOrderFulfillment',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Fulfillment details updated.';
					fulfillmentModalOpen = false;
				}
			}
		}
	);
	const {
		form: fulfillmentForm,
		enhance: fulfillmentEnhance,
		errors: fulfillmentErrors,
		submitting: fulfillmentSubmitting,
		message: fulfillmentMessage
	} = updateFulfillmentSuperform;

	// 3. Record Payment
	const recordPaymentSuperform = superForm(
		initialForm(() => data.recordPaymentForm!),
		{
			id: 'recordPayment',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Payment recorded.';
					paymentModalOpen = false;
				}
			}
		}
	);
	const {
		form: paymentForm,
		enhance: paymentEnhance,
		errors: paymentErrors,
		submitting: paymentSubmitting,
		message: paymentMessage
	} = recordPaymentSuperform;

	// 4. Record Refund
	const recordRefundSuperform = superForm(
		initialForm(() => data.recordRefundForm!),
		{
			id: 'recordRefund',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Refund recorded.';
					refundModalOpen = false;
				}
			}
		}
	);
	const {
		form: refundForm,
		enhance: refundEnhance,
		errors: refundErrors,
		submitting: refundSubmitting,
		message: refundMessage
	} = recordRefundSuperform;

	// 5. Cancel Expired Holds
	const cancelExpiredSuperform = superForm(
		initialForm(() => data.cancelExpiredForm!),
		{
			id: 'cancelExpiredPendingOrders',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Expired holds cancelled.';
					expiredHoldsModalOpen = false;
				}
			}
		}
	);
	const {
		enhance: cancelExpiredEnhance,
		submitting: cancelExpiredSubmitting,
		message: cancelExpiredMessage
	} = cancelExpiredSuperform;

	// Toast notification
	let toastMessage = $state<string | null>(null);
	const combinedMessage = $derived(
		$bulkMessage ||
			$fulfillmentMessage ||
			$paymentMessage ||
			$refundMessage ||
			$cancelExpiredMessage ||
			actionData?.form?.message
	);

	$effect(() => {
		if (combinedMessage) {
			toastMessage = combinedMessage;
		}
	});

	// ── Live Filters ────────────────────────────────────────────────────────
	function getInitialFilter<T>(getValue: () => T): T {
		return getValue();
	}

	let queryInput = $state(getInitialFilter(() => data.filters?.query ?? ''));
	let userIdInput = $state(getInitialFilter(() => data.filters?.userId ?? ''));
	let statusInput = $state(getInitialFilter(() => data.filters?.status ?? ''));
	let expiredInput = $state(getInitialFilter(() => data.filters?.paymentExpiredOnly ?? false));

	let showFilters = $state(false);

	$effect(() => {
		queryInput = data.filters?.query ?? '';
		userIdInput = data.filters?.userId ?? '';
		statusInput = data.filters?.status ?? '';
		expiredInput = data.filters?.paymentExpiredOnly ?? false;
	});

	// Automatically open filters if filters are active
	const hasActiveFilters = $derived(
		userIdInput !== '' || statusInput !== '' || expiredInput === true
	);

	$effect(() => {
		if (hasActiveFilters) {
			showFilters = true;
		}
	});

	function applyFilters() {
		const url = new URL(page.url);
		if (queryInput) {
			url.searchParams.set('query', queryInput);
		} else {
			url.searchParams.delete('query');
		}
		if (userIdInput) {
			url.searchParams.set('userId', userIdInput);
		} else {
			url.searchParams.delete('userId');
		}
		if (statusInput) {
			url.searchParams.set('status', statusInput);
		} else {
			url.searchParams.delete('status');
		}
		if (expiredInput) {
			url.searchParams.set('paymentExpiredOnly', 'true');
		} else {
			url.searchParams.delete('paymentExpiredOnly');
		}
		url.searchParams.set('limit', String(data.filters?.limit ?? 50));
		url.searchParams.delete('offset');
		const search = url.searchParams.toString();

		goto(resolve(search ? `/app/orders?${search}` : '/app/orders'), {
			keepFocus: true,
			replaceState: true
		});
	}

	let debounceTimer: number;
	function handleSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			applyFilters();
		}, 300) as unknown as number;
	}

	function clearFilters() {
		queryInput = '';
		userIdInput = '';
		statusInput = '';
		expiredInput = false;
		const url = new URL(page.url);
		url.searchParams.delete('query');
		url.searchParams.delete('userId');
		url.searchParams.delete('status');
		url.searchParams.delete('paymentExpiredOnly');
		url.searchParams.delete('offset');
		const search = url.searchParams.toString();
		goto(resolve(search ? `/app/orders?${search}` : '/app/orders'), { noScroll: true });
	}

	function triggerFormSubmit(event: Event) {
		const form = (event.target as HTMLElement).closest('form');
		if (form) form.requestSubmit();
	}

	// ── Analytics Summary ───────────────────────────────────────────────────
	const analytics = $derived(
		data.analytics ?? {
			totalSales: 0,
			pendingFulfillmentCount: 0,
			openOrdersCount: 0,
			unpaidHoldsCount: 0
		}
	);

	const stats = $derived({
		total: data.orders?.total ?? 0,
		active: analytics.openOrdersCount,
		inactive: analytics.pendingFulfillmentCount
	});

	const kicker = $derived(
		`Commerce · Sales: ${formatMoney(analytics.totalSales)} · Holds: ${analytics.unpaidHoldsCount}`
	);

	// ── Bulk Selections ─────────────────────────────────────────────────────
	let selectedOrderIds = $state<string[]>([]);
	const allOrderIds = $derived(data.orders?.items?.map((o) => o.id) ?? []);
	const isAllSelected = $derived(
		allOrderIds.length > 0 && allOrderIds.every((id) => selectedOrderIds.includes(id))
	);

	function toggleSelectAll() {
		if (isAllSelected) {
			selectedOrderIds = [];
		} else {
			selectedOrderIds = [...allOrderIds];
		}
	}

	function toggleSelect(id: string) {
		if (selectedOrderIds.includes(id)) {
			selectedOrderIds = selectedOrderIds.filter((x) => x !== id);
		} else {
			selectedOrderIds = [...selectedOrderIds, id];
		}
	}

	// Trigger printing selected orders
	function printSelected() {
		if (selectedOrderIds.length === 0) return;
		const url = resolve('/app/orders/print') + `?orderIds=${selectedOrderIds.join(',')}`;
		window.open(url, '_blank');
	}

	// Trigger CSV export of selected orders
	function exportSelectedCsv() {
		if (selectedOrderIds.length === 0) return;
		const url = resolve('/app/orders/export') + `?orderIds=${selectedOrderIds.join(',')}`;
		window.open(url, '_blank');
	}

	// Trigger CSV export of all matching current filters
	function exportFilteredCsv() {
		const params = new URL(page.url);
		if (queryInput) {
			params.searchParams.set('query', queryInput);
		} else {
			params.searchParams.delete('query');
		}
		if (userIdInput) {
			params.searchParams.set('userId', userIdInput);
		} else {
			params.searchParams.delete('userId');
		}
		if (statusInput) {
			params.searchParams.set('status', statusInput);
		} else {
			params.searchParams.delete('status');
		}
		if (expiredInput) {
			params.searchParams.set('paymentExpiredOnly', 'true');
		} else {
			params.searchParams.delete('paymentExpiredOnly');
		}

		window.open(resolve('/app/orders/export') + params.search, '_blank');
	}

	const tableHeaders = [
		{ label: '', class: 'w-10 text-center' },
		{ label: 'Order' },
		{ label: 'Status' },
		{ label: 'Total' },
		{ label: 'Items' },
		{ label: 'Created' },
		{ label: 'Tracking' },
		{ label: 'Actions', class: 'text-right' }
	];
</script>

<svelte:head>
	<title>Orders | Caro Admin</title>
	<meta
		name="description"
		content="Manage customer orders, payment state, tracking data, and order status transitions."
	/>
</svelte:head>

{#if toastMessage}
	<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />
{/if}

<AdminListLayout
	title="Orders"
	{kicker}
	loading={false}
	{stats}
	bind:query={queryInput}
	bind:showFilters
	{hasActiveFilters}
	totalItems={data.orders?.total ?? 0}
	limit={data.filters?.limit ?? 50}
	offset={data.filters?.offset ?? 0}
	{tableHeaders}
	items={data.orders?.items ?? []}
	onclearfilters={clearFilters}
	searchPlaceholder="Order or tracking number..."
>
	{#snippet headerActions()}
		<div class="mt-5 flex flex-wrap gap-2 md:mt-0">
			<AdminButton
				type="button"
				variant="outline"
				onclick={exportFilteredCsv}
				class="border-volt/30 bg-volt/10 text-volt hover:bg-volt hover:text-void"
			>
				Export Filtered CSV
			</AdminButton>
			<AdminButton type="button" variant="volt" onclick={() => (expiredHoldsModalOpen = true)}>
				Cancel Expired Holds
			</AdminButton>
			<AdminButton type="button" variant="charcoal" onclick={() => (fulfillmentModalOpen = true)}>
				Update Fulfillment
			</AdminButton>
			<AdminButton type="button" variant="charcoal" onclick={() => (paymentModalOpen = true)}>
				Record Payment
			</AdminButton>
			<AdminButton type="button" variant="charcoal" onclick={() => (refundModalOpen = true)}>
				Record Refund
			</AdminButton>
		</div>
	{/snippet}

	{#snippet advancedFilters()}
		<div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<AdminSelect
				label="Order Status"
				name="status"
				bind:value={statusInput}
				options={statusOptions}
				onchange={(e) => {
					setTimeout(() => {
						triggerFormSubmit(e);
					}, 0);
				}}
			/>

			<AdminInput
				label="Customer User ID"
				name="userId"
				bind:value={userIdInput}
				placeholder="Filter by customer user ID..."
				oninput={handleSearchInput}
			/>

			<div class="flex items-end pb-1.5">
				<AdminToggle
					label="Payment Expired Holds Only"
					name="paymentExpiredOnly"
					bind:checked={expiredInput}
					onclick={(e) => {
						setTimeout(() => {
							triggerFormSubmit(e);
						}, 0);
					}}
				/>
			</div>
		</div>
	{/snippet}

	{#snippet row(order)}
		{@const availableTransitions = order.availableTransitions ?? []}
		<tr class="border-b border-charcoal/70 last:border-b-0 hover:bg-charcoal/5">
			<td class="w-10 px-5 py-4 text-center">
				<input
					type="checkbox"
					checked={selectedOrderIds.includes(order.id)}
					onchange={() => toggleSelect(order.id)}
					class="accent-volt"
				/>
			</td>
			<td class="px-5 py-4">
				<div class="flex flex-col gap-1">
					<a
						href={resolve(`/app/orders/${order.id}`)}
						class="font-mono text-xs text-volt uppercase transition-colors hover:text-bone hover:underline"
					>
						{order.orderNumber}
					</a>
					<span class="max-w-60 truncate font-mono text-[10px] text-ash">
						{order.userId ?? 'Guest order'}
					</span>
				</div>
			</td>
			<td class="px-5 py-4">
				<span class="font-mono text-[10px] tracking-widest uppercase {statusClass(order.status)}">
					{formatStatus(order.status)}
				</span>
			</td>
			<td class="px-5 py-4 font-mono text-xs text-bone">
				{formatMoney(order.totalAmount)}
			</td>
			<td class="px-5 py-4 font-mono text-xs text-bone">{order.itemCount}</td>
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatDate(order.createdAt)}
			</td>
			<td class="px-5 py-4">
				<div class="flex flex-col gap-1 font-mono text-[10px] text-ash">
					<span>{order.trackingNumber ?? 'No tracking'}</span>
					{#if order.trackingCarrier}
						<span class="text-ash/60">{order.trackingCarrier}</span>
					{/if}
				</div>
			</td>
			<td class="px-5 py-4 text-right">
				<div class="flex items-center justify-end gap-3">
					{#if availableTransitions.length > 0}
						<form method="POST" action="?/transitionStatus" class="flex items-center gap-2">
							<input type="hidden" name="orderId" value={order.id} />
							<select
								name="toStatus"
								class="border border-charcoal bg-void px-2 py-2 font-mono text-[10px] text-bone outline-none focus:border-volt"
							>
								{#each availableTransitions as status (status)}
									<option value={status}>{formatStatus(status)}</option>
								{/each}
							</select>
							<button
								type="submit"
								class="font-mono text-[10px] tracking-widest text-volt uppercase transition-colors hover:text-bone"
							>
								Apply
							</button>
						</form>
					{:else}
						<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">
							Terminal
						</span>
					{/if}
					<a
						href={resolve(`/app/orders/${order.id}`)}
						class="border border-ash/30 px-3 py-2 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
					>
						Manage
					</a>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet card(order)}
		{@const availableTransitions = order.availableTransitions ?? []}
		<AdminCard>
			<div class="flex items-start justify-between gap-4">
				<div class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={selectedOrderIds.includes(order.id)}
						onchange={() => toggleSelect(order.id)}
						class="accent-volt"
					/>
					<div>
						<a
							href={resolve(`/app/orders/${order.id}`)}
							class="animate-none font-mono text-sm text-volt uppercase hover:underline"
						>
							{order.orderNumber}
						</a>
						<p class="mt-0.5 min-w-50 truncate font-mono text-[10px] text-ash">
							{order.userId ?? 'Guest order'}
						</p>
					</div>
				</div>
				<span class="font-mono text-[10px] tracking-widest uppercase {statusClass(order.status)}">
					{formatStatus(order.status)}
				</span>
			</div>

			<div
				class="mt-4 grid grid-cols-2 gap-2 border-t border-charcoal/50 pt-3 font-mono text-[10px]"
			>
				<div>
					<p class="text-[8px] tracking-wider text-ash/60 uppercase">Total Amount</p>
					<p class="mt-0.5 font-medium text-bone">{formatMoney(order.totalAmount)}</p>
				</div>
				<div>
					<p class="text-[8px] tracking-wider text-ash/60 uppercase">Items</p>
					<p class="mt-0.5 font-medium text-bone">{order.itemCount} items</p>
				</div>
				<div class="col-span-2">
					<p class="text-[8px] tracking-wider text-ash/60 uppercase">Tracking</p>
					<p class="mt-0.5 font-medium text-bone">
						{order.trackingNumber ?? 'No tracking'}
						{#if order.trackingCarrier}
							<span class="text-ash/60">({order.trackingCarrier})</span>
						{/if}
					</p>
				</div>
			</div>

			<div class="mt-4 flex items-center justify-between border-t border-charcoal/50 pt-3">
				<span class="font-mono text-[9px] text-ash/60">{formatDate(order.createdAt)}</span>
				<div class="flex items-center gap-2">
					{#if availableTransitions.length > 0}
						<form method="POST" action="?/transitionStatus" class="flex items-center gap-1.5">
							<input type="hidden" name="orderId" value={order.id} />
							<select
								name="toStatus"
								class="border border-charcoal bg-void px-1.5 py-1 font-mono text-[9px] text-bone outline-none focus:border-volt"
							>
								{#each availableTransitions as status (status)}
									<option value={status}>{formatStatus(status)}</option>
								{/each}
							</select>
							<button
								type="submit"
								class="font-mono text-[9px] tracking-widest text-volt uppercase hover:text-bone"
							>
								Apply
							</button>
						</form>
					{/if}
					<a
						href={resolve(`/app/orders/${order.id}`)}
						class="border border-ash/30 px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
					>
						Manage
					</a>
				</div>
			</div>
		</AdminCard>
	{/snippet}
</AdminListLayout>

<!-- Bulk Transition Drawer -->
{#if selectedOrderIds.length > 0}
	<div class="fixed bottom-6 left-1/2 z-40 w-full max-w-4xl -translate-x-1/2 px-4">
		<div
			class="flex flex-col gap-4 border border-volt bg-void/95 p-4 shadow-2xl backdrop-blur-md md:flex-row md:items-center md:justify-between"
		>
			<div
				class="flex items-center justify-between border-b border-charcoal pb-2 md:border-b-0 md:pb-0"
			>
				<span class="font-mono text-xs font-bold text-volt uppercase">
					{selectedOrderIds.length} orders selected
				</span>
				<div class="flex gap-2">
					<button
						onclick={toggleSelectAll}
						class="font-mono text-[10px] tracking-wider text-ash uppercase underline hover:text-bone"
					>
						{isAllSelected ? 'Select None' : 'Select All'}
					</button>
					<button
						onclick={() => (selectedOrderIds = [])}
						class="text-ash hover:text-bone md:hidden"
					>
						<X size={16} />
					</button>
				</div>
			</div>

			<form
				method="POST"
				action="?/bulkTransition"
				use:bulkEnhance
				class="flex flex-wrap items-center gap-3 border-b border-charcoal pb-3 md:border-b-0 md:pb-0"
			>
				<input type="hidden" name="orderIds" value={selectedOrderIds.join(',')} />

				<select
					name="toStatus"
					bind:value={$bulkForm.toStatus}
					class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-[11px] text-bone outline-none focus:border-volt"
					required
				>
					<option value="" disabled selected>Select new status...</option>
					{#each statusOptions.filter((o) => o.value !== '') as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>

				<input
					name="note"
					bind:value={$bulkForm.note}
					placeholder="Internal note"
					class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-[11px] text-bone outline-none focus:border-volt"
				/>

				<button
					type="submit"
					disabled={$bulkSubmitting}
					class="bg-volt px-4 py-2 font-mono text-[10px] font-bold text-void uppercase transition-colors hover:bg-bone disabled:opacity-40"
				>
					{$bulkSubmitting ? 'Updating...' : 'Update Status'}
				</button>
			</form>

			<div class="flex items-center gap-2">
				<button
					onclick={exportSelectedCsv}
					class="flex items-center gap-1 border border-ash/30 px-3 py-2 font-mono text-[10px] text-ash uppercase transition-colors hover:border-volt hover:text-volt"
				>
					<Download size={12} />
					CSV
				</button>
				<button
					onclick={printSelected}
					class="flex items-center gap-1 bg-bone px-3 py-2 font-mono text-[10px] font-bold text-void uppercase transition-colors hover:bg-volt"
				>
					<Printer size={12} />
					Print packing slips
				</button>
				<button
					onclick={() => (selectedOrderIds = [])}
					class="hidden text-ash hover:text-bone md:block"
					title="Clear selection"
				>
					<X size={16} />
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── DIALOG MODALS ──────────────────────────────────────────────────────── -->

<!-- UPDATE FULFILLMENT DRAWER -->
<AdminDrawer
	bind:open={fulfillmentModalOpen}
	title="Update Fulfillment"
	description="Assign tracking details and carrier status to an order."
>
	<form
		id="updateFulfillmentForm"
		method="POST"
		action="?/updateFulfillment"
		use:fulfillmentEnhance
		class="flex flex-col gap-5"
	>
		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Order ID *</span>
			<input
				name="orderId"
				bind:value={$fulfillmentForm.orderId}
				placeholder="e.g. ord_..."
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			/>
			{#if $fulfillmentErrors.orderId}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$fulfillmentErrors.orderId[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Tracking Number</span>
			<input
				name="trackingNumber"
				bind:value={$fulfillmentForm.trackingNumber}
				placeholder="e.g. TRK123456789"
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			/>
			{#if $fulfillmentErrors.trackingNumber}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$fulfillmentErrors.trackingNumber[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Carrier</span>
			<input
				name="trackingCarrier"
				bind:value={$fulfillmentForm.trackingCarrier}
				placeholder="e.g. Pronto, Domex, DHL"
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			/>
			{#if $fulfillmentErrors.trackingCarrier}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$fulfillmentErrors.trackingCarrier[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Tracking URL</span>
			<input
				name="trackingUrl"
				bind:value={$fulfillmentForm.trackingUrl}
				placeholder="e.g. https://..."
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			/>
			{#if $fulfillmentErrors.trackingUrl}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$fulfillmentErrors.trackingUrl[0]}
				</span>
			{/if}
		</label>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="updateFulfillmentForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$fulfillmentSubmitting}
		>
			{#if $fulfillmentSubmitting}Saving...{:else}Save Tracking{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (fulfillmentModalOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- RECORD PAYMENT DRAWER -->
<AdminDrawer
	bind:open={paymentModalOpen}
	title="Record Payment"
	description="Record manual payments, Bank Transfers, or override gateway status."
>
	<form
		id="recordPaymentForm"
		method="POST"
		action="?/recordPayment"
		use:paymentEnhance
		class="flex flex-col gap-5"
	>
		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Order ID *</span>
			<input
				name="orderId"
				bind:value={$paymentForm.orderId}
				placeholder="e.g. ord_..."
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			/>
			{#if $paymentErrors.orderId}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$paymentErrors.orderId[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Payment Status *</span
			>
			<select
				name="status"
				bind:value={$paymentForm.status}
				class="w-full animate-none border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			>
				{#each paymentStatuses as status (status)}
					<option value={status}>{formatStatus(status)}</option>
				{/each}
			</select>
			{#if $paymentErrors.status}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$paymentErrors.status[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Method</span>
			<select
				name="method"
				bind:value={$paymentForm.method}
				class="w-full animate-none border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt"
			>
				<option value="">Existing payment method</option>
				{#each paymentMethods as method (method)}
					<option value={method}>{formatStatus(method)}</option>
				{/each}
			</select>
			{#if $paymentErrors.method}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$paymentErrors.method[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Amount (Optional)</span
			>
			<input
				name="amount"
				type="number"
				min="1"
				bind:value={$paymentForm.amount}
				placeholder="e.g. 1500"
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			/>
			{#if $paymentErrors.amount}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$paymentErrors.amount[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Transaction ID</span>
			<input
				name="transactionId"
				bind:value={$paymentForm.transactionId}
				placeholder="e.g. tx_..."
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			/>
			{#if $paymentErrors.transactionId}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$paymentErrors.transactionId[0]}
				</span>
			{/if}
		</label>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="recordPaymentForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$paymentSubmitting}
		>
			{#if $paymentSubmitting}Recording...{:else}Record Payment{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (paymentModalOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- RECORD REFUND DRAWER -->
<AdminDrawer
	bind:open={refundModalOpen}
	title="Record Refund"
	description="Record partial or full refunds on a captured transaction."
>
	<form
		id="recordRefundForm"
		method="POST"
		action="?/recordRefund"
		use:refundEnhance
		class="flex flex-col gap-5"
	>
		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Payment ID *</span>
			<input
				name="paymentId"
				bind:value={$refundForm.paymentId}
				placeholder="e.g. pay_..."
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			/>
			{#if $refundErrors.paymentId}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$refundErrors.paymentId[0]}
				</span>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Refund Amount *</span>
			<input
				name="refundAmount"
				type="number"
				min="1"
				bind:value={$refundForm.refundAmount}
				placeholder="Refund amount in LKR"
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			/>
			{#if $refundErrors.refundAmount}
				<span class="mt-0.5 font-sans text-xs text-red-400">
					{$refundErrors.refundAmount[0]}
				</span>
			{/if}
		</label>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="recordRefundForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$refundSubmitting}
		>
			{#if $refundSubmitting}Refunding...{:else}Record Refund{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (refundModalOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- CANCEL EXPIRED HOLDS DIALOG -->
<Dialog.Root bind:open={expiredHoldsModalOpen}>
	{#if expiredHoldsModalOpen}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-100 bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-101 flex items-center justify-center p-4">
				<Dialog.Content
					class="w-full max-w-md rounded-xs border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
				>
					{#snippet child({ props })}
						<div {...props} transition:fade={{ duration: 150 }} class="space-y-6">
							<div>
								<div class="mb-2 flex items-center gap-3 text-volt">
									<Clock size={20} />
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										Cancel Expired Holds
									</Dialog.Title>
								</div>
								<Dialog.Description class="mt-2 font-sans text-xs leading-relaxed text-ash">
									Are you sure you want to cancel expired pending reserve holds? This will release
									reserved stock back to the inventory catalog.
								</Dialog.Description>
							</div>

							<form
								method="POST"
								action="?/cancelExpired"
								use:cancelExpiredEnhance
								class="flex flex-col gap-4"
							>
								<input type="hidden" name="limit" value="50" />

								<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
									<AdminButton
										type="button"
										variant="charcoal"
										onclick={() => (expiredHoldsModalOpen = false)}
									>
										Cancel
									</AdminButton>
									<AdminButton type="submit" variant="volt" disabled={$cancelExpiredSubmitting}>
										{#if $cancelExpiredSubmitting}Cancelling...{:else}Confirm Release{/if}
									</AdminButton>
								</div>
							</form>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
