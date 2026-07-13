<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		CreditCard,
		Truck,
		User,
		MapPin,
		DollarSign,
		Package,
		History,
		AlertTriangle,
		ArrowRight
	} from 'lucide-svelte';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/AdminTextarea.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminDetailLayout from '$lib/components/admin/layout/AdminDetailLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import {
		formatAdminDateTime,
		formatAdminMoney,
		formatAdminStatus
	} from '$lib/shared/admin/format';
	import { orderStatusVariant, paymentStatusVariant } from '$lib/shared/admin/status';
	import { adminPaymentMethodOptions, adminPaymentStatusOptions } from '$lib/shared/admin/options';

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
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					showTransitionModal = false;
					pendingTransition = null;
				}
			}
		}
	);
	const {
		enhance: transitionEnhance,
		message: transitionMessage,
		submitting: transitionSubmitting
	} = transitionStatusSuperform;

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
					showRefundModal = false;
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
	let showTransitionModal = $state(false);
	let showRefundModal = $state(false);
	let pendingTransition = $state<string | null>(null);
	let activeRefundPaymentId = $state<string | null>(null);
	let selectedCarrierId = $state('');
	const activeRefundPayment = $derived(
		order.payments?.find((payment) => payment.id === activeRefundPaymentId) ?? null
	);

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
	const paymentStatuses = adminPaymentStatusOptions.map((option) => option.value);
	const paymentMethods = adminPaymentMethodOptions.map((option) => option.value);

	function triggerRefund(paymentId: string, amount: number) {
		activeRefundPaymentId = paymentId;
		$refundForm.paymentId = paymentId;
		$refundForm.refundAmount = amount;
		showRefundModal = true;
	}

	function promptTransition(transition: string) {
		pendingTransition = transition;
		showTransitionModal = true;
	}
</script>

<svelte:head>
	<title>Order {order.orderNumber} | Caro Admin</title>
</svelte:head>

