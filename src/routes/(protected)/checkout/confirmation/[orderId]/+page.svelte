<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { AlertTriangle, Check, Clock } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let isRefreshingStatus = $state(false);
	let nowMs = $state(Date.now());
	let pollCount = 0;

	let order = $derived(data.order);
	let address = $derived(order.shippingAddressSnapshot);
	let latestPayment = $derived(order.payments?.[0] ?? null);
	let onlinePayment = $derived(
		order.payments?.find((payment) => ['payhere', 'paypal'].includes(payment.method)) ?? null
	);
	let paymentWindowOpen = $derived(
		Boolean(
			order.status === 'pending' &&
			order.paymentExpiresAt &&
			new Date(order.paymentExpiresAt).getTime() > nowMs
		)
	);
	let paymentComplete = $derived(
		onlinePayment?.status === 'captured' ||
			(order.status === 'confirmed' && latestPayment?.method === 'cash_on_delivery')
	);
	let requiresManualReview = $derived(Boolean(latestPayment?.requiresManualReview));
	let paymentNeedsAttention = $derived(
		requiresManualReview ||
			data.paymentNotice === 'cancelled' ||
			data.paymentNotice === 'setup_failed' ||
			data.paymentNotice === 'failed' ||
			(onlinePayment?.status !== 'captured' && order.status === 'pending')
	);

	function money(value: number) {
		return `LKR ${value.toLocaleString()}`;
	}

	function formatDeadline(value: Date | string | null) {
		if (!value) return '';
		return new Intl.DateTimeFormat('en-LK', {
			hour: 'numeric',
			minute: '2-digit',
			day: 'numeric',
			month: 'short',
			timeZone: 'Asia/Colombo'
		}).format(new Date(value));
	}

	async function refreshPaymentStatus() {
		isRefreshingStatus = true;
		try {
			await invalidate('app:checkout-order-status');
		} finally {
			isRefreshingStatus = false;
		}
	}

	$effect(() => {
		const interval = setInterval(() => {
			nowMs = Date.now();
		}, 1000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (order.status !== 'pending' || onlinePayment?.status !== 'pending' || !paymentWindowOpen) {
			return;
		}
		if (pollCount >= 24) return;
		const interval = setInterval(() => {
			pollCount += 1;
			if (pollCount >= 24) {
				clearInterval(interval);
			}
			void invalidate('app:checkout-order-status');
		}, 5000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		const refreshOnFocus = () => {
			if (document.visibilityState === 'visible') {
				void invalidate('app:checkout-order-status');
			}
		};
		document.addEventListener('visibilitychange', refreshOnFocus);
		return () => document.removeEventListener('visibilitychange', refreshOnFocus);
	});
</script>

<svelte:head>
	<title>Order {order.orderNumber} | Caro Clothing</title>
	<meta name="description" content="Review your Caro Clothing order and payment status." />
</svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-10 pb-20 text-bone">
	<div
		class="flex h-14 w-14 items-center justify-center border
		{paymentNeedsAttention && !paymentComplete
			? 'border-amber-400 text-amber-300'
			: 'border-volt bg-volt text-void'}"
	>
		{#if paymentNeedsAttention && !paymentComplete}
			<AlertTriangle size={28} aria-hidden="true" />
		{:else}
			<Check size={28} aria-hidden="true" />
		{/if}
	</div>

	<p class="mt-6 font-mono text-[10px] tracking-[0.16em] text-volt uppercase">
		Order #{order.orderNumber}
	</p>
	<h1 class="mt-2 font-display text-5xl leading-none tracking-wide text-bone uppercase md:text-6xl">
		{requiresManualReview
			? 'Payment review.'
			: paymentComplete
				? 'Order confirmed.'
				: paymentNeedsAttention
					? 'Order saved.'
					: 'Order received.'}
	</h1>
	<p class="mt-4 max-w-xl font-sans text-sm leading-6 text-ash">
		{#if data.paymentNotice === 'cancelled'}
			Payment was cancelled. No payment retry is available from this page. Review the order state
			from your account.
		{:else if data.paymentNotice === 'setup_failed'}
			The payment provider could not be opened. Return to your bag and start a new checkout; this
			page does not offer payment retries.
		{:else if requiresManualReview}
			Your payment was captured after the order could no longer be completed. Support will review
			the payment and arrange the required refund.
		{:else if paymentComplete}
			Your order is confirmed. Track fulfilment updates from your account.
		{:else}
			We received your order. Track payment and fulfilment updates from your account.
		{/if}
	</p>

	{#if paymentNeedsAttention && !paymentComplete}
		<div class="mt-6 border border-amber-400/50 bg-amber-400/5 p-4" role="alert">
			<div class="flex items-start gap-3">
				<Clock size={18} class="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
				<div>
					<p class="font-mono text-[10px] tracking-[0.12em] text-bone uppercase">Payment pending</p>
					<p class="mt-1 font-sans text-sm leading-6 text-ash">
						{requiresManualReview
							? (latestPayment?.reviewReason ?? 'This payment requires manual review.')
							: paymentWindowOpen
								? `Complete payment before ${formatDeadline(order.paymentExpiresAt)}.`
								: 'The payment window has expired. Check the order status before trying again.'}
					</p>
				</div>
			</div>

			{#if onlinePayment?.status === 'pending' && paymentWindowOpen}
				<Button
					type="button"
					variant="outline"
					disabled={isRefreshingStatus}
					class="mt-4 min-h-12 w-full sm:w-auto"
					onclick={refreshPaymentStatus}
				>
					{isRefreshingStatus ? 'Checking status...' : 'Refresh payment status'}
				</Button>
			{/if}
		</div>
	{/if}

	<section
		class="mt-8 border border-charcoal bg-charcoal/20"
		aria-labelledby="order-summary-heading"
	>
		<div class="border-b border-charcoal px-5 py-4">
			<h2
				id="order-summary-heading"
				class="font-mono text-[10px] tracking-[0.16em] text-bone uppercase"
			>
				Order summary
			</h2>
		</div>
		<ul class="flex flex-col gap-4 p-5">
			{#each order.items ?? [] as item (item.id)}
				<li class="flex gap-4">
					{#if item.imageUrl}
						<img
							src={item.imageUrl}
							alt={item.productName}
							class="h-20 w-16 shrink-0 bg-charcoal object-cover"
						/>
					{:else}
						<div class="h-20 w-16 shrink-0 bg-charcoal"></div>
					{/if}
					<div class="flex min-w-0 flex-1 flex-col justify-center">
						<strong class="truncate font-sans text-sm text-bone">{item.productName}</strong>
						<span class="mt-1 font-mono text-[9px] tracking-wide text-ash uppercase">
							{item.variantSize} / {item.variantColor} / Qty {item.quantity}
						</span>
						<span class="mt-2 font-mono text-xs text-bone">{money(item.totalPrice)}</span>
					</div>
				</li>
			{/each}
		</ul>
		<div class="space-y-3 border-t border-charcoal p-5">
			<div class="flex justify-between font-mono text-[10px] uppercase">
				<span class="text-ash">Subtotal</span>
				<span>{money(order.subtotal)}</span>
			</div>
			{#if order.discountAmount > 0}
				<div class="flex justify-between font-mono text-[10px] text-volt uppercase">
					<span>Discount</span>
					<span>-{money(order.discountAmount)}</span>
				</div>
			{/if}
			<div class="flex justify-between font-mono text-[10px] uppercase">
				<span class="text-ash">Shipping</span>
				<span>{money(order.shippingAmount)}</span>
			</div>
			<div class="flex items-end justify-between border-t border-charcoal pt-4">
				<span class="font-mono text-xs font-bold uppercase">Total</span>
				<strong class="font-display text-2xl tracking-wide">{money(order.totalAmount)}</strong>
			</div>
		</div>
	</section>

	{#if address}
		<section
			class="mt-4 border border-charcoal bg-charcoal/20 p-5"
			aria-labelledby="shipping-to-heading"
		>
			<h2
				id="shipping-to-heading"
				class="font-mono text-[10px] tracking-[0.16em] text-ash uppercase"
			>
				Shipping to
			</h2>
			<p class="mt-3 font-sans text-sm leading-6 text-bone">
				{address.recipientName}<br />
				{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}<br />
				{address.city}, {address.district}<br />
				{address.phone}
			</p>
		</section>
	{/if}

	<div class="mt-8 grid gap-3 sm:grid-cols-2">
		<Button variant="primary" href={`/account/orders/${order.id}`} class="min-h-12 w-full">
			View order
		</Button>
		<Button variant="outline" href="/shop" class="min-h-12 w-full">Continue shopping</Button>
	</div>
</div>
