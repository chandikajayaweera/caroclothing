<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const statusOptions = [
		{ value: '', label: 'All orders' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'confirmed', label: 'Confirmed' },
		{ value: 'processing', label: 'Processing' },
		{ value: 'shipped', label: 'Shipped' },
		{ value: 'delivered', label: 'Delivered' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'refunded', label: 'Refunded' }
	];

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium'
		}).format(new Date(value));
	}

	function formatStatus(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function getStatusClass(status: string) {
		switch (status) {
			case 'delivered':
				return 'text-volt';
			case 'shipped':
			case 'processing':
				return 'text-ash';
			case 'cancelled':
			case 'refunded':
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
	<div class="items-end justify-between gap-4 md:flex">
		<div>
			<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Order History</h2>
			<p class="mt-2 font-mono text-[9px] tracking-widest text-ash/50 uppercase">
				{data.orders.total} orders
			</p>
		</div>

		<form method="GET" class="mt-4 flex gap-2 md:mt-0">
			<select
				name="status"
				class="border border-charcoal bg-charcoal/40 px-3 py-2 font-mono text-[10px] text-bone uppercase"
			>
				{#each statusOptions as option (option.value)}
					<option value={option.value} selected={data.filters.status === option.value}>
						{option.label}
					</option>
				{/each}
			</select>
			<input type="hidden" name="limit" value={data.filters.limit} />
			<button
				class="border border-ash/30 px-4 py-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
			>
				Filter
			</button>
		</form>
	</div>

	<div class="flex flex-col gap-4">
		{#each data.orders.items as order (order.id)}
			<div
				class="flex items-center gap-4 border border-transparent bg-charcoal/40 p-4 transition-colors hover:border-ash/10 md:gap-8 md:p-6"
			>
				{#if order.firstItemImageUrl}
					<img
						src={order.firstItemImageUrl}
						alt=""
						class="h-18 w-14 flex-shrink-0 object-cover md:h-24 md:w-20"
					/>
				{:else}
					<div class="h-18 w-14 flex-shrink-0 bg-void/60 md:h-24 md:w-20"></div>
				{/if}

				<div class="flex flex-1 flex-col gap-1 md:gap-2">
					<div class="flex items-start justify-between">
						<span class="font-mono text-xs tracking-widest text-bone uppercase">
							{order.orderNumber}
						</span>
						<span class="font-mono text-sm text-bone">
							LKR {order.totalAmount.toLocaleString()}
						</span>
					</div>
					<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
						{formatDate(order.createdAt)}
					</span>
					<div class="mt-1 flex items-center gap-4 md:mt-2">
						<span
							class="font-mono text-[10px] tracking-widest uppercase {getStatusClass(order.status)}"
						>
							{formatStatus(order.status)}
						</span>
						<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">
							{order.itemCount}
							{order.itemCount === 1 ? 'Item' : 'Items'}
						</span>
					</div>
				</div>

				<a
					href={resolve(`/account/orders/${order.id}`)}
					class="hidden font-mono text-[10px] tracking-widest text-volt uppercase hover:underline md:block"
				>
					View Details ->
				</a>
			</div>
		{/each}
	</div>

	{#if data.orders.items.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<span class="mb-2 font-display text-3xl text-bone uppercase">No orders yet.</span>
			<a
				href={resolve('/shop')}
				class="font-mono text-xs tracking-widest text-volt uppercase hover:underline"
			>
				Start Shopping ->
			</a>
		</div>
	{/if}
</div>
