<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { AlertTriangle, ArrowUpRight } from 'lucide-svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminModal from '$lib/components/admin/overlays/AdminModal.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import { paymentStatusVariant } from '$lib/shared/admin/status';
	import { formatAdminMoney, formatAdminStatus } from '$lib/shared/admin/format';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	const statusOptions = [
		{ value: '', label: 'All Statuses' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'authorized', label: 'Authorized' },
		{ value: 'captured', label: 'Captured' },
		{ value: 'failed', label: 'Failed' },
		{ value: 'refunded', label: 'Refunded' },
		{ value: 'partially_refunded', label: 'Partially Refunded' }
	];

	const methodOptions = [
		{ value: '', label: 'All Methods' },
		{ value: 'payhere', label: 'PayHere.lk' },
		{ value: 'paypal', label: 'PayPal' },
		{ value: 'cash_on_delivery', label: 'Cash on Delivery' }
	];

	const recordablePaymentStatuses = [
		{ value: 'pending', label: 'Pending' },
		{ value: 'authorized', label: 'Authorized' },
		{ value: 'captured', label: 'Captured' },
		{ value: 'failed', label: 'Failed' }
	];

	const tableHeaders = [
		{ label: 'Payment ID' },
		{ label: 'Order ID' },
		{ label: 'Amount' },
		{ label: 'Method' },
		{ label: 'Status' },
		{ label: 'Transaction ID' },
		{ label: 'Actions', class: 'text-right' }
	];

	function methodLabel(method: string): string {
		const found = methodOptions.find((o) => o.value === method);
		return found ? found.label : method.toUpperCase();
	}

	type PagePayment = PageData['payments']['items'][number];

	// ── Dialog States ───────────────────────────────────────────────────────
	let paymentModalOpen = $state(false);
	let refundModalOpen = $state(false);
	let selectedPayment = $state<PagePayment | null>(null);
	let refundConfirming = $state(false);

	// ── Superforms ──────────────────────────────────────────────────────────

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// 1. Record Payment
	const recordPaymentSuperform = superForm(
		initialForm(() => data.recordPaymentForm),
		{
			id: 'recordPayment',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Payment successfully recorded.';
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

	// 2. Record Refund
	const recordRefundSuperform = superForm(
		initialForm(() => data.recordRefundForm),
		{
			id: 'recordRefund',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Refund recorded.';
					refundConfirming = false;
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

	// Toast notification
	let toastMessage = $state<string | null>(null);
	const combinedMessage = $derived($paymentMessage || $refundMessage || actionData?.form?.message);

	$effect(() => {
		if (combinedMessage) {
			toastMessage = combinedMessage;
		}
	});

	// Filters reactivity
	let searchOrderId = $state('');
	let selectStatus = $state('');
	let selectMethod = $state('');
	let showFilters = $state(false);

	$effect(() => {
		searchOrderId = data.filters.query;
		selectStatus = data.filters.status;
		selectMethod = data.filters.method;
	});

	const hasActiveFilters = $derived(data.filters.status !== '' || data.filters.method !== '');

	function clearFilters() {
		searchOrderId = '';
		selectStatus = '';
		selectMethod = '';
		goto(resolve('/app/payments'));
	}

	function openRecordPayment(p: PagePayment) {
		selectedPayment = p;
		$paymentForm.orderId = p.orderId;
		$paymentForm.paymentId = p.id;
		$paymentForm.method = p.method;
		$paymentForm.amount = p.amount;
		$paymentForm.status = 'captured';
		$paymentForm.transactionId = p.transactionId || '';
		paymentModalOpen = true;
	}

	function openRecordRefund(p: PagePayment) {
		selectedPayment = p;
		$refundForm.paymentId = p.id;
		$refundForm.refundAmount = p.amount - (p.refundAmount || 0);
		refundConfirming = false;
		refundModalOpen = true;
	}
</script>

<svelte:head>
	<title>Payments | Admin | Caro Clothing</title>
</svelte:head>

{#if toastMessage}
	<AdminToast
		message={toastMessage}
		type={page.status >= 400 ? 'error' : 'success'}
		onclose={() => (toastMessage = null)}
	/>
{/if}

<AdminListLayout
	title="Payments"
	kicker="Commerce"
	loading={false}
	metrics={[
		{
			label: 'Total Volume',
			value: formatAdminMoney(data.stats.totalVolume),
			description: 'All attempted checkouts'
		},
		{
			label: 'Captured',
			value: formatAdminMoney(data.stats.totalCaptured),
			description: 'Successful payments',
			tone: 'success'
		},
		{
			label: 'Pending Holds',
			value: formatAdminMoney(data.stats.totalPending),
			description: 'Awaiting verification',
			tone: 'warning'
		},
		{
			label: 'Refunded',
			value: formatAdminMoney(data.stats.totalRefunded),
			description: 'Registered refunds',
			tone: 'info'
		},
		{
			label: 'Manual Review',
			value: data.stats.manualReviewCount,
			description: 'Decision required',
			tone: data.stats.manualReviewCount > 0 ? 'danger' : 'neutral'
		}
	]}
	bind:query={searchOrderId}
	bind:showFilters
	{hasActiveFilters}
	totalItems={data.payments.total}
	limit={data.payments.limit}
	offset={data.payments.offset}
	{tableHeaders}
	items={data.payments.items}
	onclearfilters={clearFilters}
	searchPlaceholder="Search order ID or reference..."
>
	{#snippet statsNotice()}
		{#if data.stats.manualReviewCount > 0}
			<div class="mt-4 flex items-start gap-3 border border-amber-400/40 bg-amber-400/5 p-4">
				<AlertTriangle size={18} class="mt-0.5 shrink-0 text-amber-300" />
				<div>
					<p class="font-mono text-[10px] tracking-[0.14em] text-bone uppercase">
						{data.stats.manualReviewCount} payment{data.stats.manualReviewCount === 1 ? '' : 's'}
						require review
					</p>
					<p class="mt-1 font-sans text-xs text-ash">
						These captures arrived after their order could no longer be completed.
					</p>
				</div>
			</div>
		{/if}
	{/snippet}

	{#snippet advancedFilters()}
		<AdminFilterBar cols={2}>
			<AdminSelect
				label="Status"
				id="status-filter"
				name="status"
				options={statusOptions}
				bind:value={selectStatus}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>

			<AdminSelect
				label="Method"
				id="method-filter"
				name="method"
				options={methodOptions}
				bind:value={selectMethod}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>
		</AdminFilterBar>
	{/snippet}

	{#snippet row(payment)}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<td class="truncate px-5 py-4 font-mono text-[11px] text-bone/60" title={payment.id}
				>{payment.id}</td
			>
			<td class="px-5 py-4 font-mono text-[11px]">
				<a
					href={resolve(`/app/orders/${payment.orderId}`)}
					class="inline-flex max-w-30 items-center gap-1 truncate text-volt hover:underline"
				>
					{payment.orderId.substring(0, 8)}
					<ArrowUpRight size={10} />
				</a>
			</td>
			<td class="px-5 py-4 font-mono text-[11px] font-bold text-bone"
				>{formatAdminMoney(payment.amount)}</td
			>
			<td class="px-5 py-4 font-mono text-[11px] text-bone/85">{methodLabel(payment.method)}</td>
			<td class="px-5 py-4 font-mono text-[11px]">
				<div class="flex flex-wrap gap-1">
					<AdminBadge variant={paymentStatusVariant(payment.status)}>
						{formatAdminStatus(payment.status)}
					</AdminBadge>
					{#if payment.requiresManualReview}
						<span title={payment.reviewReason ?? 'Manual review required'}>
							<AdminBadge variant="warning">Review</AdminBadge>
						</span>
					{/if}
				</div>
			</td>
			<td
				class="truncate px-5 py-4 pr-4 font-mono text-[11px] text-ash/80"
				title={payment.transactionId || 'None'}
			>
				{payment.transactionId || '—'}
			</td>
			<td class="px-5 py-4 text-right">
				<div class="flex items-center justify-end gap-2">
					{#if payment.status === 'pending' || payment.status === 'failed'}
						<AdminButton onclick={() => openRecordPayment(payment)} variant="volt" size="sm">
							Verify
						</AdminButton>
					{:else if payment.status === 'captured' || payment.status === 'partially_refunded'}
						<AdminButton onclick={() => openRecordRefund(payment)} variant="danger" size="sm">
							Refund
						</AdminButton>
					{/if}
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet card(payment)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex items-start justify-between">
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Payment ID</p>
						<p class="max-w-37.5 truncate font-mono text-xs text-bone/60">{payment.id}</p>
					</div>
					<div class="flex flex-col items-end gap-1">
						<AdminBadge variant={paymentStatusVariant(payment.status)}>
							{formatAdminStatus(payment.status)}
						</AdminBadge>
						{#if payment.requiresManualReview}
							<AdminBadge variant="warning">Review</AdminBadge>
						{/if}
					</div>
				</div>
			{/snippet}

			{#snippet description()}
				{#if payment.requiresManualReview}
					<p
						class="mt-3 border border-amber-400/20 bg-amber-400/5 p-3 font-sans text-xs text-amber-100"
					>
						{payment.reviewReason}
					</p>
				{/if}
			{/snippet}

			{#snippet metadata()}
				<AdminMetaGrid cols={2}>
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Order ID</p>
						<a
							href={resolve(`/app/orders/${payment.orderId}`)}
							class="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-volt hover:underline"
						>
							{payment.orderId.substring(0, 8)}
							<ArrowUpRight size={10} />
						</a>
					</div>
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Amount</p>
						<p class="mt-0.5 font-mono text-xs font-bold text-bone">
							{formatAdminMoney(payment.amount)}
						</p>
					</div>
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Method</p>
						<p class="mt-0.5 font-mono text-xs text-bone/85">{methodLabel(payment.method)}</p>
					</div>
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Transaction ID</p>
						<p class="mt-0.5 truncate font-mono text-xs text-ash/80">
							{payment.transactionId || '—'}
						</p>
					</div>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<div class="flex justify-end gap-2 border-t border-charcoal/50 pt-3">
					{#if payment.status === 'pending' || payment.status === 'failed'}
						<AdminButton onclick={() => openRecordPayment(payment)} variant="volt" size="sm">
							Verify
						</AdminButton>
					{:else if payment.status === 'captured' || payment.status === 'partially_refunded'}
						<AdminButton onclick={() => openRecordRefund(payment)} variant="danger" size="sm">
							Refund
						</AdminButton>
					{/if}
				</div>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState
			title="No payments found"
			description="No transactions match current search and filters."
		/>
	{/snippet}
</AdminListLayout>

<!-- ── MODAL: RECORD PAYMENT ────────────────────────────────────────────── -->
{#if paymentModalOpen}
	<AdminModal
		bind:open={paymentModalOpen}
		kicker="Verify Transaction"
		title="Record Payment"
		size="md"
	>
		<form method="POST" action="?/recordPayment" use:paymentEnhance class="flex flex-col gap-5">
			<input type="hidden" name="orderId" bind:value={$paymentForm.orderId} />
			<input type="hidden" name="paymentId" bind:value={$paymentForm.paymentId} />

			<div class="flex flex-col gap-2">
				<label class="font-mono text-[9px] tracking-widest text-ash uppercase" for="order-ref-disp"
					>Order reference</label
				>
				<p id="order-ref-disp" class="font-mono text-xs text-bone">
					{$paymentForm.orderId}
				</p>
			</div>

			<AdminSelect
				label="Payment status"
				name="status"
				options={recordablePaymentStatuses}
				bind:value={$paymentForm.status}
				error={$paymentErrors.status}
			/>

			<AdminInput
				label="Transaction / Reference ID"
				name="transactionId"
				placeholder="e.g. TXN-12345678"
				bind:value={$paymentForm.transactionId}
				error={$paymentErrors.transactionId}
			/>

			<div class="mt-4 flex gap-3">
				<AdminButton type="submit" disabled={$paymentSubmitting} variant="volt" class="flex-1">
					{#if $paymentSubmitting}Processing...{:else}Record Payment{/if}
				</AdminButton>
				<AdminButton type="button" onclick={() => (paymentModalOpen = false)} variant="outline">
					Cancel
				</AdminButton>
			</div>
		</form>
	</AdminModal>
{/if}

<!-- ── MODAL: PROCESS REFUND ────────────────────────────────────────────── -->
{#if refundModalOpen}
	<AdminModal bind:open={refundModalOpen} kicker="Provider Ledger" title="Record Refund" size="md">
		<form method="POST" action="?/recordRefund" use:refundEnhance class="flex flex-col gap-5">
			<input type="hidden" name="paymentId" bind:value={$refundForm.paymentId} />
			<p class="border border-amber-400/30 bg-amber-400/5 p-3 font-sans text-xs text-amber-100">
				This records a refund already completed in PayHere, PayPal, or the COD workflow. It does not
				send funds to the customer.
			</p>

			<div class="flex flex-col gap-2">
				<label class="font-mono text-[9px] tracking-widest text-ash uppercase" for="pay-ref-disp"
					>Payment Reference ID</label
				>
				<p id="pay-ref-disp" class="font-mono text-xs text-bone">
					{$refundForm.paymentId}
				</p>
			</div>

			{#if selectedPayment}
				<AdminMetaGrid cols={1} class="mt-0 border border-charcoal/50 bg-charcoal/20 p-4">
					<div class="flex justify-between">
						<span class="text-ash">Total Captured:</span><span class="text-bone"
							>{formatAdminMoney(selectedPayment.amount)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-ash">Already Refunded:</span><span class="text-bone"
							>{formatAdminMoney(selectedPayment.refundAmount || 0)}</span
						>
					</div>
				</AdminMetaGrid>
			{/if}

			<AdminInput
				label="Refund amount (LKR)"
				name="refundAmount"
				type="number"
				required
				min="1"
				max={selectedPayment
					? selectedPayment.amount - (selectedPayment.refundAmount || 0)
					: 999999}
				bind:value={$refundForm.refundAmount}
				error={$refundErrors.refundAmount}
			/>

			{#if refundConfirming}
				<p
					class="border border-red-400/30 bg-red-950/20 p-3 font-sans text-sm text-red-200"
					role="alert"
				>
					Confirm {formatAdminMoney(Number($refundForm.refundAmount || 0))} refund for
					<span class="break-all">{$refundForm.paymentId}</span>.
				</p>
			{/if}

			<div class="mt-4 grid gap-2 sm:grid-cols-2">
				{#if refundConfirming}
					<AdminButton type="submit" disabled={$refundSubmitting} variant="danger">
						{#if $refundSubmitting}Recording...{:else}Record Refund{/if}
					</AdminButton>
					<AdminButton
						type="button"
						onclick={() => (refundConfirming = false)}
						variant="outline"
						disabled={$refundSubmitting}
					>
						Back
					</AdminButton>
				{:else}
					<AdminButton
						type="button"
						disabled={$refundSubmitting || Number($refundForm.refundAmount || 0) <= 0}
						variant="danger"
						onclick={() => (refundConfirming = true)}
					>
						Review Refund
					</AdminButton>
					<AdminButton type="button" onclick={() => (refundModalOpen = false)} variant="outline">
						Cancel
					</AdminButton>
				{/if}
			</div>
		</form>
	</AdminModal>
{/if}
