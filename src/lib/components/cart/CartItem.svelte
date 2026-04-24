<script lang="ts">
	import type { CartItem } from '$lib/client/modules/stores/cart';
	import { cartStore } from '$lib/client/modules/stores/cart';

	let { item }: { item: CartItem } = $props();

	function updateQuantity(delta: number) {
		cartStore.update((s) => ({
			...s,
			items: s.items.map((i) =>
				i.id === item.id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
			)
		}));
	}

	function removeItem() {
		cartStore.update((s) => ({
			...s,
			items: s.items.filter((i) => i.id !== item.id)
		}));
	}
</script>

<div class="flex items-start gap-4">
	<img src={item.image} alt={item.name} class="h-20 w-16 flex-shrink-0 object-cover" />
	<div class="flex min-w-0 flex-1 flex-col">
		<div class="flex items-start justify-between">
			<span class="truncate font-sans text-sm font-medium text-bone">{item.name}</span>
			<button class="ml-2 font-mono text-xs text-ash/50 hover:text-volt" onclick={removeItem}>
				×
			</button>
		</div>
		<span class="font-mono text-[10px] text-ash uppercase">{item.size} · {item.color}</span>
		<span class="font-mono text-[9px] text-ash/50">{item.sku}</span>

		<div class="mt-2 flex items-center justify-between">
			<div class="flex items-center gap-2 font-mono text-sm">
				<button class="hover:text-volt" onclick={() => updateQuantity(-1)}>[−]</button>
				<span>{item.quantity}</span>
				<button class="hover:text-volt" onclick={() => updateQuantity(1)}>[+]</button>
			</div>
			<span class="font-mono text-sm text-bone"
				>LKR {(item.unitPrice * item.quantity).toLocaleString()}</span
			>
		</div>
	</div>
</div>
