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

<div class="mx-auto max-w-lg px-4 pt-12 pb-20 text-center">
	<h1 class="font-display text-6xl leading-none text-void uppercase md:text-8xl">
		Order Confirmed.
	</h1>
	<p class="mt-4 font-mono text-sm tracking-widest text-void/50 uppercase">#{order.id}</p>
	<p class="mt-1 font-mono text-xs tracking-widest text-void/40 uppercase">
		We'll text you when it ships.
	</p>

	<div class="my-8 border-t border-void/10"></div>

	<!-- Order summary card -->
	<div class="flex flex-col gap-4 bg-void/5 p-5 text-left">
		<span class="font-mono text-[10px] tracking-widest text-void/40 uppercase">Order Summary</span>
		{#each order.items as item}
			<div class="flex gap-4">
				<img src={item.image} alt={item.name} class="h-16 w-12 object-cover" />
				<div class="flex flex-col justify-center">
					<span class="font-sans text-xs font-medium text-void uppercase">{item.name}</span>
					<span class="font-mono text-[9px] text-void/40 uppercase">{item.size} · {item.color}</span
					>
				</div>
				<span class="ml-auto self-center font-mono text-xs text-void"
					>LKR {item.price.toLocaleString()}</span
				>
			</div>
		{/each}
		<div class="flex flex-col gap-2 border-t border-void/10 pt-4">
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
		class="mt-8 w-full bg-void py-4 text-bone hover:bg-volt hover:text-void"
	>
		Continue Shopping
	</Button>

	<div class="mt-8 border border-void/20 p-5">
		<p class="font-sans text-sm tracking-tight text-void uppercase">
			Save your details for next time. Takes 10 seconds.
		</p>
		<Button
			variant="outline"
			class="mt-4 w-full border-void text-void hover:bg-void hover:text-bone"
		>
			Create Account
		</Button>
	</div>
</div>
