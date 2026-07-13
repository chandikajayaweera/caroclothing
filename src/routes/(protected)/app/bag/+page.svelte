<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ShoppingBag,
		User,
		UserCheck,
		Clock,
		Trash2,
		Info,
		Lock,
		Eye,
		FileWarning
	} from 'lucide-svelte';
	import type { AdminBagDTO } from '$lib/server/modules/bag';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminConfirmDialog from '$lib/components/admin/AdminConfirmDialog.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminJsonViewer from '$lib/components/admin/data-display/AdminJsonViewer.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import {
		formatAdminDateTime,
		formatAdminMoney,
		formatAdminStatus
	} from '$lib/shared/admin/format';
	import { bagItemAvailabilityVariant } from '$lib/shared/admin/status';

	let { data } = $props();

	let selectedBag = $state<AdminBagDTO | null>(null);
	let detailOpen = $state(false);
	let deleteConfirmOpen = $state(false);
	let cleanupConfirmOpen = $state(false);
	let cleanupFormElement = $state<HTMLFormElement | null>(null);
	let cleanupSubmitting = $state(false);
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');

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

	function getActionMessage(data: unknown, fallback: string): string {
		if (!data || typeof data !== 'object') return fallback;
		const record = data as { message?: unknown; form?: { message?: unknown } };
		const value = record.message ?? record.form?.message;
		return typeof value === 'string' ? value : fallback;
	}

	async function handleDeleteBag() {
		if (!selectedBag) return;

		deletionSubmitting = true;
		const formData = new FormData();
		formData.set('bagId', selectedBag.id);

		try {
			const res = await fetch('?/delete', {
				method: 'POST',
				body: formData
			});
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				deleteConfirmOpen = false;
				detailOpen = false;
				selectedBag = null;
				toastMessage = getActionMessage(result.data, 'Bag deleted.');
				toastType = 'success';
				await invalidateAll();
			} else {
				const resultData = result.type === 'failure' ? result.data : undefined;
				toastMessage = getActionMessage(resultData, 'Bag could not be deleted.');
				toastType = 'error';
			}
		} catch {
			toastMessage = 'Bag could not be deleted. Check the connection and retry.';
			toastType = 'error';
		} finally {
			deletionSubmitting = false;
		}
	}

	function confirmCleanup() {
		cleanupFormElement?.requestSubmit();
	}

	const enhanceCleanup: SubmitFunction = () => {
		cleanupSubmitting = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			cleanupSubmitting = false;
			if (result.type === 'success') {
				cleanupConfirmOpen = false;
				toastMessage = getActionMessage(result.data, 'Expired guest bags cleaned.');
				toastType = 'success';
			} else {
				const resultData = result.type === 'failure' ? result.data : undefined;
				toastMessage = getActionMessage(resultData, 'Expired bags could not be cleaned.');
				toastType = 'error';
			}
		};
	};
</script>

<svelte:head>
	<title>Bags | Caro Admin</title>
	<meta
		name="description"
		content="Manage active and expired bags, trace customer items, audit locked pricing anomalies, and release reserved inventory."
	/>
</svelte:head>

