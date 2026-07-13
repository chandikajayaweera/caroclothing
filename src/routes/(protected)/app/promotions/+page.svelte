<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { goto } from '$app/navigation';
	import { RotateCw, Play, Pause, Edit2, Plus } from 'lucide-svelte';
	import AdminDateTimePicker from '$lib/components/admin/AdminDateTimePicker.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/AdminTextarea.svelte';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminTabs from '$lib/components/admin/AdminTabs.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminActionToolbar from '$lib/components/admin/layout/AdminActionToolbar.svelte';
	import {
		formatAdminDateTime,
		formatAdminDiscount,
		formatAdminMoney,
		formatAdminStatus
	} from '$lib/shared/admin/format';
	import { promotionStatusVariant } from '$lib/shared/admin/status';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type PromotionAdminItem = PageData['promoCodes']['items'][number] &
		PageData['promoUsages']['items'][number];

	// Active tab derived from query params
	type PromotionTab = 'codes' | 'usages';
	const activeTab = $derived<PromotionTab>(
		page.url.searchParams.get('tab') === 'usages' ? 'usages' : 'codes'
	);

	let currentQuery = $state('');

	$effect(() => {
		if (activeTab === 'codes') {
			currentQuery = data.filters.query ?? '';
		} else {
			currentQuery = data.filters.promoCodeId ?? '';
		}
	});

	function handleFormSubmit(event: SubmitEvent) {
		const form = event.target as HTMLFormElement;
		if (form.method.toLowerCase() === 'get') {
			event.preventDefault();
			const formData = new FormData(form);
			const url = new URL(form.action || window.location.href);

			url.searchParams.forEach((_, key) => {
				url.searchParams.delete(key);
			});

			url.searchParams.set('tab', activeTab);
			url.searchParams.set('offset', '0');

			for (const [key, value] of formData.entries()) {
				if (value) {
					if (activeTab === 'usages' && key === 'query') {
						url.searchParams.set('promoCodeId', String(value));
					} else {
						url.searchParams.set(key, String(value));
					}
				}
			}

			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(resolve('/app/promotions') + '?' + url.searchParams.toString(), {
				keepFocus: true,
				noScroll: true
			});
		}
	}

	// Dialog opening states
	let createPromoModalOpen = $state(false);
	let editPromoModalOpen = $state(false);
	let syncConfirmModalOpen = $state(false);

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// ── Superforms Initialization ─────────────────────────────────────────

	const createPromoCodeSuperform = superForm(
		initialForm(() => data.createPromoCodeForm),
		{
			id: 'createPromoCode',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					createPromoModalOpen = false;
					toastMessage = form.message ?? 'Promo code created.';
				}
			}
		}
	);

	const {
		form: createForm,
		errors: createErrors,
		message: createMessage,
		enhance: createEnhance,
		submitting: createSubmitting
	} = createPromoCodeSuperform;

	const updatePromoCodeSuperform = superForm(
		initialForm(() => data.updatePromoCodeForm),
		{
			id: 'updatePromoCode',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) {
					editPromoModalOpen = false;
					toastMessage = form.message ?? 'Promo code updated.';
				}
			}
		}
	);

	const {
		form: updateForm,
		errors: updateErrors,
		message: updateMessage,
		enhance: updateEnhance,
		submitting: updateSubmitting
	} = updatePromoCodeSuperform;

	const setPromoCodeActiveSuperform = superForm(
		initialForm(() => data.setPromoCodeActiveForm),
		{
			id: 'setPromoCodeActive',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Promo code active state updated.';
				}
			}
		}
	);

	const { message: setActiveMessage, enhance: setActiveEnhance } = setPromoCodeActiveSuperform;

	const reconcilePromoCodeUsageCountSuperform = superForm(
		initialForm(() => data.reconcilePromoCodeUsageCountForm),
		{
			id: 'reconcilePromoCodeUsageCount',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Reconciled promo code count.';
				}
			}
		}
	);

	const { message: reconcileCodeMessage, enhance: reconcileCodeEnhance } =
		reconcilePromoCodeUsageCountSuperform;

	const reconcilePromoCodeUsageCountsSuperform = superForm(
		initialForm(() => data.reconcilePromoCodeUsageCountsForm),
		{
			id: 'reconcilePromoCodeUsageCounts',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) {
					syncConfirmModalOpen = false;
					toastMessage = form.message ?? 'Usage counts reconciled.';
				}
			}
		}
	);

	const {
		message: reconcileCodesMessage,
		enhance: reconcileCodesEnhance,
		submitting: reconcileCodesSubmitting
	} = reconcilePromoCodeUsageCountsSuperform;

	// Toast / message banner handling
	let toastMessage = $state<string | null>(null);
	const combinedMessage = $derived(
		$createMessage ||
			$updateMessage ||
			$setActiveMessage ||
			$reconcileCodeMessage ||
			$reconcileCodesMessage ||
			actionData?.form?.message
	);

	$effect(() => {
		if (combinedMessage) {
			toastMessage = combinedMessage;
		}
	});

	// Helper to enter edit mode for a promo code
	function startEdit(codeItem: (typeof data.promoCodes.items)[number]) {
		$updateForm.promoCodeId = codeItem.id;
		$updateForm.code = codeItem.code;
		$updateForm.description = codeItem.description ?? '';
		$updateForm.discountType = codeItem.discountType;
		$updateForm.discountValue = codeItem.discountValue;
		$updateForm.minOrderAmount = codeItem.minOrderAmount ?? null;
		$updateForm.maxDiscountAmount = codeItem.maxDiscountAmount ?? null;
		$updateForm.usageLimit = codeItem.usageLimit ?? null;
		$updateForm.perUserLimit = codeItem.perUserLimit ?? 1;
		$updateForm.startsAt = codeItem.startsAt ? codeItem.startsAt.getTime() : null;
		$updateForm.expiresAt = codeItem.expiresAt ? codeItem.expiresAt.getTime() : null;
		editPromoModalOpen = true;
	}

	let nowMs = $state(Date.now());

	$effect(() => {
		const interval = setInterval(() => {
			nowMs = Date.now();
		}, 30000);
		return () => clearInterval(interval);
	});

	const originalPromoCode = $derived(
		data.promoCodes.items.find((code) => code.id === $updateForm.promoCodeId)
	);

	const isPromoStarted = $derived(
		!!(
			originalPromoCode &&
			originalPromoCode.startsAt !== null &&
			originalPromoCode.startsAt !== undefined &&
			new Date(originalPromoCode.startsAt).getTime() < nowMs
		)
	);

	$effect(() => {
		if (
			$createForm.startsAt &&
			$createForm.expiresAt &&
			$createForm.expiresAt <= $createForm.startsAt
		) {
			$createForm.expiresAt = null;
		}
	});

	$effect(() => {
		if (
			$updateForm.startsAt &&
			$updateForm.expiresAt &&
			$updateForm.expiresAt <= $updateForm.startsAt
		) {
			$updateForm.expiresAt = null;
		}
	});

	// ── Tab Navigation ───────────────────────────────────────────────────────
	function handleTabChange(tab: 'codes' | 'usages') {
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		url.searchParams.delete('query');
		url.searchParams.delete('offset');
		url.searchParams.delete('status');
		url.searchParams.delete('promoCodeId');
		url.searchParams.delete('userId');
		url.searchParams.delete('orderId');
		url.searchParams.delete('offset');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(resolve('/app/promotions') + '?' + url.searchParams.toString(), { noScroll: true });
	}

	// ── Live Filters ────────────────────────────────────────────────────────
	function getInitialFilter<T>(getValue: () => T): T {
		return getValue();
	}

	let queryInput = $state(getInitialFilter(() => data.filters.query ?? ''));
	let statusInput = $state(getInitialFilter(() => data.filters.status ?? ''));
	let promoCodeIdInput = $state(getInitialFilter(() => data.filters.promoCodeId ?? ''));
	let userIdInput = $state(getInitialFilter(() => data.filters.userId ?? ''));
	let orderIdInput = $state(getInitialFilter(() => data.filters.orderId ?? ''));

	let showFilters = $state(false);

	$effect(() => {
		queryInput = data.filters.query ?? '';
		statusInput = data.filters.status ?? '';
		promoCodeIdInput = data.filters.promoCodeId ?? '';
		userIdInput = data.filters.userId ?? '';
		orderIdInput = data.filters.orderId ?? '';
	});

	function applyCodesFilters() {
		const url = new URL(page.url);
		url.searchParams.set('tab', 'codes');
		if (queryInput) {
			url.searchParams.set('query', queryInput);
		} else {
			url.searchParams.delete('query');
		}
		if (statusInput) {
			url.searchParams.set('status', statusInput);
		} else {
			url.searchParams.delete('status');
		}
		url.searchParams.delete('offset');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(resolve('/app/promotions') + '?' + url.searchParams.toString(), {
			keepFocus: true,
			replaceState: true
		});
	}

	function applyUsagesFilters() {
		const url = new URL(page.url);
		url.searchParams.set('tab', 'usages');
		if (promoCodeIdInput) {
			url.searchParams.set('promoCodeId', promoCodeIdInput);
		} else {
			url.searchParams.delete('promoCodeId');
		}
		if (userIdInput) {
			url.searchParams.set('userId', userIdInput);
		} else {
			url.searchParams.delete('userId');
		}
		if (orderIdInput) {
			url.searchParams.set('orderId', orderIdInput);
		} else {
			url.searchParams.delete('orderId');
		}
		url.searchParams.delete('offset');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(resolve('/app/promotions') + '?' + url.searchParams.toString(), {
			keepFocus: true,
			replaceState: true
		});
	}

	let debounceTimer: number;
	function handleUsagesSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			applyUsagesFilters();
		}, 300) as unknown as number;
	}

	function clearCodesFilters() {
		queryInput = '';
		statusInput = '';
		const url = new URL(page.url);
		url.searchParams.delete('query');
		url.searchParams.delete('status');
		url.searchParams.delete('offset');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(resolve('/app/promotions') + '?' + url.searchParams.toString(), { noScroll: true });
	}

	function clearUsagesFilters() {
		promoCodeIdInput = '';
		userIdInput = '';
		orderIdInput = '';
		const url = new URL(page.url);
		url.searchParams.delete('promoCodeId');
		url.searchParams.delete('userId');
		url.searchParams.delete('orderId');
		url.searchParams.delete('usageOffset');
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(resolve('/app/promotions') + '?' + url.searchParams.toString(), { noScroll: true });
	}

	// ── Stats ───────────────────────────────────────────────────────────────
	const promotionMetrics = $derived.by(() => {
		if (activeTab === 'codes') {
			return [
				{ label: 'Filtered Codes', value: data.promoCodes.total },
				{
					label: 'Active on Page',
					value: data.promoCodes.items.filter((code) => code.isActive).length,
					tone: 'success' as const
				},
				{
					label: 'Inactive on Page',
					value: data.promoCodes.items.filter((code) => !code.isActive).length,
					tone: 'neutral' as const
				}
			];
		}

		return [
			{ label: 'Redemption Records', value: data.promoUsages.total },
			{
				label: 'Users on Page',
				value: new Set(data.promoUsages.items.map((usage) => usage.userId).filter(Boolean)).size,
				description: 'Distinct customer references',
				tone: 'info' as const
			},
			{
				label: 'Discount on Page',
				value: formatAdminMoney(
					data.promoUsages.items.reduce((total, usage) => total + usage.discountAmount, 0)
				),
				description: 'Current result page',
				tone: 'accent' as const
			}
		];
	});

	const promotionsKicker = $derived(
		`Commerce · Codes: ${data.promoCodes.total} · Redemptions: ${data.promoUsages.total}`
	);

	const codeHeaders = [
		{ label: 'Code & Description' },
		{ label: 'Discount' },
		{ label: 'Limits / Thresholds' },
		{ label: 'Active Window' },
		{ label: 'Status' },
		{ label: 'Actions', class: 'text-right' }
	];

	const usageHeaders = [
		{ label: 'Audit Log ID' },
		{ label: 'Promo Code' },
		{ label: 'User Reference' },
		{ label: 'Order Reference' },
		{ label: 'Discount Applied' },
		{ label: 'Redeemed At', class: 'text-right' }
	];

	function formatValidity(
		startsAt: number | Date | null | undefined,
		expiresAt: number | Date | null | undefined
	): string {
		if (!startsAt && !expiresAt) return 'Always Active';
		if (startsAt && !expiresAt) return `Starts ${formatAdminDateTime(startsAt, '—')}`;
		if (!startsAt && expiresAt) return `Expires ${formatAdminDateTime(expiresAt, '—')}`;
		return `${formatAdminDateTime(startsAt, '—')} – ${formatAdminDateTime(expiresAt, '—')}`;
	}
