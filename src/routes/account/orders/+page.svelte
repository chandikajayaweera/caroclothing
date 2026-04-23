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
			case 'Delivered': return 'text-volt';
			case 'Shipped': return 'text-ash';
			case 'Cancelled': return 'text-red-400';
			default: return 'text-bone';
		}
	}
</script>

<div class="flex flex-col gap-6">
	<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Order History</h2>

	<div class="flex flex-col gap-4">
		{#each orders as order}
			<div class="bg-charcoal/40 p-4 md:p-6 flex gap-4 md:gap-8 items-center border border-transparent hover:border-ash/10 transition-colors">
				<img src={order.image} alt="" class="w-14 h-18 md:w-20 md:h-24 object-cover flex-shrink-0" />
				
				<div class="flex-1 flex flex-col gap-1 md:gap-2">
					<div class="flex justify-between items-start">
						<span class="font-mono text-xs text-bone uppercase tracking-widest">{order.id}</span>
						<span class="font-mono text-sm text-bone">LKR {order.total.toLocaleString()}</span>
					</div>
					<span class="font-mono text-[9px] text-ash/60 uppercase tracking-widest">{order.date}</span>
					<div class="flex items-center gap-4 mt-1 md:mt-2">
						<span class="font-mono text-[10px] uppercase tracking-widest {getStatusClass(order.status)}">
							{order.status}
						</span>
						<span class="font-mono text-[9px] text-ash/40 uppercase tracking-widest">
							{order.itemCount} {order.itemCount === 1 ? 'Item' : 'Items'}
						</span>
					</div>
				</div>

				<a href="/account/orders/{order.id}" class="hidden md:block font-mono text-[10px] text-volt uppercase tracking-widest hover:underline">
					View Details →
				</a>
			</div>
		{/each}
	</div>

	{#if orders.length === 0}
		<div class="py-20 flex flex-col items-center justify-center text-center">
			<span class="font-display text-3xl text-bone mb-2 uppercase">No orders yet.</span>
			<a href="/shop" class="font-mono text-xs text-volt uppercase tracking-widest hover:underline">Start Shopping →</a>
		</div>
	{/if}
</div>
