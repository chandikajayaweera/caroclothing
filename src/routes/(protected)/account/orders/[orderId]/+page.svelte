<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const order = $derived(data.order);
	const address = $derived(order.shippingAddressSnapshot);
	const timeline = $derived([
		{ label: 'Order Placed', done: true, date: order.createdAt },
		{ label: 'Confirmed', done: order.confirmedAt !== null, date: order.confirmedAt },
		{
			label: 'Processing',
			done: ['processing', 'shipped', 'delivered'].includes(order.status),
			date: null
		},
		{ label: 'Shipped', done: order.shippedAt !== null, date: order.shippedAt },
		{ label: 'Delivered', done: order.deliveredAt !== null, date: order.deliveredAt }
	]);
	const currentStepIndex = $derived(Math.max(timeline.findIndex((step) => !step.done) - 1, 0));

	function formatDate(value: Date | string | null): string {
		if (!value) return '';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString()}`;
	}
</script>

<svelte:head>
	<title>Order {order.orderNumber} | Caro Clothing</title>
	<meta name="description" content="Order details for {order.orderNumber}" />
</svelte:head>

<div class="flex flex-col gap-10">
	<div class="flex flex-col gap-2">
		<a
			href={resolve('/account/orders')}
			class="mb-4 block font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
		>
			Back to Orders
		</a>
		<h1 class="font-display text-4xl text-bone uppercase">Order {order.orderNumber}</h1>
		<span class="font-mono text-[9px] tracking-widest text-ash uppercase">
			{formatDate(order.createdAt)}
		</span>
	</div>

	<div class="lg:grid lg:grid-cols-2 lg:gap-16">
		<div class="flex flex-col gap-10">
			<section class="flex flex-col gap-6">
				<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Items</h2>
				<div class="flex flex-col gap-4">
					{#each order.items ?? [] as item (item.id)}
						<div class="flex gap-4">
							{#if item.imageUrl}
								<img src={item.imageUrl} alt="" class="h-20 w-16 object-cover" />
							{:else}
								<div class="h-20 w-16 bg-charcoal"></div>
							{/if}
							<div class="flex flex-col justify-center">
								<span class="font-sans text-sm font-medium text-bone uppercase">
									{item.productName}
								</span>
								<span class="font-mono text-[9px] tracking-widest text-ash uppercase">
									{item.variantSize} / {item.variantColor} / QTY {item.quantity}
								</span>
							</div>
							<span class="ml-auto self-center font-mono text-xs text-bone">
								{formatMoney(item.totalPrice)}
							</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="flex flex-col gap-6 border-t border-charcoal pt-8">
				<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Shipping Address</h2>
				{#if address}
					<div class="font-sans text-sm leading-relaxed text-bone">
						<p class="font-medium">{address.recipientName}</p>
						<p>{address.addressLine1}</p>
						{#if address.addressLine2}
							<p>{address.addressLine2}</p>
						{/if}
						<p>{address.city}, {address.district}</p>
						<p>{address.country}</p>
					</div>
				{:else}
					<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
						Shipping address unavailable.
					</p>
				{/if}
			</section>

			<section class="flex flex-col gap-4 border-t border-charcoal pt-8">
				<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Summary</h2>
				<div class="flex flex-col gap-2">
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash">Subtotal</span>
						<span class="text-bone">{formatMoney(order.subtotal)}</span>
					</div>
					{#if order.discountAmount > 0}
						<div class="flex justify-between font-mono text-[10px] uppercase">
							<span class="text-ash">Discount</span>
							<span class="text-volt">-{formatMoney(order.discountAmount)}</span>
						</div>
					{/if}
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash">Shipping</span>
						<span class="text-bone">{formatMoney(order.shippingAmount)}</span>
					</div>
					<div class="mt-2 flex justify-between font-mono text-sm font-bold uppercase">
						<span class="text-bone">Total</span>
						<span class="text-bone">{formatMoney(order.totalAmount)}</span>
					</div>
				</div>
			</section>
		</div>

		<div class="mt-12 lg:mt-0">
			<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Order Status</h2>
			<div class="mt-8 flex flex-col gap-0">
				{#each timeline as step, i (step.label)}
					<div class="relative flex items-start gap-4 pb-8 last:pb-0">
						{#if i < timeline.length - 1}
							<div class="absolute top-4 left-[5.5px] h-full w-px bg-charcoal">
								<div
									class="w-full bg-volt transition-all duration-500"
									style="height: {step.done && timeline[i + 1].done ? '100%' : '0%'}"
								></div>
							</div>
						{/if}

						<div
							class="z-10 mt-0.5 h-3 w-3 flex-shrink-0 rounded-full transition-all duration-300
							{step.done ? 'bg-volt' : i === currentStepIndex + 1 ? 'bg-volt ring-4 ring-volt/20' : 'bg-ash/20'}"
						></div>

						<div class="flex flex-col gap-0.5">
							<span
								class="font-mono text-xs tracking-widest uppercase
								{step.done ? 'text-bone' : 'text-ash/40'}"
							>
								{step.label}
							</span>
							{#if step.date}
								<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
									{formatDate(step.date)}
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
