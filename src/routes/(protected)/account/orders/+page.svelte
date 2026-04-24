<script lang="ts">
	const orders = [
		{
			id: 'ORD-ABC123',
			date: 'April 20, 2025',
			status: 'Delivered',
			total: 3650,
			itemCount: 1,
			image: '/images/black_tee.png'
		},
		{
			id: 'ORD-DEF456',
			date: 'March 10, 2025',
			status: 'Shipped',
			total: 9200,
			itemCount: 3,
			image: '/images/white_tee.png'
		}
	];

	function getStatusClass(status: string) {
		switch (status) {
			case 'Delivered':
				return 'text-volt';
			case 'Shipped':
				return 'text-ash';
			case 'Cancelled':
				return 'text-red-400';
			default:
				return 'text-bone';
		}
	}
</script>

<svelte:head>
	<title>Order History | Caro Clothing</title>
	<meta name="description" content="Your order history" />
</svelte:head>

<div class="flex flex-col gap-6">
	<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Order History</h2>

	<div class="flex flex-col gap-4">
		{#each orders as order}
			<div
				class="flex items-center gap-4 border border-transparent bg-charcoal/40 p-4 transition-colors hover:border-ash/10 md:gap-8 md:p-6"
			>
				<img
					src={order.image}
					alt=""
					class="h-18 w-14 flex-shrink-0 object-cover md:h-24 md:w-20"
				/>

				<div class="flex flex-1 flex-col gap-1 md:gap-2">
					<div class="flex items-start justify-between">
						<span class="font-mono text-xs tracking-widest text-bone uppercase">{order.id}</span>
						<span class="font-mono text-sm text-bone">LKR {order.total.toLocaleString()}</span>
					</div>
					<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase"
						>{order.date}</span
					>
					<div class="mt-1 flex items-center gap-4 md:mt-2">
						<span
							class="font-mono text-[10px] tracking-widest uppercase {getStatusClass(order.status)}"
						>
							{order.status}
						</span>
						<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">
							{order.itemCount}
							{order.itemCount === 1 ? 'Item' : 'Items'}
						</span>
					</div>
				</div>

				<a
					href="/account/orders/{order.id}"
					class="hidden font-mono text-[10px] tracking-widest text-volt uppercase hover:underline md:block"
				>
					View Details →
				</a>
			</div>
		{/each}
	</div>

	{#if orders.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<span class="mb-2 font-display text-3xl text-bone uppercase">No orders yet.</span>
			<a href="/shop" class="font-mono text-xs tracking-widest text-volt uppercase hover:underline"
				>Start Shopping →</a
			>
		</div>
	{/if}
</div>
