<script lang="ts">
	import { resolve } from '$app/paths';
	import { ClipboardList, AlertTriangle, ArrowRight, Plus } from 'lucide-svelte';
	import AdminPageShell from '$lib/components/admin/layout/AdminPageShell.svelte';
	import AdminPageHeader from '$lib/components/admin/layout/AdminPageHeader.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminStatsGrid from '$lib/components/admin/layout/AdminStatsGrid.svelte';
	import AdminSection from '$lib/components/admin/layout/AdminSection.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import { orderStatusVariant, formatStatusLabel } from '$lib/shared/admin/status';
	import { formatAdminDate, formatAdminMoney } from '$lib/shared/admin/format';

	let { data } = $props();

	const tracked = $derived(data.inventorySummary.trackedCount);
	const unhealthy = $derived(
		data.inventorySummary.lowStockCount + data.inventorySummary.outOfStockCount
	);
	const healthyPercent = $derived(
		tracked > 0 ? Math.round(((tracked - unhealthy) / tracked) * 100) : 100
	);
</script>

<AdminPageShell size="normal" spacing="compact">
	<AdminPageHeader
		kicker="Admin Dashboard"
		title="Overview"
		description="High-level operations cockpit for real-time overview of sales, inventory, and recent orders."
	/>

	<!-- QUICK ACTIONS Section -->
	<AdminSection title="Operational Shortcuts" border={false} class="mb-8">
		<div class="grid gap-3 min-[430px]:grid-cols-2 md:grid-cols-3">
			<AdminButton
				href={resolve('/app/products/new')}
				variant="outline"
				size="md"
				class="w-full justify-between bg-charcoal/10"
			>
				New Product
				<Plus size={14} class="text-volt" />
			</AdminButton>
			<AdminButton
				href={resolve('/app/orders?status=pending')}
				variant="outline"
				size="md"
				class="w-full justify-between bg-charcoal/10"
			>
				Pending Orders
				<ClipboardList size={14} class="text-volt" />
			</AdminButton>
			<AdminButton
				href={resolve('/app/inventory?stockStatus=low')}
				variant="outline"
				size="md"
				class="w-full justify-between bg-charcoal/10"
			>
				Low Stock List
				<AlertTriangle size={14} class="text-volt" />
			</AdminButton>
		</div>
	</AdminSection>

	<!-- KPI Grid Section -->
	<div class="mb-8">
		<AdminStatsGrid
			metrics={[
				{
					label: 'Total Revenue',
					value: formatAdminMoney(data.analytics.totalSales, 2),
					tone: 'accent'
				},
				{
					label: 'Open Orders',
					value: data.analytics.openOrdersCount,
					description: `${data.analytics.pendingFulfillmentCount} pending fulfillment`,
					tone: 'info'
				},
				{
					label: 'Catalog Products',
					value: data.productStats.total,
					description: `${data.productStats.active} active / ${data.productStats.inactive} inactive`
				},
				{
					label: 'Available Stock',
					value: data.inventorySummary.totalAvailableQuantity.toLocaleString(),
					description: `${data.inventorySummary.lowStockCount} low / ${data.inventorySummary.outOfStockCount} out`,
					tone: data.inventorySummary.outOfStockCount > 0 ? 'warning' : 'success'
				}
			]}
		/>
	</div>

	<!-- High-Fidelity SVG/CSS Widgets Block -->
	<div class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Catalog Health Progress Bar -->
		<AdminSection title="Catalog Distribution">
			<div class="mb-2 flex items-center justify-between">
				<span class="font-mono text-[11px] text-bone uppercase">Active Products Ratio</span>
				<span class="font-mono text-[11px] text-volt">
					{data.productStats.total > 0
						? Math.round((data.productStats.active / data.productStats.total) * 100)
						: 0}%
				</span>
			</div>
			<!-- Custom visual progress bar -->
			<div
				class="h-2 w-full border border-charcoal bg-void"
				role="progressbar"
				aria-label="Active products ratio"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={data.productStats.total > 0
					? Math.round((data.productStats.active / data.productStats.total) * 100)
					: 0}
			>
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
		</AdminSection>

		<!-- Stock Status Health -->
		<AdminSection title="Inventory Health Indicator">
			<div class="mb-2 flex items-center justify-between">
				<span class="font-mono text-[11px] text-bone uppercase">Healthy Stock Ratio</span>
				<span class="font-mono text-[11px] text-volt">{healthyPercent}%</span>
			</div>
			<!-- Custom visual progress bar -->
			<div
				class="flex h-2 w-full border border-charcoal bg-void"
				role="progressbar"
				aria-label="Healthy stock ratio"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={healthyPercent}
			>
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
		</AdminSection>
	</div>

	<!-- Split Dashboard Columns -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Left: Recent Orders (2 Columns Width) -->
		<AdminSection title="Recent Orders" class="lg:col-span-2">
			{#snippet action()}
				<AdminButton href={resolve('/app/orders')} variant="outline" size="sm">
					View All <ArrowRight size={10} />
				</AdminButton>
			{/snippet}

			{#if data.recentOrders && data.recentOrders.length > 0}
				<div class="-mx-5 -mb-5 overflow-x-auto">
					<table class="w-full min-w-150 text-left">
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
											<span class="min-w-50 truncate font-mono text-[9px] text-ash/70">
												{order.shippingAddressSnapshot?.recipientName ?? 'Guest'}
												{#if order.shippingAddressSnapshot?.phone}
													({order.shippingAddressSnapshot.phone})
												{/if}
											</span>
										</div>
									</td>
									<td class="px-5 py-4">
										<AdminBadge variant={orderStatusVariant(order.status)} size="sm">
											{formatStatusLabel(order.status)}
										</AdminBadge>
									</td>
									<td class="px-5 py-4 font-mono text-xs text-bone">
										{formatAdminMoney(order.totalAmount)}
									</td>
									<td class="px-5 py-4 font-mono text-[10px] text-ash/80">
										{formatAdminDate(order.createdAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<AdminEmptyState
					title="No orders found"
					description="No orders registered in the system."
				/>
			{/if}
		</AdminSection>

		<!-- Right Column: Low Stock Highlights (1 Column Width) -->
		<div class="space-y-6">
			<!-- Low Stock Highlights -->
			<AdminSection title="Low Stock Alerts">
				{#snippet action()}
					<AdminButton href={resolve('/app/inventory?stockStatus=low')} variant="outline" size="sm">
						View All <ArrowRight size={10} />
					</AdminButton>
				{/snippet}

				<div class="-mx-5 -mb-5 bg-charcoal/5 px-5">
					{#if data.lowStockItems && data.lowStockItems.length > 0}
						{#each data.lowStockItems as item (item.variantId)}
							<div
								class="flex items-center justify-between gap-3 border-b border-charcoal py-3 last:border-b-0"
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
									<AdminBadge variant="accent">
										{item.inventory?.quantity ?? 0} Left
									</AdminBadge>
								</div>
							</div>
						{/each}
					{:else}
						<AdminEmptyState
							title="Stock levels healthy"
							description="No low-stock variants require attention."
							size="compact"
						/>
					{/if}
				</div>
			</AdminSection>
		</div>
	</div>
</AdminPageShell>
