<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { UserCheck, Package } from 'lucide-svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminTabs from '$lib/components/admin/controls/AdminTabs.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminFilterToggle from '$lib/components/admin/filters/AdminFilterToggle.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import { formatAdminDateTime, formatAdminMoney } from '$lib/shared/admin/format';
	import { booleanStatusVariant, wishlistAlertVariant } from '$lib/shared/admin/status';

	let { data }: { data: PageData } = $props();

	let currentTab = $derived(data.tab);
	let signals = $derived(data.signals);
	let searchedUsers = $derived(data.searchedUsers);
	let userWishlist = $derived(data.userWishlist);
	let filters = $derived(data.filters);

	// Client-side states bound to AdminListLayout's query
	let searchQuery = $derived(data.filters.query || '');
	let showFilters = $state(false);

	// Automatically open filters if there are search results (to choose users easily)
	$effect(() => {
		if (currentTab === 'users' && searchedUsers.items.length > 0) {
			showFilters = true;
		}
	});

	const signalHeaders = [
		{ label: 'Product' },
		{ label: 'Variant' },
		{ label: 'Availability' },
		{ label: 'Stock Alert' },
		{ label: 'Saves', class: 'text-right' },
		{ label: 'Last Saved', class: 'text-right' }
	];

	const wishlistHeaders = [
		{ label: 'Product' },
		{ label: 'Variant' },
		{ label: 'Effective Price' },
		{ label: 'Added At', class: 'text-right' }
	];

	// Get active selected user name
	const selectedUserLabel = $derived(
		searchedUsers.items.find((u) => u.id === filters.userId)?.name ||
			(filters.userId ? `User (ID: ${filters.userId})` : '')
	);

	function updateQueryParam(name: string, value: string | null) {
		const url = new URL(page.url);
		if (value === null || value === '') {
			url.searchParams.delete(name);
		} else {
			url.searchParams.set(name, value);
		}
		url.searchParams.delete('offset'); // Reset paging on filter change
		goto(resolve(`${url.pathname}${url.search}` as '/'), { keepFocus: true, noScroll: true });
	}

	function selectUser(id: string) {
		const url = new URL(page.url);
		url.searchParams.set('userId', id);
		url.searchParams.delete('offset');
		showFilters = false; // close filter panel after selection
		goto(resolve(`${url.pathname}${url.search}` as '/'), { noScroll: true });
	}

	function clearSignalFilters() {
		searchQuery = '';
		const url = new URL(page.url);
		url.searchParams.delete('query');
		url.searchParams.delete('includeUnavailable');
		url.searchParams.delete('alertLevel');
		url.searchParams.delete('offset');
		goto(resolve(`${url.pathname}${url.search}` as '/'), { noScroll: true });
	}

	function clearUserFilters() {
		searchQuery = '';
		const url = new URL(page.url);
		url.searchParams.delete('query');
		url.searchParams.delete('userId');
		url.searchParams.delete('offset');
		goto(resolve(`${url.pathname}${url.search}` as '/'), { noScroll: true });
	}
</script>

