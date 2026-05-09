<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const order = $derived(data.order);
	const address = $derived(order.shippingAddressSnapshot);

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString()}`;
	}
</script>

<svelte:head>
	<title>Order Confirmation | Caro Clothing</title>
	<meta name="description" content="Your order has been received" />
</svelte:head>

<div class="mx-auto max-w-lg px-4 pt-12 pb-20 text-center">
	<h1 class="font-display text-6xl leading-none text-void uppercase md:text-8xl">
		Order Received.
	</h1>
	<p class="mt-4 font-mono text-sm tracking-widest text-void/50 uppercase">
		#{order.orderNumber}
	</p>
	<p class="mt-1 font-mono text-xs tracking-widest text-void/40 uppercase">
		We'll update your order when payment and fulfillment move forward.
	</p>

	<div class="my-8 border-t border-void/10"></div>

	<div class="flex flex-col gap-4 bg-void/5 p-5 text-left">
		<span class="font-mono text-[10px] tracking-widest text-void/40 uppercase">Order Summary</span>
		{#each order.items ?? [] as item (item.id)}
			<div class="flex gap-4">
				{#if item.imageUrl}
					<img src={item.imageUrl} alt={item.productName} class="h-16 w-12 object-cover" />
				{:else}
					<div class="h-16 w-12 bg-void/10"></div>
				{/if}
				<div class="flex flex-col justify-center">
					<span class="font-sans text-xs font-medium text-void uppercase">{item.productName}</span>
					<span class="font-mono text-[9px] text-void/40 uppercase">
						{item.variantSize} / {item.variantColor} / QTY {item.quantity}
					</span>
				</div>
				<span class="ml-auto self-center font-mono text-xs text-void">
					{formatMoney(item.totalPrice)}
				</span>
			</div>
		{/each}
		<div class="flex flex-col gap-2 border-t border-void/10 pt-4">
			{#if order.discountAmount > 0}
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-void/60">Discount</span>
					<span class="text-void">-{formatMoney(order.discountAmount)}</span>
				</div>
			{/if}
			<div class="flex justify-between font-mono text-[10px] uppercase">
				<span class="text-void/60">Shipping</span>
				<span class="text-void">{formatMoney(order.shippingAmount)}</span>
			</div>
			<div class="flex justify-between font-mono text-sm font-bold uppercase">
				<span class="text-void">Total</span>
				<span class="text-void">{formatMoney(order.totalAmount)}</span>
			</div>
		</div>
	</div>

	{#if address}
		<div class="mt-5 border border-void/10 p-5 text-left">
			<p class="font-mono text-[10px] tracking-widest text-void/40 uppercase">Shipping To</p>
			<p class="mt-3 font-sans text-sm leading-relaxed text-void uppercase">
				{address.recipientName}<br />
				{address.city}, {address.district}
			</p>
		</div>
	{/if}

	<Button
		variant="primary"
		href="/account/orders/{order.id}"
		class="mt-8 w-full bg-void py-4 text-bone hover:bg-volt hover:text-void"
	>
		View Order
	</Button>

	<Button
		variant="outline"
		href="/shop"
		class="mt-3 w-full border-void text-void hover:bg-void hover:text-bone"
	>
		Continue Shopping
	</Button>
</div>
