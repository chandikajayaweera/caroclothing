<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { MapPin, Calendar, Clock, ExternalLink, Copy, Check, X } from 'lucide-svelte';
	import type { PageData } from './$types';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';

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
	let copied = $state(false);

	function openDetails(address: AddressItem) {
		selectedAddress = address;
		drawerOpen = true;
		copied = false;
	}

	function closeDetails() {
		drawerOpen = false;
		setTimeout(() => {
			selectedAddress = null;
		}, 150);
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text).then(() => {
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		});
	}

	function clearFilters() {
		goto(resolve('/app/addresses'));
	}

	function formatDate(date: Date | string | null | undefined): string {
		if (!date) return '—';
		const d = new Date(date);
		return d.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

{#await data.streamed.addresses}
	<AdminListLayout title="Addresses" kicker="Customers" loading={true} {tableHeaders} items={[]}>
		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each [0, 1, 2, 3, 4] as index (index)}
					<div
						class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0"
					>
						<div class="flex flex-1 items-center gap-3">
							<div class="h-10 w-10 bg-charcoal"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-1/4 rounded bg-charcoal"></div>
								<div class="h-3 w-1/3 rounded bg-charcoal"></div>
							</div>
						</div>
						<div class="h-6 w-16 bg-charcoal"></div>
						<div class="h-6 w-12 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}
		{#snippet card()}{/snippet}
		{#snippet row()}{/snippet}
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
		stats={{
			total: total,
			active: defaultCount,
			inactive: guestCount
		}}
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
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

				<div class="flex flex-col gap-1">
					<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
						>User Search ID</span
					>
					<input
						type="text"
						name="userId"
						placeholder="User UUID..."
						value={data.filters.userId}
						onchange={(e) => {
							const form = (e.currentTarget as HTMLElement).closest('form');
							if (form) form.requestSubmit();
						}}
						class="min-h-11 w-full border border-ash/30 bg-void px-3.5 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					/>
				</div>
			</div>
		{/snippet}

		{#snippet card(addr: AddressItem)}
			<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
				<div class="flex flex-col gap-3">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="font-mono text-xs tracking-widest text-bone uppercase">
								{addr.recipientName}
							</p>
							<p class="mt-1 font-mono text-[10px] text-ash">{addr.phone}</p>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-1">
							{#if addr.isDefault}
								<span
									class="border border-volt/40 bg-volt/5 px-2 py-0.5 font-mono text-[8px] tracking-widest text-volt uppercase"
								>
									Default
								</span>
							{/if}
							{#if addr.userId}
								<a
									href={resolve(`/app/users?userId=${addr.userId}`)}
									class="flex items-center gap-1 border border-ash/30 px-2 py-0.5 font-mono text-[8px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
								>
									User Profile <ExternalLink size={8} />
								</a>
							{:else}
								<span
									class="border border-amber-300/40 px-2 py-0.5 font-mono text-[8px] tracking-widest text-amber-300 uppercase"
								>
									Guest
								</span>
							{/if}
						</div>
					</div>

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

					<div class="mt-2 flex justify-end border-t border-charcoal pt-3">
						<AdminButton
							type="button"
							variant="volt"
							size="sm"
							onclick={() => openDetails(addr)}
							class="min-h-0 py-1 font-mono text-[9px] tracking-wider uppercase"
						>
							View Details
						</AdminButton>
					</div>
				</div>
			</article>
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
					<p class="max-w-[200px] truncate" title={addr.addressLine1}>{addr.addressLine1}</p>
					{#if addr.addressLine2}
						<p class="max-w-[200px] truncate text-ash/70" title={addr.addressLine2}>
							{addr.addressLine2}
						</p>
					{/if}
				</td>
				<td class="px-5 py-4 font-mono text-[10px] text-bone">
					{addr.city}, {addr.district}
				</td>
				<td class="px-5 py-4">
					{#if addr.userId}
						<a
							href={resolve(`/app/users?userId=${addr.userId}`)}
							class="inline-flex items-center gap-1 border border-ash/30 bg-charcoal/30 px-2.5 py-1 font-mono text-[8px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
						>
							Registered <ExternalLink size={8} />
						</a>
					{:else}
						<span
							class="border border-amber-300/40 bg-amber-300/5 px-2.5 py-1 font-mono text-[8px] tracking-widest text-amber-300 uppercase"
						>
							Guest
						</span>
					{/if}
				</td>
				<td class="px-5 py-4">
					{#if addr.isDefault}
						<span
							class="border border-volt/40 bg-volt/5 px-2.5 py-1 font-mono text-[8px] tracking-widest text-volt uppercase"
						>
							Default
						</span>
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
							class="min-h-0 border-ash/20 py-1 font-mono text-[9px] tracking-wider uppercase hover:border-volt hover:text-volt"
						>
							Details
						</AdminButton>
					</div>
				</td>
			</tr>
		{/snippet}

		{#snippet emptyState()}
			<p class="font-display text-4xl text-bone uppercase">No addresses found</p>
			<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
				Adjust search query or filters.
			</p>
		{/snippet}
	</AdminListLayout>
{/await}

<!-- ADDRESS DETAILS DRAWER -->
<Dialog.Root
	bind:open={drawerOpen}
	onOpenChange={(open) => {
		if (!open) closeDetails();
	}}
>
	{#if drawerOpen && selectedAddress}
		{@const selected = selectedAddress}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-50 bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div
				class="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl border-l border-charcoal bg-charcoal shadow-2xl outline-none"
			>
				<Dialog.Content class="w-full">
					{#snippet child({ props })}
						<div
							{...props}
							transition:fade={{ duration: 150 }}
							class="flex h-full flex-col justify-between overflow-y-auto p-6"
						>
							<!-- Header -->
							<div>
								<div class="flex items-start justify-between border-b border-ash/10 pb-4">
									<div class="flex items-center gap-4">
										<div
											class="flex h-12 w-12 items-center justify-center rounded border border-charcoal bg-void text-volt"
										>
											<MapPin size={22} />
										</div>
										<div>
											<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
												Address Details
											</p>
											<Dialog.Title
												class="mt-1 font-display text-3xl leading-none text-bone uppercase"
											>
												{selected.recipientName}
											</Dialog.Title>
											<p class="mt-1 font-sans text-xs text-ash">{selected.phone}</p>
										</div>
									</div>
									<button
										type="button"
										onclick={closeDetails}
										class="text-ash/60 transition-colors hover:text-bone"
										aria-label="Close"
									>
										<X size={20} />
									</button>
								</div>

								<Dialog.Description class="sr-only">
									Detailed full shipping address information and snapshot records.
								</Dialog.Description>

								<div class="mt-6 flex flex-col gap-6">
									<!-- Info Grid -->
									<div
										class="grid grid-cols-2 gap-4 rounded-[2px] border border-ash/5 bg-void/50 p-4"
									>
										<div class="font-mono text-[10px] text-ash uppercase">
											<span>Address ID:</span>
											<p class="mt-1 font-mono text-xs font-semibold text-bone select-all">
												{selected.id}
											</p>
										</div>
										<div class="font-mono text-[10px] text-ash uppercase">
											<span>Address Label:</span>
											<p class="mt-1 text-xs font-semibold text-volt">
												{selected.label ? selected.label.toUpperCase() : 'NO LABEL'}
											</p>
										</div>
										<div class="mt-2 font-mono text-[10px] text-ash uppercase">
											<span>Default status:</span>
											<p class="mt-1 text-xs text-bone">
												{selected.isDefault ? 'PRIMARY DEFAULT' : 'SECONDARY'}
											</p>
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
													<span class="text-xs text-amber-300">GUEST CHECKOUT</span>
												{/if}
											</div>
										</div>
									</div>

									<!-- Address Snapshot Card -->
									<div class="rounded-[2px] border border-ash/5 bg-void/35 p-4">
										<h3
											class="flex items-center gap-1.5 border-b border-ash/10 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
										>
											<MapPin size={11} class="text-volt" /> Full Shipping Address
										</h3>
										<div
											class="mt-3 flex flex-col gap-1 font-mono text-xs leading-relaxed text-bone"
										>
											<p>{selected.recipientName}</p>
											<p>{selected.addressLine1}</p>
											{#if selected.addressLine2}
												<p>{selected.addressLine2}</p>
											{:else}
												<p class="font-sans text-[11px] text-ash/30 italic">[Line 2 is empty]</p>
											{/if}
											<p>{selected.city}, {selected.district}</p>
											{#if selected.postalCode}
												<p>{selected.postalCode}</p>
											{/if}
											<p class="mt-1 text-[10px] text-ash/60">Sri Lanka</p>
										</div>

										<div class="mt-4 flex justify-end border-t border-charcoal/60 pt-3">
											<AdminButton
												type="button"
												variant="outline"
												size="sm"
												onclick={() => copyToClipboard(selected.singleLine)}
												class="flex items-center gap-1.5 font-mono text-[9px] tracking-wider uppercase"
											>
												{#if copied}
													<Check size={11} class="text-volt" /> Copied
												{:else}
													<Copy size={11} /> Copy Address
												{/if}
											</AdminButton>
										</div>
									</div>

									<!-- Metadata Timestamps -->
									<div
										class="grid grid-cols-2 gap-4 rounded-[2px] border border-ash/5 bg-void/25 p-4"
									>
										<div class="font-mono text-[10px] text-ash uppercase">
											<span class="flex items-center gap-1"><Calendar size={11} /> Created At</span>
											<p class="mt-1 text-xs text-bone">{formatDate(selected.createdAt)}</p>
										</div>
										<div class="font-mono text-[10px] text-ash uppercase">
											<span class="flex items-center gap-1"><Clock size={11} /> Last Updated</span>
											<p class="mt-1 text-xs text-bone">{formatDate(selected.updatedAt)}</p>
										</div>
									</div>
								</div>
							</div>

							<!-- Actions Footer -->
							<div class="mt-8 flex justify-end border-t border-ash/10 pt-4">
								<AdminButton
									type="button"
									variant="charcoal"
									size="md"
									onclick={closeDetails}
									class="font-mono text-[10px] tracking-widest uppercase"
								>
									Close View
								</AdminButton>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
