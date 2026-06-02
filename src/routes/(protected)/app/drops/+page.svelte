<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Eye, Pencil, Plus, Power, Trash2, Calendar, ShoppingBag, Users, AlertTriangle } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	const tableHeaders = [
		{ label: 'Hero Image' },
		{ label: 'Drop' },
		{ label: 'Status' },
		{ label: 'Launch Schedule' },
		{ label: 'Lineup & Waitlist' },
		{ label: 'Actions', class: 'text-right' }
	];

	let query = $derived(data.filters.query);
	let currentStatus = $derived(data.filters.status);
	const hasActiveFilters = $derived(data.filters.query !== '' || data.filters.status !== 'all');
	let showFilters = $state(false);

	$effect(() => {
		if (hasActiveFilters) {
			showFilters = true;
		}
	});

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: deleteDropMessage,
		enhance: deleteDropEnhance,
		submitting: deleteDropSubmitting
	} = superForm(initialForm(() => data.deleteDropForm));

	const {
		message: transitionDropStatusMessage,
		enhance: transitionDropStatusEnhance,
		submitting: transitionDropStatusSubmitting
	} = superForm(
		initialForm(() => data.transitionDropStatusForm),
		{
			resetForm: false
		}
	);

	const dropActionMessage = $derived(
		actionData?.form?.message ?? $deleteDropMessage ?? $transitionDropStatusMessage
	);
 
	let toastMessage = $state<string | null>(null);
 
	$effect(() => {
		if (dropActionMessage) {
			toastMessage = dropActionMessage;
		}
	});
 
	function clearFilters() {
		goto('/app/drops');
	}

	// Confirm transition state
	let confirmingTransition = $state<{
		dropId: string;
		dropName: string;
		toStatus: 'teaser' | 'live' | 'sold_out' | 'archived';
	} | null>(null);

	// Form binds to submit programmatically
	let transitionFormEl = $state<HTMLFormElement | null>(null);
	let submitToStatus = $state('');
	let submitDropId = $state('');

	function handleTransitionClick(
		dropId: string,
		dropName: string,
		fromStatus: string,
		toStatus: 'teaser' | 'live' | 'sold_out' | 'archived'
	) {
		submitDropId = dropId;
		submitToStatus = toStatus;

		if (toStatus === 'live') {
			confirmingTransition = { dropId, dropName, toStatus };
		} else {
			// Submit directly for non-critical transitions
			setTimeout(() => {
				if (transitionFormEl) transitionFormEl.requestSubmit();
			}, 0);
		}
	}

	function confirmLaunch() {
		confirmingTransition = null;
		setTimeout(() => {
			if (transitionFormEl) transitionFormEl.requestSubmit();
		}, 0);
	}

	function formatDateTime(date: Date | string | null | undefined): string {
		if (!date) return 'TBC';
		const d = new Date(date);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getStatusClass(status: string): string {
		switch (status) {
			case 'live':
				return 'text-volt border border-volt/20 bg-volt/5';
			case 'teaser':
				return 'text-ash border border-ash/20 bg-ash/5';
			case 'sold_out':
				return 'text-red-400 border border-red-400/20 bg-red-400/5';
			case 'archived':
				return 'text-ash/60 border border-ash/10 bg-ash/5';
			default:
				return 'text-bone border border-charcoal bg-void';
		}
	}

	function getStatusLabel(status: string): string {
		return (status ?? '').replace('_', ' ');
	}
</script>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<!-- Hidden Form for transitions -->
<form
	method="POST"
	action="?/transitionDropStatus"
	bind:this={transitionFormEl}
	use:transitionDropStatusEnhance
	hidden
>
	<input type="hidden" name="dropId" value={submitDropId} />
	<input type="hidden" name="toStatus" value={submitToStatus} />
</form>

<!-- Confirmation Modal for "Go Live" -->
<Dialog.Root open={confirmingTransition !== null} onOpenChange={(open) => { if (!open) confirmingTransition = null; }}>
	{#if confirmingTransition}
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

			<div class="fixed inset-0 z-50 grid place-items-center px-4">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 200, start: 0.95 }}
							class="w-full max-w-lg border border-red-500/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<Dialog.Title class="sr-only">Confirm Drop Launch</Dialog.Title>
							<Dialog.Description class="sr-only">
								Verify you wish to transition drop to Live status.
							</Dialog.Description>

							<div class="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
								<AlertTriangle size={12} class="text-volt" />
								<span>DANGER ZONE / HIGH IMPACT ACTION</span>
							</div>
							<h2 class="mt-2 font-display text-3xl leading-none text-bone uppercase">
								LAUNCH "{confirmingTransition?.dropName ?? ''}" LIVE?
							</h2>
							<p class="mt-3 font-sans text-sm leading-relaxed text-ash/80">
								Transitioning this drop to <strong class="text-volt uppercase">LIVE</strong> will instantly make all assigned products purchasable. It will also immediately enqueue and dispatch launch emails/SMS notifications to all contacts registered on the waitlist. This action is irreversible.
							</p>
							<div class="mt-6 grid gap-3 sm:grid-cols-2">
								<AdminButton type="button" onclick={confirmLaunch} variant="volt">
									<Power size={14} aria-hidden="true" />
									Launch Drop Live
								</AdminButton>
								<AdminButton type="button" onclick={() => confirmingTransition = null} variant="outline">
									Cancel
								</AdminButton>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

