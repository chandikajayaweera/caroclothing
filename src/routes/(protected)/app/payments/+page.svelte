<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { AlertTriangle, CreditCard, Eye, ArrowUpRight } from 'lucide-svelte';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';

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
		{ value: 'bank_transfer', label: 'Bank Transfer' },
		{ value: 'cash_on_delivery', label: 'Cash on Delivery' },
		{ value: 'paykoko', label: 'Koko (paykoko.com)' },
		{ value: 'mintpay', label: 'Mintpay' }
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

	function methodLabel(method: string): string {
		const found = methodOptions.find((o) => o.value === method);
		return found ? found.label : method.toUpperCase();
	}

	function statusClass(status: string): string {
		if (status === 'failed' || status === 'refunded') {
			return 'text-red-400 border-red-500/20 bg-red-500/5';
		}
		if (status === 'captured' || status === 'authorized') {
			return 'text-volt border-volt/20 bg-volt/5';
		}
		return 'text-ash border-charcoal bg-charcoal/30';
	}

	type PagePayment = PageData['payments']['items'][number];

	// ── Dialog States ───────────────────────────────────────────────────────
	let paymentModalOpen = $state(false);
	let refundModalOpen = $state(false);
	let slipModalOpen = $state(false);
	let selectedPayment = $state<PagePayment | null>(null);

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
					toastMessage = form.message ?? 'Refund successfully processed.';
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
		refundModalOpen = true;
	}

	function openSlipModal(p: PagePayment) {
		selectedPayment = p;
		slipModalOpen = true;
	}
</script>

<svelte:head>
	<title>Payments | Admin | Caro Clothing</title>
</svelte:head>

