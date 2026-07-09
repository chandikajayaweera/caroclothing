<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fade, scale } from 'svelte/transition';
	import {
		ShoppingBag,
		User,
		UserCheck,
		Clock,
		Trash2,
		X,
		Info,
		Lock,
		Eye,
		FileWarning
	} from 'lucide-svelte';
	import type { AdminBagDTO } from '$lib/server/modules/bag';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';

	let { data } = $props();

	let selectedBag = $state<AdminBagDTO | null>(null);
	let detailOpen = $state(false);

	let showFilters = $state(false);
	const hasActiveFilters = $derived(
		data.filters.status !== '' ||
			data.filters.ownerType !== '' ||
			data.filters.includeExpired === true
	);

	$effect(() => {
		if (hasActiveFilters) {
			showFilters = true;
		}
	});

	function formatDate(value: Date | string | null): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function clearFilters() {
		goto(resolve('/app/bag'));
	}

	function openDetails(bag: AdminBagDTO) {
		selectedBag = bag;
		detailOpen = true;
	}

	function closeDetails() {
		detailOpen = false;
	}

	let deletionSubmitting = $state(false);
	async function handleDeleteBag(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedBag) return;

		const confirmation = confirm(
			'Are you sure you want to permanently delete this bag? All items will be removed and reserved inventory will be released immediately.'
		);
		if (!confirmation) return;

		deletionSubmitting = true;
		const formData = new FormData();
		formData.set('bagId', selectedBag.id);

		try {
			const res = await fetch('?/delete', {
				method: 'POST',
				body: formData
			});
			const result = (await res.json()) as { success?: boolean; status?: number; type?: string };
			if (result.type === 'success' || result.status === 200) {
				detailOpen = false;
				selectedBag = null;
				// Reload page state silently
				const url = new URL(page.url);
				goto(resolve(`${url.pathname}${url.search}` as '/'), {
					keepFocus: true,
					noScroll: true,
					invalidateAll: true
				});
			}
		} catch (err) {
			console.error('[admin:bag] Failed to delete bag:', err);
		} finally {
			deletionSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Bags | Caro Admin</title>
	<meta
		name="description"
		content="Manage active and expired bags, trace customer items, audit locked pricing anomalies, and release reserved inventory."
	/>
</svelte:head>

<AdminListLayout
	title="Bag"
	kicker="Services"
	loading={false}
	query={data.filters.userId}
	bind:showFilters
	{hasActiveFilters}
	totalItems={data.bags.total}
	limit={data.filters.limit}
	offset={data.filters.offset}
	tableHeaders={[
		{ label: 'Owner' },
		{ label: 'Identity Identifier' },
		{ label: 'Items' },
		{ label: 'Subtotal' },
		{ label: 'Expiry Status' },
		{ label: 'Last Updated' },
		{ label: 'Actions', class: 'text-right' }
	]}
	items={data.bags.items}
	onclearfilters={clearFilters}
	searchPlaceholder="Search user ID..."
>
	{#snippet statsSnippet()}
		<div class="mt-8 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-6">
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Total Bags
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{data.summary.total}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Active Bags
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
					{data.summary.active}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Expired Bags
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{data.summary.expired}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Bag Units
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-sky-400 uppercase sm:text-4xl">
					{data.summary.totalItems}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Active Checkouts
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-volt uppercase sm:text-4xl">
					{data.summary.activeCheckouts}
				</p>
				<p class="mt-1 font-mono text-[8px] text-ash/60 uppercase">
					{data.summary.reservedItems} units reserved
				</p>
			</AdminCard>
			<AdminCard class="col-span-2 min-w-0 lg:col-span-1" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Bag Value
				</p>
				<p class="mt-2 font-display text-2xl leading-none text-emerald-400 uppercase sm:text-3xl">
					LKR {data.summary.totalSubtotal.toLocaleString()}
				</p>
			</AdminCard>
		</div>
	{/snippet}

	{#snippet headerActions()}
		<div class="flex flex-col gap-3 md:flex-row md:items-center">
			<form method="POST" action="?/deleteExpired" class="flex">
				<input type="hidden" name="limit" value="100" />
				<button
					type="submit"
					class="border border-rose-500/30 bg-rose-500/5 px-4 py-2 font-mono text-[9px] font-bold tracking-widest text-rose-400 uppercase transition-colors hover:bg-rose-500/10"
				>
					Clean Expired Guest Bags
				</button>
			</form>
		</div>
	{/snippet}

	{#snippet advancedFilters()}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<AdminSelect
				label="Include Expired Bags"
				name="includeExpired"
				value={data.filters.includeExpired ? 'true' : 'false'}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
				options={[
					{ value: 'false', label: 'No' },
					{ value: 'true', label: 'Yes' }
				]}
			/>

			<AdminSelect
				label="Status"
				name="status"
				value={data.filters.status}
				options={[
					{ value: '', label: 'All Bags' },
					{ value: 'active', label: 'Active' },
					{ value: 'expired', label: 'Expired' },
					{ value: 'empty', label: 'Empty' },
					{ value: 'non-empty', label: 'With Items' }
				]}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>

			<AdminSelect
				label="Owner Type"
				name="ownerType"
				value={data.filters.ownerType}
				options={[
					{ value: '', label: 'All Owners' },
					{ value: 'user', label: 'User Bags' },
					{ value: 'guest', label: 'Guest Bags' }
				]}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>
		</div>
	{/snippet}

	{#snippet card(bag: AdminBagDTO)}
		{@const isExpired = bag.expiresAt && new Date(bag.expiresAt) <= new Date()}
		<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
			<div class="flex flex-col gap-3">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							{#if bag.ownerType === 'user'}
								<UserCheck size={12} class="text-volt" />
								<span class="font-mono text-[8px] tracking-widest text-volt uppercase">User</span>
							{:else}
								<User size={12} class="text-sky-400" />
								<span class="font-mono text-[8px] tracking-widest text-sky-400 uppercase"
									>Guest</span
								>
							{/if}
						</div>
						<p class="mt-1.5 truncate font-mono text-[10px] text-bone select-all">
							{bag.userId ?? bag.sessionToken ?? bag.id}
						</p>
					</div>
					<div class="flex shrink-0 flex-col items-end gap-1">
						{#if isExpired}
							<span
								class="border border-rose-500/30 bg-rose-500/5 px-2 py-0.5 font-mono text-[8px] tracking-widest text-rose-400 uppercase"
							>
								Expired
							</span>
						{:else if bag.expiresAt}
							<span
								class="border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 font-mono text-[8px] tracking-widest text-amber-400 uppercase"
							>
								Active
							</span>
						{:else}
							<span
								class="border border-charcoal bg-void px-2 py-0.5 font-mono text-[8px] tracking-widest text-ash/60 uppercase"
							>
								No Expiry
							</span>
						{/if}
					</div>
				</div>

				<div class="font-mono text-[10px] text-ash">
					<p>Items: <span class="text-bone">{bag.itemCount}</span></p>
					<p class="mt-1">
						Checkout:
						<span class={bag.checkoutStatus === 'active' ? 'text-volt' : 'text-ash/60'}>
							{bag.checkoutStatus}
						</span>
					</p>
					<p class="mt-1">
						Subtotal: <span class="text-bone">LKR {bag.subtotal.toLocaleString()}</span>
					</p>
					<p class="mt-1 text-[9px] text-ash/60">Updated: {formatDate(bag.updatedAt)}</p>
				</div>

				<div class="mt-2 flex justify-end border-t border-charcoal pt-3">
					<button
						type="button"
						onclick={() => openDetails(bag)}
						class="border border-ash/30 px-2 py-1 font-mono text-[9px] tracking-wider text-ash uppercase hover:border-volt hover:text-volt"
					>
						View Details
					</button>
				</div>
			</div>
		</article>
	{/snippet}

	{#snippet row(bag: AdminBagDTO)}
		{@const isExpired = bag.expiresAt && new Date(bag.expiresAt) <= new Date()}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<!-- Owner -->
			<td class="px-5 py-4">
				<div class="flex items-center gap-2">
					{#if bag.ownerType === 'user'}
						<UserCheck size={14} class="text-volt" />
						<span class="font-mono text-[9px] tracking-widest text-volt uppercase">User</span>
					{:else}
						<User size={14} class="text-sky-400" />
						<span class="font-mono text-[9px] tracking-widest text-sky-400 uppercase">Guest</span>
					{/if}
				</div>
			</td>

			<!-- Identity Identifier -->
			<td class="px-5 py-4">
				<span
					class="block max-w-[200px] truncate font-mono text-xs text-bone"
					title={bag.userId ?? bag.sessionToken ?? bag.id}
				>
					{bag.userId ?? bag.sessionToken ?? bag.id}
				</span>
			</td>

			<!-- Items count -->
			<td class="px-5 py-4">
				<span class="font-mono text-xs text-bone"
					>{bag.itemCount} {bag.itemCount === 1 ? 'item' : 'items'}</span
				>
			</td>

			<!-- Subtotal -->
			<td class="px-5 py-4 font-mono text-xs text-bone">
				LKR {bag.subtotal.toLocaleString()}
			</td>

			<!-- Expiry Badge -->
			<td class="px-5 py-4">
				{#if isExpired}
					<span
						class="border border-rose-500/30 bg-rose-500/5 px-2 py-0.5 font-mono text-[9px] tracking-widest text-rose-400 uppercase"
					>
						Expired
					</span>
				{:else if bag.expiresAt}
					<span
						class="border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 font-mono text-[9px] tracking-widest text-amber-400 uppercase"
					>
						Expires {formatDate(bag.expiresAt)}
					</span>
				{:else}
					<span
						class="border border-charcoal bg-void px-2 py-0.5 font-mono text-[9px] tracking-widest text-ash/60 uppercase"
					>
						No Expiry
					</span>
				{/if}
			</td>

			<!-- Updated At -->
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatDate(bag.updatedAt)}
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<button
					type="button"
					onclick={() => openDetails(bag)}
					class="inline-flex items-center gap-1.5 border border-ash/30 px-2.5 py-1.5 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
				>
					<Eye size={10} /> View Details
				</button>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<p class="font-display text-4xl text-bone uppercase">No items found</p>
		<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
			Adjust filters or query parameters.
		</p>
	{/snippet}
</AdminListLayout>

<!-- TECHNICAL DETAIL SLIDE-OVER DRAWER -->
{#if detailOpen && selectedBag}
	<button
		type="button"
		class="fixed inset-0 z-[90] bg-void/70 backdrop-blur-sm transition-opacity"
		onclick={closeDetails}
		aria-label="Close bag details"
		transition:fade={{ duration: 150 }}
	></button>

	<div
		class="fixed inset-y-0 right-0 z-[100] w-full max-w-2xl overflow-y-auto border-l border-charcoal bg-void p-6 shadow-2xl"
		transition:scale={{ duration: 150, start: 0.98, opacity: 0 }}
	>
		<!-- Detail view header -->
		<div class="mb-6 flex items-center justify-between border-b border-charcoal pb-4">
			<div>
				<p class="mb-0.5 font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Bag Detail</p>
				<h2 class="max-w-md truncate font-mono text-sm font-bold text-bone">
					ID: {selectedBag.id}
				</h2>
			</div>
			<button
				type="button"
				class="p-1 text-ash transition-colors hover:text-bone"
				onclick={closeDetails}
				aria-label="Close details"
			>
				<X size={18} />
			</button>
		</div>

		<!-- Main details Split Grid: Visual Mockup on top, Stats below -->
		<div class="space-y-6">
			<!-- Bag Items List -->
			<div>
				<p class="mb-3 font-mono text-[9px] tracking-[0.2em] text-ash/50 uppercase">Bag Contents</p>

				{#if selectedBag.items && selectedBag.items.length > 0}
					<div class="space-y-3">
						{#each selectedBag.items as item (item.id)}
							<div class="flex items-start gap-4 border border-charcoal/80 bg-charcoal/10 p-3">
								<!-- Thumbnail image -->
								{#if item.imageUrl}
									<img
										src={item.imageUrl}
										alt={item.productName || 'Product'}
										class="h-16 w-16 border border-charcoal bg-charcoal object-cover"
									/>
								{:else}
									<div
										class="flex h-16 w-16 shrink-0 items-center justify-center border border-charcoal bg-charcoal text-ash/40"
									>
										<ShoppingBag size={20} />
									</div>
								{/if}

								<!-- Item info details -->
								<div class="min-w-0 flex-1">
									<h4 class="truncate font-mono text-xs font-bold text-bone">
										{item.productName || 'Unknown Product'}
									</h4>
									<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-ash">
										{#if item.size}
											<span>Size: <strong class="text-bone uppercase">{item.size}</strong></span>
										{/if}
										{#if item.color}
											<span class="flex items-center gap-1">
												Color:
												{#if item.colorHex}
													<span
														class="h-2.5 w-2.5 rounded-full border border-charcoal"
														style="background-color: {item.colorHex}"
													></span>
												{/if}
												<strong class="text-bone">{item.color}</strong>
											</span>
										{/if}
										<span>Qty: <strong class="text-bone">{item.quantity}</strong></span>
									</div>

									<!-- Availability and Price Changed warnings -->
									<div class="mt-2 flex flex-wrap gap-2">
										{#if item.priceChanged}
											<span
												class="inline-flex items-center gap-1 border border-volt/30 bg-volt/5 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider text-volt uppercase"
												title="Price has changed since this item was added to the bag. Price locked at LKR {item.unitPrice}."
											>
												<FileWarning size={10} /> Price Locked
											</span>
										{/if}
										{#if item.availabilityStatus === 'available'}
											<span
												class="inline-flex items-center border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-emerald-400 uppercase"
											>
												In Stock
											</span>
										{:else if item.availabilityStatus === 'backorder'}
											<span
												class="inline-flex items-center border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-amber-400 uppercase"
											>
												Backorder
											</span>
										{:else if item.availabilityStatus === 'untracked'}
											<span
												class="inline-flex items-center border border-charcoal bg-void px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-ash/60 uppercase"
											>
												Untracked
											</span>
										{:else}
											<span
												class="inline-flex items-center border border-rose-500/30 bg-rose-500/5 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-rose-400 uppercase"
											>
												Unavailable
											</span>
										{/if}
									</div>
								</div>

								<!-- Prices right-aligned -->
								<div class="text-right font-mono text-xs">
									<div class="font-medium text-bone">LKR {item.lineTotal.toLocaleString()}</div>
									<div class="mt-0.5 text-[9px] text-ash/60">
										LKR {item.unitPrice.toLocaleString()} ea
									</div>
									{#if item.priceChanged && item.currentUnitPrice}
										<div
											class="mt-1 text-[8px] text-volt line-through"
											title="Current catalog price"
										>
											LKR {item.currentUnitPrice.toLocaleString()}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="border border-charcoal/80 bg-charcoal/10 p-6 text-center">
						<ShoppingBag size={24} class="mx-auto mb-2 text-ash/20" />
						<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
							This bag is empty.
						</p>
					</div>
				{/if}
			</div>

			<!-- Bag Subtotals & Value breakdown -->
			<div class="space-y-2 rounded-lg border border-charcoal bg-charcoal/15 p-4 font-mono text-xs">
				<div class="flex justify-between text-ash">
					<span>Bag Subtotal:</span>
					<span class="text-bone">LKR {selectedBag.subtotal.toLocaleString()}</span>
				</div>
				{#if selectedBag.discountAmount > 0}
					<div class="flex justify-between text-rose-400">
						<span>Promo Code Discount:</span>
						<span>- LKR {selectedBag.discountAmount.toLocaleString()}</span>
					</div>
				{/if}
				<div class="flex justify-between border-t border-charcoal pt-2 text-sm font-bold text-bone">
					<span>Total Value:</span>
					<span class="text-volt">LKR {selectedBag.totalBeforeShipping.toLocaleString()}</span>
				</div>
			</div>

			<!-- Quick info stats grid -->
			<div class="grid grid-cols-2 gap-3">
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Owner Type</span>
					<span class="mt-1 block font-mono text-xs font-bold text-bone uppercase">
						{#if selectedBag.ownerType === 'user'}
							<span class="text-volt">User Bag</span>
						{:else}
							<span class="text-sky-400">Guest Bag</span>
						{/if}
					</span>
				</div>
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Promo Code Applied</span>
					<span class="mt-1 block truncate font-mono text-xs text-bone"
						>{selectedBag.promoCodeId || 'None'}</span
					>
				</div>
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Items Count</span>
					<span class="mt-1 block font-mono text-xs text-bone">{selectedBag.itemCount} items</span>
				</div>
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Session / Identifier</span>
					<span
						class="mt-1 block truncate font-mono text-[10px] text-bone"
						title={selectedBag.userId ?? selectedBag.sessionToken}
						>{selectedBag.userId ?? selectedBag.sessionToken ?? '—'}</span
					>
				</div>
			</div>

			<!-- Expiry and locking block -->
			{#if selectedBag.expiresAt}
				<div
					class="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4"
				>
					<Clock class="mt-0.5 shrink-0 text-amber-400" size={16} />
					<div>
						<p class="font-mono text-[9px] font-bold text-amber-300 uppercase">
							Expiry Date & Stock Retention
						</p>
						<p class="mt-1 font-mono text-[10px] leading-relaxed text-amber-200/80">
							This guest bag expires on {formatDate(selectedBag.expiresAt)}. Bag expiry removes the
							saved guest bag.
						</p>
					</div>
				</div>
			{:else}
				<div class="flex items-start gap-3 rounded-lg border border-charcoal bg-charcoal/10 p-4">
					<Lock class="mt-0.5 shrink-0 text-ash/60" size={16} />
					<div>
						<p class="font-mono text-[9px] font-bold text-ash uppercase">
							Indefinite Authentication Retention
						</p>
						<p class="mt-1 font-mono text-[10px] leading-relaxed text-ash/80">
							Authenticated user bags persist indefinitely and do not expire.
						</p>
					</div>
				</div>
			{/if}

			<div class="flex items-start gap-3 border border-charcoal bg-charcoal/10 p-4">
				<Clock class="mt-0.5 shrink-0 text-volt" size={16} />
				<div>
					<p class="font-mono text-[9px] font-bold text-bone uppercase">Checkout Hold</p>
					<p class="mt-1 font-mono text-[10px] leading-relaxed text-ash">
						Status: {selectedBag.checkoutStatus}.
						{#if selectedBag.checkoutExpiresAt}
							Stock hold deadline: {formatDate(selectedBag.checkoutExpiresAt)}.
						{:else}
							No stock is reserved for this bag.
						{/if}
					</p>
				</div>
			</div>

			<!-- Copyable Raw JSON Payload block -->
			<div>
				<div class="mb-2 flex items-center justify-between">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash/50 uppercase">
						Raw JSON Bag Data
					</p>
					<button
						type="button"
						onclick={() => {
							navigator.clipboard.writeText(JSON.stringify(selectedBag, null, 2));
						}}
						class="font-mono text-[8px] text-volt uppercase hover:underline"
					>
						Copy Raw Data
					</button>
				</div>
				<pre
					class="max-h-60 overflow-y-auto border border-charcoal bg-void p-4 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-ash/80">{JSON.stringify(
						selectedBag,
						null,
						2
					)}</pre>
			</div>

			<!-- Actions block (Delete Bag) -->
			<div class="flex items-center justify-between gap-4 border-t border-charcoal pt-4">
				<div class="flex items-center gap-2 font-mono text-[9px] text-ash">
					<Info size={12} class="text-rose-400" />
					<span>Deleting releases inventory blocks immediately.</span>
				</div>

				<form onsubmit={handleDeleteBag}>
					<button
						type="submit"
						disabled={deletionSubmitting}
						class="flex items-center gap-2 border border-rose-500/60 bg-rose-500/10 px-4 py-2 font-mono text-[10px] font-bold tracking-widest text-rose-400 uppercase transition-colors hover:bg-rose-500/25 disabled:opacity-50"
					>
						<Trash2 size={12} />
						{deletionSubmitting ? 'Deleting...' : 'Delete Bag'}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