{#if toastMessage}
	<AdminToast message={toastMessage} type={toastType} onclose={() => (toastMessage = null)} />
{/if}

<form
	bind:this={cleanupFormElement}
	method="POST"
	action="?/deleteExpired"
	use:enhance={enhanceCleanup}
	class="hidden"
>
	<input type="hidden" name="limit" value="100" />
</form>

<AdminListLayout
	title="Bag"
	kicker="Services"
	loading={false}
	metrics={[
		{ label: 'Total Bags', value: data.summary.total },
		{ label: 'Active Bags', value: data.summary.active, tone: 'success' },
		{
			label: 'Expired Bags',
			value: data.summary.expired,
			tone: data.summary.expired > 0 ? 'warning' : 'neutral'
		},
		{ label: 'Bag Units', value: data.summary.totalItems },
		{
			label: 'Active Checkouts',
			value: data.summary.activeCheckouts,
			description: `${data.summary.reservedItems} units reserved`,
			tone: 'info'
		},
		{
			label: 'Bag Value',
			value: formatAdminMoney(data.summary.totalSubtotal),
			tone: 'accent'
		}
	]}
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
	searchParamName="userId"
>
	{#snippet headerActions()}
		<AdminActionToolbar
			ariaLabel="Bag maintenance actions"
			menuItems={[
				{
					label: 'Clean expired guest bags',
					description: 'Delete up to 100 expired anonymous bags.',
					icon: Trash2,
					tone: 'danger',
					onselect: () => (cleanupConfirmOpen = true)
				}
			]}
		/>
	{/snippet}

	{#snippet advancedFilters()}
		<AdminFilterBar cols={3}>
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
		</AdminFilterBar>
	{/snippet}

	{#snippet card(bag: AdminBagDTO)}
		{@const isExpired = bag.expiresAt && new Date(bag.expiresAt) <= new Date()}
		<AdminEntityCard>
			{#snippet header()}
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
							<AdminBadge variant="danger" size="xs">Expired</AdminBadge>
						{:else if bag.expiresAt}
							<AdminBadge variant="warning" size="xs">Active</AdminBadge>
						{:else}
							<AdminBadge variant="neutral" size="xs">No Expiry</AdminBadge>
						{/if}
					</div>
				</div>
			{/snippet}

			{#snippet metadata()}
				<AdminMetaGrid>
					<div>
						<p class="text-ash/60">Items</p>
						<p class="mt-0.5 text-bone">{bag.itemCount}</p>
					</div>
					<div>
						<p class="text-ash/60">Checkout</p>
						<p class="mt-0.5 text-bone capitalize">{formatAdminStatus(bag.checkoutStatus)}</p>
					</div>
					<div>
						<p class="text-ash/60">Subtotal</p>
						<p class="mt-0.5 text-bone">{formatAdminMoney(bag.subtotal)}</p>
					</div>
					<div>
						<p class="text-ash/60">Updated</p>
						<p class="mt-0.5 text-bone">{formatAdminDateTime(bag.updatedAt, '—')}</p>
					</div>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<AdminButton type="button" variant="outline" size="sm" onclick={() => openDetails(bag)}>
					<Eye size={14} /> View Details
				</AdminButton>
			{/snippet}
		</AdminEntityCard>
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
					class="block min-w-50 truncate font-mono text-xs text-bone"
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
				{formatAdminMoney(bag.subtotal)}
			</td>

			<!-- Expiry Badge -->
			<td class="px-5 py-4">
				{#if isExpired}
					<AdminBadge variant="danger" size="xs">Expired</AdminBadge>
				{:else if bag.expiresAt}
					<span class="font-mono text-[10px] text-amber-400">
						Expires {formatAdminDateTime(bag.expiresAt, '—')}
					</span>
				{:else}
					<AdminBadge variant="neutral" size="xs">No Expiry</AdminBadge>
				{/if}
			</td>

			<!-- Updated At -->
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatAdminDateTime(bag.updatedAt, '—')}
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<AdminButton type="button" variant="outline" size="sm" onclick={() => openDetails(bag)}>
					<Eye size={10} /> View Details
				</AdminButton>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState title="No bags found" description="Adjust filters or query parameters." />
	{/snippet}
</AdminListLayout>

<AdminDrawer
	bind:open={detailOpen}
	title="Bag Detail"
	description="Inspect bag contents, checkout state, and ownership metadata."
	onOpenChange={(open) => {
		if (!open) closeDetails();
	}}
>
	{#if selectedBag}
		<p class="mb-5 font-mono text-[10px] break-all text-ash">ID: {selectedBag.id}</p>
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
												title="Price has changed since this item was added to the bag. Price locked at LKR {item.unitPrice}."
											>
												<AdminBadge variant="accent" size="xs" class="gap-1">
													<FileWarning size={10} /> Price Locked
												</AdminBadge>
											</span>
										{/if}
										{#if item.availabilityStatus === 'available'}
											<AdminBadge
												variant={bagItemAvailabilityVariant(item.availabilityStatus)}
												size="xs"
											>
												In Stock
											</AdminBadge>
										{:else if item.availabilityStatus === 'backorder'}
											<AdminBadge
												variant={bagItemAvailabilityVariant(item.availabilityStatus)}
												size="xs"
											>
												Backorder
											</AdminBadge>
										{:else if item.availabilityStatus === 'untracked'}
											<AdminBadge
												variant={bagItemAvailabilityVariant(item.availabilityStatus)}
												size="xs"
											>
												Untracked
											</AdminBadge>
										{:else}
											<AdminBadge
												variant={bagItemAvailabilityVariant(item.availabilityStatus)}
												size="xs"
											>
												Unavailable
											</AdminBadge>
										{/if}
									</div>
								</div>

								<!-- Prices right-aligned -->
								<div class="text-right font-mono text-xs">
									<div class="font-medium text-bone">{formatAdminMoney(item.lineTotal)}</div>
									<div class="mt-0.5 text-[9px] text-ash/60">
										{formatAdminMoney(item.unitPrice)} ea
									</div>
									{#if item.priceChanged && item.currentUnitPrice}
										<div
											class="mt-1 text-[8px] text-volt line-through"
											title="Current catalog price"
										>
											{formatAdminMoney(item.currentUnitPrice)}
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
					<span class="text-bone">{formatAdminMoney(selectedBag.subtotal)}</span>
				</div>
				{#if selectedBag.discountAmount > 0}
					<div class="flex justify-between text-rose-400">
						<span>Promo Code Discount:</span>
						<span>- {formatAdminMoney(selectedBag.discountAmount)}</span>
					</div>
				{/if}
				<div class="flex justify-between border-t border-charcoal pt-2 text-sm font-bold text-bone">
					<span>Total Value:</span>
					<span class="text-volt">{formatAdminMoney(selectedBag.totalBeforeShipping)}</span>
				</div>
			</div>

			<AdminMetaGrid>
				<div>
					<p class="text-ash/60">Owner Type</p>
					<p class="mt-0.5 text-bone capitalize">{selectedBag.ownerType} bag</p>
				</div>
				<div>
					<p class="text-ash/60">Promo Code</p>
					<p class="mt-0.5 truncate text-bone">{selectedBag.promoCodeId || 'None'}</p>
				</div>
				<div>
					<p class="text-ash/60">Items</p>
					<p class="mt-0.5 text-bone">{selectedBag.itemCount}</p>
				</div>
				<div>
					<p class="text-ash/60">Session / Identifier</p>
					<p
						class="mt-0.5 truncate text-bone"
						title={selectedBag.userId ?? selectedBag.sessionToken}
					>
						{selectedBag.userId ?? selectedBag.sessionToken ?? '—'}
					</p>
				</div>
			</AdminMetaGrid>

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
							This guest bag expires on {formatAdminDateTime(selectedBag.expiresAt, '—')}. Bag
							expiry removes the saved guest bag.
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
							Stock hold deadline: {formatAdminDateTime(selectedBag.checkoutExpiresAt, '—')}.
						{:else}
							No stock is reserved for this bag.
						{/if}
					</p>
				</div>
			</div>

			<AdminJsonViewer value={selectedBag} label="Raw bag data" copyLabel="Copy raw data" />

			<!-- Actions block (Delete Bag) -->
			<div
				class="grid gap-3 border-t border-charcoal pt-4 sm:flex sm:items-center sm:justify-between"
			>
				<div class="flex items-center gap-2 font-mono text-[9px] text-ash">
					<Info size={12} class="text-rose-400" />
					<span>Deleting releases inventory blocks immediately.</span>
				</div>

				<AdminButton
					type="button"
					variant="danger"
					disabled={deletionSubmitting}
					onclick={() => (deleteConfirmOpen = true)}
				>
					<Trash2 size={12} />
					Delete Bag
				</AdminButton>
			</div>
		</div>
	{/if}
</AdminDrawer>

<AdminConfirmDialog
	bind:open={cleanupConfirmOpen}
	title="Clean expired guest bags"
	message="Delete up to 100 expired guest bags and release their reserved inventory?"
	confirmLabel="Clean expired bags"
	loading={cleanupSubmitting}
	onconfirm={confirmCleanup}
/>

<AdminConfirmDialog
	bind:open={deleteConfirmOpen}
	title="Delete bag"
	message="Permanently delete this bag, remove all items, and release reserved inventory?"
	confirmLabel="Delete bag"
	loading={deletionSubmitting}
	onconfirm={handleDeleteBag}
/>
