<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	const order = {
		id: 'ORD-ABC123',
		items: [
			{
				name: 'Void Oversized Tee',
				size: 'L',
				color: 'Void Black',
				price: 3200,
				qty: 1,
				image: '/images/black_tee.png'
			}
		],
		subtotal: 3200,
		shipping: 450,
		total: 3650,
		address: { recipientName: 'Kasun Mendis', city: 'Colombo 03', district: 'Colombo' },
		estimatedDelivery: '3–5 business days'
	};
</script>

<svelte:head>
	<title>Order Confirmation | Caro Clothing</title>
	<meta name="description" content="Your order has been confirmed" />
</svelte:head>

<div class="max-w-lg mx-auto px-4 pt-12 pb-20 text-center">
	<h1 class="font-display text-6xl md:text-8xl text-void uppercase leading-none">Order Confirmed.</h1>
	<p class="font-mono text-sm text-void/50 mt-4 uppercase tracking-widest">#{order.id}</p>
	<p class="font-mono text-xs text-void/40 mt-1 uppercase tracking-widest">We'll text you when it ships.</p>

	<div class="border-t border-void/10 my-8"></div>

	<!-- Order summary card -->
	<div class="bg-void/5 p-5 text-left flex flex-col gap-4">
		<span class="font-mono text-[10px] text-void/40 uppercase tracking-widest">Order Summary</span>
		{#each order.items as item}
			<div class="flex gap-4">
				<img src={item.image} alt={item.name} class="w-12 h-16 object-cover" />
				<div class="flex flex-col justify-center">
					<span class="font-sans text-xs font-medium text-void uppercase">{item.name}</span>
					<span class="font-mono text-[9px] text-void/40 uppercase">{item.size} · {item.color}</span>
				</div>
				<span class="ml-auto font-mono text-xs text-void self-center">LKR {item.price.toLocaleString()}</span>
			</div>
		{/each}
		<div class="border-t border-void/10 pt-4 flex flex-col gap-2">
			<div class="flex justify-between font-mono text-[10px] uppercase">
				<span class="text-void/60">Shipping</span>
				<span class="text-void">LKR {order.shipping.toLocaleString()}</span>
			</div>
			<div class="flex justify-between font-mono text-sm font-bold uppercase">
				<span class="text-void">Total</span>
				<span class="text-void">LKR {order.total.toLocaleString()}</span>
			</div>
		</div>
	</div>

	<Button
		variant="primary"
		href="/shop"
		class="w-full bg-void text-bone hover:bg-volt hover:text-void mt-8 py-4"
	>
		Continue Shopping
	</Button>

	<div class="mt-8 border border-void/20 p-5">
		<p class="font-sans text-sm text-void uppercase tracking-tight">Save your details for next time. Takes 10 seconds.</p>
		<Button variant="outline" class="w-full mt-4 border-void text-void hover:bg-void hover:text-bone">
			Create Account
		</Button>
	</div>
</div>
