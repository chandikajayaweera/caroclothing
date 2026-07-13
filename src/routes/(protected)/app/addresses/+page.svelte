<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MapPin, Calendar, Clock, ExternalLink } from 'lucide-svelte';
	import type { PageData } from './$types';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminSkeletonList from '$lib/components/admin/data-display/AdminSkeletonList.svelte';
	import AdminCopyButton from '$lib/components/admin/data-display/AdminCopyButton.svelte';
	import AdminErrorState from '$lib/components/admin/data-display/AdminErrorState.svelte';
	import { formatAdminDateTime } from '$lib/shared/admin/format';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';

	let { data }: { data: PageData } = $props();

	type AddressItem = Awaited<PageData['streamed']['addresses']>['items'][number];

	const tableHeaders = [
		{ label: 'Recipient' },
		{ label: 'Address' },
		{ label: 'City & District' },
		{ label: 'Type' },
		{ label: 'Default' },
		{ label: 'Actions', class: 'text-right' }
	];

	// Filter state reactivity
	const hasActiveFilters = $derived(
		data.filters.district !== '' ||
			data.filters.isDefault !== '' ||
			data.filters.hasUser !== '' ||
			data.filters.userId !== ''
	);
	let showFilters = $state(false);

	// Automatically expand filters if any are active
	$effect(() => {
		if (hasActiveFilters) {
			showFilters = true;
		}
	});

	// Detail drawer state
	let selectedAddress = $state<AddressItem | null>(null);
	let drawerOpen = $state(false);
	function openDetails(address: AddressItem) {
		selectedAddress = address;
		drawerOpen = true;
	}

	function closeDetails() {
		drawerOpen = false;
		setTimeout(() => {
			selectedAddress = null;
		}, 150);
	}

	function clearFilters() {
		goto(resolve('/app/addresses'));
	}
</script>

