<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { afterNavigate, goto } from '$app/navigation';
	import { CreditCard, Download, Printer, RotateCcw, TimerOff, Truck, X } from 'lucide-svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import AdminConfirmDialog from '$lib/components/admin/AdminConfirmDialog.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCheckbox from '$lib/components/admin/AdminCheckbox.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import { orderStatusVariant } from '$lib/shared/admin/status';
	import {
		formatAdminMoney,
		formatAdminDateTime,
		formatAdminStatus
	} from '$lib/shared/admin/format';
	import { adminPaymentMethodOptions, adminPaymentStatusOptions } from '$lib/shared/admin/options';

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
	const paymentStatuses = adminPaymentStatusOptions.map((option) => option.value);
	const paymentMethods = adminPaymentMethodOptions.map((option) => option.value);

	// ── Dialog States ───────────────────────────────────────────────────────
	let fulfillmentModalOpen = $state(false);
	let paymentModalOpen = $state(false);
	let refundModalOpen = $state(false);
	let expiredHoldsModalOpen = $state(false);
	let cancelExpiredForm = $state<HTMLFormElement | null>(null);
	let singleTransitionModalOpen = $state(false);
	let bulkTransitionConfirmOpen = $state(false);
	let bulkTransitionFormElement = $state<HTMLFormElement | null>(null);
	type OrderItem = PageData['orders']['items'][number];
	let pendingSingleTransition = $state<{
		orderId: string;
		orderNumber: string;
		fromStatus: string;
		toStatus: string;
	} | null>(null);
	let rowTransitionSelections = $state<Record<string, string>>({});
	let singleTransitionNote = $state('');

	// ── Superforms ──────────────────────────────────────────────────────────

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const transitionStatusSuperform = superForm(
		initialForm(() => data.transitionStatusForm!),
		{
			id: 'transitionOrderStatus',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Order status updated.';
					singleTransitionModalOpen = false;
					if (pendingSingleTransition) {
						rowTransitionSelections[pendingSingleTransition.orderId] = '';
					}
					pendingSingleTransition = null;
				}
			}
		}
	);
	const {
		enhance: transitionEnhance,
		submitting: transitionSubmitting,
		message: transitionMessage
	} = transitionStatusSuperform;

	// 1. Bulk Transition
	const bulkTransitionSuperform = superForm(
		initialForm(() => data.bulkTransitionForm!),
		{
			id: 'bulkTransitionOrderStatus',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					selectedOrderIds = [];
					bulkTransitionConfirmOpen = false;
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
		$transitionMessage ||
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
		`Commerce · Sales: ${formatAdminMoney(analytics.totalSales)} · Holds: ${analytics.unpaidHoldsCount}`
	);

	// ── Bulk Selections ─────────────────────────────────────────────────────
	let selectedOrderIds = $state<string[]>([]);
	const allOrderIds = $derived(data.orders?.items?.map((o) => o.id) ?? []);
	const isAllSelected = $derived(
		allOrderIds.length > 0 && allOrderIds.every((id) => selectedOrderIds.includes(id))
	);
	const commonBulkTransitions = $derived.by(() => {
		const selectedOrders = (data.orders?.items ?? []).filter((order) =>
			selectedOrderIds.includes(order.id)
		);
		if (selectedOrders.length === 0) return [];
		const first = selectedOrders[0]?.availableTransitions ?? [];
		return first.filter((status) =>
			selectedOrders.every((order) => (order.availableTransitions ?? []).includes(status))
		);
	});

	afterNavigate(() => {
		selectedOrderIds = [];
		rowTransitionSelections = {};
	});

	function setRowTransition(orderId: string, event: Event) {
		rowTransitionSelections[orderId] = (event.currentTarget as HTMLSelectElement).value;
	}

	function promptSingleTransition(order: OrderItem) {
		const toStatus = rowTransitionSelections[order.id];
		if (!toStatus) return;
		pendingSingleTransition = {
			orderId: order.id,
			orderNumber: order.orderNumber,
			fromStatus: order.status,
			toStatus
		};
		singleTransitionNote = '';
		singleTransitionModalOpen = true;
	}

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

	function confirmCancelExpired() {
		cancelExpiredForm?.requestSubmit();
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
	<AdminToast
		message={toastMessage}
		type={page.status >= 400 ? 'error' : 'success'}
		onclose={() => (toastMessage = null)}
	/>
{/if}

<AdminListLayout
	title="Orders"
	{kicker}
	loading={false}
	metrics={[
		{ label: 'Filtered Orders', value: stats.total },
		{ label: 'Open Orders', value: stats.active, tone: 'info' },
		{ label: 'Pending Fulfillment', value: stats.inactive, tone: 'warning' },
		{ label: 'Unpaid Holds', value: analytics.unpaidHoldsCount, tone: 'danger' }
	]}
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
		<AdminActionToolbar
			ariaLabel="Order page actions"
			menuItems={[
				{
					label: 'Export filtered CSV',
					description: 'Download every order matching current filters.',
					icon: Download,
					onselect: exportFilteredCsv
				},
				{
					label: 'Record payment',
					description: 'Attach a manual payment to an order.',
					icon: CreditCard,
					onselect: () => (paymentModalOpen = true)
				},
				{
					label: 'Record refund',
					description: 'Register a refund against a captured payment.',
					icon: RotateCcw,
					onselect: () => (refundModalOpen = true)
				},
				{
					label: 'Cancel expired holds',
					description: 'Release all expired unpaid checkout holds.',
					icon: TimerOff,
					tone: 'danger',
					onselect: () => (expiredHoldsModalOpen = true)
				}
			]}
		>
			{#snippet primary()}
				<AdminButton type="button" variant="volt" onclick={() => (fulfillmentModalOpen = true)}>
					<Truck size={15} aria-hidden="true" />
					Update fulfillment
				</AdminButton>
			{/snippet}
		</AdminActionToolbar>
	{/snippet}

	{#snippet advancedFilters()}
		<AdminFilterBar cols={3} class="mt-2">
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
		</AdminFilterBar>
	{/snippet}

	{#snippet row(order)}
		{@const availableTransitions = order.availableTransitions ?? []}
		<tr class="border-b border-charcoal/70 last:border-b-0 hover:bg-charcoal/5">
			<td class="w-10 px-5 py-4 text-center">
				<AdminCheckbox
					checked={selectedOrderIds.includes(order.id)}
					onchange={() => toggleSelect(order.id)}
					ariaLabel={`Select order ${order.orderNumber}`}
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
				<AdminBadge variant={orderStatusVariant(order.status)} size="sm">
					{formatAdminStatus(order.status)}
				</AdminBadge>
			</td>
			<td class="px-5 py-4 font-mono text-xs text-bone">
				{formatAdminMoney(order.totalAmount)}
			</td>
			<td class="px-5 py-4 font-mono text-xs text-bone">{order.itemCount}</td>
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatAdminDateTime(order.createdAt)}
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
						<div class="flex items-center gap-2">
							<AdminSelect
								name={`transition-${order.id}`}
								value={rowTransitionSelections[order.id] ?? ''}
								onchange={(event) => setRowTransition(order.id, event)}
								class="min-w-32"
							>
								<option value="" disabled selected>Select status</option>
								{#each availableTransitions as status (status)}
									<option value={status}>{formatAdminStatus(status)}</option>
								{/each}
							</AdminSelect>
							<AdminButton
								type="button"
								variant="outline"
								size="sm"
								disabled={!rowTransitionSelections[order.id]}
								onclick={() => promptSingleTransition(order)}
							>
								Review
							</AdminButton>
						</div>
					{:else}
						<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">
							Terminal
						</span>
					{/if}
					<AdminButton href={resolve(`/app/orders/${order.id}`)} variant="outline" size="sm">
						Manage
					</AdminButton>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet card(order)}
		{@const availableTransitions = order.availableTransitions ?? []}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex min-w-0 items-start justify-between gap-3">
					<div class="flex min-w-0 items-center gap-2">
						<AdminCheckbox
							checked={selectedOrderIds.includes(order.id)}
							onchange={() => toggleSelect(order.id)}
							ariaLabel={`Select order ${order.orderNumber}`}
						/>
						<div class="min-w-0">
							<a
								href={resolve(`/app/orders/${order.id}`)}
								class="animate-none font-mono text-sm text-volt uppercase hover:underline"
							>
								{order.orderNumber}
							</a>
							<p class="mt-0.5 max-w-full truncate font-mono text-[10px] text-ash">
								{order.userId ?? 'Guest order'}
							</p>
						</div>
					</div>
					<AdminBadge variant={orderStatusVariant(order.status)} size="sm">
						{formatAdminStatus(order.status)}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<AdminMetaGrid cols={2} class="border-t border-charcoal/50 pt-3">
					<div>
						<p class="text-[8px] tracking-wider text-ash/60 uppercase">Total Amount</p>
						<p class="mt-0.5 font-medium text-bone">{formatAdminMoney(order.totalAmount)}</p>
					</div>
					<div>
						<p class="text-[8px] tracking-wider text-ash/60 uppercase">Items</p>
						<p class="mt-0.5 font-medium text-bone">{order.itemCount} items</p>
					</div>
					<div class="min-[430px]:col-span-2">
						<p class="text-[8px] tracking-wider text-ash/60 uppercase">Tracking</p>
						<p class="mt-0.5 font-medium text-bone">
							{order.trackingNumber ?? 'No tracking'}
							{#if order.trackingCarrier}
								<span class="text-ash/60">({order.trackingCarrier})</span>
							{/if}
						</p>
					</div>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<div class="grid gap-3 border-t border-charcoal/50 pt-3">
					<span class="font-mono text-[9px] text-ash/60"
						>{formatAdminDateTime(order.createdAt)}</span
					>
					<div class="grid gap-2">
						{#if availableTransitions.length > 0}
							<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
								<AdminSelect
									name={`transition-mobile-${order.id}`}
									value={rowTransitionSelections[order.id] ?? ''}
									onchange={(event) => setRowTransition(order.id, event)}
								>
									<option value="" disabled selected>Select status</option>
									{#each availableTransitions as status (status)}
										<option value={status}>{formatAdminStatus(status)}</option>
									{/each}
								</AdminSelect>
								<AdminButton
									type="button"
									variant="outline"
									size="sm"
									disabled={!rowTransitionSelections[order.id]}
									onclick={() => promptSingleTransition(order)}
								>
									Review
								</AdminButton>
							</div>
						{/if}
						<AdminButton
							href={resolve(`/app/orders/${order.id}`)}
							variant="outline"
							size="sm"
							class="w-full"
						>
							Manage
						</AdminButton>
					</div>
				</div>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState title="No orders found" description="Adjust filters or search terms." />
	{/snippet}
</AdminListLayout>

<AdminModal
	bind:open={singleTransitionModalOpen}
	title="Confirm status change"
	description="Review the workflow change before updating this order."
	kicker="Order workflow"
	size="md"
>
	{#if pendingSingleTransition}
		<div
			class="border border-amber-400/25 bg-amber-400/5 p-4 font-sans text-sm leading-relaxed text-ash"
		>
			Move <strong class="text-bone">{pendingSingleTransition.orderNumber}</strong> from
			<strong class="text-bone">{formatAdminStatus(pendingSingleTransition.fromStatus)}</strong>
			to <strong class="text-bone">{formatAdminStatus(pendingSingleTransition.toStatus)}</strong>?
		</div>
		<form method="POST" action="?/transitionStatus" use:transitionEnhance class="grid gap-4">
			<input type="hidden" name="orderId" value={pendingSingleTransition.orderId} />
			<input type="hidden" name="toStatus" value={pendingSingleTransition.toStatus} />
			<AdminInput
				label="Internal Note"
				name="note"
				bind:value={singleTransitionNote}
				placeholder="Reason or operational context (optional)"
			/>
			<div class="grid gap-2 sm:flex sm:justify-end">
				<AdminButton
					type="button"
					variant="charcoal"
					disabled={$transitionSubmitting}
					onclick={() => (singleTransitionModalOpen = false)}
				>
					Keep Current Status
				</AdminButton>
				<AdminButton type="submit" variant="volt" disabled={$transitionSubmitting}>
					{$transitionSubmitting
						? 'Updating...'
						: `Mark as ${formatAdminStatus(pendingSingleTransition.toStatus)}`}
				</AdminButton>
			</div>
		</form>
	{/if}
</AdminModal>

<!-- Bulk Transition Drawer -->
{#if selectedOrderIds.length > 0}
	<div
		class="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto border-t border-volt bg-void/95 p-3 backdrop-blur-md sm:bottom-4 sm:left-1/2 sm:max-w-4xl sm:-translate-x-1/2 sm:border sm:p-4"
	>
		<div
			class="mx-auto flex max-w-4xl flex-col gap-4 md:flex-row md:items-center md:justify-between"
		>
			<div
				class="flex items-center justify-between border-b border-charcoal pb-2 md:border-b-0 md:pb-0"
			>
				<span class="font-mono text-xs font-bold text-volt uppercase">
					{selectedOrderIds.length} orders selected
				</span>
				<div class="flex gap-2">
					<AdminButton onclick={toggleSelectAll} variant="outline" size="sm">
						{isAllSelected ? 'Select None' : 'Select All'}
					</AdminButton>
					<div class="w-10 md:hidden">
						<AdminIconAction
							onclick={() => (selectedOrderIds = [])}
							variant="neutral"
							ariaLabel="Clear selection"
							title="Clear selection"
						>
							<X size={16} />
						</AdminIconAction>
					</div>
				</div>
			</div>

			<form
				bind:this={bulkTransitionFormElement}
				method="POST"
				action="?/bulkTransition"
				use:bulkEnhance
				class="flex flex-wrap items-center gap-3 border-b border-charcoal pb-3 md:border-b-0 md:pb-0"
			>
				<input type="hidden" name="orderIds" value={selectedOrderIds.join(',')} />

				<AdminSelect name="toStatus" bind:value={$bulkForm.toStatus} required>
					<option value="" disabled selected>Select new status...</option>
					{#each commonBulkTransitions as status (status)}
						<option value={status}>{formatAdminStatus(status)}</option>
					{/each}
				</AdminSelect>

				<AdminInput name="note" bind:value={$bulkForm.note} placeholder="Internal note" />

				<AdminButton
					type="button"
					disabled={$bulkSubmitting || commonBulkTransitions.length === 0 || !$bulkForm.toStatus}
					variant="volt"
					size="sm"
					onclick={() => (bulkTransitionConfirmOpen = true)}
				>
					Review Update
				</AdminButton>
			</form>

			<div class="flex items-center gap-2">
				<AdminButton onclick={exportSelectedCsv} variant="outline" size="sm">
					<Download size={12} />
					CSV
				</AdminButton>
				<AdminButton onclick={printSelected} variant="charcoal" size="sm">
					<Printer size={12} />
					Print packing slips
				</AdminButton>
				<div class="hidden w-10 md:block">
					<AdminIconAction
						onclick={() => (selectedOrderIds = [])}
						variant="neutral"
						ariaLabel="Clear selection"
						title="Clear selection"
					>
						<X size={16} />
					</AdminIconAction>
				</div>
			</div>
		</div>
	</div>
	<div class="h-72 md:h-24" aria-hidden="true"></div>
{/if}

<!-- ── DIALOG MODALS ──────────────────────────────────────────────────────── -->

<!-- UPDATE FULFILLMENT MODAL -->
<AdminModal bind:open={fulfillmentModalOpen} title="Update Fulfillment" kicker="Orders" size="lg">
	<form
		id="updateFulfillmentForm"
		method="POST"
		action="?/updateFulfillment"
		use:fulfillmentEnhance
		class="flex flex-col gap-5"
	>
		<AdminInput
			label="Order ID"
			name="orderId"
			bind:value={$fulfillmentForm.orderId}
			placeholder="e.g. ord_..."
			error={$fulfillmentErrors.orderId}
			required
		/>
		<AdminInput
			label="Tracking Number"
			name="trackingNumber"
			bind:value={$fulfillmentForm.trackingNumber}
			placeholder="e.g. TRK123456789"
			error={$fulfillmentErrors.trackingNumber}
		/>
		<AdminInput
			label="Carrier"
			name="trackingCarrier"
			bind:value={$fulfillmentForm.trackingCarrier}
			placeholder="e.g. Pronto, Domex, DHL"
			error={$fulfillmentErrors.trackingCarrier}
		/>
		<AdminInput
			label="Tracking URL"
			name="trackingUrl"
			bind:value={$fulfillmentForm.trackingUrl}
			placeholder="e.g. https://..."
			error={$fulfillmentErrors.trackingUrl}
		/>

		<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
			<AdminButton type="button" variant="outline" onclick={() => (fulfillmentModalOpen = false)}
				>Cancel</AdminButton
			>
			<AdminButton type="submit" variant="volt" disabled={$fulfillmentSubmitting}>
				{#if $fulfillmentSubmitting}Saving...{:else}Save Tracking{/if}
			</AdminButton>
		</div>
	</form>
</AdminModal>

<!-- RECORD PAYMENT MODAL -->
<AdminModal bind:open={paymentModalOpen} title="Record Payment" kicker="Orders" size="lg">
	<form
		id="recordPaymentForm"
		method="POST"
		action="?/recordPayment"
		use:paymentEnhance
		class="flex flex-col gap-5"
	>
		<AdminInput
			label="Order ID"
			name="orderId"
			bind:value={$paymentForm.orderId}
			placeholder="e.g. ord_..."
			error={$paymentErrors.orderId}
			required
		/>
		<AdminSelect
			label="Payment Status"
			name="status"
			bind:value={$paymentForm.status}
			options={paymentStatuses.map((status) => ({
				value: status,
				label: formatAdminStatus(status)
			}))}
			error={$paymentErrors.status}
			required
		/>
		<AdminSelect
			label="Method"
			name="method"
			bind:value={$paymentForm.method}
			options={[
				{ value: '', label: 'Existing payment method' },
				...paymentMethods.map((method) => ({ value: method, label: formatAdminStatus(method) }))
			]}
			error={$paymentErrors.method}
		/>
		<AdminInput
			label="Amount (Optional)"
			name="amount"
			type="number"
			min="1"
			bind:value={$paymentForm.amount}
			placeholder="e.g. 1500"
			error={$paymentErrors.amount}
		/>
		<AdminInput
			label="Transaction ID"
			name="transactionId"
			bind:value={$paymentForm.transactionId}
			placeholder="e.g. tx_..."
			error={$paymentErrors.transactionId}
		/>

		<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
			<AdminButton type="button" variant="outline" onclick={() => (paymentModalOpen = false)}
				>Cancel</AdminButton
			>
			<AdminButton type="submit" variant="volt" disabled={$paymentSubmitting}>
				{#if $paymentSubmitting}Recording...{:else}Record Payment{/if}
			</AdminButton>
		</div>
	</form>
</AdminModal>

<!-- RECORD REFUND MODAL -->
<AdminModal bind:open={refundModalOpen} title="Record Refund" kicker="Orders" size="lg">
	<form
		id="recordRefundForm"
		method="POST"
		action="?/recordRefund"
		use:refundEnhance
		class="flex flex-col gap-5"
	>
		<AdminInput
			label="Payment ID"
			name="paymentId"
			bind:value={$refundForm.paymentId}
			placeholder="e.g. pay_..."
			error={$refundErrors.paymentId}
			required
		/>
		<AdminInput
			label="Refund Amount"
			name="refundAmount"
			type="number"
			min="1"
			bind:value={$refundForm.refundAmount}
			placeholder="Refund amount in LKR"
			error={$refundErrors.refundAmount}
			required
		/>

		<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
			<AdminButton type="button" variant="outline" onclick={() => (refundModalOpen = false)}
				>Cancel</AdminButton
			>
			<AdminButton type="submit" variant="volt" disabled={$refundSubmitting}>
				{#if $refundSubmitting}Refunding...{:else}Record Refund{/if}
			</AdminButton>
		</div>
	</form>
</AdminModal>

<form bind:this={cancelExpiredForm} method="POST" action="?/cancelExpired" use:cancelExpiredEnhance>
	<input type="hidden" name="limit" value="50" />
</form>

<AdminConfirmDialog
	bind:open={bulkTransitionConfirmOpen}
	title="Confirm bulk status update"
	message={`Move ${selectedOrderIds.length} selected orders to ${formatAdminStatus($bulkForm.toStatus || 'the selected status')}? Orders that cannot follow this transition will be reported as failures.`}
	confirmLabel="Update selected orders"
	loading={$bulkSubmitting}
	onconfirm={() => bulkTransitionFormElement?.requestSubmit()}
/>

<AdminConfirmDialog
	bind:open={expiredHoldsModalOpen}
	title="Cancel expired holds"
	message="Cancel expired pending reserve holds and release reserved stock back to inventory?"
	confirmLabel="Confirm release"
	loading={$cancelExpiredSubmitting}
	onconfirm={confirmCancelExpired}
/>
