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

<div class="mx-auto max-w-lg px-4 pt-12 pb-20 text-center text-bone">
	<div class="mb-6 flex justify-center text-volt">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="64"
			height="64"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide lucide-check-circle-2"
		>
			<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
			<path d="m9 12 2 2 4-4" />
		</svg>
	</div>

	<h1 class="font-display text-5xl leading-none text-bone uppercase md:text-6xl">
		Order Received.
	</h1>
	<p class="mt-4 font-mono text-sm tracking-widest text-volt uppercase">
		#{order.orderNumber}
	</p>
	<p class="mt-2 font-mono text-xs tracking-widest text-ash uppercase">
		We'll update your order when payment and fulfillment move forward.
	</p>

	<div class="my-8 border-t border-charcoal"></div>

	<div class="flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-5 text-left">
		<span class="font-mono text-[10px] tracking-widest text-ash uppercase">Order Summary</span>
		{#each order.items ?? [] as item (item.id)}
			<div class="flex gap-4">
				{#if item.imageUrl}
					<img src={item.imageUrl} alt={item.productName} class="h-16 w-12 object-cover bg-charcoal" />
				{:else}
					<div class="h-16 w-12 bg-charcoal"></div>
				{/if}
				<div class="flex flex-col justify-center">
					<span class="font-sans text-xs font-medium text-bone uppercase">{item.productName}</span>
					<span class="font-mono text-[9px] text-ash uppercase">
						{item.variantSize} / {item.variantColor} / QTY {item.quantity}
					</span>
				</div>
				<span class="ml-auto self-center font-mono text-xs text-bone">
					{formatMoney(item.totalPrice)}
				</span>
			</div>
		{/each}
		<div class="flex flex-col gap-2 border-t border-charcoal pt-4">
			{#if order.discountAmount > 0}
				<div class="flex justify-between font-mono text-[10px] uppercase">
					<span class="text-ash">Discount</span>
					<span class="text-bone">-{formatMoney(order.discountAmount)}</span>
				</div>
			{/if}
			<div class="flex justify-between font-mono text-[10px] uppercase">
				<span class="text-ash">Shipping</span>
				<span class="text-bone">{formatMoney(order.shippingAmount)}</span>
			</div>
			<div class="flex justify-between font-mono text-sm font-bold uppercase">
				<span class="text-bone">Total</span>
				<span class="text-bone">{formatMoney(order.totalAmount)}</span>
			</div>
		</div>
	</div>

	{#if address}
		<div class="mt-5 border border-charcoal bg-charcoal/20 p-5 text-left">
			<p class="font-mono text-[10px] tracking-widest text-ash uppercase">Shipping To</p>
			<p class="mt-3 font-sans text-sm leading-relaxed text-bone uppercase">
				{address.recipientName}<br />
				{address.addressLine1}{address.addressLine2 ? ', ' + address.addressLine2 : ''}<br />
				{address.city}, {address.district}
			</p>
		</div>
	{/if}

	<Button
		variant="primary"
		href="/account/orders/{order.id}"
		class="mt-8 w-full py-4 text-xs font-mono tracking-widest uppercase transition-all duration-300"
	>
		View Order
	</Button>

	<Button
		variant="outline"
		href="/shop"
		class="mt-3 w-full border-charcoal text-bone hover:bg-bone hover:text-void py-4 text-xs font-mono tracking-widest uppercase transition-all duration-300"
	>
		Continue Shopping
	</Button>
</div>
