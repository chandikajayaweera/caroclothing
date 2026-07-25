<script lang="ts">
	type ShippingQuote = {
		name: string;
		carrier: string | null;
		price: number;
		priceBeforeFreeShipping: number;
		freeShippingThreshold: number | null;
		amountToFreeShipping: number | null;
		etaText: string;
	};

	let {
		quotes = [],
		selectedPrice = 0
	}: {
		quotes?: ShippingQuote[];
		selectedPrice?: number;
	} = $props();

	const activeQuotes = $derived(quotes.filter((quote) => quote.priceBeforeFreeShipping >= 0));
	const primaryQuote = $derived(activeQuotes[0] ?? null);
	const lowestPrice = $derived.by(() => {
		if (activeQuotes.length === 0) return null;
		return Math.min(...activeQuotes.map((quote) => quote.priceBeforeFreeShipping));
	});
	const freeThreshold = $derived.by(() => {
		const thresholds = activeQuotes
			.map((quote) => quote.freeShippingThreshold)
			.filter((value): value is number => value !== null);

		return thresholds.length > 0 ? Math.min(...thresholds) : null;
	});
	const amountToFreeShipping = $derived(
		freeThreshold === null ? null : Math.max(freeThreshold - selectedPrice, 0)
	);

	function formatMoney(value: number | null | undefined): string {
		return `LKR ${Math.round(value ?? 0).toLocaleString('en-LK')}`;
	}
</script>

{#if primaryQuote}
	<div class="mt-5 border border-charcoal bg-charcoal/25 p-4">
		<div class="flex items-start justify-between gap-4">
			<div>
				<span class="block font-mono text-[10px] tracking-widest text-volt uppercase">
					Delivery
				</span>
				<p class="mt-2 font-sans text-sm text-bone/85">
					{primaryQuote.name}{primaryQuote.carrier ? ` by ${primaryQuote.carrier}` : ''}
				</p>
				<p class="mt-1 font-sans text-xs text-ash">{primaryQuote.etaText}</p>
			</div>
			<span class="shrink-0 font-mono text-xs text-bone">
				{lowestPrice === 0 ? 'Free' : `From ${formatMoney(lowestPrice)}`}
			</span>
		</div>

		{#if freeThreshold !== null}
			<div class="mt-4 border-t border-charcoal pt-3">
				{#if amountToFreeShipping === 0}
					<p class="font-mono text-[10px] tracking-widest text-volt uppercase">
						Free shipping unlocked
					</p>
				{:else}
					<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
						Add {formatMoney(amountToFreeShipping)} for free shipping
					</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}
