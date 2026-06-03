<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		TrendingUp,
		ClipboardList,
		Package,
		Boxes,
		AlertTriangle,
		ArrowRight,
		Plus
	} from 'lucide-svelte';

	let { data } = $props();

	const tracked = $derived(data.inventorySummary.trackedCount);
	const unhealthy = $derived(
		data.inventorySummary.lowStockCount + data.inventorySummary.outOfStockCount
	);
	const healthyPercent = $derived(
		tracked > 0 ? Math.round(((tracked - unhealthy) / tracked) * 100) : 100
	);

	function formatDate(date: Date | string | null | undefined) {
		if (!date) return '—';
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-LK', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDateShort(date: Date | string | null | undefined) {
		if (!date) return '—';
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-LK', {
			month: 'short',
			day: 'numeric'
		});
	}

	function statusClass(status: string) {
		switch (status) {
			case 'confirmed':
				return 'border-volt bg-volt/5 text-volt';
			case 'processing':
				return 'border-amber-500/30 bg-amber-500/5 text-amber-400';
			case 'shipped':
				return 'border-sky-500/30 bg-sky-500/5 text-sky-400';
			case 'delivered':
				return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400';
			case 'cancelled':
				return 'border-rose-500/30 bg-rose-500/5 text-rose-400';
			case 'refunded':
				return 'border-purple-500/30 bg-purple-500/5 text-purple-400';
			default:
				return 'border-charcoal bg-void text-ash';
		}
	}
</script>