{#if toastMessage}
	<AdminToast
		message={toastMessage}
		type={page.status >= 400 ? 'error' : 'success'}
		onclose={() => (toastMessage = null)}
	/>
{/if}

<AdminDetailLayout
	backHref={resolve('/app/orders')}
	backLabel="Back to orders"
	kicker="Orders / Fulfillment"
	title={order.orderNumber}
	subtitle={`ID: ${order.id} · ${formatAdminStatus(order.status)} · Created ${formatAdminDateTime(order.createdAt)}`}
>
	{#snippet headerActions()}
		{#snippet primaryTransitionAction()}
			<AdminButton
				type="button"
				onclick={() => promptTransition(order.availableTransitions[0])}
				variant="volt"
			>
				<ArrowRight size={14} aria-hidden="true" />
				Mark as {formatAdminStatus(order.availableTransitions[0])}
			</AdminButton>
		{/snippet}
		<AdminActionToolbar
			ariaLabel="Order actions"
			primary={order.availableTransitions.length > 0 ? primaryTransitionAction : undefined}
			menuItems={[
				...order.availableTransitions.slice(1).map((transition) => ({
					label: `Mark as ${formatAdminStatus(transition)}`,
					description: 'Move order to this workflow state.',
					icon: ArrowRight,
					onselect: () => promptTransition(transition)
				})),
				...(!order.isTerminal
					? [
							{
								label: 'Cancel order',
								description: 'Cancel order and release reserved stock.',
								icon: AlertTriangle,
								tone: 'danger' as const,
								onselect: () => (showCancelModal = true)
							}
						]
					: [])
			]}
		>
			{#snippet views()}
				<AdminBadge variant={orderStatusVariant(order.status)}>
					{formatAdminStatus(order.status)}
				</AdminBadge>
			{/snippet}
		</AdminActionToolbar>
	{/snippet}

	{#snippet mainContent()}
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
								<p>{formatAdminMoney(item.unitPrice)} &times; {item.quantity}</p>
								<p class="mt-0.5 font-bold text-ash">{formatAdminMoney(item.totalPrice)}</p>
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
						<span class="text-bone">{formatAdminMoney(order.subtotal)}</span>
					</div>
					{#if order.discountAmount > 0}
						<div class="flex justify-between text-red-400">
							<span>Discount:</span>
							<span>-{formatAdminMoney(order.discountAmount)}</span>
						</div>
					{/if}
					<div class="flex justify-between text-ash">
						<span>Shipping Amount:</span>
						<span class="text-bone">{formatAdminMoney(order.shippingAmount)}</span>
					</div>
					<div class="my-1 border-t border-charcoal/80"></div>
					<div class="flex justify-between text-sm font-bold text-volt">
						<span>Total Amount:</span>
						<span>{formatAdminMoney(order.totalAmount)}</span>
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
			{#if order.payments && order.payments.length > 0}
				<div class="grid gap-3 p-3 md:hidden">
					{#each order.payments as payment (payment.id)}
						<AdminEntityCard class="bg-void">
							{#snippet header()}
								<div class="flex min-w-0 items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
											Payment ID
										</p>
										<p class="mt-1 font-mono text-xs break-all text-bone">{payment.id}</p>
									</div>
									<AdminBadge variant={paymentStatusVariant(payment.status)}>
										{formatAdminStatus(payment.status)}
									</AdminBadge>
								</div>
							{/snippet}

							{#snippet metadata()}
								<AdminMetaGrid cols={2}>
									<div>
										<p class="text-ash/60">Amount</p>
										<p class="mt-0.5 text-bone">{formatAdminMoney(payment.amount)}</p>
									</div>
									<div>
										<p class="text-ash/60">Method</p>
										<p class="mt-0.5 text-bone">{formatAdminStatus(payment.method)}</p>
									</div>
									<div class="min-[430px]:col-span-2">
										<p class="text-ash/60">Paid At</p>
										<p class="mt-0.5 text-bone">
											{payment.paidAt ? formatAdminDateTime(payment.paidAt) : 'Not paid'}
										</p>
									</div>
								</AdminMetaGrid>
							{/snippet}

							{#snippet description()}
								{#if payment.transactionId}
									<p class="mt-3 font-mono text-[10px] break-all text-ash/70">
										Transaction: {payment.transactionId}
									</p>
								{/if}
							{/snippet}

							{#snippet actions()}
								{#if payment.status === 'captured' && order.status !== 'refunded'}
									<AdminButton
										type="button"
										onclick={() => triggerRefund(payment.id, payment.amount)}
										variant="outline"
										class="w-full"
									>
										Record Refund
									</AdminButton>
								{:else}
									<p class="font-mono text-[9px] text-ash/50 uppercase">No actions available</p>
								{/if}
							{/snippet}
						</AdminEntityCard>
					{/each}
				</div>

				<div class="hidden overflow-x-auto md:block">
					<table class="w-full min-w-[760px] text-left">
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
									<td class="max-w-64 px-5 py-4 font-mono text-bone">
										<span class="break-all">{payment.id}</span>
										{#if payment.transactionId}
											<span class="mt-0.5 block font-mono text-[10px] break-all text-ash/70"
												>TXN: {payment.transactionId}</span
											>
										{/if}
									</td>
									<td class="px-5 py-4">
										<AdminBadge variant={paymentStatusVariant(payment.status)}>
											{payment.status}
										</AdminBadge>
									</td>
									<td class="px-5 py-4 font-mono text-bone">{formatAdminMoney(payment.amount)}</td>
									<td class="px-5 py-4 font-mono text-ash uppercase"
										>{formatAdminStatus(payment.method)}</td
									>
									<td class="px-5 py-4 font-mono text-ash">
										{payment.paidAt ? formatAdminDateTime(payment.paidAt) : 'Not paid'}
									</td>
									<td class="px-5 py-4 text-right">
										{#if payment.status === 'captured' && order.status !== 'refunded'}
											<AdminButton
												type="button"
												onclick={() => triggerRefund(payment.id, payment.amount)}
												variant="outline"
												size="sm"
											>
												Record Refund
											</AdminButton>
										{:else}
											<span class="font-mono text-[9px] text-ash/40 uppercase">None</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-8 text-center font-mono text-xs text-ash/60">
					No payments recorded for this order.
				</div>
			{/if}
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
										{formatAdminStatus(event.toStatus)}
									</p>
									<span class="font-mono text-[9px] text-ash/60">
										{formatAdminDateTime(event.createdAt)}
									</span>
								</div>
								<p class="mt-1 font-sans text-xs leading-relaxed text-ash/80">
									{#if event.fromStatus}
										Transitioned from <span class="font-mono text-[10px] text-bone uppercase"
											>{formatAdminStatus(event.fromStatus)}</span
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
	{/snippet}

	{#snippet sidebarContent()}
		<!-- Customer Info Card -->
		<div class="rounded-sm border border-charcoal bg-void p-5">
			<div class="mb-4 flex items-center gap-2 border-b border-charcoal pb-3">
				<User size={14} class="text-volt" />
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Customer Details</h2>
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
					<span class="font-mono text-[10px] text-ash">No shipping address snapshot attached.</span>
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
					<AdminSelect label="Select Carrier" name="" bind:value={selectedCarrierId}>
						<option value="">-- Custom Carrier / URL --</option>
						{#each carriers as carrier (carrier.id)}
							<option value={carrier.id}>{carrier.name} ({carrier.code})</option>
						{/each}
					</AdminSelect>
				{/if}

				<AdminInput
					label="Carrier"
					name="trackingCarrier"
					bind:value={$fulfillmentForm.trackingCarrier}
					placeholder="e.g. Fedex, DHL"
					error={$fulfillmentErrors.trackingCarrier}
				/>

				<AdminInput
					label="Tracking Number"
					name="trackingNumber"
					bind:value={$fulfillmentForm.trackingNumber}
					placeholder="Tracking identification ID"
					error={$fulfillmentErrors.trackingNumber}
				/>

				<AdminInput
					label="Tracking URL"
					name="trackingUrl"
					bind:value={$fulfillmentForm.trackingUrl}
					placeholder="https://tracker.com/..."
					error={$fulfillmentErrors.trackingUrl}
				/>

				<AdminTextarea
					label="Admin Internal Note"
					name="adminNote"
					rows={3}
					bind:value={$fulfillmentForm.adminNote}
					placeholder="Log internal comments"
					error={$fulfillmentErrors.adminNote}
				/>

				<AdminButton type="submit" disabled={$fulfillmentSubmitting} variant="volt">
					{$fulfillmentSubmitting ? 'Saving...' : 'Save Fulfillment'}
				</AdminButton>
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

					<AdminSelect
						label="Status"
						name="status"
						bind:value={$paymentForm.status}
						error={$paymentErrors.status}
						required
					>
						{#each paymentStatuses as status (status)}
							<option value={status}>{formatAdminStatus(status)}</option>
						{/each}
					</AdminSelect>

					<AdminSelect
						label="Payment Method"
						name="method"
						bind:value={$paymentForm.method}
						error={$paymentErrors.method}
					>
						<option value="">Existing payment method</option>
						{#each paymentMethods as method (method)}
							<option value={method}>{formatAdminStatus(method)}</option>
						{/each}
					</AdminSelect>

					<AdminInput
						label="Amount"
						name="amount"
						type="number"
						min="1"
						bind:value={$paymentForm.amount}
						placeholder="LKR amount"
						error={$paymentErrors.amount}
					/>

					<AdminInput
						label="Transaction ID"
						name="transactionId"
						bind:value={$paymentForm.transactionId}
						placeholder="e.g. gateway txn ID"
						error={$paymentErrors.transactionId}
					/>

					<AdminButton type="submit" disabled={$paymentSubmitting} variant="volt">
						{$paymentSubmitting ? 'Recording...' : 'Record Payment'}
					</AdminButton>
				</div>
			</form>
		{/if}
	{/snippet}
</AdminDetailLayout>

<AdminModal
	bind:open={showTransitionModal}
	title="Confirm status change"
	description="Confirm the next status for this order."
	kicker="Order workflow"
>
	{#if pendingTransition}
		<div class="flex items-start gap-3 border border-amber-500/20 bg-amber-500/5 p-4">
			<AlertTriangle size={18} class="shrink-0 text-amber-400" />
			<p class="font-sans text-sm leading-relaxed text-ash">
				Move <strong class="text-bone">{order.orderNumber}</strong> from
				<strong class="text-bone">{formatAdminStatus(order.status)}</strong> to
				<strong class="text-bone">{formatAdminStatus(pendingTransition)}</strong>? This update is
				added to the order status history.
			</p>
		</div>

		<form method="POST" action="?/transitionStatus" use:transitionEnhance class="grid gap-4">
			<input type="hidden" name="orderId" value={order.id} />
			<input type="hidden" name="toStatus" value={pendingTransition} />
			<input type="hidden" name="note" value="Transitioned via confirmed detail page action." />

			<div class="grid gap-2 sm:flex sm:justify-end">
				<AdminButton
					type="button"
					onclick={() => (showTransitionModal = false)}
					variant="charcoal"
					disabled={$transitionSubmitting}
				>
					Keep current status
				</AdminButton>
				<AdminButton type="submit" disabled={$transitionSubmitting} variant="volt">
					{$transitionSubmitting
						? 'Updating...'
						: `Mark as ${formatAdminStatus(pendingTransition)}`}
				</AdminButton>
			</div>
		</form>
	{/if}
</AdminModal>

<AdminModal
	bind:open={showRefundModal}
	title="Record refund"
	description="Confirm the refund amount for the selected captured payment."
	kicker="Payment action"
>
	{#if activeRefundPayment}
		<div class="grid gap-2 border border-charcoal bg-void p-4 font-mono text-[10px] uppercase">
			<div class="flex flex-wrap justify-between gap-2">
				<span class="text-ash">Payment</span>
				<span class="text-right break-all text-bone">{activeRefundPayment.id}</span>
			</div>
			<div class="flex justify-between gap-2">
				<span class="text-ash">Captured amount</span>
				<span class="text-bone">{formatAdminMoney(activeRefundPayment.amount)}</span>
			</div>
		</div>

		<div class="flex items-start gap-3 border border-red-500/20 bg-red-500/5 p-4">
			<AlertTriangle size={18} class="shrink-0 text-red-400" />
			<p class="font-sans text-sm leading-relaxed text-ash">
				Verify the amount before confirming. This records the refund against the captured payment.
			</p>
		</div>

		<form method="POST" action="?/recordRefund" use:refundEnhance class="grid gap-4">
			<input type="hidden" name="paymentId" bind:value={$refundForm.paymentId} />
			<AdminInput
				label="Refund Amount (LKR)"
				name="refundAmount"
				type="number"
				min="1"
				max={activeRefundPayment.amount}
				bind:value={$refundForm.refundAmount}
				error={$refundErrors.refundAmount}
				required
			/>

			<div class="grid gap-2 sm:flex sm:justify-end">
				<AdminButton
					type="button"
					onclick={() => (showRefundModal = false)}
					variant="charcoal"
					disabled={$refundSubmitting}
				>
					Keep payment
				</AdminButton>
				<AdminButton type="submit" disabled={$refundSubmitting} variant="danger">
					{$refundSubmitting ? 'Recording...' : 'Confirm Refund'}
				</AdminButton>
			</div>
		</form>
	{/if}
</AdminModal>

<AdminModal bind:open={showCancelModal} title="Cancel order" kicker="Destructive action">
	<div class="flex items-start gap-3 border border-red-500/20 bg-red-500/5 p-4">
		<AlertTriangle size={18} class="shrink-0 text-red-400" />
		<p class="font-sans text-sm leading-relaxed text-ash">
			Cancel order <strong class="text-bone">{order.orderNumber}</strong>? Reserved stock will be
			released and this action cannot be undone.
		</p>
	</div>

	<form method="POST" action="?/cancel" use:cancelEnhance class="grid gap-4">
		<input type="hidden" name="orderId" bind:value={$cancelForm.orderId} />
		<AdminTextarea
			label="Cancellation Reason"
			name="reason"
			rows={3}
			bind:value={$cancelForm.reason}
			placeholder="Customer request, out of stock, etc."
			error={$cancelErrors.reason}
			required
		/>

		<div class="grid gap-2 sm:flex sm:justify-end">
			<AdminButton
				type="button"
				onclick={() => (showCancelModal = false)}
				variant="charcoal"
				disabled={$cancelSubmitting}
			>
				Keep order
			</AdminButton>
			<AdminButton type="submit" disabled={$cancelSubmitting} variant="danger">
				{$cancelSubmitting ? 'Cancelling...' : 'Cancel Order'}
			</AdminButton>
		</div>
	</form>
</AdminModal>
