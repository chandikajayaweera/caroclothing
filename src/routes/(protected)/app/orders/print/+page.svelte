<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { Printer, ChevronLeft } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import { formatAdminDateTime, formatAdminMoney } from '$lib/shared/admin/format';

	let { data }: { data: PageData } = $props();
	const orders = $derived(data.orders);

	$effect(() => {
		const timer = setTimeout(() => {
			window.print();
		}, 800);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>Print Manifest & Packing Slips | Caro Admin</title>
</svelte:head>

<div
	class="fixed inset-x-0 top-0 z-50 grid gap-2 border-b border-charcoal bg-void px-3 py-3 shadow-md sm:flex sm:items-center sm:justify-between sm:px-6 sm:py-4 print:hidden"
>
	<AdminButton href={resolve('/app/orders')} variant="outline" size="sm">
		<ChevronLeft size={14} />
		Back to Orders
	</AdminButton>
	<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:gap-3">
		<span class="font-mono text-[10px] text-ash uppercase">{orders.length} orders selected</span>
		<AdminButton type="button" onclick={() => window.print()} variant="volt" size="sm">
			<Printer size={12} />
			Print Document
		</AdminButton>
	</div>
</div>

<div
	class="mx-auto max-w-4xl px-3 pt-32 pb-12 text-void sm:px-6 sm:pt-24 print:bg-white print:p-0 print:text-black"
>
	<section
		class="mb-12 break-after-page border border-charcoal bg-charcoal/5 p-3 sm:p-6 print:border-black print:bg-transparent print:p-6"
	>
		<div
			class="grid gap-3 border-b border-charcoal pb-4 sm:flex sm:items-end sm:justify-between print:flex print:border-black"
		>
			<div>
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase print:text-black">
					Handover Document
				</p>
				<h1 class="mt-2 font-display text-4xl leading-none text-bone uppercase print:text-black">
					Courier Manifest
				</h1>
			</div>
			<div class="text-right font-mono text-[10px] text-ash print:text-black">
				<p>Printed: {formatAdminDateTime(new Date())}</p>
				<p>Total Orders: {orders.length}</p>
			</div>
		</div>

		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-left font-sans text-xs">
				<thead>
					<tr
						class="border-b border-charcoal font-mono text-[9px] tracking-widest text-ash uppercase print:border-black print:text-black"
					>
						<th class="py-3 pr-4">Order</th>
						<th class="px-4 py-3">Recipient</th>
						<th class="px-4 py-3">Phone</th>
						<th class="px-4 py-3">District / City</th>
						<th class="px-4 py-3 text-right">Items</th>
						<th class="py-3 pl-4 text-right">Total Amount</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-charcoal/30 print:divide-black/20">
					{#each orders as o (o.id)}
						<tr class="text-bone print:text-black">
							<td class="py-3 pr-4 font-mono font-bold">{o.orderNumber}</td>
							<td class="px-4 py-3">{o.shippingAddressSnapshot?.recipientName ?? 'Guest'}</td>
							<td class="px-4 py-3 font-mono">{o.shippingAddressSnapshot?.phone ?? ''}</td>
							<td class="px-4 py-3">
								{o.shippingAddressSnapshot?.district ?? ''}, {o.shippingAddressSnapshot?.city ?? ''}
							</td>
							<td class="px-4 py-3 text-right font-mono">{o.itemCount}</td>
							<td class="py-3 pl-4 text-right font-mono font-bold"
								>{formatAdminMoney(o.totalAmount)}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div
			class="mt-12 grid gap-8 font-mono text-[10px] text-ash sm:grid-cols-2 print:grid-cols-2 print:text-black"
		>
			<div class="border-t border-charcoal/50 pt-4 print:border-black">
				<p class="font-bold">Handed Over By:</p>
				<p class="mt-8">Signature / Date</p>
			</div>
			<div class="border-t border-charcoal/50 pt-4 print:border-black">
				<p class="font-bold">Received By Courier:</p>
				<p class="mt-8">Signature / Date</p>
			</div>
		</div>
	</section>

	{#each orders as o, i (o.id)}
		<section
			class="border border-charcoal bg-charcoal/5 p-4 sm:p-8 print:border-0 print:border-black print:bg-transparent print:p-0 {i <
			orders.length - 1
				? 'break-after-page'
				: ''}"
		>
			<div
				class="grid gap-3 border-b border-charcoal pb-6 sm:flex sm:justify-between print:flex print:border-black"
			>
				<div>
					<h2
						class="font-display text-3xl font-black tracking-widest text-bone uppercase print:text-black"
					>
						CARO CLOTHING
					</h2>
					<p class="font-mono text-[9px] tracking-widest text-ash print:text-black">
						PACKING SLIP & RECEIPT
					</p>
				</div>
				<div class="text-right font-mono text-[10px] text-ash print:text-black">
					<p class="text-sm font-bold text-volt print:text-black">{o.orderNumber}</p>
					<p>Placed: {formatAdminDateTime(o.createdAt)}</p>
				</div>
			</div>

			<div
				class="mt-6 grid gap-6 font-sans text-xs text-bone sm:grid-cols-2 print:grid-cols-2 print:text-black"
			>
				<div>
					<p class="font-mono text-[9px] tracking-widest text-ash uppercase print:text-black">
						Ship To:
					</p>
					{#if o.shippingAddressSnapshot}
						<p class="mt-1 font-bold">{o.shippingAddressSnapshot.recipientName}</p>
						<p>{o.shippingAddressSnapshot.phone}</p>
						<p class="mt-1">{o.shippingAddressSnapshot.addressLine1}</p>
						{#if o.shippingAddressSnapshot.addressLine2}
							<p>{o.shippingAddressSnapshot.addressLine2}</p>
						{/if}
						<p>{o.shippingAddressSnapshot.city}, {o.shippingAddressSnapshot.district}</p>
						{#if o.shippingAddressSnapshot.postalCode}
							<p>{o.shippingAddressSnapshot.postalCode}</p>
						{/if}
					{:else}
						<p class="mt-1 text-ash">No shipping snapshot</p>
					{/if}
				</div>
				<div class="text-right">
					<p class="font-mono text-[9px] tracking-widest text-ash uppercase print:text-black">
						Order details:
					</p>
					<p class="mt-1">Customer ID: <span class="font-mono">{o.userId ?? 'Guest'}</span></p>
					<p>Fulfillment Status: <span class="font-mono uppercase">{o.status}</span></p>
					{#if o.customerNote}
						<div class="mt-3 border border-dashed border-charcoal p-3 text-left print:border-black">
							<p class="font-mono text-[8px] text-ash uppercase print:text-black">Customer Note:</p>
							<p class="mt-1 font-mono text-[11px]">&ldquo;{o.customerNote}&rdquo;</p>
						</div>
					{/if}
				</div>
			</div>

			<div class="mt-8">
				<table class="w-full text-left font-sans text-xs">
					<thead>
						<tr
							class="border-b border-charcoal font-mono text-[9px] tracking-widest text-ash uppercase print:border-black print:text-black"
						>
							<th class="py-2">Item</th>
							<th class="px-4 py-2">Size/Color</th>
							<th class="px-4 py-2 text-right">Price</th>
							<th class="px-4 py-2 text-right">Qty</th>
							<th class="py-2 pl-4 text-right">Total</th>
						</tr>
					</thead>
					<tbody
						class="divide-y divide-charcoal/30 text-bone print:divide-black/20 print:text-black"
					>
						{#if o.items}
							{#each o.items as item (item.id)}
								<tr>
									<td class="py-3 font-semibold">{item.productName}</td>
									<td class="px-4 py-3 font-mono text-[10px]">
										{item.variantSize} / {item.variantColor}
									</td>
									<td class="px-4 py-3 text-right font-mono">{formatAdminMoney(item.unitPrice)}</td>
									<td class="px-4 py-3 text-right font-mono">{item.quantity}</td>
									<td class="py-3 pl-4 text-right font-mono">{formatAdminMoney(item.totalPrice)}</td
									>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			<div class="mt-6 border-t border-charcoal/50 pt-4 print:border-black">
				<div
					class="ml-auto flex max-w-xs flex-col gap-1.5 font-mono text-[10px] text-ash print:text-black"
				>
					<div class="flex justify-between">
						<span>Subtotal:</span>
						<span class="text-bone print:text-black">{formatAdminMoney(o.subtotal)}</span>
					</div>
					{#if o.discountAmount > 0}
						<div class="flex justify-between text-red-400 print:text-black">
							<span>Discount:</span>
							<span>-{formatAdminMoney(o.discountAmount)}</span>
						</div>
					{/if}
					<div class="flex justify-between">
						<span>Shipping:</span>
						<span class="text-bone print:text-black">{formatAdminMoney(o.shippingAmount)}</span>
					</div>
					<div class="my-1 border-t border-charcoal/30 print:border-black/30"></div>
					<div class="flex justify-between text-xs font-bold text-volt print:text-black">
						<span>Order Total:</span>
						<span>{formatAdminMoney(o.totalAmount)}</span>
					</div>
				</div>
			</div>
		</section>
	{/each}
</div>

<style>
	:global(body) {
		background-color: #0a0a0a !important;
	}
	@media print {
		:global(body) {
			background-color: #ffffff !important;
		}
		.break-after-page {
			break-after: page;
			page-break-after: always;
		}
	}
</style>
