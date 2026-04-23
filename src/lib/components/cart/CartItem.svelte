<script lang="ts">
	import type { CartItem } from '$lib/stores/cart';
	import { cartStore } from '$lib/stores/cart';

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

<div class="flex gap-4 items-start">
	<img src={item.image} alt={item.name} class="w-16 h-20 object-cover flex-shrink-0" />
	<div class="flex-1 flex flex-col min-w-0">
		<div class="flex justify-between items-start">
			<span class="font-sans text-sm font-medium text-bone truncate">{item.name}</span>
			<button class="font-mono text-xs text-ash/50 hover:text-volt ml-2" onclick={removeItem}>
				×
			</button>
		</div>
		<span class="font-mono text-[10px] text-ash uppercase">{item.size} · {item.color}</span>
		<span class="font-mono text-[9px] text-ash/50">{item.sku}</span>
		
		<div class="flex justify-between items-center mt-2">
			<div class="flex items-center gap-2 font-mono text-sm">
				<button class="hover:text-volt" onclick={() => updateQuantity(-1)}>[−]</button>
				<span>{item.quantity}</span>
				<button class="hover:text-volt" onclick={() => updateQuantity(1)}>[+]</button>
			</div>
			<span class="font-mono text-sm text-bone">LKR {(item.unitPrice * item.quantity).toLocaleString()}</span>
		</div>
	</div>
</div>
