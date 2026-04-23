<script lang="ts">
	import OrderStatusTimeline from '$lib/components/account/OrderStatusTimeline.svelte';

	const order = {
		id: 'ORD-ABC123',
		date: 'April 20, 2025',
		status: 'Confirmed',
		total: 3650,
		shipping: 450,
		subtotal: 3200,
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
		address: {
			recipientName: 'Kasun Mendis',
			addressLine1: '12 Galle Road',
			city: 'Colombo 03',
			district: 'Colombo'
		}
	};
</script>

<div class="flex flex-col gap-10">
	<div class="flex flex-col gap-2">
		<a href="/account/orders" class="font-mono text-[9px] text-ash uppercase tracking-widest hover:text-bone mb-4 block">← Back to Orders</a>
		<h1 class="font-display text-4xl text-bone uppercase">Order {order.id}</h1>
		<span class="font-mono text-[9px] text-ash uppercase tracking-widest">{order.date}</span>
	</div>

	<div class="lg:grid lg:grid-cols-2 lg:gap-16">
		<!-- Order Details -->
		<div class="flex flex-col gap-10">
			<section class="flex flex-col gap-6">
				<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Items</h2>
				<div class="flex flex-col gap-4">
					{#each order.items as item}
						<div class="flex gap-4">
							<img src={item.image} alt="" class="w-16 h-20 object-cover" />
							<div class="flex flex-col justify-center">
								<span class="font-sans text-sm font-medium text-bone uppercase">{item.name}</span>
								<span class="font-mono text-[9px] text-ash uppercase tracking-widest">
									{item.size} · {item.color} · QTY {item.qty}
								</span>
							</div>
							<span class="ml-auto font-mono text-xs text-bone self-center">
								LKR {item.price.toLocaleString()}
							</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="flex flex-col gap-6 border-t border-charcoal pt-8">
				<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Shipping Address</h2>
				<div class="font-sans text-sm text-bone leading-relaxed">
					<p class="font-medium">{order.address.recipientName}</p>
					<p>{order.address.addressLine1}</p>
					<p>{order.address.city}, {order.address.district}</p>
				</div>
			</section>

			<section class="flex flex-col gap-4 border-t border-charcoal pt-8">
				<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Summary</h2>
				<div class="flex flex-col gap-2">
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash">Subtotal</span>
						<span class="text-bone">LKR {order.subtotal.toLocaleString()}</span>
					</div>
					<div class="flex justify-between font-mono text-[10px] uppercase">
						<span class="text-ash">Shipping</span>
						<span class="text-bone">LKR {order.shipping.toLocaleString()}</span>
					</div>
					<div class="flex justify-between font-mono text-sm font-bold uppercase mt-2">
						<span class="text-bone">Total</span>
						<span class="text-bone">LKR {order.total.toLocaleString()}</span>
					</div>
				</div>
			</section>
		</div>

		<!-- Status Timeline -->
		<div class="mt-12 lg:mt-0">
			<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Order Status</h2>
			<OrderStatusTimeline />
		</div>
	</div>
</div>
