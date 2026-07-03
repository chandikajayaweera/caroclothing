<script lang="ts">
	import { onMount } from 'svelte';
	import type { BagItemDTO } from '$lib/server/modules/bag/bag.types';
	import { bag } from '$lib/client/modules/stores/bag.svelte';

	let { item }: { item: BagItemDTO } = $props();

	let reservationSeconds = $state(0);
	let reservationRefreshStarted = false;
	let reservationTime = $derived(
		`${Math.floor(reservationSeconds / 60)
			.toString()
			.padStart(2, '0')}:${(reservationSeconds % 60).toString().padStart(2, '0')}`
	);

	onMount(() => {
		if (item.availabilityStatus !== 'reserved') return;
		reservationSeconds = item.reservationSecondsRemaining ?? 0;
		const countdown = setInterval(() => {
			reservationSeconds = Math.max(0, reservationSeconds - 1);

			if (reservationSeconds === 0 && !reservationRefreshStarted) {
				reservationRefreshStarted = true;
				void bag.refresh();
			}
		}, 1000);
		return () => {
			clearInterval(countdown);
		};
	});

	const maxQuantityAvailable = $derived.by(() => {
		if (item.isBackorder || item.availabilityStatus === 'untracked') {
			return 10;
		}
		return item.availableQuantity ?? 10;
	});
</script>

<div class="flex items-start gap-4">
	{#if item.imageUrl}
		<img
			src={item.imageUrl}
			alt={item.productName ?? 'Product'}
			class="h-20 w-16 flex-shrink-0 object-cover"
		/>
	{:else}
		<div class="h-20 w-16 flex-shrink-0 bg-charcoal"></div>
	{/if}
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="flex items-start justify-between">
			<span class="truncate font-sans text-sm font-medium text-bone"
				>{item.productName ?? 'Product'}</span
			>
			<button class="ml-2 font-mono text-xs text-ash/50 hover:text-volt" onclick={() => bag.removeItem(item.id)}>
				×
			</button>
		</div>
		<span class="font-mono text-[10px] text-ash uppercase"
			>{item.size ?? 'OS'} · {item.color ?? 'N/A'}</span
		>
		{#if item.availabilityStatus === 'backorder'}
			<span class="font-mono text-[9px] text-volt uppercase">Backorder</span>
		{:else if item.availabilityStatus === 'reserved'}
			<span class="font-mono text-[9px] text-amber-400 uppercase">
				Reserved at checkout · {reservationTime}
			</span>
		{:else if item.availabilityStatus === 'unavailable'}
			<span class="font-mono text-[9px] text-red-400 uppercase">Out of Stock</span>
		{:else if item.availabilityStatus === 'available' && item.availableQuantity !== null && item.availableQuantity < 5}
			<span class="font-mono text-[9px] text-volt uppercase"
				>Only {item.availableQuantity} left</span
			>
		{/if}

		<div class="mt-2 flex items-center justify-between">
			<div class="flex items-center gap-2 font-mono text-sm">
				<button
					class="hover:text-volt disabled:opacity-30"
					onclick={() => bag.updateItemQuantity(item.id, -1, maxQuantityAvailable)}
					disabled={item.quantity <= 1}>[−]</button
				>
				<span>{item.quantity}</span>
				<button
					class="hover:text-volt disabled:opacity-30"
					onclick={() => bag.updateItemQuantity(item.id, 1, maxQuantityAvailable)}
					disabled={item.quantity >= maxQuantityAvailable}>[+]</button
				>
			</div>
			<span class="font-mono text-sm text-bone">
				LKR {item.lineTotal.toLocaleString()}
			</span>
		</div>
	</div>
</div>
