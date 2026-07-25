<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		CheckCircle2,
		Circle,
		CreditCard,
		ExternalLink,
		MapPin,
		Package,
		Truck
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const order = $derived(data.order);
	const address = $derived(order.shippingAddressSnapshot);
	const history = $derived(
		order.statusHistory?.length
			? order.statusHistory
			: [
					{
						id: 'created',
						toStatus: order.status,
						note: null,
						createdAt: order.createdAt
					}
				]
	);

	function formatDate(value: Date | string | null): string {
		if (!value) return 'Not available';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function openTrackingUrl(url: string): void {
		window.open(url, '_blank', 'noopener,noreferrer');
	}
</script>

<svelte:head>
	<title>Order {order.orderNumber} | Caro Clothing</title>
	<meta name="description" content="Order details for {order.orderNumber}" />
</svelte:head>

<div class="space-y-10">
	<header class="border-b border-charcoal pb-6">
		<a
			href={resolve('/account/orders')}
			class="inline-flex min-h-11 items-center gap-2 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-volt"
		>
			<ArrowLeft size={14} aria-hidden="true" />
			All orders
		</a>
		<div class="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Order details</p>
				<h1 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">
					{order.orderNumber}
				</h1>
				<p class="mt-3 font-mono text-[9px] text-ash">{formatDate(order.createdAt)}</p>
			</div>
			<span
				class="w-fit border border-volt/30 px-3 py-2 font-mono text-[9px] tracking-widest text-volt uppercase"
			>
				{formatLabel(order.status)}
			</span>
		</div>
	</header>

	<div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
		<div class="space-y-10">
			<section>
				<div class="flex items-center gap-3">
					<Package size={18} class="text-volt" aria-hidden="true" />
					<h2 class="font-display text-3xl uppercase">Items</h2>
				</div>
				<div class="mt-5 divide-y divide-charcoal border-y border-charcoal">
					{#each order.items ?? [] as item (item.id)}
						<div
							class="grid grid-cols-[64px_1fr] gap-4 py-5 sm:grid-cols-[72px_1fr_auto] sm:items-center"
						>
							{#if item.imageUrl}
								<img
									src={item.imageUrl}
									alt=""
									class="h-20 w-16 bg-charcoal object-cover sm:h-24 sm:w-18"
								/>
							{:else}
								<div class="h-20 w-16 bg-charcoal/40 sm:h-24 sm:w-18"></div>
							{/if}
							<div>
								<h3 class="text-sm font-medium text-bone uppercase">{item.productName}</h3>
								<p class="mt-2 font-mono text-[9px] tracking-widest text-ash uppercase">
									{item.variantColor} / {item.variantSize} / Qty {item.quantity}
								</p>
								<p class="mt-1 font-mono text-[9px] text-ash">
									{formatMoney(item.unitPrice)} each
								</p>
							</div>
							<p class="col-start-2 font-mono text-sm text-bone sm:col-auto">
								{formatMoney(item.totalPrice)}
							</p>
						</div>
					{/each}
				</div>
			</section>

			<section class="grid gap-8 border-t border-charcoal pt-8 md:grid-cols-2">
				<div>
					<div class="flex items-center gap-3">
						<MapPin size={18} class="text-volt" aria-hidden="true" />
						<h2 class="font-display text-2xl uppercase">Delivery address</h2>
					</div>
					{#if address}
						<div class="mt-4 text-sm leading-relaxed text-ash">
							<p class="font-medium text-bone">{address.recipientName}</p>
							<p>{address.addressLine1}</p>
							{#if address.addressLine2}<p>{address.addressLine2}</p>{/if}
							<p>{address.city}, {address.district}</p>
							<p>{address.postalCode ?? ''} {address.country}</p>
							<p class="mt-2 font-mono text-[10px]">{address.phone}</p>
						</div>
					{:else}
						<p class="mt-4 text-sm text-ash">Shipping address unavailable.</p>
					{/if}
				</div>

				<div>
					<div class="flex items-center gap-3">
						<Truck size={18} class="text-volt" aria-hidden="true" />
						<h2 class="font-display text-2xl uppercase">Shipping</h2>
					</div>
					<div class="mt-4 space-y-2 text-sm text-ash">
						<p class="text-bone">{order.shippingMethodSnapshot?.name ?? 'Delivery method'}</p>
						{#if order.trackingCarrier}<p>{order.trackingCarrier}</p>{/if}
						{#if order.trackingNumber}<p class="font-mono text-[10px]">
								{order.trackingNumber}
							</p>{/if}
						{#if order.trackingUrl}
							<button
								type="button"
								onclick={() => openTrackingUrl(order.trackingUrl!)}
								class="inline-flex min-h-11 items-center gap-2 font-mono text-[9px] tracking-widest text-volt uppercase hover:text-bone"
							>
								Track shipment
								<ExternalLink size={13} aria-hidden="true" />
							</button>
						{/if}
					</div>
				</div>
			</section>

			{#if order.payments?.length}
				<section class="border-t border-charcoal pt-8">
					<div class="flex items-center gap-3">
						<CreditCard size={18} class="text-volt" aria-hidden="true" />
						<h2 class="font-display text-2xl uppercase">Payment</h2>
					</div>
					<div class="mt-4 divide-y divide-charcoal border-y border-charcoal">
						{#each order.payments as payment (payment.id)}
							<div class="grid gap-2 py-4 sm:grid-cols-3 sm:items-center">
								<p class="font-mono text-[10px] tracking-widest text-bone uppercase">
									{formatLabel(payment.method)}
								</p>
								<p class="font-mono text-[9px] text-ash uppercase">{formatLabel(payment.status)}</p>
								<p class="font-mono text-sm text-bone sm:text-right">
									{formatMoney(payment.amount)}
								</p>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<aside class="space-y-8">
			<section class="border border-charcoal p-5 lg:sticky lg:top-24">
				<h2 class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Order total</h2>
				<dl class="mt-5 space-y-3 font-mono text-[10px] uppercase">
					<div class="flex justify-between gap-4">
						<dt class="text-ash">Subtotal</dt>
						<dd>{formatMoney(order.subtotal)}</dd>
					</div>
					{#if order.discountAmount > 0}
						<div class="flex justify-between gap-4">
							<dt class="text-ash">Discount</dt>
							<dd class="text-volt">-{formatMoney(order.discountAmount)}</dd>
						</div>
					{/if}
					<div class="flex justify-between gap-4">
						<dt class="text-ash">Shipping</dt>
						<dd>{formatMoney(order.shippingAmount)}</dd>
					</div>
					<div class="flex justify-between gap-4 border-t border-charcoal pt-4 text-sm">
						<dt>Total</dt>
						<dd>{formatMoney(order.totalAmount)}</dd>
					</div>
				</dl>
			</section>

			<section>
				<h2 class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Status history</h2>
				<ol class="mt-5 space-y-0">
					{#each history as event, index (event.id)}
						<li class="relative flex gap-4 pb-7 last:pb-0">
							{#if index < history.length - 1}
								<span class="absolute top-4 left-[7px] h-full w-px bg-charcoal"></span>
							{/if}
							{#if index === history.length - 1}
								<CheckCircle2
									size={16}
									class="z-10 shrink-0 bg-void text-volt"
									aria-hidden="true"
								/>
							{:else}
								<Circle size={16} class="z-10 shrink-0 bg-void text-ash/50" aria-hidden="true" />
							{/if}
							<div>
								<p class="font-mono text-[10px] tracking-widest text-bone uppercase">
									{formatLabel(event.toStatus)}
								</p>
								<p class="mt-1 font-mono text-[8px] text-ash">{formatDate(event.createdAt)}</p>
								{#if event.note}<p class="mt-2 text-xs leading-relaxed text-ash">
										{event.note}
									</p>{/if}
							</div>
						</li>
					{/each}
				</ol>
			</section>
		</aside>
	</div>
</div>