{#snippet wishlistTabs()}
	<AdminTabs
		label="Wishlist views"
		value={currentTab}
		items={[
			{ value: 'signals', label: 'Demand Signals', href: '/app/wishlist?tab=signals' },
			{ value: 'users', label: 'User Saves', href: '/app/wishlist?tab=users' }
		]}
	/>
{/snippet}

{#if currentTab === 'signals'}
	<!-- DEMAND SIGNALS TAB -->
	<AdminListLayout
		title="Wishlist"
		kicker="Customers"
		metrics={[
			{ label: 'Total Saves', value: data.stats.totalSaves },
			{ label: 'Demand Signals', value: data.stats.totalSignals, tone: 'info' },
			{ label: 'High-risk Variants', value: data.stats.highRiskVariants, tone: 'warning' }
		]}
		loading={false}
		bind:query={searchQuery}
		searchPlaceholder="Search by Product ID..."
		totalItems={signals.total}
		limit={filters.limit}
		offset={filters.offset}
		tableHeaders={signalHeaders}
		items={signals.items}
		preserveParams={['tab']}
		bind:showFilters
		hasActiveFilters={filters.alertLevel !== 'all' || filters.includeUnavailable}
		onclearfilters={clearSignalFilters}
	>
		{#snippet headerActions()}
			{@render wishlistTabs()}
		{/snippet}

		{#snippet advancedFilters()}
			<AdminFilterBar cols={2} class="mt-2">
				<AdminSelect
					label="Alert Level"
					name="alertLevel"
					value={filters.alertLevel}
					onchange={(e) =>
						updateQueryParam('alertLevel', (e.currentTarget as HTMLSelectElement).value)}
					options={[
						{ value: 'all', label: 'All Alerts' },
						{ value: 'high', label: 'High Risk' },
						{ value: 'watch', label: 'Watch' },
						{ value: 'normal', label: 'Normal' }
					]}
				/>

				<AdminFilterToggle
					label="Include Unavailable"
					checked={filters.includeUnavailable}
					onclick={() => {
						setTimeout(() => {
							updateQueryParam('includeUnavailable', String(!filters.includeUnavailable));
						}, 0);
					}}
				/>
			</AdminFilterBar>
		{/snippet}

		{#snippet row(signal)}
			<tr
				class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10"
			>
				<td class="px-5 py-4">
					<div class="flex items-center gap-3">
						{#if signal.imageUrl}
							<img
								src={signal.imageUrl}
								alt=""
								class="h-10 w-10 border border-charcoal bg-void object-cover"
							/>
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center border border-charcoal bg-void text-ash/30"
							>
								<Package size={16} />
							</div>
						{/if}
						<div>
							<p class="font-sans text-sm leading-tight font-medium text-bone">
								{signal.product.name}
							</p>
							<p class="mt-0.5 font-mono text-[9px] tracking-widest text-ash uppercase">
								{signal.productId}
							</p>
						</div>
					</div>
				</td>
				<td class="px-5 py-4 font-mono text-xs text-ash">
					{#if signal.variant}
						<span class="text-bone">{signal.variant.color}</span> / Size {signal.variant.size}
						{#if signal.variant.trackInventory}
							<span class="ml-1 text-[10px] text-ash/60">
								(Stock: {signal.variant.inventoryQuantity ?? 0})
							</span>
						{:else}
							<span class="ml-1 text-[10px] text-ash/40">(Untracked)</span>
						{/if}
					{:else}
						<span class="text-ash/40">—</span>
					{/if}
				</td>
				<td class="px-5 py-4 font-mono text-[10px] tracking-wider uppercase">
					<AdminBadge variant={booleanStatusVariant(signal.isAvailable)}>
						{signal.isAvailable ? 'Active' : 'Inactive'}
					</AdminBadge>
				</td>
				<td class="px-5 py-4 font-mono text-[10px]">
					<AdminBadge variant={wishlistAlertVariant(signal.alertStatus)}>
						{signal.alertStatus === 'high' ? 'High Risk' : signal.alertStatus}
					</AdminBadge>
				</td>
				<td class="px-5 py-4 text-right font-display text-xl text-bone">
					{signal.saveCount}
				</td>
				<td class="px-5 py-4 text-right font-mono text-[10px] text-ash">
					{formatAdminDateTime(signal.lastSavedAt, 'Never')}
				</td>
			</tr>
		{/snippet}

		{#snippet card(signal)}
			<AdminEntityCard>
				{#snippet header()}
					<div class="flex items-start gap-3">
						{#if signal.imageUrl}
							<img
								src={signal.imageUrl}
								alt=""
								class="h-12 w-12 border border-charcoal bg-void object-cover"
							/>
						{:else}
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center border border-charcoal bg-void text-ash/30"
							>
								<Package size={16} />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-display text-lg leading-tight text-bone uppercase">
								{signal.product.name}
							</h3>
							<p class="mt-0.5 truncate font-mono text-[9px] tracking-wider text-ash/60">
								{signal.productId}
							</p>

							<div
								class="mt-2 flex flex-wrap gap-1.5 font-mono text-[8px] tracking-wider uppercase"
							>
								{#if signal.variant}
									<AdminBadge variant="neutral" size="xs">
										{signal.variant.color} / {signal.variant.size}
									</AdminBadge>
									{#if signal.variant.trackInventory}
										<AdminBadge variant="neutral" size="xs">
											Stock: {signal.variant.inventoryQuantity ?? 0}
										</AdminBadge>
									{/if}
								{/if}

								<AdminBadge variant={wishlistAlertVariant(signal.alertStatus)} size="xs">
									{signal.alertStatus === 'high' ? 'High Risk' : signal.alertStatus}
								</AdminBadge>
							</div>
						</div>
					</div>
				{/snippet}
				{#snippet metadata()}
					<AdminMetaGrid>
						<div>
							<p class="text-ash/60">Saves</p>
							<p class="mt-0.5 text-bone">{signal.saveCount}</p>
						</div>
						<div>
							<p class="text-ash/60">Last Saved</p>
							<p class="mt-0.5 text-bone">
								{formatAdminDateTime(signal.lastSavedAt, 'Never')}
							</p>
						</div>
					</AdminMetaGrid>
				{/snippet}
			</AdminEntityCard>
		{/snippet}

		{#snippet emptyState()}
			<AdminEmptyState title="No demand signals found" description="Adjust query or filters." />
		{/snippet}
	</AdminListLayout>
{:else if currentTab === 'users'}
	<!-- USER WISHLISTS TAB -->
	<AdminListLayout
		title="Wishlist"
		kicker="Customers"
		metrics={[
			{ label: 'Selected User Saves', value: userWishlist?.total ?? 0, tone: 'accent' },
			{ label: 'Matching Users', value: searchedUsers.total, tone: 'info' },
			{ label: 'Tracked Products', value: signals.total }
		]}
		loading={false}
		bind:query={searchQuery}
		searchPlaceholder="Search user name, email, or phone..."
		totalItems={userWishlist?.total ?? 0}
		limit={filters.limit}
		offset={filters.offset}
		tableHeaders={wishlistHeaders}
		items={userWishlist?.items ?? []}
		preserveParams={['tab', 'userId']}
		bind:showFilters
		hasActiveFilters={filters.userId !== ''}
		onclearfilters={clearUserFilters}
		actionMessage={selectedUserLabel ? `Viewing saves for: ${selectedUserLabel}` : null}
		actionMessageClass="border-volt/30 bg-volt/10 text-volt"
	>
		{#snippet headerActions()}
			{@render wishlistTabs()}
		{/snippet}

		{#snippet advancedFilters()}
			<div class="mt-2">
				<p class="mb-3 font-mono text-[8px] tracking-[0.2em] text-volt uppercase">
					Matching Users ({searchedUsers.items.length})
				</p>
				<div class="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
					{#each searchedUsers.items as user (user.id)}
						<AdminButton
							type="button"
							size="lg"
							variant={filters.userId === user.id ? 'volt' : 'outline'}
							onclick={() => selectUser(user.id)}
							class="w-full justify-between text-left"
						>
							<div>
								<p class="font-sans text-xs leading-tight font-semibold text-bone">
									{user.name || 'Anonymous User'}
								</p>
								<p class="mt-0.5 min-w-50 truncate font-mono text-[9px] tracking-wider text-ash">
									{user.email || user.phoneNumber || user.id}
								</p>
							</div>
							<UserCheck
								size={14}
								class={filters.userId === user.id ? 'text-volt' : 'text-ash/40'}
							/>
						</AdminButton>
					{/each}
				</div>
			</div>
		{/snippet}

		{#snippet row(item)}
			<tr
				class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10"
			>
				<td class="px-5 py-4">
					<div class="flex items-center gap-3">
						{#if item.imageUrl}
							<img
								src={item.imageUrl}
								alt=""
								class="h-10 w-10 border border-charcoal bg-void object-cover"
							/>
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center border border-charcoal bg-void text-ash/30"
							>
								<Package size={16} />
							</div>
						{/if}
						<div>
							<p class="font-sans text-sm leading-tight font-medium text-bone">
								{item.product.name}
							</p>
							<p class="mt-0.5 font-mono text-[9px] tracking-widest text-ash uppercase">
								{item.productId}
							</p>
						</div>
					</div>
				</td>
				<td class="px-5 py-4 font-mono text-xs text-ash">
					{#if item.variant}
						<span class="text-bone">{item.variant.color}</span> / Size {item.variant.size}
					{:else}
						<span class="text-ash/40">—</span>
					{/if}
				</td>
				<td class="px-5 py-4 font-mono text-xs font-medium text-volt">
					{formatAdminMoney(item.effectivePrice)}
				</td>
				<td class="px-5 py-4 text-right font-mono text-[10px] text-ash">
					{formatAdminDateTime(item.addedAt, 'Never')}
				</td>
			</tr>
		{/snippet}

		{#snippet card(item)}
			<AdminEntityCard>
				{#snippet header()}
					<div class="flex items-start gap-3">
						{#if item.imageUrl}
							<img
								src={item.imageUrl}
								alt=""
								class="h-12 w-12 border border-charcoal bg-void object-cover"
							/>
						{:else}
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center border border-charcoal bg-void text-ash/30"
							>
								<Package size={16} />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-display text-lg leading-tight text-bone uppercase">
								{item.product.name}
							</h3>
							<p class="mt-0.5 truncate font-mono text-[9px] tracking-wider text-ash/60">
								{item.productId}
							</p>

							{#if item.variant}
								<div class="mt-2">
									<AdminBadge variant="neutral" size="xs">
										{item.variant.color} / {item.variant.size}
									</AdminBadge>
								</div>
							{/if}
						</div>
					</div>
				{/snippet}
				{#snippet metadata()}
					<AdminMetaGrid>
						<div>
							<p class="text-ash/60">Price</p>
							<p class="mt-0.5 text-bone">
								{formatAdminMoney(item.effectivePrice)}
							</p>
						</div>
						<div>
							<p class="text-ash/60">Added At</p>
							<p class="mt-0.5 text-bone">
								{formatAdminDateTime(item.addedAt, 'Never')}
							</p>
						</div>
					</AdminMetaGrid>
				{/snippet}
			</AdminEntityCard>
		{/snippet}

		{#snippet emptyState()}
			{#if !filters.userId}
				<AdminEmptyState
					title="No user selected"
					description="Search and select a user from the filter panel."
				/>
			{:else}
				<AdminEmptyState
					title="Wishlist is empty"
					description="This user has not wishlisted any active products."
				/>
			{/if}
		{/snippet}
	</AdminListLayout>
{/if}
