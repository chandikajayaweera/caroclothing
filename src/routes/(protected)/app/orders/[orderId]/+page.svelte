<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { resolve } from '$app/paths';
	import {
		ChevronLeft,
		CreditCard,
		Truck,
		User,
		MapPin,
		DollarSign,
		Package,
		History,
		AlertTriangle,
		X
	} from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	// Status transition history list and formatting
	const order = $derived(data.order);

	// ── Superforms Initialization ─────────────────────────────────────────

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const transitionStatusSuperform = superForm(
		initialForm(() => data.transitionStatusForm),
		{
			id: 'transitionOrderStatus',
			resetForm: true
		}
	);
	const { enhance: transitionEnhance, message: transitionMessage } = transitionStatusSuperform;

	const cancelOrderSuperform = superForm(
		initialForm(() => data.cancelOrderForm),
		{
			id: 'cancelOrder',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					showCancelModal = false;
				}
			}
		}
	);
	const {
		form: cancelForm,
		enhance: cancelEnhance,
		errors: cancelErrors,
		message: cancelMessage,
		submitting: cancelSubmitting
	} = cancelOrderSuperform;

	const updateFulfillmentSuperform = superForm(
		initialForm(() => data.updateFulfillmentForm),
		{
			id: 'updateOrderFulfillment',
			resetForm: false
		}
	);
	const {
		form: fulfillmentForm,
		enhance: fulfillmentEnhance,
		errors: fulfillmentErrors,
		message: fulfillmentMessage,
		submitting: fulfillmentSubmitting
	} = updateFulfillmentSuperform;

	const recordPaymentSuperform = superForm(
		initialForm(() => data.recordPaymentForm),
		{
			id: 'recordPayment',
			resetForm: true
		}
	);
	const {
		form: paymentForm,
		enhance: paymentEnhance,
		errors: paymentErrors,
		message: paymentMessage,
		submitting: paymentSubmitting
	} = recordPaymentSuperform;

	const recordRefundSuperform = superForm(
		initialForm(() => data.recordRefundForm),
		{
			id: 'recordRefund',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					activeRefundPaymentId = null;
				}
			}
		}
	);
	const {
		form: refundForm,
		enhance: refundEnhance,
		errors: refundErrors,
		message: refundMessage,
		submitting: refundSubmitting
	} = recordRefundSuperform;

	// Toast notification messages
	let toastMessage = $state<string | null>(null);
	const combinedMessage = $derived(
		$transitionMessage ||
			$cancelMessage ||
			$fulfillmentMessage ||
			$paymentMessage ||
			$refundMessage ||
			actionData?.form?.message
	);

	$effect(() => {
		if (combinedMessage) {
			toastMessage = combinedMessage;
		}
	});

	// UI interaction state
	let showCancelModal = $state(false);
	let activeRefundPaymentId = $state<string | null>(null);
	let selectedCarrierId = $state('');

	type CarrierOption = NonNullable<PageData['carriers']>[number];
	const carriers = $derived(data.carriers ?? []);

	$effect(() => {
		if (selectedCarrierId) {
			const selected = carriers.find((c: CarrierOption) => c.id === selectedCarrierId);
			if (selected) {
				$fulfillmentForm.trackingCarrier = selected.code;
				const trackNum = $fulfillmentForm.trackingNumber || '';
				$fulfillmentForm.trackingUrl = selected.urlTemplate
					? selected.urlTemplate.replace('{trackingNumber}', trackNum)
					: '';
			}
		}
	});

	$effect(() => {
		const trackNum = $fulfillmentForm.trackingNumber;
		if (selectedCarrierId) {
			const selected = carriers.find((c: CarrierOption) => c.id === selectedCarrierId);
			if (selected && selected.urlTemplate) {
				$fulfillmentForm.trackingUrl = selected.urlTemplate.replace(
					'{trackingNumber}',
					trackNum || ''
				);
			}
		}
	});

	// Constants
	const paymentStatuses = ['pending', 'authorized', 'captured', 'failed'] as const;
	const paymentMethods = [
		'card',
		'bank_transfer',
		'cash_on_delivery',
		'payhere',
		'ipg',
		'webxpay'
	] as const;

	// Helpers
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
			return 'border-red-500/30 bg-red-500/10 text-red-400';
		}
		if (status === 'delivered' || status === 'captured' || status === 'authorized') {
			return 'border-volt/30 bg-volt/10 text-volt';
		}
		return 'border-charcoal bg-charcoal/30 text-ash';
	}

	function triggerRefund(paymentId: string, amount: number) {
		activeRefundPaymentId = paymentId;
		$refundForm.paymentId = paymentId;
		$refundForm.refundAmount = amount;
	}
