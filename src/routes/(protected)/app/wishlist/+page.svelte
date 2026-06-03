<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Heart,
		Search,
		Users,
		RadioTower,
		ChevronLeft,
		ChevronRight,
		Eye,
		UserCheck,
		Package,
		AlertTriangle,
		EyeOff
	} from 'lucide-svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminTableGrid from '$lib/components/admin/AdminTableGrid.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminFilterToggle from '$lib/components/admin/AdminFilterToggle.svelte';

	let { data }: { data: PageData } = $props();

	let currentTab = $derived(data.tab);
	let signals = $derived(data.signals);
	let searchedUsers = $derived(data.searchedUsers);
	let userWishlist = $derived(data.userWishlist);
	let filters = $derived(data.filters);

	// Client-side states bound to AdminListLayout's query
	let searchQuery = $state('');
	let showFilters = $state(false);

	// Ensure search query updates when url filter changes
	$effect(() => {
		searchQuery = data.filters.query || '';
	});

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
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	function handleTabChange(tab: string) {
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		url.searchParams.delete('query');
		url.searchParams.delete('offset');
		url.searchParams.delete('userId');
		goto(url.pathname + url.search, { noScroll: true });
	}

	function selectUser(id: string) {
		const url = new URL(page.url);
		url.searchParams.set('userId', id);
		url.searchParams.delete('offset');
		showFilters = false; // close filter panel after selection
		goto(url.pathname + url.search, { noScroll: true });
	}

	function clearSignalFilters() {
		searchQuery = '';
		const url = new URL(page.url);
		url.searchParams.delete('query');
		url.searchParams.delete('includeUnavailable');
		url.searchParams.delete('alertLevel');
		url.searchParams.delete('offset');
		goto(url.pathname + url.search, { noScroll: true });
	}

	function clearUserFilters() {
		searchQuery = '';
		const url = new URL(page.url);
		url.searchParams.delete('query');
		url.searchParams.delete('userId');
		url.searchParams.delete('offset');
		goto(url.pathname + url.search, { noScroll: true });
	}

	function formatDate(value: Date | string | null | undefined): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