{#await Promise.all([data.streamed.drops, data.streamed.allDrops])}
	<AdminListLayout
		title="Drops"
		loading={true}
		{tableHeaders}
		items={[]}
	>
		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each Array(5) as _}
					<div class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0">
						<div class="flex flex-1 items-center gap-3">
							<div class="h-12 w-20 bg-charcoal"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-1/4 rounded bg-charcoal"></div>
								<div class="h-3 w-1/3 rounded bg-charcoal"></div>
							</div>
						</div>
						<div class="h-6 w-16 bg-charcoal"></div>
						<div class="h-6 w-12 bg-charcoal"></div>
						<div class="h-6 w-24 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}
		{#snippet card()}{/snippet}
		{#snippet row()}{/snippet}
	</AdminListLayout>
{:then [dropsResult, allDrops]}
	{@const drops = dropsResult.items}
	{@const total = dropsResult.total}
	{@const statsTotal = allDrops.length}
	{@const statsLive = allDrops.filter((d) => d.status === 'live').length}
	{@const statsTeaser = allDrops.filter((d) => d.status === 'teaser').length}

	<AdminListLayout
		title="Drops"
		loading={false}
		stats={{
			total: statsTotal,
			active: statsLive,
			inactive: statsTeaser
		}}
		query={data.filters.query}
		bind:showFilters={showFilters}
		hasActiveFilters={hasActiveFilters}
		totalItems={total}
		limit={data.limit}
		offset={data.offset}
		{tableHeaders}
		items={drops}
		onclearfilters={clearFilters}
	>
		{#snippet headerActions()}
			<AdminButton
				href={resolve('/app/drops/new')}
				variant="volt"
				size="md"
				class="mt-5 md:mt-0"
			>
				<Plus size={14} aria-hidden="true" />
				Create Drop
			</AdminButton>
		{/snippet}

		{#snippet advancedFilters()}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<AdminSelect
					label="Status"
					name="status"
					value={data.filters.status}
					onchange={(e) => {
						const form = (e.currentTarget as HTMLElement).closest('form');
						if (form) form.requestSubmit();
					}}
				>
					<option value="all">All statuses</option>
					<option value="teaser">Teaser only</option>
					<option value="live">Live only</option>
					<option value="sold_out">Sold Out only</option>
					<option value="archived">Archived only</option>
				</AdminSelect>
			</div>
		{/snippet}

		{#snippet skeleton()}
			<div class="animate-pulse space-y-4 p-5">
				{#each Array(5) as _}
					<div class="flex items-center justify-between gap-4 border-b border-charcoal pb-4 last:border-b-0 last:pb-0">
						<div class="flex flex-1 items-center gap-3">
							<div class="h-12 w-20 bg-charcoal"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-1/4 rounded bg-charcoal"></div>
								<div class="h-3 w-1/3 rounded bg-charcoal"></div>
							</div>
						</div>
						<div class="h-6 w-16 bg-charcoal"></div>
						<div class="h-6 w-12 bg-charcoal"></div>
						<div class="h-6 w-24 bg-charcoal"></div>
					</div>
				{/each}
			</div>
		{/snippet}

		{#snippet card(dropItem: any)}
			<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
				<div class="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] gap-3">
					<a
						href={resolve(`/app/drops/${dropItem.slug}`)}
						class="grid aspect-video w-full place-items-center border border-charcoal bg-charcoal/30 overflow-hidden"
						aria-label={`View ${dropItem.name}`}
					>
						{#if dropItem.heroImageUrl}
							<img src={dropItem.heroImageUrl} alt="" class="h-full w-full object-cover" />
						{:else}
							<Calendar size={18} class="text-ash/50" aria-hidden="true" />
						{/if}
					</a>
					<div class="min-w-0 flex-1">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<a
									href={resolve(`/app/drops/${dropItem.slug}`)}
									class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
								>
									{dropItem.name}
								</a>
								<p class="mt-0.5 truncate font-mono text-[10px] text-ash">{dropItem.slug}</p>
							</div>
							<span
								class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] tracking-wider uppercase {getStatusClass(dropItem.status)}"
							>
								{getStatusLabel(dropItem.status)}
							</span>
						</div>

						{#if dropItem.tagline}
							<p class="mt-2 font-mono text-[9px] text-volt uppercase leading-tight">{dropItem.tagline}</p>
						{/if}

						<div class="mt-3 space-y-1 font-mono text-[10px]">
							<div class="flex items-center gap-1.5 text-ash">
								<Calendar size={11} />
								<span>Launch At: {formatDateTime(dropItem.launchAt)}</span>
							</div>
							<div class="flex items-center gap-3 mt-1.5 flex-wrap">
								<span class="inline-flex items-center gap-1 text-bone">
									<ShoppingBag size={11} class="text-volt" />
									{dropItem.products.length} Products
								</span>
							</div>
						</div>
					</div>
				</div>
				<div class="mt-4 grid gap-2">
					<div class="grid grid-cols-4 gap-1.5" aria-label="Drop actions">
						<!-- Toggle to Live / Transitions -->
						{#if dropItem.status === 'teaser'}
							<button
								type="button"
								onclick={() => handleTransitionClick(dropItem.id, dropItem.name, dropItem.status, 'live')}
								disabled={$transitionDropStatusSubmitting}
								class="grid h-10 w-full place-items-center border border-volt/40 text-volt hover:bg-volt hover:text-void disabled:opacity-40 transition-colors"
								aria-label={`Go Live`}
								title="Go Live"
							>
								<Power size={14} aria-hidden="true" />
							</button>
						{:else if dropItem.status === 'live'}
							<button
								type="button"
								onclick={() => handleTransitionClick(dropItem.id, dropItem.name, dropItem.status, 'sold_out')}
								disabled={$transitionDropStatusSubmitting}
								class="grid h-10 w-full place-items-center border border-red-400/40 text-red-300 hover:bg-red-400 hover:text-void disabled:opacity-40 transition-colors"
								aria-label={`Mark Sold Out`}
								title="Mark Sold Out"
							>
								<ShoppingBag size={14} aria-hidden="true" />
							</button>
						{:else if dropItem.status === 'sold_out'}
							<button
								type="button"
								onclick={() => handleTransitionClick(dropItem.id, dropItem.name, dropItem.status, 'archived')}
								disabled={$transitionDropStatusSubmitting}
								class="grid h-10 w-full place-items-center border border-ash/40 text-ash hover:bg-ash hover:text-void disabled:opacity-40 transition-colors"
								aria-label={`Archive Drop`}
								title="Archive Drop"
							>
								<Trash2 size={14} aria-hidden="true" />
							</button>
						{:else}
							<div class="grid h-10 w-full place-items-center border border-charcoal text-ash/40 cursor-not-allowed">
								<Power size={14} aria-hidden="true" />
							</div>
						{/if}

						<a
							href={resolve(`/app/drops/${dropItem.slug}`)}
							class="grid h-10 place-items-center border border-volt/40 text-volt transition-colors hover:bg-volt hover:text-void"
							aria-label={`View ${dropItem.name}`}
							title="View details"
						>
							<Eye size={14} aria-hidden="true" />
						</a>

						<a
							href={resolve(`/app/drops/${dropItem.slug}/edit`)}
							class="grid h-10 place-items-center border border-ash/30 text-bone transition-colors hover:border-volt hover:text-volt"
							aria-label={`Edit ${dropItem.name}`}
							title="Edit"
						>
							<Pencil size={14} aria-hidden="true" />
						</a>

						<form method="POST" action="?/deleteDrop" use:deleteDropEnhance>
							<input type="hidden" name="dropId" value={dropItem.id} />
							<button
								type="submit"
								disabled={$deleteDropSubmitting}
								class="grid h-10 w-full place-items-center border border-red-400/40 text-red-300 transition-colors hover:bg-red-400 hover:text-void disabled:opacity-40"
								aria-label={`Delete ${dropItem.name}`}
								title="Delete"
							>
								<Trash2 size={14} aria-hidden="true" />
							</button>
						</form>
					</div>
				</div>
			</article>
		{/snippet}

		{#snippet row(dropItem: any)}
			<tr class="border-b border-charcoal/70 last:border-b-0">
				<td class="px-5 py-4">
					<a
						href={resolve(`/app/drops/${dropItem.slug}`)}
						class="grid h-12 w-20 shrink-0 place-items-center border border-charcoal bg-void overflow-hidden"
						aria-label={`View ${dropItem.name}`}
					>
						{#if dropItem.heroImageUrl}
							<img src={dropItem.heroImageUrl} alt="" class="h-full w-full object-cover" />
						{:else}
							<Calendar size={16} class="text-ash/50" aria-hidden="true" />
						{/if}
					</a>
				</td>
				<td class="px-5 py-4">
					<div class="min-w-0">
						<a
							href={resolve(`/app/drops/${dropItem.slug}`)}
							class="font-mono text-xs tracking-widest text-bone uppercase hover:text-volt"
						>
							{dropItem.name}
						</a>
						{#if dropItem.tagline}
							<p class="mt-0.5 font-mono text-[9px] text-volt uppercase truncate max-w-[200px]">{dropItem.tagline}</p>
						{/if}
						<p class="mt-1 font-mono text-[9px] text-ash">
							{dropItem.slug}
						</p>
					</div>
				</td>
				<td class="px-5 py-4">
					<span
						class="rounded px-1.5 py-0.5 font-mono text-[8px] tracking-wider uppercase {getStatusClass(dropItem.status)}"
					>
						{getStatusLabel(dropItem.status)}
					</span>
				</td>
				<td class="px-5 py-4 font-mono text-[10px] text-ash">
					<div class="flex flex-col gap-0.5">
						<span>Launch: {formatDateTime(dropItem.launchAt)}</span>
						{#if dropItem.endAt}
							<span>Close: {formatDateTime(dropItem.endAt)}</span>
						{/if}
					</div>
				</td>
				<td class="px-5 py-4">
					<div class="flex items-center gap-4 font-mono text-[10px] text-bone">
						<span class="inline-flex items-center gap-1">
							<ShoppingBag size={11} class="text-volt" />
							{dropItem.products.length} Products
						</span>
					</div>
				</td>
				<td class="px-5 py-4">
					<div class="flex items-center justify-end gap-3">
						<div class="flex items-center gap-2" aria-label="Drop state actions">
							<!-- Toggle to Live / Transitions -->
							{#if dropItem.status === 'teaser'}
								<button
									type="button"
									onclick={() => handleTransitionClick(dropItem.id, dropItem.name, dropItem.status, 'live')}
									disabled={$transitionDropStatusSubmitting}
									class="grid h-9 w-9 place-items-center border border-volt/40 text-volt hover:bg-volt hover:text-void disabled:opacity-40 transition-colors"
									aria-label={`Go Live`}
									title="Go Live"
								>
									<Power size={14} aria-hidden="true" />
								</button>
							{:else if dropItem.status === 'live'}
								<button
									type="button"
									onclick={() => handleTransitionClick(dropItem.id, dropItem.name, dropItem.status, 'sold_out')}
									disabled={$transitionDropStatusSubmitting}
									class="grid h-9 w-9 place-items-center border border-red-400/40 text-red-300 hover:bg-red-400 hover:text-void disabled:opacity-40 transition-colors"
									aria-label={`Mark Sold Out`}
									title="Mark Sold Out"
								>
									<ShoppingBag size={14} aria-hidden="true" />
								</button>
							{:else if dropItem.status === 'sold_out'}
								<button
									type="button"
									onclick={() => handleTransitionClick(dropItem.id, dropItem.name, dropItem.status, 'archived')}
									disabled={$transitionDropStatusSubmitting}
									class="grid h-9 w-9 place-items-center border border-ash/40 text-ash hover:bg-ash hover:text-void disabled:opacity-40 transition-colors"
									aria-label={`Archive Drop`}
									title="Archive Drop"
								>
									<Trash2 size={14} aria-hidden="true" />
								</button>
							{:else}
								<div class="grid h-9 w-9 place-items-center border border-charcoal text-ash/40 cursor-not-allowed">
									<Power size={14} aria-hidden="true" />
								</div>
							{/if}
						</div>
						<div class="h-9 w-px bg-charcoal" aria-hidden="true"></div>
						<div class="flex items-center gap-2" aria-label="Drop record actions">
							<a
								href={resolve(`/app/drops/${dropItem.slug}`)}
								class="grid h-9 w-9 place-items-center border border-volt/40 text-volt transition-colors hover:bg-volt hover:text-void"
								aria-label={`View ${dropItem.name}`}
								title="View details"
							>
								<Eye size={14} aria-hidden="true" />
							</a>
							<a
								href={resolve(`/app/drops/${dropItem.slug}/edit`)}
								class="grid h-9 w-9 place-items-center border border-ash/30 text-bone transition-colors hover:border-volt hover:text-volt"
								aria-label={`Edit ${dropItem.name}`}
								title="Edit"
							>
								<Pencil size={14} aria-hidden="true" />
							</a>
							<form method="POST" action="?/deleteDrop" use:deleteDropEnhance>
								<input type="hidden" name="dropId" value={dropItem.id} />
								<button
									type="submit"
									disabled={$deleteDropSubmitting}
									class="grid h-9 w-9 place-items-center border border-red-400/40 text-red-300 transition-colors hover:bg-red-400 hover:text-void disabled:opacity-40"
									aria-label={`Delete ${dropItem.name}`}
									title="Delete"
								>
									<Trash2 size={14} aria-hidden="true" />
								</button>
							</form>
						</div>
					</div>
				</td>
			</tr>
		{/snippet}

		{#snippet emptyState()}
			<p class="font-display text-4xl text-bone uppercase">No drops found</p>
			<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
				Adjust filters or create the first release.
			</p>
			<a
				href={resolve('/app/drops/new')}
				class="mt-6 inline-flex bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
			>
				Create Drop
			</a>
		{/snippet}
	</AdminListLayout>
{/await}

<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	duration={5000}
	onclose={() => (toastMessage = null)}
/>