</script>

<svelte:head>
	<title>Promotions | Caro Admin</title>
	<meta
		name="description"
		content="Manage promo codes, usage limits, minimum order value, per-user limits, expiry windows, and redemption logs."
	/>
</svelte:head>

{#if toastMessage}
	<AdminToast
		message={toastMessage}
		type={page.status >= 400 ? 'error' : 'success'}
		onclose={() => (toastMessage = null)}
	/>
{/if}

<div onsubmit={handleFormSubmit}>
	<AdminListLayout
		title="Promotions"
		kicker={promotionsKicker}
		loading={false}
		metrics={promotionMetrics}
		bind:query={currentQuery}
		bind:showFilters
		hasActiveFilters={activeTab === 'codes'
			? statusInput !== ''
			: promoCodeIdInput !== '' || userIdInput !== '' || orderIdInput !== ''}
		totalItems={activeTab === 'codes' ? data.promoCodes.total : data.promoUsages.total}
		limit={activeTab === 'codes' ? data.filters.limit : data.filters.usageLimit}
		offset={activeTab === 'codes' ? data.promoCodes.offset : data.promoUsages.offset}
		tableHeaders={activeTab === 'codes' ? codeHeaders : usageHeaders}
		items={activeTab === 'codes'
			? (data.promoCodes.items as unknown as PromotionAdminItem[])
			: (data.promoUsages.items as unknown as PromotionAdminItem[])}
		preserveParams={['tab']}
		onclearfilters={activeTab === 'codes' ? clearCodesFilters : clearUsagesFilters}
		searchPlaceholder={activeTab === 'codes'
			? 'Search promo codes...'
			: 'Filter by Promo Code ID...'}
		searchParamName={activeTab === 'codes' ? 'query' : 'promoCodeId'}
	>
		{#snippet headerActions()}
			<AdminActionToolbar
				ariaLabel="Promotion page actions"
				menuItems={[
					{
						label: 'Sync first 100 counts',
						description: 'Reconcile stored redemption counters for first 100 codes.',
						icon: RotateCw,
						onselect: () => (syncConfirmModalOpen = true)
					}
				]}
			>
				{#snippet views()}
					<AdminTabs
						label="Promotion views"
						value={activeTab}
						items={[
							{ value: 'codes', label: 'Codes', count: data.promoCodes.total },
							{ value: 'usages', label: 'Audit Logs', count: data.promoUsages.total }
						]}
						onchange={(tab) => handleTabChange(tab as PromotionTab)}
					/>
				{/snippet}
				{#snippet primary()}
					<AdminButton type="button" variant="volt" onclick={() => (createPromoModalOpen = true)}>
						<Plus size={15} aria-hidden="true" />
						Add promo code
					</AdminButton>
				{/snippet}
			</AdminActionToolbar>
		{/snippet}

		{#snippet advancedFilters()}
			{#if activeTab === 'codes'}
				<AdminFilterBar class="mt-2" cols={3}>
					<AdminSelect
						label="Filter Status"
						name="status"
						bind:value={statusInput}
						options={[
							{ value: '', label: 'All Statuses' },
							{ value: 'active', label: 'Active' },
							{ value: 'inactive', label: 'Inactive' }
						]}
						onchange={applyCodesFilters}
					/>
				</AdminFilterBar>
			{:else}
				<AdminFilterBar class="mt-2" cols={3}>
					<AdminInput
						label="Promo Code ID"
						name="promoCodeId"
						bind:value={promoCodeIdInput}
						placeholder="Filter by Promo Code ID..."
						oninput={handleUsagesSearchInput}
					/>
					<AdminInput
						label="User ID"
						name="userId"
						bind:value={userIdInput}
						placeholder="Filter by customer User ID..."
						oninput={handleUsagesSearchInput}
					/>
					<AdminInput
						label="Order ID"
						name="orderId"
						bind:value={orderIdInput}
						placeholder="Filter by Order ID..."
						oninput={handleUsagesSearchInput}
					/>
				</AdminFilterBar>
			{/if}
		{/snippet}

		{#snippet row(item)}
			{#if activeTab === 'codes'}
				{@const code = item}
				<tr
					class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/5"
				>
					<td class="px-5 py-4">
						<div class="flex flex-col gap-1">
							<span class="font-mono text-xs font-bold tracking-wide text-bone uppercase">
								{code.code}
							</span>
							{#if code.description}
								<span
									class="min-w-50 truncate font-sans text-xs text-ash/80"
									title={code.description}
								>
									{code.description}
								</span>
							{/if}
							<span class="font-mono text-[9px] text-ash/40">ID: {code.id}</span>
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<div class="flex flex-col gap-0.5">
							<span>{formatAdminDiscount(code.discountType, code.discountValue)}</span>
							<span class="text-[9px] font-normal text-ash uppercase">{code.discountType}</span>
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<div class="flex flex-col gap-1 text-[10px]">
							{#if code.minOrderAmount}
								<span class="text-ash">
									Min Order: <span class="text-bone">{formatAdminMoney(code.minOrderAmount)}</span>
								</span>
							{/if}
							{#if code.maxDiscountAmount}
								<span class="text-ash">
									Max Discount: <span class="text-bone"
										>{formatAdminMoney(code.maxDiscountAmount)}</span
									>
								</span>
							{/if}
							<span class="text-ash">
								Usage: <span class="text-bone">{code.usedCount} / {code.usageLimit ?? '∞'}</span>
							</span>
							<span class="text-ash">
								Per-User Limit: <span class="text-bone">{code.perUserLimit}</span>
							</span>
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
						{formatValidity(code.startsAt, code.expiresAt)}
					</td>
					<td class="px-5 py-4">
						<AdminBadge variant={promotionStatusVariant(code.status)}>
							{formatAdminStatus(code.status)}
						</AdminBadge>
					</td>
					<td class="px-5 py-4 text-right">
						<AdminRowActions cols={3} ariaLabel={`Actions for ${code.code}`}>
							<form method="POST" action="?/reconcileCode" use:reconcileCodeEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<AdminIconAction
									type="submit"
									variant="info"
									title="Reconcile count from logs"
									ariaLabel={`Reconcile ${code.code}`}
								>
									<RotateCw size={14} />
								</AdminIconAction>
							</form>

							<AdminIconAction
								onclick={() => startEdit(code)}
								variant="neutral"
								title="Edit promo code"
								ariaLabel={`Edit ${code.code}`}
							>
								<Edit2 size={14} />
							</AdminIconAction>

							<form method="POST" action="?/setActive" use:setActiveEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<input type="hidden" name="isActive" value={code.isActive ? 'false' : 'true'} />
								<AdminIconAction
									type="submit"
									variant={code.isActive ? 'warning' : 'success'}
									title={code.isActive ? 'Pause promo code' : 'Activate promo code'}
									ariaLabel={`${code.isActive ? 'Pause' : 'Activate'} ${code.code}`}
								>
									{#if code.isActive}
										<Pause size={14} />
									{:else}
										<Play size={14} />
									{/if}
								</AdminIconAction>
							</form>
						</AdminRowActions>
					</td>
				</tr>
			{:else}
				{@const usage = item}
				<tr
					class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/5"
				>
					<td class="px-5 py-4 font-mono text-xs text-ash/60">
						{usage.id}
					</td>
					<td class="px-5 py-4">
						<div class="flex flex-col gap-0.5">
							<span class="font-mono text-xs font-bold text-bone uppercase">
								{usage.promoCode?.code ?? 'UNKNOWN'}
							</span>
							<span class="font-mono text-[9px] text-ash/40">ID: {usage.promoCodeId}</span>
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						{usage.userId ?? 'Guest User'}
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<a
							href={resolve(`/app/orders/${usage.orderId}`)}
							class="underline transition-colors hover:text-volt"
						>
							{usage.orderId}
						</a>
					</td>
					<td class="px-5 py-4 font-mono text-xs font-bold text-volt">
						{formatAdminMoney(usage.discountAmount)}
					</td>
					<td class="px-5 py-4 text-right font-mono text-[10px] text-ash">
						{formatAdminDateTime(usage.usedAt, '—')}
					</td>
				</tr>
			{/if}
		{/snippet}

		{#snippet card(item)}
			{#if activeTab === 'codes'}
				{@const code = item}
				<AdminEntityCard>
					{#snippet header()}
						<div class="flex items-start justify-between gap-4">
							<div>
								<span class="font-mono text-sm font-bold tracking-wide text-bone uppercase">
									{code.code}
								</span>
								{#if code.description}
									<p class="mt-1 font-sans text-xs text-ash/80">{code.description}</p>
								{/if}
							</div>
							<AdminBadge variant={promotionStatusVariant(code.status)}>
								{formatAdminStatus(code.status)}
							</AdminBadge>
						</div>
					{/snippet}

					{#snippet metadata()}
						<AdminMetaGrid>
							<div>
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Discount</p>
								<p class="mt-0.5 font-medium text-bone">
									{formatAdminDiscount(code.discountType, code.discountValue)} ({code.discountType})
								</p>
							</div>
							<div>
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Usage</p>
								<p class="mt-0.5 font-medium text-bone">
									{code.usedCount} / {code.usageLimit ?? '∞'}
								</p>
							</div>
							{#if code.minOrderAmount}
								<div>
									<p class="text-[8px] tracking-wider text-ash/60 uppercase">Min Order</p>
									<p class="mt-0.5 font-medium text-bone">
										{formatAdminMoney(code.minOrderAmount)}
									</p>
								</div>
							{/if}
							{#if code.maxDiscountAmount}
								<div>
									<p class="text-[8px] tracking-wider text-ash/60 uppercase">Max Discount</p>
									<p class="mt-0.5 font-medium text-bone">
										{formatAdminMoney(code.maxDiscountAmount)}
									</p>
								</div>
							{/if}
							<div class="min-[430px]:col-span-2">
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Active Window</p>
								<p class="mt-0.5 font-medium text-bone">
									{formatValidity(code.startsAt, code.expiresAt)}
								</p>
							</div>
						</AdminMetaGrid>
					{/snippet}

					{#snippet actions()}
						<AdminRowActions cols={3} ariaLabel={`Actions for ${code.code}`}>
							<form method="POST" action="?/reconcileCode" use:reconcileCodeEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<AdminIconAction
									type="submit"
									variant="info"
									title="Reconcile count from logs"
									ariaLabel={`Reconcile ${code.code}`}
								>
									<RotateCw size={14} />
								</AdminIconAction>
							</form>
							<AdminIconAction
								onclick={() => startEdit(code)}
								variant="neutral"
								title="Edit promo code"
								ariaLabel={`Edit ${code.code}`}
							>
								<Edit2 size={14} />
							</AdminIconAction>
							<form method="POST" action="?/setActive" use:setActiveEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<input type="hidden" name="isActive" value={code.isActive ? 'false' : 'true'} />
								<AdminIconAction
									type="submit"
									variant={code.isActive ? 'warning' : 'success'}
									title={code.isActive ? 'Pause promo code' : 'Activate promo code'}
									ariaLabel={`${code.isActive ? 'Pause' : 'Activate'} ${code.code}`}
								>
									{#if code.isActive}
										<Pause size={14} />
									{:else}
										<Play size={14} />
									{/if}
								</AdminIconAction>
							</form>
						</AdminRowActions>
					{/snippet}
				</AdminEntityCard>
			{:else}
				{@const usage = item}
				<AdminEntityCard>
					{#snippet header()}
						<div class="flex items-start justify-between gap-4 font-mono">
							<div>
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Log ID</p>
								<p class="mt-0.5 text-[10px] text-ash/60">{usage.id}</p>
							</div>
							<span class="font-mono text-xs font-bold text-volt">
								-{formatAdminMoney(usage.discountAmount)}
							</span>
						</div>
					{/snippet}

					{#snippet metadata()}
						<AdminMetaGrid>
							<div>
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Promo Code</p>
								<p class="mt-0.5 font-medium text-bone">{usage.promoCode?.code ?? 'UNKNOWN'}</p>
							</div>
							<div>
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Customer ID</p>
								<p class="mt-0.5 max-w-30 truncate font-medium text-bone">
									{usage.userId ?? 'Guest User'}
								</p>
							</div>
							<div class="min-[430px]:col-span-2">
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Order ID</p>
								<a
									href={resolve(`/app/orders/${usage.orderId}`)}
									class="mt-0.5 block font-medium text-bone hover:underline"
								>
									{usage.orderId}
								</a>
							</div>
							<div class="min-[430px]:col-span-2">
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Redeemed At</p>
								<p class="mt-0.5 font-medium text-bone">{formatAdminDateTime(usage.usedAt, '—')}</p>
							</div>
						</AdminMetaGrid>
					{/snippet}
				</AdminEntityCard>
			{/if}
		{/snippet}

		{#snippet emptyState()}
			<AdminEmptyState
				title={activeTab === 'codes' ? 'No promo codes found' : 'No redemption logs found'}
				description="Adjust filters or query parameters."
			/>
		{/snippet}
	</AdminListLayout>
</div>

<!-- CREATE PROMO CODE DRAWER -->
<AdminDrawer
	bind:open={createPromoModalOpen}
	title="Add Promo Code"
	description="Create a new promotion code to deploy campaigns."
>
	<form
		id="createPromoForm"
		method="POST"
		action="?/createCode"
		use:createEnhance
		class="flex flex-col gap-4"
	>
		<AdminInput
			label="Code"
			name="code"
			bind:value={$createForm.code}
			oninput={(event) => {
				const input = event.currentTarget as HTMLInputElement;
				$createForm.code = input.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
			}}
			placeholder="e.g. CARO20"
			required
			error={$createErrors.code}
		/>

		<AdminTextarea
			label="Description"
			name="description"
			bind:value={$createForm.description}
			placeholder="Internal campaign details..."
			rows={3}
			error={$createErrors.description}
		/>

		<div class="grid gap-4 sm:grid-cols-2">
			<AdminSelect
				label="Discount Type"
				name="discountType"
				bind:value={$createForm.discountType}
				options={[
					{ value: 'percentage', label: 'Percentage (%)' },
					{ value: 'fixed', label: 'Fixed (LKR)' }
				]}
				required
				error={$createErrors.discountType}
			/>

			<AdminInput
				label="Value"
				name="discountValue"
				type="number"
				min="1"
				max={$createForm.discountType === 'percentage' ? 100 : undefined}
				bind:value={$createForm.discountValue}
				placeholder={$createForm.discountType === 'percentage' ? 'e.g. 20' : 'e.g. 1000'}
				helpText={$createForm.discountType === 'percentage'
					? 'Percentage must be 1-100%.'
					: undefined}
				required
				error={$createErrors.discountValue}
			/>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<AdminInput
				label="Min Order (LKR)"
				name="minOrderAmount"
				type="number"
				min="0"
				bind:value={$createForm.minOrderAmount}
				placeholder="None"
				error={$createErrors.minOrderAmount}
			/>

			<AdminInput
				label="Max Discount (LKR)"
				name="maxDiscountAmount"
				type="number"
				min="1"
				bind:value={$createForm.maxDiscountAmount}
				placeholder="None"
				disabled={$createForm.discountType !== 'percentage'}
				error={$createErrors.maxDiscountAmount}
			/>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<AdminInput
				label="Usage Limit"
				name="usageLimit"
				type="number"
				min="1"
				bind:value={$createForm.usageLimit}
				placeholder="Unlimited"
				error={$createErrors.usageLimit}
			/>

			<AdminInput
				label="Per User Limit"
				name="perUserLimit"
				type="number"
				min="1"
				bind:value={$createForm.perUserLimit}
				required
				error={$createErrors.perUserLimit}
			/>
		</div>

		<div class="mt-2 grid gap-4">
			<AdminDateTimePicker
				label="Starts At"
				name="startsAt"
				bind:value={$createForm.startsAt}
				minValue={nowMs - 60000}
				error={$createErrors.startsAt?.[0]}
			/>
			<AdminDateTimePicker
				label="Expires At"
				name="expiresAt"
				bind:value={$createForm.expiresAt}
				minValue={$createForm.startsAt || nowMs}
				error={$createErrors.expiresAt?.[0]}
			/>
		</div>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="createPromoForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$createSubmitting}
		>
			{#if $createSubmitting}Creating...{:else}Create Code{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (createPromoModalOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>
<!-- EDIT PROMO CODE DRAWER -->
<AdminDrawer
	bind:open={editPromoModalOpen}
	title="Edit Promo Code"
	description="Modify existing campaign conditions for this promo code."
>
	<form
		id="editPromoForm"
		method="POST"
		action="?/updateCode"
		use:updateEnhance
		class="flex flex-col gap-4"
	>
		<input type="hidden" name="promoCodeId" bind:value={$updateForm.promoCodeId} />

		<AdminInput
			label="Code"
			name="code"
			bind:value={$updateForm.code}
			required
			error={$updateErrors.code}
		/>

		<AdminTextarea
			label="Description"
			name="description"
			bind:value={$updateForm.description}
			placeholder="Internal campaign details..."
			rows={3}
			error={$updateErrors.description}
		/>

		<div class="grid gap-4 sm:grid-cols-2">
			<AdminSelect
				label="Discount Type"
				name="discountType"
				bind:value={$updateForm.discountType}
				options={[
					{ value: 'percentage', label: 'Percentage (%)' },
					{ value: 'fixed', label: 'Fixed (LKR)' }
				]}
				required
				error={$updateErrors.discountType}
			/>

			<AdminInput
				label="Value"
				name="discountValue"
				type="number"
				min="1"
				max={$updateForm.discountType === 'percentage' ? 100 : undefined}
				bind:value={$updateForm.discountValue}
				helpText={$updateForm.discountType === 'percentage'
					? 'Percentage must be 1-100%.'
					: undefined}
				required
				error={$updateErrors.discountValue}
			/>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<AdminInput
				label="Min Order (LKR)"
				name="minOrderAmount"
				type="number"
				min="0"
				bind:value={$updateForm.minOrderAmount}
				placeholder="None"
				error={$updateErrors.minOrderAmount}
			/>

			<AdminInput
				label="Max Discount (LKR)"
				name="maxDiscountAmount"
				type="number"
				min="1"
				bind:value={$updateForm.maxDiscountAmount}
				placeholder="None"
				disabled={$updateForm.discountType !== 'percentage'}
				error={$updateErrors.maxDiscountAmount}
			/>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<AdminInput
				label="Usage Limit"
				name="usageLimit"
				type="number"
				min="1"
				bind:value={$updateForm.usageLimit}
				placeholder="Unlimited"
				error={$updateErrors.usageLimit}
			/>

			<AdminInput
				label="Per User Limit"
				name="perUserLimit"
				type="number"
				min="1"
				bind:value={$updateForm.perUserLimit}
				required
				error={$updateErrors.perUserLimit}
			/>
		</div>

		<div class="mt-2 grid gap-4">
			<AdminDateTimePicker
				label="Starts At"
				name="startsAt"
				bind:value={$updateForm.startsAt}
				disabled={isPromoStarted}
				error={$updateErrors.startsAt?.[0]}
			/>
			{#if isPromoStarted}
				<span class="mt-0.5 font-sans text-[10px] leading-snug text-yellow-400/80 italic">
					Start date cannot be modified because this promotion has already started.
				</span>
			{/if}
			<AdminDateTimePicker
				label="Expires At"
				name="expiresAt"
				bind:value={$updateForm.expiresAt}
				minValue={$updateForm.startsAt || nowMs}
				error={$updateErrors.expiresAt?.[0]}
			/>
		</div>
	</form>

	{#snippet footer()}
		<AdminButton
			type="submit"
			form="editPromoForm"
			variant="volt"
			class="flex-1 font-mono text-xs uppercase"
			disabled={$updateSubmitting}
		>
			{#if $updateSubmitting}Saving...{:else}Save Changes{/if}
		</AdminButton>
		<AdminButton type="button" variant="outline" onclick={() => (editPromoModalOpen = false)}>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<AdminModal
	bind:open={syncConfirmModalOpen}
	kicker="Operations"
	title="Sync First 100 Usage Counts"
	size="md"
>
	<form
		method="POST"
		action="?/reconcileCodes"
		use:reconcileCodesEnhance
		class="flex flex-col gap-6"
	>
		<input type="hidden" name="limit" value="100" />
		<input type="hidden" name="offset" value="0" />

		<p class="font-sans text-sm leading-relaxed text-ash">
			Reconcile up to 100 promo code usage counters against the append-only redemption audit trail.
			Run again for remaining codes after this batch completes.
		</p>

		<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
			<AdminButton type="button" variant="charcoal" onclick={() => (syncConfirmModalOpen = false)}>
				Cancel
			</AdminButton>
			<AdminButton type="submit" variant="volt" disabled={$reconcileCodesSubmitting}>
				{#if $reconcileCodesSubmitting}Syncing...{:else}Confirm Sync{/if}
			</AdminButton>
		</div>
	</form>
</AdminModal>