{#if currentTab === 'signals'}
	<!-- DEMAND SIGNALS TAB -->
	<AdminListLayout
		title="Wishlist"
		kicker="Customers"
		stats={data.stats}
		loading={false}
		bind:query={searchQuery}
		searchPlaceholder="Search by Product ID..."
		totalItems={signals.total}
		limit={filters.limit}
		offset={filters.offset}
		tableHeaders={signalHeaders}
		items={signals.items}
		bind:showFilters
		hasActiveFilters={filters.alertLevel !== 'all' || filters.includeUnavailable}
		onclearfilters={clearSignalFilters}
	>
		{#snippet advancedFilters()}
			<div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<AdminSelect
					label="View Mode"
					name="tab"
					value={data.tab}
					options={[
						{ value: 'signals', label: 'Signals' },
						{ value: 'users', label: 'User Saves' }
					]}
					onchange={(e: any) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				/>

				<AdminSelect
					label="Alert Level"
					name="alertLevel"
					value={filters.alertLevel}
					onchange={(e: any) => updateQueryParam('alertLevel', e.target.value)}
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
			</div>
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
					{#if signal.isAvailable}
						<span class="font-semibold text-volt">Active</span>
					{:else}
						<span class="text-red-300">Inactive</span>
					{/if}
				</td>
				<td class="px-5 py-4 font-mono text-[10px]">
					{#if signal.alertStatus === 'high'}
						<span
							class="inline-block border border-volt bg-volt/10 px-2 py-0.5 text-[9px] font-bold tracking-wider text-volt uppercase"
							title="High saves count relative to very low stock levels (Stock <= 5)"
						>
							High Risk
						</span>
					{:else if signal.alertStatus === 'watch'}
						<span
							class="inline-block border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] tracking-wider text-amber-400 uppercase"
							title="Moderately low stock relative to demand (Stock <= 15)"
						>
							Watch
						</span>
					{:else}
						<span
							class="inline-block border border-charcoal bg-charcoal/30 px-2 py-0.5 text-[9px] tracking-wider text-ash/60 uppercase"
							title="Stock levels are healthy relative to saves count"
						>
							Normal
						</span>
					{/if}
				</td>
				<td class="px-5 py-4 text-right font-display text-xl text-bone">
					{signal.saveCount}
				</td>
				<td class="px-5 py-4 text-right font-mono text-[10px] text-ash">
					{formatDate(signal.lastSavedAt)}
				</td>
			</tr>
		{/snippet}

		{#snippet card(signal)}
			<AdminCard>
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

						<div class="mt-2 flex flex-wrap gap-1.5 font-mono text-[8px] tracking-wider uppercase">
							{#if signal.variant}
								<span class="border border-charcoal bg-charcoal/50 px-1.5 py-0.5 text-bone">
									{signal.variant.color} / {signal.variant.size}
								</span>
								{#if signal.variant.trackInventory}
									<span class="border border-charcoal bg-charcoal/50 px-1.5 py-0.5 text-ash">
										Stock: {signal.variant.inventoryQuantity ?? 0}
									</span>
								{/if}
							{/if}

							{#if signal.alertStatus === 'high'}
								<span class="border border-volt bg-volt/10 px-1.5 py-0.5 font-bold text-volt">
									High Risk
								</span>
							{:else if signal.alertStatus === 'watch'}
								<span
									class="border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-400"
								>
									Watch
								</span>
							{/if}
						</div>
					</div>
				</div>
				<div class="mt-4 flex items-center justify-between border-t border-charcoal/50 pt-3">
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Saves</p>
						<p class="mt-0.5 font-display text-xl leading-none text-volt">{signal.saveCount}</p>
					</div>
					<div class="text-right">
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Last Saved</p>
						<p class="mt-0.5 font-mono text-[9px] leading-none text-bone">
							{formatDate(signal.lastSavedAt)}
						</p>
					</div>
				</div>
			</AdminCard>
		{/snippet}

		{#snippet emptyState()}
			<div class="py-6 text-center">
				<EyeOff class="mx-auto mb-3 text-ash/20" size={40} />
				<p class="font-display text-2xl text-bone uppercase">No demand signals found</p>
				<p class="mt-1 font-mono text-[9px] tracking-widest text-ash uppercase">
					Adjust query or check filters.
				</p>
			</div>
		{/snippet}
	</AdminListLayout>
{:else if currentTab === 'users'}
	<!-- USER WISHLISTS TAB -->
	<AdminListLayout
		title="Wishlist"
		kicker="Customers"
		stats={data.stats}
		loading={false}
		bind:query={searchQuery}
		searchPlaceholder="Search user name, email, or phone..."
		totalItems={userWishlist?.total ?? 0}
		limit={filters.limit}
		offset={filters.offset}
		tableHeaders={wishlistHeaders}
		items={userWishlist?.items ?? []}
		bind:showFilters
		hasActiveFilters={filters.userId !== ''}
		onclearfilters={clearUserFilters}
		actionMessage={selectedUserLabel ? `Viewing saves for: ${selectedUserLabel}` : null}
		actionMessageClass="border-volt/30 bg-volt/10 text-volt"
	>
		{#snippet advancedFilters()}
			<div class="mt-2">
				<div class="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<AdminSelect
						label="View Mode"
						name="tab"
						value={data.tab}
						options={[
							{ value: 'signals', label: 'Signals' },
							{ value: 'users', label: 'User Saves' }
						]}
						onchange={(e: any) => {
							const form = (e.currentTarget as HTMLElement).closest('form');
							if (form) form.requestSubmit();
						}}
					/>
				</div>

				<p class="mb-3 font-mono text-[8px] tracking-[0.2em] text-volt uppercase">
					Matching Users ({searchedUsers.items.length})
				</p>
				<div class="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
					{#each searchedUsers.items as user (user.id)}
						<button
							type="button"
							onclick={() => selectUser(user.id)}
							class="flex w-full items-center justify-between border p-3 text-left transition-colors hover:border-volt {filters.userId ===
							user.id
								? 'border-volt bg-volt/10'
								: 'border-charcoal bg-void/50'}"
						>
							<div>
								<p class="font-sans text-xs leading-tight font-semibold text-bone">
									{user.name || 'Anonymous User'}
								</p>
								<p
									class="mt-0.5 max-w-[200px] truncate font-mono text-[9px] tracking-wider text-ash"
								>
									{user.email || user.phoneNumber || user.id}
								</p>
							</div>
							<UserCheck
								size={14}
								class={filters.userId === user.id ? 'text-volt' : 'text-ash/40'}
							/>
						</button>
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
					LKR {item.effectivePrice.toLocaleString('en-LK')}
				</td>
				<td class="px-5 py-4 text-right font-mono text-[10px] text-ash">
					{formatDate(item.addedAt)}
				</td>
			</tr>
		{/snippet}

		{#snippet card(item)}
			<AdminCard>
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
								<span
									class="border border-charcoal bg-charcoal/50 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider text-bone uppercase"
								>
									{item.variant.color} / {item.variant.size}
								</span>
							</div>
						{/if}
					</div>
				</div>
				<div class="mt-4 flex items-center justify-between border-t border-charcoal/50 pt-3">
					<div>
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Price</p>
						<p class="mt-0.5 font-mono text-xs leading-none text-volt">
							LKR {item.effectivePrice.toLocaleString('en-LK')}
						</p>
					</div>
					<div class="text-right">
						<p class="font-mono text-[8px] tracking-[0.08em] text-ash uppercase">Added At</p>
						<p class="mt-0.5 font-mono text-[9px] leading-none text-bone">
							{formatDate(item.addedAt)}
						</p>
					</div>
				</div>
			</AdminCard>
		{/snippet}

		{#snippet emptyState()}
			{#if !filters.userId}
				<div class="py-6 text-center">
					<Users class="mx-auto mb-3 text-ash/25" size={40} />
					<p class="font-display text-2xl text-bone uppercase">No user selected</p>
					<p class="mt-1 font-mono text-[9px] tracking-widest text-ash uppercase">
						Search and select a user from the filter panel.
					</p>
				</div>
			{:else}
				<div class="py-6 text-center">
					<Heart class="mx-auto mb-3 text-ash/25" size={40} />
					<p class="font-display text-2xl text-bone uppercase">Wishlist is empty</p>
					<p class="mt-1 font-mono text-[9px] tracking-widest text-ash uppercase">
						This user has not wishlisted any active products.
					</p>
				</div>
			{/if}
		{/snippet}
	</AdminListLayout>
{/if}