{#if toastMessage}
	<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />
{/if}

<AdminListLayout
	title="Payments"
	kicker="Commerce"
	loading={false}
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
	{#snippet statsSnippet()}
		{#if data.stats.manualReviewCount > 0}
			<div class="mt-8 flex items-start gap-3 border border-amber-400/40 bg-amber-400/5 p-4">
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
		<!-- Metrics Cards -->
		<div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
			<AdminCard class="min-w-0" padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Total Volume
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{formatMoney(data.stats.totalVolume)}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash/60">All attempted checkouts</p>
			</AdminCard>

			<AdminCard class="min-w-0" padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">Captured</p>
				<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
					{formatMoney(data.stats.totalCaptured)}
				</p>
				<p class="mt-1 font-mono text-[9px] text-volt/60">Successful payments</p>
			</AdminCard>

			<AdminCard class="min-w-0" padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Pending Holds
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{formatMoney(data.stats.totalPending)}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash/60">Awaiting verification</p>
			</AdminCard>

			<AdminCard class="min-w-0" padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">Refunded</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{formatMoney(data.stats.totalRefunded)}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash/60">Manual registered refunds</p>
			</AdminCard>

			<AdminCard class="min-w-0" padding="p-4 sm:p-5">
				<p class="truncate font-mono text-[8px] tracking-[0.2em] text-ash uppercase">
					Manual review
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-amber-300 uppercase sm:text-4xl">
					{data.stats.manualReviewCount}
				</p>
				<p class="mt-1 font-mono text-[9px] text-amber-300/60">Refund decision required</p>
			</AdminCard>
		</div>
	{/snippet}

	{#snippet advancedFilters()}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<label for="status-filter" class="font-mono text-[9px] tracking-widest text-ash uppercase"
					>Status</label
				>
				<AdminSelect
					id="status-filter"
					name="status"
					options={statusOptions}
					bind:value={selectStatus}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<label for="method-filter" class="font-mono text-[9px] tracking-widest text-ash uppercase"
					>Method</label
				>
				<AdminSelect
					id="method-filter"
					name="method"
					options={methodOptions}
					bind:value={selectMethod}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				/>
			</div>
		</div>
	{/snippet}

	{#snippet row(payment)}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<td class="truncate px-5 py-4 font-mono text-[11px] text-bone/60" title={payment.id}
				>{payment.id}</td
			>
			<td class="px-5 py-4 font-mono text-[11px]">
				<a
					href={resolve(`/app/orders?query=${payment.orderId}`)}
					class="inline-flex max-w-30 items-center gap-1 truncate text-volt hover:underline"
				>
					{payment.orderId.substring(0, 8)}
					<ArrowUpRight size={10} />
				</a>
			</td>
			<td class="px-5 py-4 font-mono text-[11px] font-bold text-bone"
				>{formatMoney(payment.amount)}</td
			>
			<td class="px-5 py-4 font-mono text-[11px] text-bone/85">{methodLabel(payment.method)}</td>
			<td class="px-5 py-4 font-mono text-[11px]">
				<div class="flex flex-wrap gap-1">
					<span
						class="inline-flex border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase {statusClass(
							payment.status
						)}"
					>
						{payment.status.replace('_', ' ')}
					</span>
					{#if payment.requiresManualReview}
						<span
							class="inline-flex border border-amber-400/30 bg-amber-400/5 px-2 py-0.5 text-[9px] font-bold tracking-wider text-amber-300 uppercase"
							title={payment.reviewReason ?? 'Manual review required'}
						>
							Review
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
					{#if payment.bankSlipR2Key}
						<AdminButton
							onclick={() => openSlipModal(payment)}
							variant="charcoal"
							size="icon"
							class="border border-charcoal hover:border-volt/30 hover:text-volt"
							title="View Uploaded Bank Slip"
						>
							<Eye size={14} />
						</AdminButton>
					{/if}

					{#if payment.status === 'pending' || payment.status === 'failed'}
						<AdminButton
							onclick={() => openRecordPayment(payment)}
							variant="outline"
							size="sm"
							class="min-h-0 border-volt/20 bg-volt/5 px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-widest text-volt uppercase transition-colors hover:bg-volt hover:text-void"
						>
							Verify
						</AdminButton>
					{:else if payment.status === 'captured' || payment.status === 'partially_refunded'}
						<AdminButton
							onclick={() => openRecordRefund(payment)}
							variant="danger"
							size="sm"
							class="min-h-0 border-red-500/20 bg-red-500/5 px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-widest text-red-400 uppercase transition-colors hover:bg-red-500 hover:text-bone"
						>
							Refund
						</AdminButton>
					{/if}
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet card(payment)}
		<AdminCard>
			<div class="flex items-start justify-between">
				<div>
					<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Payment ID</p>
					<p class="max-w-37.5 truncate font-mono text-xs text-bone/60">{payment.id}</p>
				</div>
				<div class="flex flex-col items-end gap-1">
					<span
						class="inline-flex border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase {statusClass(
							payment.status
						)}"
					>
						{payment.status.replace('_', ' ')}
					</span>
					{#if payment.requiresManualReview}
						<span class="font-mono text-[8px] tracking-wider text-amber-300 uppercase">
							Manual review
						</span>
					{/if}
				</div>
			</div>

			{#if payment.requiresManualReview}
				<p
					class="mt-3 border border-amber-400/20 bg-amber-400/5 p-3 font-sans text-xs text-amber-100"
				>
					{payment.reviewReason}
				</p>
			{/if}

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div>
					<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Order ID</p>
					<a
						href={resolve(`/app/orders?query=${payment.orderId}`)}
						class="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-volt hover:underline"
					>
						{payment.orderId.substring(0, 8)}
						<ArrowUpRight size={10} />
					</a>
				</div>
				<div>
					<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Amount</p>
					<p class="mt-0.5 font-mono text-xs font-bold text-bone">{formatMoney(payment.amount)}</p>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-4 border-t border-charcoal/50 pt-3">
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
			</div>

			<div class="mt-4 flex justify-end gap-2 border-t border-charcoal/50 pt-3">
				{#if payment.bankSlipR2Key}
					<AdminButton
						onclick={() => openSlipModal(payment)}
						variant="outline"
						size="sm"
						class="min-h-0 border-charcoal px-3 py-1.5 font-mono text-[9px] font-bold tracking-widest text-ash uppercase transition-colors hover:border-volt/30 hover:text-volt"
					>
						View Slip
					</AdminButton>
				{/if}

				{#if payment.status === 'pending' || payment.status === 'failed'}
					<AdminButton
						onclick={() => openRecordPayment(payment)}
						variant="outline"
						size="sm"
						class="min-h-0 border-volt/20 bg-volt/5 px-3 py-1.5 font-mono text-[9px] font-bold tracking-widest text-volt uppercase transition-colors hover:bg-volt hover:text-void"
					>
						Verify
					</AdminButton>
				{:else if payment.status === 'captured' || payment.status === 'partially_refunded'}
					<AdminButton
						onclick={() => openRecordRefund(payment)}
						variant="danger"
						size="sm"
						class="min-h-0 border-red-500/20 bg-red-500/5 px-3 py-1.5 font-mono text-[9px] font-bold tracking-widest text-red-400 uppercase transition-colors hover:bg-red-500 hover:text-bone"
					>
						Refund
					</AdminButton>
				{/if}
			</div>
		</AdminCard>
	{/snippet}

	{#snippet emptyState()}
		<div class="flex flex-col items-center justify-center px-4 py-6 text-center sm:px-6 sm:py-12">
			<CreditCard size={36} class="mb-4 text-charcoal" />
			<h3 class="mb-1 font-display text-xl tracking-tight text-bone uppercase">
				No payments found
			</h3>
			<p class="max-w-sm font-sans text-xs text-ash/60">
				No transactions match your current search and filter settings. Try adjusting your query
				parameters.
			</p>
		</div>
	{/snippet}
</AdminListLayout>

<!-- ── MODAL: VIEW BANK SLIP ────────────────────────────────────────────── -->
<Dialog.Root bind:open={slipModalOpen}>
	{#if slipModalOpen && selectedPayment}
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

			<div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto px-4 py-10">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 200, start: 0.95 }}
							class="flex w-full max-w-2xl flex-col gap-6 border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<div class="flex items-start justify-between border-b border-charcoal pb-4">
								<div>
									<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
										Review Slip
									</p>
									<Dialog.Title class="font-display text-2xl text-bone uppercase"
										>Bank Transfer Proof</Dialog.Title
									>
								</div>
								<button
									onclick={() => (slipModalOpen = false)}
									class="font-mono text-[10px] text-ash uppercase transition-colors hover:text-bone"
								>
									Close
								</button>
							</div>

							<div class="grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]">
								<!-- Left: Slip Image -->
								<div
									class="flex min-h-75 items-center justify-center border border-charcoal bg-void p-2"
								>
									{#if selectedPayment!.bankSlipR2Key}
										<img
											src="/media/{selectedPayment!.bankSlipR2Key}"
											alt="Uploaded bank slip"
											class="max-h-100 max-w-full object-contain"
										/>
									{:else}
										<span class="font-mono text-xs text-ash/40">No slip image uploaded</span>
									{/if}
								</div>

								<!-- Right: Slip details & manual action link -->
								<div class="flex flex-col justify-between gap-5">
									<div class="flex flex-col gap-4">
										<div>
											<span class="font-mono text-[9px] tracking-wider text-ash uppercase"
												>Reference No</span
											>
											<p class="font-mono text-xs font-bold break-all text-bone">
												{selectedPayment!.bankReference || 'None'}
											</p>
										</div>
										<div>
											<span class="font-mono text-[9px] tracking-wider text-ash uppercase"
												>Amount Due</span
											>
											<p class="font-mono text-sm font-bold text-volt">
												{formatMoney(selectedPayment!.amount)}
											</p>
										</div>
										<div>
											<span class="font-mono text-[9px] tracking-wider text-ash uppercase"
												>Submitted At</span
											>
											<p class="font-mono text-[10px] text-bone/60">
												{formatDate(selectedPayment!.createdAt)}
											</p>
										</div>
									</div>

									<div class="flex flex-col gap-2">
										<AdminButton
											onclick={() => {
												slipModalOpen = false;
												openRecordPayment(selectedPayment!);
											}}
											variant="volt"
											class="w-full py-2.5 font-mono text-[9px] tracking-widest uppercase"
										>
											Approve Payment
										</AdminButton>
										<AdminButton
											onclick={() => (slipModalOpen = false)}
											variant="outline"
											class="w-full border-ash/10 py-2.5 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
										>
											Close
										</AdminButton>
									</div>
								</div>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- ── MODAL: RECORD PAYMENT ────────────────────────────────────────────── -->
<Dialog.Root bind:open={paymentModalOpen}>
	{#if paymentModalOpen}
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
							class="w-full max-w-md border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<div class="mb-6 flex items-center justify-between border-b border-charcoal pb-4">
								<div>
									<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
										Verify Transaction
									</p>
									<Dialog.Title class="font-display text-2xl text-bone uppercase"
										>Record Payment</Dialog.Title
									>
								</div>
							</div>

							<form
								method="POST"
								action="?/recordPayment"
								use:paymentEnhance
								class="flex flex-col gap-5"
							>
								<input type="hidden" name="orderId" bind:value={$paymentForm.orderId} />
								<input type="hidden" name="paymentId" bind:value={$paymentForm.paymentId} />

								<div class="flex flex-col gap-2">
									<label
										class="font-mono text-[9px] tracking-widest text-ash uppercase"
										for="order-ref-disp">Order reference</label
									>
									<p id="order-ref-disp" class="font-mono text-xs text-bone">
										{$paymentForm.orderId}
									</p>
								</div>

								<div class="flex flex-col gap-2">
									<label
										for="record-status"
										class="font-mono text-[9px] tracking-widest text-ash uppercase"
										>Payment status</label
									>
									<AdminSelect
										id="record-status"
										name="status"
										options={recordablePaymentStatuses}
										bind:value={$paymentForm.status}
									/>
									{#if $paymentErrors.status}
										<span class="font-mono text-[9px] text-red-400">{$paymentErrors.status}</span>
									{/if}
								</div>

								<div class="flex flex-col gap-2">
									<label
										for="record-txid"
										class="font-mono text-[9px] tracking-widest text-ash uppercase"
										>Transaction / Reference ID</label
									>
									<AdminInput
										id="record-txid"
										name="transactionId"
										placeholder="e.g. TXN-12345678"
										bind:value={$paymentForm.transactionId}
									/>
									{#if $paymentErrors.transactionId}
										<span class="font-mono text-[9px] text-red-400"
											>{$paymentErrors.transactionId}</span
										>
									{/if}
								</div>

								<div class="mt-4 flex gap-3">
									<AdminButton
										type="submit"
										disabled={$paymentSubmitting}
										variant="volt"
										class="flex-1 py-3 font-mono text-[10px] tracking-widest uppercase"
									>
										{#if $paymentSubmitting}Processing...{:else}Record Payment{/if}
									</AdminButton>
									<AdminButton
										type="button"
										onclick={() => (paymentModalOpen = false)}
										variant="outline"
										class="px-6 py-3 font-mono text-[10px] tracking-widest uppercase"
									>
										Cancel
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

<!-- ── MODAL: PROCESS REFUND ────────────────────────────────────────────── -->
<Dialog.Root bind:open={refundModalOpen}>
	{#if refundModalOpen}
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
							class="w-full max-w-md border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<div class="mb-6 flex items-center justify-between border-b border-charcoal pb-4">
								<div>
									<p class="font-mono text-[9px] tracking-[0.2em] text-red-400 uppercase">
										Process Returns
									</p>
									<Dialog.Title class="font-display text-2xl text-bone uppercase"
										>Process Refund</Dialog.Title
									>
								</div>
							</div>

							<form
								method="POST"
								action="?/recordRefund"
								use:refundEnhance
								class="flex flex-col gap-5"
							>
								<input type="hidden" name="paymentId" bind:value={$refundForm.paymentId} />

								<div class="flex flex-col gap-2">
									<label
										class="font-mono text-[9px] tracking-widest text-ash uppercase"
										for="pay-ref-disp">Payment Reference ID</label
									>
									<p id="pay-ref-disp" class="font-mono text-xs text-bone">
										{$refundForm.paymentId}
									</p>
								</div>

								{#if selectedPayment}
									<div class="flex flex-col gap-1 border border-charcoal/50 bg-charcoal/20 p-4">
										<div class="flex justify-between font-mono text-[10px] text-ash">
											<span>Total Captured:</span>
											<span class="text-bone">{formatMoney(selectedPayment.amount)}</span>
										</div>
										<div class="mt-1 flex justify-between font-mono text-[10px] text-ash">
											<span>Already Refunded:</span>
											<span class="text-bone">{formatMoney(selectedPayment.refundAmount || 0)}</span
											>
										</div>
									</div>
								{/if}

								<div class="flex flex-col gap-2">
									<label
										for="refund-amount"
										class="font-mono text-[9px] tracking-widest text-ash uppercase"
										>Refund amount (LKR)</label
									>
									<AdminInput
										id="refund-amount"
										name="refundAmount"
										type="number"
										min="1"
										max={selectedPayment
											? selectedPayment.amount - (selectedPayment.refundAmount || 0)
											: 999999}
										bind:value={$refundForm.refundAmount}
									/>
									{#if $refundErrors.refundAmount}
										<span class="font-mono text-[9px] text-red-400"
											>{$refundErrors.refundAmount}</span
										>
									{/if}
								</div>

								<div class="mt-4 flex gap-3">
									<AdminButton
										type="submit"
										disabled={$refundSubmitting}
										variant="outline"
										class="flex-1 border-none bg-red-500 py-3 font-mono text-[10px] tracking-widest text-bone uppercase hover:bg-red-600"
									>
										{#if $refundSubmitting}Processing...{:else}Issue Refund{/if}
									</AdminButton>
									<AdminButton
										type="button"
										onclick={() => (refundModalOpen = false)}
										variant="outline"
										class="px-6 py-3 font-mono text-[10px] tracking-widest uppercase"
									>
										Cancel
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
