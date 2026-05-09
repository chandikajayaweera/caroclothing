<script lang="ts">
	import type { ActionData, PageData } from './$types';

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

	const actionMessage = $derived(actionData?.form?.message);

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
</script>

<svelte:head>
	<title>Orders | Caro Admin</title>
	<meta
		name="description"
		content="Manage customer orders, payment state, tracking data, and order status transitions."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Commerce</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				Orders
			</h1>
		</div>

		<form method="POST" action="?/cancelExpired" class="mt-5 flex gap-2 md:mt-0">
			<input type="hidden" name="limit" value="50" />
			<button
				class="bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone"
			>
				Cancel Expired Holds
			</button>
		</form>
	</div>

	{#if actionMessage}
		<p
			class="mt-6 border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
		>
			{actionMessage}
		</p>
	{/if}

	<div class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
		<div class="flex flex-col gap-4">
			<div class="border border-charcoal bg-charcoal/25">
				<div class="border-b border-charcoal p-5">
					<div class="items-center justify-between gap-4 md:flex">
						<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
							{data.orders.total} orders
						</p>
						<form method="GET" class="mt-4 flex flex-wrap gap-2 md:mt-0">
							<input
								name="query"
								value={data.filters.query}
								placeholder="Order or tracking"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							/>
							<input
								name="userId"
								value={data.filters.userId}
								placeholder="User ID"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							/>
							<select
								name="status"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							>
								{#each statusOptions as option (option.value)}
									<option value={option.value} selected={data.filters.status === option.value}>
										{option.label}
									</option>
								{/each}
							</select>
							<label
								class="flex items-center gap-2 border border-charcoal bg-void px-3 py-2 font-mono text-[10px] tracking-widest text-ash uppercase"
							>
								<input
									type="checkbox"
									name="paymentExpiredOnly"
									value="true"
									checked={data.filters.paymentExpiredOnly}
								/>
								Expired
							</label>
							<input type="hidden" name="limit" value={data.filters.limit} />
							<button
								class="border border-ash/30 px-4 py-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
							>
								Filter
							</button>
						</form>
					</div>
				</div>

				{#if data.orders.items.length > 0}
					<div class="overflow-x-auto">
						<table class="w-full min-w-[1100px] text-left">
							<thead class="border-b border-charcoal">
								<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
									<th class="px-5 py-4 font-normal">Order</th>
									<th class="px-5 py-4 font-normal">Status</th>
									<th class="px-5 py-4 font-normal">Total</th>
									<th class="px-5 py-4 font-normal">Items</th>
									<th class="px-5 py-4 font-normal">Created</th>
									<th class="px-5 py-4 font-normal">Tracking</th>
									<th class="px-5 py-4 text-right font-normal">Transition</th>
								</tr>
							</thead>
							<tbody>
								{#each data.orders.items as order (order.id)}
									<tr class="border-b border-charcoal/70 last:border-b-0">
										<td class="px-5 py-4">
											<div class="flex flex-col gap-1">
												<span class="font-mono text-xs text-bone uppercase">
													{order.orderNumber}
												</span>
												<span class="max-w-[240px] truncate font-mono text-[10px] text-ash">
													{order.userId ?? 'Guest order'}
												</span>
											</div>
										</td>
										<td class="px-5 py-4">
											<span
												class="font-mono text-[10px] tracking-widest uppercase {statusClass(
													order.status
												)}"
											>
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
										<td class="px-5 py-4">
											{#if order.availableTransitions.length > 0}
												<form
													method="POST"
													action="?/transitionStatus"
													class="flex justify-end gap-2"
												>
													<input type="hidden" name="orderId" value={order.id} />
													<select
														name="toStatus"
														class="border border-charcoal bg-void px-2 py-2 font-mono text-[10px] text-bone"
													>
														{#each order.availableTransitions as status (status)}
															<option value={status}>{formatStatus(status)}</option>
														{/each}
													</select>
													<button
														class="font-mono text-[10px] tracking-widest text-volt uppercase hover:text-bone"
													>
														Apply
													</button>
												</form>
											{:else}
												<p
													class="text-right font-mono text-[10px] tracking-widest text-ash/50 uppercase"
												>
													Terminal
												</p>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="p-12 text-center">
						<p class="font-display text-4xl text-bone uppercase">No orders found</p>
						<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
							Adjust filters or wait for checkout activity.
						</p>
					</div>
				{/if}
			</div>

			<div class="border border-charcoal bg-charcoal/25">
				<div class="border-b border-charcoal p-5">
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Recent payments</p>
				</div>

				{#if data.payments.items.length > 0}
					<div class="overflow-x-auto">
						<table class="w-full min-w-[780px] text-left">
							<thead class="border-b border-charcoal">
								<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
									<th class="px-5 py-4 font-normal">Payment</th>
									<th class="px-5 py-4 font-normal">Status</th>
									<th class="px-5 py-4 font-normal">Amount</th>
									<th class="px-5 py-4 font-normal">Method</th>
									<th class="px-5 py-4 font-normal">Paid</th>
								</tr>
							</thead>
							<tbody>
								{#each data.payments.items as payment (payment.id)}
									<tr class="border-b border-charcoal/70 last:border-b-0">
										<td class="px-5 py-4">
											<div class="flex flex-col gap-1">
												<span class="font-mono text-xs text-bone">{payment.id}</span>
												<span class="font-mono text-[10px] text-ash">{payment.orderId}</span>
											</div>
										</td>
										<td class="px-5 py-4">
											<span
												class="font-mono text-[10px] tracking-widest uppercase {statusClass(
													payment.status
												)}"
											>
												{formatStatus(payment.status)}
											</span>
										</td>
										<td class="px-5 py-4 font-mono text-xs text-bone">
											{formatMoney(payment.amount)}
										</td>
										<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
											{formatStatus(payment.method)}
										</td>
										<td class="px-5 py-4 font-mono text-[10px] text-ash">
											{formatDate(payment.paidAt)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="p-8">
						<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
							No payments recorded.
						</p>
					</div>
				{/if}
			</div>
		</div>

		<aside class="flex flex-col gap-4">
			<form method="POST" action="?/updateFulfillment" class="border border-charcoal bg-void p-5">
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Fulfillment</h2>
				<div class="mt-5 flex flex-col gap-3">
					<input
						name="orderId"
						placeholder="Order ID"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						required
					/>
					<input
						name="trackingNumber"
						placeholder="Tracking number"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					/>
					<input
						name="trackingCarrier"
						placeholder="Carrier"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					/>
					<input
						name="trackingUrl"
						placeholder="Tracking URL"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					/>
					<button
						class="bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
					>
						Save Tracking
					</button>
				</div>
			</form>

			<form method="POST" action="?/recordPayment" class="border border-charcoal bg-void p-5">
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Record Payment</h2>
				<div class="mt-5 flex flex-col gap-3">
					<input
						name="orderId"
						placeholder="Order ID"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						required
					/>
					<select
						name="status"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						required
					>
						{#each paymentStatuses as status (status)}
							<option value={status}>{formatStatus(status)}</option>
						{/each}
					</select>
					<select
						name="method"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					>
						<option value="">Existing payment method</option>
						{#each paymentMethods as method (method)}
							<option value={method}>{formatStatus(method)}</option>
						{/each}
					</select>
					<input
						name="amount"
						type="number"
						min="1"
						placeholder="Amount for new payment"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					/>
					<input
						name="transactionId"
						placeholder="Transaction ID"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					/>
					<button
						class="bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
					>
						Record
					</button>
				</div>
			</form>

			<form method="POST" action="?/recordRefund" class="border border-charcoal bg-void p-5">
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Record Refund</h2>
				<div class="mt-5 flex flex-col gap-3">
					<input
						name="paymentId"
						placeholder="Payment ID"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						required
					/>
					<input
						name="refundAmount"
						type="number"
						min="1"
						placeholder="Refund amount"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						required
					/>
					<button
						class="border border-ash/30 px-5 py-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
					>
						Refund
					</button>
				</div>
			</form>
		</aside>
	</div>
</section>
