<script lang="ts">
	import type { CartItemDTO } from '$lib/server/modules/cart/cart.types';
	import { cart } from '$lib/client/modules/stores/cart.svelte';

	let { item }: { item: CartItemDTO } = $props();

	async function updateQuantity(delta: number) {
		const next = item.quantity + delta;
		if (next < 1 || next > 10) return;
		try {
			const res = await fetch('/api/cart', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'update', cartItemId: item.id, quantity: next })
			});
			if (res.ok) {
				const updated = (await res.json()) as any;
				cart.setCart(updated);
			}
		} catch (err) {
			console.error('Failed to update quantity:', err);
		}
	}

	async function removeItem() {
		try {
			const res = await fetch('/api/cart', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'remove', cartItemId: item.id })
			});
			if (res.ok) {
				const updated = (await res.json()) as any;
				cart.setCart(updated);
			}
		} catch (err) {
			console.error('Failed to remove item:', err);
		}
	}
</script>

<div class="flex items-start gap-4">
	{#if item.imageUrl}
		<img src={item.imageUrl} alt={item.productName ?? 'Product'} class="h-20 w-16 flex-shrink-0 object-cover" />
	{:else}
		<div class="h-20 w-16 flex-shrink-0 bg-charcoal"></div>
	{/if}
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="flex items-start justify-between">
			<span class="truncate font-sans text-sm font-medium text-bone">{item.productName ?? 'Product'}</span>
			<button class="ml-2 font-mono text-xs text-ash/50 hover:text-volt" onclick={removeItem}>
				×
			</button>
		</div>
		<span class="font-mono text-[10px] text-ash uppercase">{item.size ?? 'OS'} · {item.color ?? 'N/A'}</span>
		{#if item.availabilityStatus === 'backorder'}
			<span class="font-mono text-[9px] text-volt uppercase">Backorder</span>
		{:else}
			<span class="font-mono text-[9px] text-ash/50">{item.variantId}</span>
		{/if}

		<div class="mt-2 flex items-center justify-between">
			<div class="flex items-center gap-2 font-mono text-sm">
				<button class="hover:text-volt disabled:opacity-30" onclick={() => updateQuantity(-1)} disabled={item.quantity <= 1}>[−]</button>
				<span>{item.quantity}</span>
				<button class="hover:text-volt disabled:opacity-30" onclick={() => updateQuantity(1)} disabled={item.quantity >= 10}>[+]</button>
			</div>
			<span class="font-mono text-sm text-bone">
				LKR {item.lineTotal.toLocaleString()}
			</span>
		</div>
	</div>
</div>
