<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, ChevronLeft, ChevronRight, Package } from 'lucide-svelte';
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

	const hasPrevious = $derived(data.filters.offset > 0);
	const hasNext = $derived(data.filters.offset + data.orders.items.length < data.orders.total);

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' }).format(new Date(value));
	}

	function formatStatus(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function statusClass(status: string): string {
		if (status === 'delivered') return 'border-volt/30 text-volt';
		if (status === 'cancelled' || status === 'refunded') return 'border-red-400/30 text-red-300';
		return 'border-ash/25 text-ash';
	}
</script>

<svelte:head>
	<title>Order History | Caro Clothing</title>
	<meta name="description" content="Track and review your Caro orders" />
</svelte:head>

<div class="space-y-8">
	<header
		class="flex flex-col gap-5 border-b border-charcoal pb-6 md:flex-row md:items-end md:justify-between"
	>
		<div>
			<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Purchase history</p>
			<h2 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">Orders.</h2>
			<p class="mt-3 text-sm text-ash">{data.orders.total} orders on record.</p>
		</div>
		<form method="GET" class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-auto">
			<label class="sr-only" for="order-status">Filter orders by status</label>
			<select
				id="order-status"
				name="status"
				class="min-h-11 min-w-0 border border-charcoal bg-void px-3 font-mono text-[10px] text-bone uppercase outline-none focus:border-volt"
			>
				{#each statusOptions as option (option.value)}
					<option value={option.value} selected={data.filters.status === option.value}>
						{option.label}
					</option>
				{/each}
			</select>
			<input type="hidden" name="limit" value={data.filters.limit} />
			<button
				class="min-h-11 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
			>
				Apply
			</button>
		</form>
	</header>

	<div class="divide-y divide-charcoal border-y border-charcoal">
		{#each data.orders.items as order (order.id)}
			<a
				href={resolve(`/account/orders/${order.id}`)}
				class="group grid grid-cols-[80px_minmax(0,1fr)] gap-4 py-5 transition-colors hover:bg-charcoal/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt sm:grid-cols-[80px_1fr_auto] sm:items-center sm:px-3"
			>
				{#if order.firstItemImageUrl}
					<img src={order.firstItemImageUrl} alt="" class="h-24 w-20 bg-charcoal object-cover" />
				{:else}
					<div class="flex h-24 w-20 items-center justify-center bg-charcoal/40">
						<Package size={22} class="text-ash/50" aria-hidden="true" />
					</div>
				{/if}

				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-3">
						<h3 class="font-mono text-xs tracking-widest text-bone uppercase">
							{order.orderNumber}
						</h3>
						<span
							class="border px-2 py-1 font-mono text-[8px] tracking-widest uppercase {statusClass(
								order.status
							)}"
						>
							{formatStatus(order.status)}
						</span>
					</div>
					<p class="mt-2 font-mono text-[9px] text-ash">
						{formatDate(order.createdAt)} / {order.itemCount}
						{order.itemCount === 1 ? 'item' : 'items'}
					</p>
					<p class="mt-2 font-mono text-sm text-bone">
						LKR {order.totalAmount.toLocaleString('en-LK')}
					</p>
				</div>

				<span
					class="col-span-2 flex min-h-11 items-center justify-end gap-2 border-t border-charcoal pt-3 font-mono text-[9px] tracking-widest text-volt uppercase sm:col-auto sm:border-0 sm:pt-0"
				>
					View order
					<ArrowRight size={14} aria-hidden="true" />
				</span>
			</a>
		{:else}
			<div class="py-20 text-center">
				<Package class="mx-auto text-ash/50" size={30} aria-hidden="true" />
				<h3 class="mt-4 font-display text-3xl uppercase">No orders found.</h3>
				<p class="mt-2 text-sm text-ash">
					{data.filters.status
						? 'Try another status filter.'
						: 'Your first order will appear here.'}
				</p>
				<a
					href={resolve('/shop')}
					class="mt-6 inline-flex min-h-11 items-center bg-volt px-6 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
				>
					Shop now
				</a>
			</div>
		{/each}
	</div>

	{#if data.orders.total > data.filters.limit}
		<nav class="grid grid-cols-3 items-center gap-2" aria-label="Order history pages">
			{#if hasPrevious}
				<form method="GET">
					{#if data.filters.status}
						<input type="hidden" name="status" value={data.filters.status} />
					{/if}
					<input
						type="hidden"
						name="offset"
						value={Math.max(0, data.filters.offset - data.filters.limit)}
					/>
					<input type="hidden" name="limit" value={data.filters.limit} />
					<button
						class="flex min-h-11 items-center gap-2 px-1 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-volt sm:px-3"
					>
						<ChevronLeft size={14} aria-hidden="true" />
						Previous
					</button>
				</form>
			{:else}
				<span></span>
			{/if}
			<span class="text-center font-mono text-[9px] text-ash">
				{data.filters.offset + 1}-{Math.min(
					data.filters.offset + data.orders.items.length,
					data.orders.total
				)}
				of {data.orders.total}
			</span>
			{#if hasNext}
				<form method="GET">
					{#if data.filters.status}
						<input type="hidden" name="status" value={data.filters.status} />
					{/if}
					<input type="hidden" name="offset" value={data.filters.offset + data.filters.limit} />
					<input type="hidden" name="limit" value={data.filters.limit} />
					<button
						class="ml-auto flex min-h-11 items-center gap-2 px-1 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-volt sm:px-3"
					>
						Next
						<ChevronRight size={14} aria-hidden="true" />
					</button>
				</form>
			{:else}
				<span></span>
			{/if}
		</nav>
	{/if}
</div>