</script>

<svelte:head>
	<title>Order {order.orderNumber} | Caro Admin</title>
</svelte:head>

{#if toastMessage}
	<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />
{/if}

<section class="mx-auto max-w-7xl">
	<!-- Top Navigation Breadcrumbs & Back button -->
	<div class="mb-6 flex items-center gap-2 border-b border-charcoal pb-4">
		<a
			href={resolve('/app/orders')}
			class="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:text-volt"
		>
			<ChevronLeft size={14} />
			Back to Orders
		</a>
	</div>

	<!-- Order Banner Header -->
	<div
		class="flex flex-col gap-4 border-b border-charcoal pb-6 md:flex-row md:items-center md:justify-between"
	>
		<div>
			<div class="flex items-center gap-3">
				<h1 class="font-display text-5xl leading-none text-bone uppercase md:text-6xl">
					{order.orderNumber}
				</h1>
				<span
					class="rounded-sm border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase {statusClass(
						order.status
					)}"
				>
					{formatStatus(order.status)}
				</span>
			</div>
			<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
				ID: {order.id} &bull; Customer ID: {order.userId ?? 'Guest'} &bull; Created {formatDate(
					order.createdAt
				)}
			</p>
		</div>

		<!-- Direct Transitions Quick-Buttons -->
		<div class="flex flex-wrap items-center gap-2">
			{#if order.availableTransitions.length > 0}
				{#each order.availableTransitions as transition (transition)}
					<form
						method="POST"
						action="?/transitionStatus"
						use:transitionEnhance
						class="inline-block"
					>
						<input type="hidden" name="orderId" value={order.id} />
						<input type="hidden" name="toStatus" value={transition} />
						<input type="hidden" name="note" value="Transitioned via detail page button." />
						<button
							type="submit"
							class="border border-ash/20 bg-charcoal px-4 py-2.5 font-mono text-[9px] tracking-widest text-bone uppercase transition-colors hover:border-volt hover:text-volt"
						>
							Mark as {formatStatus(transition)}
						</button>
					</form>
				{/each}
			{/if}

			{#if !order.isTerminal}
				<button
					type="button"
					onclick={() => (showCancelModal = true)}
					class="border border-red-500/40 px-4 py-2.5 font-mono text-[9px] tracking-widest text-red-400 uppercase transition-all hover:bg-red-500 hover:text-void"
				>
					Cancel Order
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Details Grid Layout -->
	<div class="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
		<!-- Main Content Left Column -->
		<div class="flex flex-col gap-6">
			<!-- Order Items Summary Card -->
			<div class="rounded-sm border border-charcoal bg-charcoal/10">
				<div class="flex items-center gap-2 border-b border-charcoal p-5">
					<Package size={16} class="text-volt" />
					<h2 class="font-mono text-xs tracking-[0.25em] text-volt uppercase">
						Order Items ({order.itemCount})
					</h2>
				</div>
				<div class="divide-y divide-charcoal/60">
					{#if order.items && order.items.length > 0}
						{#each order.items as item (item.id)}
							<div class="flex items-center gap-4 p-5 transition-colors hover:bg-charcoal/20">
								<!-- Thumbnail image -->
								<div
									class="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden border border-charcoal bg-void"
								>
									{#if item.imageUrl}
										<img
											src={item.imageUrl}
											alt={item.productName}
											class="h-full w-full object-cover"
										/>
									{:else}
										<Package size={20} class="text-charcoal" />
									{/if}
								</div>

								<!-- Details info -->
								<div class="grow">
									<p class="font-sans text-sm font-semibold text-bone">{item.productName}</p>
									<p class="mt-1 font-mono text-[10px] text-ash/80 uppercase">
										Size: <span class="text-bone">{item.variantSize}</span> &bull; Colour:
										<span class="text-bone">{item.variantColor}</span>
									</p>
								</div>

								<!-- Price & Quantity -->
								<div class="text-right font-mono text-xs text-bone">
									<p>{formatMoney(item.unitPrice)} &times; {item.quantity}</p>
									<p class="mt-0.5 font-bold text-ash">{formatMoney(item.totalPrice)}</p>
								</div>
							</div>
						{/each}
					{:else}
						<div class="p-8 text-center font-mono text-xs text-ash/60">No items in this order.</div>
					{/if}
				</div>

				<!-- Totals Breakdown Foot -->
				<div class="border-t border-charcoal bg-charcoal/20 p-5 font-mono text-xs">
					<div class="ml-auto flex max-w-sm flex-col gap-2">
						<div class="flex justify-between text-ash">
							<span>Subtotal:</span>
							<span class="text-bone">{formatMoney(order.subtotal)}</span>
						</div>
						{#if order.discountAmount > 0}
							<div class="flex justify-between text-red-400">
								<span>Discount:</span>
								<span>-{formatMoney(order.discountAmount)}</span>
							</div>
						{/if}
						<div class="flex justify-between text-ash">
							<span>Shipping Amount:</span>
							<span class="text-bone">{formatMoney(order.shippingAmount)}</span>
						</div>
						<div class="my-1 border-t border-charcoal/80"></div>
						<div class="flex justify-between text-sm font-bold text-volt">
							<span>Total Amount:</span>
							<span>{formatMoney(order.totalAmount)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Linked Payments List Card -->
			<div class="rounded-sm border border-charcoal bg-charcoal/10">
				<div class="flex items-center gap-2 border-b border-charcoal p-5">
					<CreditCard size={16} class="text-volt" />
					<h2 class="font-mono text-xs tracking-[0.25em] text-volt uppercase">Linked Payments</h2>
				</div>
				<div class="overflow-x-auto">
					{#if order.payments && order.payments.length > 0}
						<table class="w-full text-left">
							<thead
								class="border-b border-charcoal bg-charcoal/15 font-mono text-[9px] tracking-[0.2em] text-ash uppercase"
							>
								<tr>
									<th class="px-5 py-3.5 font-normal">Payment ID</th>
									<th class="px-5 py-3.5 font-normal">Status</th>
									<th class="px-5 py-3.5 font-normal">Amount</th>
									<th class="px-5 py-3.5 font-normal">Method</th>
									<th class="px-5 py-3.5 font-normal">Paid At</th>
									<th class="px-5 py-3.5 text-right font-normal">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-charcoal/60">
								{#each order.payments as payment (payment.id)}
									<tr class="font-sans text-xs">
										<td class="px-5 py-4 font-mono text-bone">
											{payment.id}
											{#if payment.transactionId}
												<span class="mt-0.5 block font-mono text-[10px] text-ash/70"
													>TXN: {payment.transactionId}</span
												>
											{/if}
										</td>
										<td class="px-5 py-4">
											<span
												class="rounded-sm border px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase {statusClass(
													payment.status
												)}"
											>
												{payment.status}
											</span>
										</td>
										<td class="px-5 py-4 font-mono text-bone">{formatMoney(payment.amount)}</td>
										<td class="px-5 py-4 font-mono text-ash uppercase"
											>{formatStatus(payment.method)}</td
										>
										<td class="px-5 py-4 font-mono text-ash">{formatDate(payment.paidAt)}</td>
										<td class="px-5 py-4 text-right">
											{#if payment.status === 'captured' && order.status !== 'refunded'}
												<button
													type="button"
													onclick={() => triggerRefund(payment.id, payment.amount)}
													class="rounded-sm border border-ash/40 px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
												>
													Record Refund
												</button>
											{:else}
												<span class="font-mono text-[9px] text-ash/40 uppercase">None</span>
											{/if}
										</td>
									</tr>

									<!-- Expanded inline Record Refund form -->
									{#if activeRefundPaymentId === payment.id}
										<tr>
											<td colspan="6" class="border-t border-charcoal/70 bg-void p-5">
												<form
													method="POST"
													action="?/recordRefund"
													use:refundEnhance
													class="ml-auto max-w-md"
												>
													<input
														type="hidden"
														name="paymentId"
														bind:value={$refundForm.paymentId}
													/>

													<h3 class="mb-3 font-mono text-[9px] tracking-widest text-volt uppercase">
														Refund Amount (LKR)
													</h3>
													<div class="flex gap-2">
														<div class="relative grow">
															<input
																name="refundAmount"
																type="number"
																min="1"
																max={payment.amount}
																bind:value={$refundForm.refundAmount}
																class="w-full border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
																required
															/>
															{#if $refundErrors.refundAmount}
																<span
																	class="absolute mt-0.5 block font-mono text-[9px] text-red-400"
																	>{$refundErrors.refundAmount[0]}</span
																>
															{/if}
														</div>
														<button
															type="submit"
															disabled={$refundSubmitting}
															class="bg-volt px-4 py-2 font-mono text-[9px] tracking-widest text-void uppercase transition-colors hover:bg-bone disabled:opacity-40"
														>
															{$refundSubmitting ? 'Processing...' : 'Apply Refund'}
														</button>
														<button
															type="button"
															onclick={() => (activeRefundPaymentId = null)}
															class="border border-charcoal px-3 py-2 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:bg-charcoal/30"
														>
															Cancel
														</button>
													</div>
												</form>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					{:else}
						<div class="p-8 text-center font-mono text-xs text-ash/60">
							No payments recorded for this order.
						</div>
					{/if}
				</div>
			</div>

			<!-- Status History Timeline Card -->
			<div class="rounded-sm border border-charcoal bg-charcoal/10">
				<div class="flex items-center gap-2 border-b border-charcoal p-5">
					<History size={16} class="text-volt" />
					<h2 class="font-mono text-xs tracking-[0.25em] text-volt uppercase">
						Status Transition Log
					</h2>
				</div>
				<div class="p-6">
					{#if order.statusHistory && order.statusHistory.length > 0}
						<div class="relative ml-2 space-y-6 border-l border-charcoal pl-6">
							{#each order.statusHistory as event (event.id)}
								<div class="relative">
									<!-- Dot marker -->
									<span
										class="absolute top-1.5 -left-7.75 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-charcoal bg-void text-volt"
									>
										<span class="h-1.5 w-1.5 rounded-full bg-volt"></span>
									</span>

									<div class="flex items-center gap-3">
										<p class="font-mono text-xs font-semibold text-bone uppercase">
											{formatStatus(event.toStatus)}
										</p>
										<span class="font-mono text-[9px] text-ash/60">
											{formatDate(event.createdAt)}
										</span>
									</div>
									<p class="mt-1 font-sans text-xs leading-relaxed text-ash/80">
										{#if event.fromStatus}
											Transitioned from <span class="font-mono text-[10px] text-bone uppercase"
												>{formatStatus(event.fromStatus)}</span
											>.
										{:else}
											Initial order submission.
										{/if}
										{#if event.note}
											<span class="mt-1 block font-mono text-[10px] text-volt/80"
												>&ldquo;{event.note}&rdquo;</span
											>
										{/if}
									</p>
								</div>
							{/each}
						</div>
					{:else}
						<div class="py-4 text-center font-mono text-xs text-ash/60">
							No transition history logged.
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Details Right Column (Sidebar Details & Forms) -->
		<aside class="flex flex-col gap-6">
			<!-- Customer Info Card -->
			<div class="rounded-sm border border-charcoal bg-void p-5">
				<div class="mb-4 flex items-center gap-2 border-b border-charcoal pb-3">
					<User size={14} class="text-volt" />
					<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">
						Customer Details
					</h2>
				</div>
				<div class="flex flex-col gap-3 font-sans text-xs">
					{#if order.shippingAddressSnapshot}
						<div class="flex flex-col gap-1">
							<span class="font-semibold text-bone"
								>{order.shippingAddressSnapshot.recipientName}</span
							>
							<span class="text-ash">{order.shippingAddressSnapshot.phone}</span>
						</div>

						<div class="my-1 border-t border-charcoal/60"></div>

						<div class="flex items-start gap-1.5 text-ash">
							<MapPin size={12} class="mt-0.5 text-volt" />
							<div class="flex flex-col">
								<span>{order.shippingAddressSnapshot.addressLine1}</span>
								{#if order.shippingAddressSnapshot.addressLine2}
									<span>{order.shippingAddressSnapshot.addressLine2}</span>
								{/if}
								<span
									>{order.shippingAddressSnapshot.city}, {order.shippingAddressSnapshot
										.district}</span
								>
								{#if order.shippingAddressSnapshot.postalCode}
									<span>{order.shippingAddressSnapshot.postalCode}</span>
								{/if}
							</div>
						</div>
					{:else}
						<span class="font-mono text-[10px] text-ash"
							>No shipping address snapshot attached.</span
						>
					{/if}
				</div>
			</div>

			<!-- Shipping Carrier / Fulfillment Form -->
			<form
				method="POST"
				action="?/updateFulfillment"
				use:fulfillmentEnhance
				class="rounded-sm border border-charcoal bg-void p-5"
			>
				<div class="mb-4 flex items-center gap-2 border-b border-charcoal pb-3">
					<Truck size={14} class="text-volt" />
					<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Fulfillment</h2>
				</div>
				<div class="flex flex-col gap-3">
					<input type="hidden" name="orderId" bind:value={$fulfillmentForm.orderId} />

					{#if carriers.length > 0}
						<label class="flex flex-col gap-1.5 font-mono text-[9px] text-ash uppercase">
							<span>Select Carrier</span>
							<select
								bind:value={selectedCarrierId}
								class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								<option value="">-- Custom Carrier / URL --</option>
								{#each carriers as carrier (carrier.id)}
									<option value={carrier.id}>{carrier.name} ({carrier.code})</option>
								{/each}
							</select>
						</label>
					{/if}

					<label class="flex flex-col gap-1.5">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Carrier</span>
						<input
							name="trackingCarrier"
							bind:value={$fulfillmentForm.trackingCarrier}
							placeholder="e.g. Fedex, DHL"
							class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
						/>
						{#if $fulfillmentErrors.trackingCarrier}
							<span class="font-mono text-[9px] text-red-400"
								>{$fulfillmentErrors.trackingCarrier[0]}</span
							>
						{/if}
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
							>Tracking Number</span
						>
						<input
							name="trackingNumber"
							bind:value={$fulfillmentForm.trackingNumber}
							placeholder="Tracking identification ID"
							class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
						/>
						{#if $fulfillmentErrors.trackingNumber}
							<span class="font-mono text-[9px] text-red-400"
								>{$fulfillmentErrors.trackingNumber[0]}</span
							>
						{/if}
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Tracking URL</span
						>
						<input
							name="trackingUrl"
							bind:value={$fulfillmentForm.trackingUrl}
							placeholder="https://tracker.com/..."
							class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
						/>
						{#if $fulfillmentErrors.trackingUrl}
							<span class="font-mono text-[9px] text-red-400"
								>{$fulfillmentErrors.trackingUrl[0]}</span
							>
						{/if}
					</label>

					<label class="flex flex-col gap-1.5">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
							>Admin Internal Note</span
						>
						<textarea
							name="adminNote"
							bind:value={$fulfillmentForm.adminNote}
							placeholder="Log internal comments"
							class="min-h-16 border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
						></textarea>
						{#if $fulfillmentErrors.adminNote}
							<span class="font-mono text-[9px] text-red-400"
								>{$fulfillmentErrors.adminNote[0]}</span
							>
						{/if}
					</label>

					<button
						type="submit"
						disabled={$fulfillmentSubmitting}
						class="bg-bone px-4 py-2.5 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-volt disabled:opacity-40"
					>
						{$fulfillmentSubmitting ? 'Saving...' : 'Save Fulfillment'}
					</button>
				</div>
			</form>

			<!-- Record Payment Form (Only if unpaid balance or active check allows) -->
			{#if order.status !== 'cancelled' && order.status !== 'refunded'}
				<form
					method="POST"
					action="?/recordPayment"
					use:paymentEnhance
					class="rounded-sm border border-charcoal bg-void p-5"
				>
					<div class="mb-4 flex items-center gap-2 border-b border-charcoal pb-3">
						<DollarSign size={14} class="text-volt" />
						<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">
							Record Manual Payment
						</h2>
					</div>
					<div class="flex flex-col gap-3">
						<input type="hidden" name="orderId" bind:value={$paymentForm.orderId} />

						<label class="flex flex-col gap-1.5">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Status</span>
							<select
								name="status"
								bind:value={$paymentForm.status}
								class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
								required
							>
								{#each paymentStatuses as status (status)}
									<option value={status}>{formatStatus(status)}</option>
								{/each}
							</select>
							{#if $paymentErrors.status}
								<span class="font-mono text-[9px] text-red-400">{$paymentErrors.status[0]}</span>
							{/if}
						</label>

						<label class="flex flex-col gap-1.5">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
								>Payment Method</span
							>
							<select
								name="method"
								bind:value={$paymentForm.method}
								class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
							>
								<option value="">Existing payment method</option>
								{#each paymentMethods as method (method)}
									<option value={method}>{formatStatus(method)}</option>
								{/each}
							</select>
							{#if $paymentErrors.method}
								<span class="font-mono text-[9px] text-red-400">{$paymentErrors.method[0]}</span>
							{/if}
						</label>

						<label class="flex flex-col gap-1.5">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Amount</span>
							<input
								name="amount"
								type="number"
								min="1"
								bind:value={$paymentForm.amount}
								placeholder="LKR amount"
								class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
							/>
							{#if $paymentErrors.amount}
								<span class="font-mono text-[9px] text-red-400">{$paymentErrors.amount[0]}</span>
							{/if}
						</label>

						<label class="flex flex-col gap-1.5">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
								>Transaction ID</span
							>
							<input
								name="transactionId"
								bind:value={$paymentForm.transactionId}
								placeholder="e.g. gateway txn ID"
								class="border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
							/>
							{#if $paymentErrors.transactionId}
								<span class="font-mono text-[9px] text-red-400"
									>{$paymentErrors.transactionId[0]}</span
								>
							{/if}
						</label>

						<button
							type="submit"
							disabled={$paymentSubmitting}
							class="bg-bone px-4 py-2.5 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-volt disabled:opacity-40"
						>
							{$paymentSubmitting ? 'Recording...' : 'Record Payment'}
						</button>
					</div>
				</form>
			{/if}
		</aside>
	</div>
</section>

<!-- Cancel Order Warning Modal -->
{#if showCancelModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm">
		<div
			class="relative w-full max-w-md rounded-sm border border-charcoal bg-void p-6"
			transition:slide
		>
			<button
				type="button"
				onclick={() => (showCancelModal = false)}
				class="absolute top-4 right-4 text-ash hover:text-bone"
			>
				<X size={16} />
			</button>

			<div class="mb-4 flex items-center gap-2 border-b border-charcoal pb-3">
				<AlertTriangle size={18} class="text-red-400" />
				<h2 class="font-mono text-xs tracking-wider text-red-400 uppercase">Cancel Order Hold</h2>
			</div>

			<p class="mb-4 font-sans text-xs leading-relaxed text-ash">
				Are you sure you want to cancel order <strong>{order.orderNumber}</strong>? This action will
				release reserved stock back into the inventory movement pool and cannot be undone.
			</p>

			<form method="POST" action="?/cancel" use:cancelEnhance>
				<input type="hidden" name="orderId" bind:value={$cancelForm.orderId} />

				<label class="mb-5 flex flex-col gap-1.5">
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
						>Cancellation Reason</span
					>
					<textarea
						name="reason"
						bind:value={$cancelForm.reason}
						placeholder="Customer request, out of stock, etc."
						class="min-h-16 border border-charcoal bg-charcoal/30 px-3 py-2 font-mono text-xs text-bone outline-none focus:border-volt"
						required
					></textarea>
					{#if $cancelErrors.reason}
						<span class="font-mono text-[9px] text-red-400">{$cancelErrors.reason[0]}</span>
					{/if}
				</label>

				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (showCancelModal = false)}
						class="border border-charcoal px-4 py-2 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:bg-charcoal/35"
					>
						No, keep hold
					</button>
					<button
						type="submit"
						disabled={$cancelSubmitting}
						class="bg-red-500 px-4 py-2 font-mono text-[9px] font-bold tracking-widest text-void uppercase transition-colors hover:bg-red-400 disabled:opacity-40"
					>
						{$cancelSubmitting ? 'Cancelling...' : 'Yes, Cancel Order'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
