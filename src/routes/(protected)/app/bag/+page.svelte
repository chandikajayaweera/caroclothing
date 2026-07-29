<script lang="ts">
	import { onMount } from 'svelte';
	import { deserialize, enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { User, UserCheck, Trash2, Eye, ReceiptText } from 'lucide-svelte';
	import type { AdminBagDTO } from '$lib/server/modules/bag';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import AdminDataRefresh from '$lib/components/admin/controls/AdminDataRefresh.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminDrawer from '$lib/components/admin/overlays/AdminDrawer.svelte';
	import AdminActionMenu, {
		type AdminActionMenuItem
	} from '$lib/components/admin/overlays/AdminActionMenu.svelte';
	import AdminConfirmDialog from '$lib/components/admin/overlays/AdminConfirmDialog.svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminBagDetails from '$lib/components/admin/data-display/AdminBagDetails.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import {
		formatAdminDateTime,
		formatAdminMoney,
		formatAdminStatus
	} from '$lib/shared/admin/format';

	let { data } = $props();

	let selectedBagId = $state<string | null>(null);
	const selectedBag = $derived(
		selectedBagId ? (data.bags.items.find((bag) => bag.id === selectedBagId) ?? null) : null
	);
	let detailOpen = $state(false);
	let deleteConfirmOpen = $state(false);
	let cleanupConfirmOpen = $state(false);
	let cleanupFormElement = $state<HTMLFormElement | null>(null);
	let cleanupSubmitting = $state(false);
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');
	let autoRefresh = $state(true);
	let refreshing = $state(false);
	let refreshRequest: Promise<void> | null = null;
	let liveNowMs = $state<number | null>(null);
	const nowMs = $derived(liveNowMs ?? new Date(data.refreshedAt).getTime());

	const SECOND_MS = 1_000;
	const MINUTE_MS = 60 * SECOND_MS;
	const HOUR_MS = 60 * MINUTE_MS;
	const DAY_MS = 24 * HOUR_MS;
	const MONTH_MS = 30 * DAY_MS;
	const YEAR_MS = 365 * DAY_MS;

	onMount(() => {
		liveNowMs = Date.now();
		const interval = window.setInterval(() => {
			liveNowMs = Date.now();
		}, SECOND_MS);

		return () => window.clearInterval(interval);
	});

	const hasActiveFilters = $derived(
		data.filters.status !== '' ||
			data.filters.ownerType !== '' ||
			data.filters.includeExpired === true
	);
	let showFilters = $derived(hasActiveFilters);

	function clearFilters() {
		goto(resolve('/app/bag'));
	}

	function openBag(bag: AdminBagDTO) {
		selectedBagId = bag.id;
		detailOpen = true;
	}

	function closeDetails() {
		detailOpen = false;
		selectedBagId = null;
	}

	function customerHref(userId: string): string {
		return `${resolve('/app/users')}?userId=${encodeURIComponent(userId)}`;
	}

	function customerOrdersHref(userId: string): string {
		return `${resolve('/app/orders')}?userId=${encodeURIComponent(userId)}`;
	}

	function timestamp(value: Date | string | number): number {
		return value instanceof Date ? value.getTime() : new Date(value).getTime();
	}

	function quantityLabel(value: number, singular: string): string {
		return `${value} ${singular}${value === 1 ? '' : 's'}`;
	}

	function formatExpiryRemaining(value: Date | string | number): string {
		const remainingMs = timestamp(value) - nowMs;
		if (!Number.isFinite(remainingMs)) return 'Expiry unknown';
		if (remainingMs <= 0) return 'Expired';

		if (remainingMs < MINUTE_MS) {
			return `Expires in ${quantityLabel(Math.max(1, Math.ceil(remainingMs / SECOND_MS)), 'second')}`;
		}
		if (remainingMs < HOUR_MS) {
			return `Expires in ${quantityLabel(Math.max(1, Math.floor(remainingMs / MINUTE_MS)), 'minute')}`;
		}
		if (remainingMs < DAY_MS) {
			return `Expires in ${quantityLabel(Math.max(1, Math.floor(remainingMs / HOUR_MS)), 'hour')}`;
		}

		return `Expires in ${quantityLabel(Math.max(1, Math.floor(remainingMs / DAY_MS)), 'day')}`;
	}

	function formatUpdatedAgo(value: Date | string | number): string {
		const elapsedMs = Math.max(0, nowMs - timestamp(value));
		if (!Number.isFinite(elapsedMs)) return 'Unknown';

		if (elapsedMs < MINUTE_MS) {
			return `${quantityLabel(Math.floor(elapsedMs / SECOND_MS), 'second')} ago`;
		}
		if (elapsedMs < HOUR_MS) {
			return `${quantityLabel(Math.floor(elapsedMs / MINUTE_MS), 'minute')} ago`;
		}
		if (elapsedMs < DAY_MS) {
			return `${quantityLabel(Math.floor(elapsedMs / HOUR_MS), 'hour')} ago`;
		}
		if (elapsedMs < MONTH_MS) {
			return `${quantityLabel(Math.floor(elapsedMs / DAY_MS), 'day')} ago`;
		}
		if (elapsedMs < YEAR_MS) {
			return `${quantityLabel(Math.floor(elapsedMs / MONTH_MS), 'month')} ago`;
		}

		return `${quantityLabel(Math.floor(elapsedMs / YEAR_MS), 'year')} ago`;
	}

	function getBagActions(bag: AdminBagDTO): AdminActionMenuItem[] {
		const actions: AdminActionMenuItem[] = [
			{
				label: 'View bag',
				icon: Eye,
				tone: 'accent',
				onselect: () => openBag(bag)
			}
		];

		if (bag.userId) {
			const userId = bag.userId;
			actions.push(
				{
					label: 'View customer',
					icon: User,
					onselect: () => goto(resolve(`/app/users?userId=${encodeURIComponent(userId)}` as '/'))
				},
				{
					label: 'View customer orders',
					icon: ReceiptText,
					onselect: () => goto(resolve(`/app/orders?userId=${encodeURIComponent(userId)}` as '/'))
				}
			);
		}

		return actions;
	}

	async function refreshBagData(): Promise<void> {
		if (refreshRequest) return refreshRequest;

		refreshing = true;
		const request = invalidate('app:bags')
			.catch(() => {
				toastMessage = 'Bag data could not be refreshed. Check the connection and retry.';
				toastType = 'error';
			})
			.finally(() => {
				if (refreshRequest === request) refreshRequest = null;
				refreshing = false;
			});

		refreshRequest = request;
		return request;
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
				selectedBagId = null;
				toastMessage = getActionMessage(result.data, 'Bag deleted.');
				toastType = 'success';
				await invalidate('app:bags');
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
			await update({ reset: false, invalidateAll: false });
			cleanupSubmitting = false;
			if (result.type === 'success') {
				cleanupConfirmOpen = false;
				toastMessage = getActionMessage(result.data, 'Expired guest bags cleaned.');
				toastType = 'success';
				await invalidate('app:bags');
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
		content="Review active and expired bags, bag contents, promotions, value, and checkout validation state."
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
	title="Bags"
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
			description: `${data.summary.checkoutWindowItems} units in validation windows · no stock held`,
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
		{ label: 'Bag' },
		{ label: 'Contents' },
		{ label: 'Subtotal' },
		{ label: 'Promotion' },
		{ label: 'Checkout' },
		{ label: 'Updated' },
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
			class="sm:flex sm:w-auto sm:items-center sm:justify-end"
			menuItems={[
				{
					label: 'Clean expired guest bags',
					icon: Trash2,
					tone: 'danger',
					onselect: () => (cleanupConfirmOpen = true)
				}
			]}
		>
			{#snippet views()}
				<AdminDataRefresh
					bind:enabled={autoRefresh}
					{refreshing}
					lastRefreshedAt={data.refreshedAt}
					label="bag data"
					onrefresh={refreshBagData}
				/>
			{/snippet}
		</AdminActionToolbar>
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
		{@const isExpired = Boolean(bag.expiresAt && timestamp(bag.expiresAt) <= nowMs)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							{#if bag.ownerType === 'user'}
								<UserCheck size={12} class="text-volt" />
								<span class="font-mono text-[8px] tracking-widest text-volt uppercase"
									>Customer bag</span
								>
							{:else}
								<User size={12} class="text-sky-400" />
								<span class="font-mono text-[8px] tracking-widest text-sky-400 uppercase"
									>Guest bag</span
								>
							{/if}
						</div>
						{#if bag.expiresAt}
							<p class="mt-1.5 font-sans text-xs {isExpired ? 'text-red-300' : 'text-ash'}">
								{formatExpiryRemaining(bag.expiresAt)}
							</p>
						{/if}
					</div>
					<AdminBadge
						variant={bag.checkoutStatus === 'active'
							? 'info'
							: bag.checkoutStatus === 'expired'
								? 'warning'
								: 'neutral'}
						size="xs"
					>
						{bag.checkoutStatus === 'active'
							? 'At checkout'
							: bag.checkoutStatus === 'expired'
								? 'Checkout expired'
								: 'Browsing'}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<AdminMetaGrid>
					<div>
						<p class="text-ash/60">Contents</p>
						<p class="mt-0.5 text-bone">
							{bag.itemCount}
							{bag.itemCount === 1 ? 'unit' : 'units'} · {bag.items.length}
							{bag.items.length === 1 ? 'line' : 'lines'}
						</p>
					</div>
					<div>
						<p class="text-ash/60">Subtotal</p>
						<p class="mt-0.5 text-bone">{formatAdminMoney(bag.subtotal)}</p>
					</div>
					<div>
						<p class="text-ash/60">Promotion</p>
						<p class="mt-0.5 truncate text-bone">
							{bag.promoCode ?? bag.promotionName ?? 'None'}
						</p>
					</div>
					<div>
						<p class="text-ash/60">Updated</p>
						<p class="mt-0.5 text-bone">{formatUpdatedAgo(bag.updatedAt)}</p>
					</div>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<AdminActionMenu
					items={getBagActions(bag)}
					label="Actions"
					ariaLabel={`Actions for ${bag.ownerType === 'user' ? 'customer' : 'guest'} bag`}
					class="w-full"
				/>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(bag: AdminBagDTO)}
		{@const isExpired = Boolean(bag.expiresAt && timestamp(bag.expiresAt) <= nowMs)}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<!-- Bag summary -->
			<td class="px-5 py-4">
				<div class="flex min-w-48 items-start gap-2">
					{#if bag.ownerType === 'user'}
						<UserCheck size={14} class="mt-0.5 text-volt" />
					{:else}
						<User size={14} class="mt-0.5 text-sky-400" />
					{/if}
					<div>
						<p class="font-mono text-[9px] tracking-widest text-bone uppercase">
							{bag.ownerType === 'user' ? 'Customer bag' : 'Guest bag'}
						</p>
						{#if bag.expiresAt}
							<p class="mt-1 font-sans text-[10px] {isExpired ? 'text-red-300' : 'text-ash'}">
								{formatExpiryRemaining(bag.expiresAt)}
							</p>
						{/if}
					</div>
				</div>
			</td>

			<!-- Contents -->
			<td class="px-5 py-4">
				<p class="font-mono text-xs text-bone">
					{bag.itemCount}
					{bag.itemCount === 1 ? 'unit' : 'units'}
				</p>
				<p class="mt-1 font-sans text-[10px] text-ash/60">
					{bag.items.length}
					{bag.items.length === 1 ? 'line' : 'lines'}
				</p>
			</td>

			<!-- Subtotal -->
			<td class="px-5 py-4 font-mono text-xs text-bone">
				{formatAdminMoney(bag.subtotal)}
			</td>

			<!-- Promotion -->
			<td class="px-5 py-4">
				{#if bag.promoCode}
					<span class="font-mono text-[10px] font-bold text-volt">{bag.promoCode}</span>
				{:else if bag.promotionName}
					<span
						class="block max-w-40 truncate font-sans text-xs text-bone"
						title={bag.promotionName}
					>
						{bag.promotionName}
					</span>
				{:else}
					<span class="font-sans text-xs text-ash/45">None</span>
				{/if}
			</td>

			<!-- Checkout -->
			<td class="px-5 py-4">
				<AdminBadge
					variant={bag.checkoutStatus === 'active'
						? 'info'
						: bag.checkoutStatus === 'expired'
							? 'warning'
							: 'neutral'}
					size="xs"
				>
					{formatAdminStatus(bag.checkoutStatus)}
				</AdminBadge>
				{#if bag.checkoutStatus === 'active' && bag.checkoutExpiresAt}
					<p class="mt-1.5 font-sans text-[10px] text-sky-300">
						Until {formatAdminDateTime(bag.checkoutExpiresAt, '—')}
					</p>
				{/if}
			</td>

			<!-- Updated At -->
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatUpdatedAgo(bag.updatedAt)}
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<AdminActionMenu
					items={getBagActions(bag)}
					iconOnly
					ariaLabel={`Actions for ${bag.ownerType === 'user' ? 'customer' : 'guest'} bag`}
				/>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState title="No bags found" description="Adjust filters or query parameters." />
	{/snippet}
</AdminListLayout>

{#if selectedBag}
	<AdminDrawer
		bind:open={detailOpen}
		title={selectedBag.ownerType === 'user' ? 'Customer bag' : 'Guest bag'}
		kicker="Bag operations"
		size="lg"
		description="Inspect bag contents, pricing, promotion, expiry, and checkout validation state."
		onOpenChange={(open) => {
			if (!open) closeDetails();
		}}
	>
		<AdminBagDetails bag={selectedBag} />

		{#snippet footer()}
			{#if selectedBag.userId}
				<AdminButton href={customerHref(selectedBag.userId)} variant="outline">
					<User size={14} aria-hidden="true" />
					View customer
				</AdminButton>
				<AdminButton href={customerOrdersHref(selectedBag.userId)} variant="outline">
					<ReceiptText size={14} aria-hidden="true" />
					Customer orders
				</AdminButton>
			{/if}
			<AdminButton
				type="button"
				variant="danger"
				disabled={deletionSubmitting}
				onclick={() => (deleteConfirmOpen = true)}
			>
				<Trash2 size={14} aria-hidden="true" />
				Delete bag
			</AdminButton>
		{/snippet}
	</AdminDrawer>
{/if}

<AdminConfirmDialog
	bind:open={cleanupConfirmOpen}
	title="Clean expired guest bags"
	message="Permanently delete up to 100 expired guest bags and all items saved in them?"
	confirmLabel="Clean expired bags"
	loading={cleanupSubmitting}
	onconfirm={confirmCleanup}
/>

<AdminConfirmDialog
	bind:open={deleteConfirmOpen}
	title="Delete bag"
	message="Permanently delete this bag and all items saved in it? This cannot be undone."
	confirmLabel="Delete bag"
	loading={deletionSubmitting}
	onconfirm={handleDeleteBag}
/>