<div class="mx-auto max-w-7xl px-4 py-8 md:px-0">
	<!-- HEADER Section -->
	<div class="mb-8 border-b border-charcoal/40 pb-6">
		<p class="mb-1 font-mono text-xs tracking-[0.2em] text-volt uppercase">Admin Dashboard</p>
		<h1 class="font-display text-4xl tracking-wider text-bone uppercase">Overview</h1>
		<p class="mt-2 max-w-2xl text-sm text-ash/80">
			High-level operations cockpit for real-time overview of sales, inventory, active drops, and
			recent orders.
		</p>
	</div>

	<!-- QUICK ACTIONS Section -->
	<div class="mb-8">
		<h2 class="mb-4 font-mono text-[10px] tracking-[0.25em] text-ash/40 uppercase">
			Operational Shortcuts
		</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<a
				href={resolve('/app/products/new')}
				class="flex items-center justify-between border border-charcoal bg-charcoal/10 px-4 py-3 transition-all hover:translate-y-[-1px] hover:border-volt/60 hover:bg-charcoal/25"
			>
				<span class="font-mono text-[10px] tracking-widest text-bone uppercase">New Product</span>
				<Plus size={14} class="text-volt" />
			</a>
			<a
				href={resolve('/app/drops/new')}
				class="flex items-center justify-between border border-charcoal bg-charcoal/10 px-4 py-3 transition-all hover:translate-y-[-1px] hover:border-volt/60 hover:bg-charcoal/25"
			>
				<span class="font-mono text-[10px] tracking-widest text-bone uppercase">Create Drop</span>
				<Plus size={14} class="text-volt" />
			</a>
			<a
				href={resolve('/app/orders?status=pending')}
				class="flex items-center justify-between border border-charcoal bg-charcoal/10 px-4 py-3 transition-all hover:translate-y-[-1px] hover:border-volt/60 hover:bg-charcoal/25"
			>
				<span class="font-mono text-[10px] tracking-widest text-bone uppercase">Pending Orders</span
				>
				<ClipboardList size={14} class="text-volt" />
			</a>
			<a
				href={resolve('/app/inventory?stockStatus=low')}
				class="flex items-center justify-between border border-charcoal bg-charcoal/10 px-4 py-3 transition-all hover:translate-y-[-1px] hover:border-volt/60 hover:bg-charcoal/25"
			>
				<span class="font-mono text-[10px] tracking-widest text-bone uppercase">Low Stock List</span
				>
				<AlertTriangle size={14} class="text-volt" />
			</a>
		</div>
	</div>

	<!-- KPI Grid Section -->
	<div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Card 1: Revenue -->
		<div
			class="group relative overflow-hidden border border-charcoal bg-charcoal/25 p-5 transition-colors hover:border-volt/40"
		>
			<div class="flex items-start justify-between">
				<div>
					<p class="mb-1 font-mono text-[9px] tracking-[0.2em] text-ash/60 uppercase">
						Total Revenue
					</p>
					<h3 class="font-mono text-lg font-bold text-bone">
						LKR {data.analytics.totalSales.toLocaleString('en-LK', {
							minimumFractionDigits: 2,
							maximumFractionDigits: 2
						})}
					</h3>
				</div>
				<div class="text-ash/40 transition-colors group-hover:text-volt">
					<TrendingUp size={18} />
				</div>
			</div>
			<div
				class="absolute inset-x-0 bottom-0 h-[2px] bg-charcoal transition-colors group-hover:bg-volt"
			></div>
		</div>

		<!-- Card 2: Open Orders -->
		<div
			class="group relative overflow-hidden border border-charcoal bg-charcoal/25 p-5 transition-colors hover:border-volt/40"
		>
			<div class="flex items-start justify-between">
				<div>
					<p class="mb-1 font-mono text-[9px] tracking-[0.2em] text-ash/60 uppercase">
						Open Orders
					</p>
					<h3 class="font-mono text-xl font-bold text-bone">
						{data.analytics.openOrdersCount}
					</h3>
					<p class="mt-1 font-mono text-[9px] text-ash/80 uppercase">
						{data.analytics.pendingFulfillmentCount} pending fulfillment
					</p>
				</div>
				<div class="text-ash/40 transition-colors group-hover:text-volt">
					<ClipboardList size={18} />
				</div>
			</div>
			<div
				class="absolute inset-x-0 bottom-0 h-[2px] bg-charcoal transition-colors group-hover:bg-volt"
			></div>
		</div>

		<!-- Card 3: Catalog Products -->
		<div
			class="group relative overflow-hidden border border-charcoal bg-charcoal/25 p-5 transition-colors hover:border-volt/40"
		>
			<div class="flex items-start justify-between">
				<div>
					<p class="mb-1 font-mono text-[9px] tracking-[0.2em] text-ash/60 uppercase">
						Catalog Products
					</p>
					<h3 class="font-mono text-xl font-bold text-bone">
						{data.productStats.total}
					</h3>
					<p class="mt-1 font-mono text-[9px] text-ash/80 uppercase">
						{data.productStats.active} Active / {data.productStats.inactive} Inactive
					</p>
				</div>
				<div class="text-ash/40 transition-colors group-hover:text-volt">
					<Package size={18} />
				</div>
			</div>
			<div
				class="absolute inset-x-0 bottom-0 h-[2px] bg-charcoal transition-colors group-hover:bg-volt"
			></div>
		</div>

		<!-- Card 4: Inventory Health -->
		<div
			class="group relative overflow-hidden border border-charcoal bg-charcoal/25 p-5 transition-colors hover:border-volt/40"
		>
			<div class="flex items-start justify-between">
				<div>
					<p class="mb-1 font-mono text-[9px] tracking-[0.2em] text-ash/60 uppercase">
						Available Stock
					</p>
					<h3 class="font-mono text-xl font-bold text-bone">
						{data.inventorySummary.totalAvailableQuantity.toLocaleString()}
					</h3>
					<p class="mt-1 font-mono text-[9px] text-ash/80 uppercase">
						{data.inventorySummary.lowStockCount} Low / {data.inventorySummary.outOfStockCount} Out
					</p>
				</div>
				<div class="text-ash/40 transition-colors group-hover:text-volt">
					<Boxes size={18} />
				</div>
			</div>
			<div
				class="absolute inset-x-0 bottom-0 h-[2px] bg-charcoal transition-colors group-hover:bg-volt"
			></div>
		</div>
	</div>

	<!-- High-Fidelity SVG/CSS Widgets Block -->
	<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Catalog Health Progress Bar -->
		<div class="border border-charcoal bg-charcoal/25 p-5">
			<h4 class="mb-3 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
				Catalog Distribution
			</h4>
			<div class="mb-2 flex items-center justify-between">
				<span class="font-mono text-[11px] text-bone uppercase">Active Products Ratio</span>
				<span class="font-mono text-[11px] text-volt">
					{data.productStats.total > 0
						? Math.round((data.productStats.active / data.productStats.total) * 100)
						: 0}%
				</span>
			</div>
			<!-- Custom visual progress bar -->
			<div class="h-2 w-full border border-charcoal bg-void">
				<div
					class="h-full bg-volt transition-all duration-500"
					style="width: {data.productStats.total > 0
						? (data.productStats.active / data.productStats.total) * 100
						: 0}%"
				></div>
			</div>
			<div
				class="mt-3 flex items-center justify-between font-mono text-[9px] text-ash/60 uppercase"
			>
				<span>{data.productStats.active} Active</span>
				<span>{data.productStats.total} Total</span>
			</div>
		</div>

		<!-- Stock Status Health -->
		<div class="border border-charcoal bg-charcoal/25 p-5">
			<h4 class="mb-3 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
				Inventory Health Indicator
			</h4>
			<div class="mb-2 flex items-center justify-between">
				<span class="font-mono text-[11px] text-bone uppercase">Healthy Stock Ratio</span>
				<span class="font-mono text-[11px] text-volt">{healthyPercent}%</span>
			</div>
			<!-- Custom visual progress bar -->
			<div class="flex h-2 w-full border border-charcoal bg-void">
				<div
					class="h-full bg-volt transition-all duration-500"
					style="width: {healthyPercent}%"
				></div>
				<div
					class="h-full bg-amber-500 transition-all duration-500"
					style="width: {tracked > 0 ? (data.inventorySummary.lowStockCount / tracked) * 100 : 0}%"
				></div>
				<div
					class="h-full bg-red-600 transition-all duration-500"
					style="width: {tracked > 0
						? (data.inventorySummary.outOfStockCount / tracked) * 100
						: 0}%"
				></div>
			</div>
			<div
				class="mt-3 flex items-center justify-between font-mono text-[9px] text-ash/60 uppercase"
			>
				<span>{tracked - unhealthy} Healthy</span>
				<span>{data.inventorySummary.lowStockCount} Low</span>
				<span>{data.inventorySummary.outOfStockCount} Out</span>
			</div>
		</div>
	</div>

	<!-- Split Dashboard Columns -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Left: Recent Orders (2 Columns Width) -->
		<div class="border border-charcoal bg-charcoal/25 lg:col-span-2">
			<div class="flex items-center justify-between border-b border-charcoal p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Recent Orders</p>
				<a
					href={resolve('/app/orders')}
					class="flex items-center gap-1 font-mono text-[9px] tracking-wider text-volt uppercase transition-colors hover:text-bone"
				>
					View All <ArrowRight size={10} />
				</a>
			</div>

			{#if data.recentOrders && data.recentOrders.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full min-w-[600px] text-left">
						<thead class="border-b border-charcoal">
							<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
								<th class="px-5 py-4 font-normal">Order</th>
								<th class="px-5 py-4 font-normal">Status</th>
								<th class="px-5 py-4 font-normal">Total</th>
								<th class="px-5 py-4 font-normal">Date</th>
							</tr>
						</thead>
						<tbody>
							{#each data.recentOrders as order (order.id)}
								<tr
									class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10"
								>
									<td class="px-5 py-4">
										<div class="flex flex-col gap-0.5">
											<a
												href={resolve(`/app/orders/${order.id}`)}
												class="font-mono text-xs text-bone hover:text-volt hover:underline"
											>
												#{order.orderNumber}
											</a>
											<span class="max-w-[200px] truncate font-mono text-[9px] text-ash/70">
												{order.shippingAddressSnapshot?.recipientName ?? 'Guest'}
												{#if order.shippingAddressSnapshot?.phone}
													({order.shippingAddressSnapshot.phone})
												{/if}
											</span>
										</div>
									</td>
									<td class="px-5 py-4">
										<span
											class="border px-2 py-0.5 font-mono text-[9px] tracking-widest uppercase {statusClass(
												order.status
											)}"
										>
											{order.status}
										</span>
									</td>
									<td class="px-5 py-4 font-mono text-xs text-bone">
										LKR {order.totalAmount.toLocaleString('en-LK')}
									</td>
									<td class="px-5 py-4 font-mono text-[10px] text-ash/80">
										{formatDate(order.createdAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-8 text-center">
					<p class="font-mono text-[10px] tracking-widest text-ash uppercase">No orders found.</p>
				</div>
			{/if}
		</div>

		<!-- Right Column: Active Drops & Low Stock Highlights (1 Column Width) -->
		<div class="space-y-6">
			<!-- Drops Health / Active List -->
			<div class="border border-charcoal bg-charcoal/25">
				<div class="flex items-center justify-between border-b border-charcoal p-5">
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Drops Overview</p>
					<a
						href={resolve('/app/drops')}
						class="flex items-center gap-1 font-mono text-[9px] tracking-wider text-volt uppercase transition-colors hover:text-bone"
					>
						Manage <ArrowRight size={10} />
					</a>
				</div>
				<div class="space-y-3 p-4">
					{#if data.recentDrops && data.recentDrops.length > 0}
						{#each data.recentDrops as drop (drop.id)}
							<div
								class="flex items-start justify-between gap-3 border border-charcoal bg-void/50 p-3"
							>
								<div class="min-w-0">
									<p class="truncate font-mono text-[10px] font-bold text-bone uppercase">
										{drop.name}
									</p>
									<p class="mt-1 font-mono text-[8px] text-ash/70 uppercase">
										Status:
										<span
											class={drop.status === 'live'
												? 'font-bold text-volt'
												: drop.status === 'teaser'
													? 'text-amber-400'
													: 'text-ash'}
										>
											{drop.status}
										</span>
									</p>
								</div>
								{#if drop.launchAt}
									<div class="shrink-0 text-right font-mono">
										<p class="text-[8px] text-ash/50 uppercase">Launch</p>
										<p class="mt-0.5 text-[9px] text-bone">{formatDateShort(drop.launchAt)}</p>
									</div>
								{/if}
							</div>
						{/each}
					{:else}
						<div class="p-4 text-center">
							<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
								No active drops.
							</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Low Stock Highlights -->
			<div class="border border-charcoal bg-charcoal/25">
				<div class="flex items-center justify-between border-b border-charcoal p-5">
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Low Stock Alerts</p>
					<a
						href={resolve('/app/inventory?stockStatus=low')}
						class="flex items-center gap-1 font-mono text-[9px] tracking-wider text-volt uppercase transition-colors hover:text-bone"
					>
						View All <ArrowRight size={10} />
					</a>
				</div>
				<div class="space-y-3 p-4">
					{#if data.lowStockItems && data.lowStockItems.length > 0}
						{#each data.lowStockItems as item (item.variantId)}
							<div
								class="flex items-center justify-between gap-3 border border-charcoal bg-void/50 p-3"
							>
								<div class="min-w-0">
									<p class="truncate font-mono text-[10px] font-bold text-bone">
										{item.product.name}
									</p>
									<p class="mt-1 font-mono text-[8px] text-ash/70 uppercase">
										{item.variant.color} / Size {item.variant.size}
									</p>
								</div>
								<div class="shrink-0 text-right">
									<span
										class="border border-volt/30 bg-volt/5 px-1.5 py-0.5 font-mono text-[9px] font-bold text-volt"
									>
										{item.inventory?.quantity ?? 0} Left
									</span>
								</div>
							</div>
						{/each}
					{:else}
						<div class="p-4 text-center">
							<p class="font-mono text-[10px] tracking-widest text-ash/60 uppercase">
								Stock levels healthy.
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