{#await data.streamed.addresses}
	<AdminListLayout title="Addresses" kicker="Customers" loading={true} {tableHeaders} items={[]}>
		{#snippet skeleton()}
			<AdminSkeletonList rows={5} />
		{/snippet}
	</AdminListLayout>
{:then addressesResult}
	{@const addresses = addressesResult.items}
	{@const total = addressesResult.total}
	{@const defaultCount = addresses.filter((a) => a.isDefault).length}
	{@const guestCount = addresses.filter((a) => !a.userId).length}

	<AdminListLayout
		title="Addresses"
		kicker="Customers"
		loading={false}
		metrics={[
			{ label: 'Filtered Addresses', value: total },
			{ label: 'Defaults on Page', value: defaultCount, tone: 'accent' },
			{ label: 'Guest on Page', value: guestCount, tone: 'info' }
		]}
		query={data.filters.query}
		bind:showFilters
		{hasActiveFilters}
		totalItems={total}
		limit={data.filters.limit}
		offset={data.filters.offset}
		{tableHeaders}
		items={addresses}
		onclearfilters={clearFilters}
		searchPlaceholder="Search recipient name..."
	>
		{#snippet advancedFilters()}
			<AdminFilterBar cols={4}>
				<AdminSelect
					label="District"
					name="district"
					value={data.filters.district}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				>
					<option value="">All districts</option>
					{#each data.districtOptions as districtOption (districtOption.value)}
						<option value={districtOption.value}>
							{districtOption.label}
						</option>
					{/each}
				</AdminSelect>

				<AdminSelect
					label="Address Type"
					name="hasUser"
					value={data.filters.hasUser}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
					options={[
						{ value: '', label: 'All types' },
						{ value: 'true', label: 'Registered User Only' },
						{ value: 'false', label: 'Guest Checkout Only' }
					]}
				/>

				<AdminSelect
					label="Default Status"
					name="isDefault"
					value={data.filters.isDefault}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
					options={[
						{ value: '', label: 'Any default status' },
						{ value: 'true', label: 'Default Only' },
						{ value: 'false', label: 'Non-Default Only' }
					]}
				/>

				<AdminInput
					label="User Search ID"
					name="userId"
					placeholder="User UUID..."
					value={data.filters.userId}
					onchange={(e: Event) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				/>
			</AdminFilterBar>
		{/snippet}

		{#snippet card(addr: AddressItem)}
			<AdminEntityCard>
				{#snippet header()}
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="font-mono text-xs tracking-widest text-bone uppercase">
								{addr.recipientName}
							</p>
							<p class="mt-1 font-mono text-[10px] text-ash">{addr.phone}</p>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-1">
							{#if addr.isDefault}
								<AdminBadge variant="success" size="xs">Default</AdminBadge>
							{/if}
							{#if addr.userId}
								<AdminButton
									href={resolve(`/app/users?userId=${addr.userId}`)}
									variant="outline"
									size="sm"
									class="px-2 font-mono text-[8px] tracking-widest uppercase"
								>
									User Profile <ExternalLink size={8} />
								</AdminButton>
							{:else}
								<AdminBadge variant="warning" size="xs">Guest</AdminBadge>
							{/if}
						</div>
					</div>
				{/snippet}

				{#snippet description()}
					<div class="font-mono text-[10px] leading-relaxed text-ash">
						<p>{addr.addressLine1}</p>
						{#if addr.addressLine2}
							<p>{addr.addressLine2}</p>
						{/if}
						<p class="text-bone">{addr.city}, {addr.district}</p>
						{#if addr.label}
							<p class="mt-1 text-volt">[{addr.label.toUpperCase()}]</p>
						{/if}
					</div>
				{/snippet}

				{#snippet actions()}
					<div class="flex justify-end border-t border-charcoal pt-3">
						<AdminButton
							type="button"
							variant="volt"
							size="sm"
							onclick={() => openDetails(addr)}
							class="font-mono text-[9px] tracking-wider uppercase"
						>
							View Details
						</AdminButton>
					</div>
				{/snippet}
			</AdminEntityCard>
		{/snippet}

		{#snippet row(addr: AddressItem)}
			<tr class="border-b border-charcoal/70 last:border-b-0">
				<td class="px-5 py-4">
					<div class="min-w-0">
						<span class="font-mono text-xs tracking-widest text-bone uppercase">
							{addr.recipientName}
						</span>
						<p class="mt-1 font-mono text-[10px] text-ash">{addr.phone}</p>
					</div>
				</td>
				<td class="px-5 py-4 font-mono text-[10px] text-ash">
					<p class="min-w-50 truncate" title={addr.addressLine1}>{addr.addressLine1}</p>
					{#if addr.addressLine2}
						<p class="min-w-50 truncate text-ash/70" title={addr.addressLine2}>
							{addr.addressLine2}
						</p>
					{/if}
				</td>
				<td class="px-5 py-4 font-mono text-[10px] text-bone">
					{addr.city}, {addr.district}
				</td>
				<td class="px-5 py-4">
					{#if addr.userId}
						<AdminButton
							href={resolve(`/app/users?userId=${addr.userId}`)}
							variant="outline"
							size="sm"
							class="px-2.5 font-mono text-[8px] tracking-widest uppercase"
						>
							Registered <ExternalLink size={8} />
						</AdminButton>
					{:else}
						<AdminBadge variant="warning" size="xs">Guest</AdminBadge>
					{/if}
				</td>
				<td class="px-5 py-4">
					{#if addr.isDefault}
						<AdminBadge variant="success" size="xs">Default</AdminBadge>
					{:else}
						<span class="font-mono text-[10px] text-ash/40">—</span>
					{/if}
				</td>
				<td class="px-5 py-4">
					<div class="flex items-center justify-end">
						<AdminButton
							type="button"
							variant="outline"
							size="sm"
							onclick={() => openDetails(addr)}
							class="border-ash/20 font-mono text-[9px] tracking-wider uppercase hover:border-volt hover:text-volt"
						>
							Details
						</AdminButton>
					</div>
				</td>
			</tr>
		{/snippet}

		{#snippet emptyState()}
			<AdminEmptyState title="No addresses found" description="Adjust search query or filters." />
		{/snippet}
	</AdminListLayout>
{:catch}
	<AdminListLayout
		title="Addresses"
		kicker="Customers"
		loading={false}
		showSearch={false}
		{tableHeaders}
		items={[]}
	>
		{#snippet emptyState()}
			<AdminErrorState
				title="Addresses unavailable"
				description="Address records could not be loaded. Retry without losing the current admin session."
				onretry={() => invalidateAll()}
			/>
		{/snippet}
	</AdminListLayout>
{/await}

<!-- ADDRESS DETAILS DRAWER -->
{#if selectedAddress}
	{@const selected = selectedAddress}
	<AdminDrawer
		bind:open={drawerOpen}
		title={selected.recipientName}
		description="Detailed full shipping address information and snapshot records."
		onOpenChange={(open) => {
			if (!open) closeDetails();
		}}
	>
		<div class="flex flex-col gap-6">
			<!-- Icon + phone subheader -->
			<div class="flex items-center gap-4 border-b border-ash/10 pb-4">
				<div
					class="flex h-12 w-12 shrink-0 items-center justify-center border border-charcoal bg-void text-volt"
				>
					<MapPin size={22} />
				</div>
				<p class="font-sans text-xs text-ash">{selected.phone}</p>
			</div>

			<!-- Info Grid -->
			<AdminMetaGrid cols={2} class="mt-0 border border-ash/5 bg-void/50 p-4">
				<div class="font-mono text-[10px] text-ash uppercase">
					<span>Address ID:</span>
					<p class="mt-1 font-mono text-xs font-semibold text-bone select-all">{selected.id}</p>
				</div>
				<div class="font-mono text-[10px] text-ash uppercase">
					<span>Address Label:</span>
					<p class="mt-1 text-xs font-semibold text-volt">
						{selected.label ? selected.label.toUpperCase() : 'NO LABEL'}
					</p>
				</div>
				<div class="mt-2 font-mono text-[10px] text-ash uppercase">
					<span>Default status:</span>
					<div class="mt-1">
						<AdminBadge variant={selected.isDefault ? 'success' : 'neutral'} size="xs">
							{selected.isDefault ? 'Primary default' : 'Secondary'}
						</AdminBadge>
					</div>
				</div>
				<div class="mt-2 font-mono text-[10px] text-ash uppercase">
					<span>Ownership:</span>
					<div class="mt-1">
						{#if selected.userId}
							<a
								href={resolve(`/app/users?userId=${selected.userId}`)}
								class="flex items-center gap-1 text-xs text-volt hover:underline"
							>
								Registered User <ExternalLink size={10} />
							</a>
						{:else}
							<AdminBadge variant="warning" size="xs">Guest checkout</AdminBadge>
						{/if}
					</div>
				</div>
			</AdminMetaGrid>

			<!-- Address Snapshot Card -->
			<div class="border border-ash/5 bg-void/35 p-4">
				<h3
					class="flex items-center gap-1.5 border-b border-ash/10 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
				>
					<MapPin size={11} class="text-volt" /> Full Shipping Address
				</h3>
				<div class="mt-3 flex flex-col gap-1 font-mono text-xs leading-relaxed text-bone">
					<p>{selected.recipientName}</p>
					<p>{selected.addressLine1}</p>
					{#if selected.addressLine2}
						<p>{selected.addressLine2}</p>
					{:else}
						<p class="font-sans text-[11px] text-ash/30 italic">[Line 2 is empty]</p>
					{/if}
					<p>{selected.city}, {selected.district}</p>
					{#if selected.postalCode}<p>{selected.postalCode}</p>{/if}
					<p class="mt-1 text-[10px] text-ash/60">Sri Lanka</p>
				</div>
				<div class="mt-4 flex justify-end border-t border-charcoal/60 pt-3">
					<AdminCopyButton
						value={selected.singleLine}
						label="Copy address"
						copiedLabel="Address copied"
						class="font-mono text-[9px] tracking-wider uppercase"
					/>
				</div>
			</div>

			<!-- Metadata Timestamps -->
			<AdminMetaGrid cols={2} class="mt-0 border border-ash/5 bg-void/25 p-4">
				<div class="font-mono text-[10px] text-ash uppercase">
					<span class="flex items-center gap-1"><Calendar size={11} /> Created At</span>
					<p class="mt-1 text-xs text-bone">{formatAdminDateTime(selected.createdAt, '—')}</p>
				</div>
				<div class="font-mono text-[10px] text-ash uppercase">
					<span class="flex items-center gap-1"><Clock size={11} /> Last Updated</span>
					<p class="mt-1 text-xs text-bone">{formatAdminDateTime(selected.updatedAt, '—')}</p>
				</div>
			</AdminMetaGrid>
		</div>

		{#snippet footer()}
			<AdminButton
				type="button"
				variant="charcoal"
				size="md"
				onclick={closeDetails}
				class="font-mono text-[10px] tracking-widest uppercase"
			>
				Close View
			</AdminButton>
		{/snippet}
	</AdminDrawer>
{/if}
