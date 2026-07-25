<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { AlertTriangle, Clock, Loader2, ShoppingBag } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let refreshing = $state(false);
	let pollCount = 0;

	let isProcessing = $derived(
		data.attempt.status === 'pending' &&
			(data.paymentNotice === 'processing' || data.paymentNotice === 'completed')
	);
	let needsReview = $derived(data.attempt.status === 'review_required');
	let title = $derived(
		needsReview
			? 'Payment needs review.'
			: isProcessing
				? 'Confirming payment.'
				: 'No order was placed.'
	);
	let message = $derived.by(() => {
		if (needsReview) {
			return 'Payment reached the provider, but the order could not be completed. Support must review the payment. No stock is reserved.';
		}
		if (isProcessing) {
			return 'The provider is confirming your payment. Your order will appear only after verified payment succeeds.';
		}
		if (data.paymentNotice === 'setup_failed') {
			return 'The payment provider could not be opened. Your bag is unchanged, no order was saved, and no stock is reserved.';
		}
		if (data.paymentNotice === 'cancelled') {
			return 'Payment was cancelled. Your bag is unchanged, no order was saved, and no stock is reserved.';
		}
		return 'Payment was not completed. Your bag is unchanged, no order was saved, and no stock is reserved.';
	});

	async function refreshStatus() {
		refreshing = true;
		try {
			await invalidate('app:checkout-payment-attempt');
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		if (!isProcessing || pollCount >= 40) return;
		const interval = setInterval(() => {
			pollCount += 1;
			void invalidate('app:checkout-payment-attempt');
			if (pollCount >= 40) clearInterval(interval);
		}, 3000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>Payment status | Caro Clothing</title>
	<meta name="description" content="Review your Caro Clothing payment status." />
</svelte:head>

<main class="mx-auto flex min-h-[70dvh] max-w-2xl items-center px-4 py-14 text-bone">
	<section class="w-full border border-charcoal bg-charcoal/20 p-5 sm:p-8">
		<div
			class="flex h-14 w-14 items-center justify-center border {isProcessing
				? 'border-volt text-volt'
				: 'border-amber-400 text-amber-300'}"
		>
			{#if isProcessing}
				<Loader2 size={27} class="animate-spin" aria-hidden="true" />
			{:else}
				<AlertTriangle size={27} aria-hidden="true" />
			{/if}
		</div>

		<p class="mt-6 font-mono text-[9px] tracking-[0.16em] text-volt uppercase">
			Payment attempt {data.attempt.id.slice(0, 8)}
		</p>
		<h1 class="mt-2 font-display text-5xl leading-none text-bone uppercase sm:text-6xl">
			{title}
		</h1>
		<p class="mt-5 max-w-xl font-sans text-sm leading-6 text-ash">{message}</p>

		{#if needsReview && data.attempt.failureReason}
			<div class="mt-6 border border-amber-400/40 bg-amber-400/5 p-4" role="alert">
				<p class="font-mono text-[9px] tracking-wider text-amber-300 uppercase">Review reason</p>
				<p class="mt-2 font-sans text-sm leading-6 text-ash">{data.attempt.failureReason}</p>
			</div>
		{/if}

		<div class="mt-8 grid gap-3 sm:flex">
			{#if isProcessing}
				<Button type="button" variant="outline" disabled={refreshing} onclick={refreshStatus}>
					<Clock size={15} aria-hidden="true" />
					{refreshing ? 'Checking...' : 'Check payment status'}
				</Button>
			{/if}
			<Button
				href={resolve('/bag')}
				variant={isProcessing ? 'outline' : 'primary'}
				class="w-full sm:w-auto"
			>
				<ShoppingBag size={15} aria-hidden="true" />
				Return to bag
			</Button>
		</div>
	</section>
</main>
