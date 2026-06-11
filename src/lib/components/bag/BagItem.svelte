<script lang="ts">
	import { onMount } from 'svelte';
	import type { BagDTO, BagItemDTO } from '$lib/server/modules/bag/bag.types';
	import { bag } from '$lib/client/modules/stores/bag.svelte';

	let { item }: { item: BagItemDTO } = $props();

	// null  = not editing → display follows item.quantity (server-confirmed)
	// number = user is editing → display this value immediately
	let editingQuantity = $state<number | null>(null);
	const localQuantity = $derived(editingQuantity ?? item.quantity);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let rollbackQuantity: number | null = null;
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

	function updateQuantity(delta: number) {
		const next = localQuantity + delta;
		if (next < 1 || next > maxQuantityAvailable) return;

		// Capture the server-confirmed value before the first click in a sequence
		if (rollbackQuantity === null) {
			rollbackQuantity = item.quantity;
		}

		// Update display instantly — no re-render dependency, purely local
		editingQuantity = next;
		bag.updateItemQuantityOptimistically(item.id, next);

		// Only send one request after the user stops clicking
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			debounceTimer = null;

			// Capture before clearing — editingQuantity holds the final desired qty
			const quantityToSend = editingQuantity!;
			const quantityToRollback = rollbackQuantity!;
			rollbackQuantity = null;

			// Switch back to server-driven display (item.quantity = optimistic value = quantityToSend)
			// No visual flicker since item.quantity matches what we just set optimistically
			editingQuantity = null;

			try {
				const res = await fetch('/api/bag', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'update', bagItemId: item.id, quantity: quantityToSend })
				});
				if (res.ok) {
					const updated = (await res.json()) as BagDTO;
					bag.setBag(updated);
				} else {
					// Revert optimistic state to original server value
					bag.updateItemQuantityOptimistically(item.id, quantityToRollback);
				}
			} catch (err) {
				console.error('Failed to update quantity:', err);
				bag.updateItemQuantityOptimistically(item.id, quantityToRollback);
			}
		}, 350);
	}

	async function removeItem() {
		const previousItems = bag.removeItemOptimistically(item.id);
		try {
			const res = await fetch('/api/bag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'remove', bagItemId: item.id })
			});
			if (res.ok) {
				const updated = (await res.json()) as BagDTO;
				bag.setBag(updated);
			} else {
				bag.items = previousItems;
			}
		} catch (err) {
			console.error('Failed to remove item:', err);
			bag.items = previousItems;
		}
	}
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
			<button class="ml-2 font-mono text-xs text-ash/50 hover:text-volt" onclick={removeItem}>
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
					onclick={() => updateQuantity(-1)}
					disabled={localQuantity <= 1}>[−]</button
				>
				<span>{localQuantity}</span>
				<button
					class="hover:text-volt disabled:opacity-30"
					onclick={() => updateQuantity(1)}
					disabled={localQuantity >= maxQuantityAvailable}>[+]</button
				>
			</div>
			<span class="font-mono text-sm text-bone">
				LKR {(item.unitPrice * localQuantity).toLocaleString()}
			</span>
		</div>
	</div>
</div>
