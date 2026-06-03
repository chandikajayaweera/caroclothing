<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { goto } from '$app/navigation';
	import { Tag, RotateCw, Play, Pause, Edit2, Settings } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { Dialog } from 'bits-ui';
	import AdminDateTimePicker from '$lib/components/admin/AdminDateTimePicker.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	// Active tab derived from query params
	const activeTab = $derived((page.url.searchParams.get('tab') as 'codes' | 'usages') || 'codes');

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

	// Formatters
	function formatMoney(value: number | null | undefined): string {
		if (value === null || value === undefined) return '—';
		return `LKR ${value.toLocaleString()}`;
	}

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
		url.searchParams.delete('usageOffset');
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
		url.searchParams.delete('usageOffset');
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
	const codesStats = $derived({
		total: data.promoCodes.total,
		active: data.promoCodes.items.filter((c) => c.isActive).length,
		inactive: data.promoCodes.items.filter((c) => !c.isActive).length
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

	function formatDiscount(type: 'percentage' | 'fixed', value: number): string {
		if (type === 'percentage') return `${value}%`;
		return `LKR ${value.toLocaleString()}`;
	}

	function formatDate(value: Date | string | number | null | undefined): string {
		if (!value) return '—';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function formatValidity(
		startsAt: number | Date | null | undefined,
		expiresAt: number | Date | null | undefined
	): string {
		if (!startsAt && !expiresAt) return 'Always Active';
		if (startsAt && !expiresAt) return `Starts ${formatDate(startsAt)}`;
		if (!startsAt && expiresAt) return `Expires ${formatDate(expiresAt)}`;
		return `${formatDate(startsAt)} – ${formatDate(expiresAt)}`;
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
	<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />
{/if}

<div onsubmit={handleFormSubmit}>
	<AdminListLayout
		title="Promotions"
		kicker={promotionsKicker}
		loading={false}
		stats={codesStats}
		bind:query={currentQuery}
		bind:showFilters
		hasActiveFilters={activeTab === 'codes'
			? statusInput !== ''
			: promoCodeIdInput !== '' || userIdInput !== '' || orderIdInput !== ''}
		totalItems={activeTab === 'codes' ? data.promoCodes.total : data.promoUsages.total}
		limit={activeTab === 'codes' ? data.filters.limit : data.filters.usageLimit}
		offset={activeTab === 'codes' ? data.promoCodes.offset : data.promoUsages.offset}
		tableHeaders={activeTab === 'codes' ? codeHeaders : usageHeaders}
		items={activeTab === 'codes' ? data.promoCodes.items : data.promoUsages.items}
		onclearfilters={activeTab === 'codes' ? clearCodesFilters : clearUsagesFilters}
		searchPlaceholder={activeTab === 'codes'
			? 'Search promo codes...'
			: 'Filter by Promo Code ID...'}
	>
		{#snippet headerActions()}
			<div class="mt-5 flex flex-wrap gap-2 md:mt-0">
				<!-- Tab switcher segmented controls -->
				<div class="flex items-center gap-1 border border-charcoal bg-void p-1">
					<button
						type="button"
						onclick={() => handleTabChange('codes')}
						class="cursor-pointer px-4 py-1.5 font-mono text-[10px] tracking-widest uppercase transition-colors {activeTab ===
						'codes'
							? 'bg-volt font-bold text-void'
							: 'text-ash hover:text-bone'}"
					>
						Codes
					</button>
					<button
						type="button"
						onclick={() => handleTabChange('usages')}
						class="cursor-pointer px-4 py-1.5 font-mono text-[10px] tracking-widest uppercase transition-colors {activeTab ===
						'usages'
							? 'bg-volt font-bold text-void'
							: 'text-ash hover:text-bone'}"
					>
						Audit Logs
					</button>
				</div>

				<AdminButton type="button" variant="volt" onclick={() => (createPromoModalOpen = true)}>
					Add Promo Code
				</AdminButton>

				<AdminButton type="button" variant="charcoal" onclick={() => (syncConfirmModalOpen = true)}>
					Sync All Usage Counts
				</AdminButton>
			</div>
		{/snippet}

		{#snippet advancedFilters()}
			{#if activeTab === 'codes'}
				<div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
				</div>
			{:else}
				<div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
				</div>
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
									class="max-w-[200px] truncate font-sans text-xs text-ash/80"
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
							<span>{formatDiscount(code.discountType, code.discountValue)}</span>
							<span class="text-[9px] font-normal text-ash uppercase">{code.discountType}</span>
						</div>
					</td>
					<td class="px-5 py-4 font-mono text-xs text-bone">
						<div class="flex flex-col gap-1 text-[10px]">
							{#if code.minOrderAmount}
								<span class="text-ash">
									Min Order: <span class="text-bone">{formatMoney(code.minOrderAmount)}</span>
								</span>
							{/if}
							{#if code.maxDiscountAmount}
								<span class="text-ash">
									Max Discount: <span class="text-bone">{formatMoney(code.maxDiscountAmount)}</span>
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
						<span
							class="font-mono text-[10px] font-semibold tracking-wider uppercase
							{code.status === 'active' ? 'text-volt' : ''}
							{code.status === 'inactive' ? 'text-ash/50' : ''}
							{code.status === 'scheduled' ? 'text-bone/80' : ''}
							{code.status === 'expired' ? 'text-red-400/70' : ''}
							{code.status === 'exhausted' ? 'text-red-300' : ''}"
						>
							{code.status}
						</span>
					</td>
					<td class="px-5 py-4 text-right">
						<div class="flex items-center justify-end gap-3">
							<form method="POST" action="?/reconcileCode" use:reconcileCodeEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<button
									type="submit"
									title="Reconcile count from logs"
									class="flex cursor-pointer items-center gap-1 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:text-volt"
								>
									<RotateCw size={10} />
									Rec
								</button>
							</form>

							<button
								onclick={() => startEdit(code)}
								class="flex cursor-pointer items-center gap-1 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:text-bone"
							>
								<Edit2 size={10} />
								Edit
							</button>

							<form method="POST" action="?/setActive" use:setActiveEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<input type="hidden" name="isActive" value={code.isActive ? 'false' : 'true'} />
								<button
									type="submit"
									class="flex cursor-pointer items-center gap-1 font-mono text-[9px] font-semibold tracking-widest uppercase transition-colors
									{code.isActive ? 'text-volt hover:text-red-400' : 'text-ash/70 hover:text-volt'}"
								>
									{#if code.isActive}
										<Pause size={10} /> Pause
									{:else}
										<Play size={10} /> Live
									{/if}
								</button>
							</form>
						</div>
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
						{formatMoney(usage.discountAmount)}
					</td>
					<td class="px-5 py-4 text-right font-mono text-[10px] text-ash">
						{formatDate(usage.usedAt)}
					</td>
				</tr>
			{/if}
		{/snippet}

		{#snippet card(item)}
			{#if activeTab === 'codes'}
				{@const code = item}
				<AdminCard>
					<div class="flex items-start justify-between gap-4">
						<div>
							<span class="font-mono text-sm font-bold tracking-wide text-bone uppercase">
								{code.code}
							</span>
							{#if code.description}
								<p class="mt-1 font-sans text-xs text-ash/80">{code.description}</p>
							{/if}
						</div>
						<span
							class="font-mono text-[10px] font-semibold tracking-wider uppercase
							{code.status === 'active' ? 'text-volt' : ''}
							{code.status === 'inactive' ? 'text-ash/50' : ''}
							{code.status === 'scheduled' ? 'text-bone/80' : ''}
							{code.status === 'expired' ? 'text-red-400/70' : ''}
							{code.status === 'exhausted' ? 'text-red-300' : ''}"
						>
							{code.status}
						</span>
					</div>

					<div
						class="mt-4 grid grid-cols-2 gap-2 border-t border-charcoal/50 pt-3 font-mono text-[10px]"
					>
						<div>
							<p class="text-[8px] tracking-wider text-ash/60 uppercase">Discount</p>
							<p class="mt-0.5 font-medium text-bone">
								{formatDiscount(code.discountType, code.discountValue)} ({code.discountType})
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
								<p class="mt-0.5 font-medium text-bone">{formatMoney(code.minOrderAmount)}</p>
							</div>
						{/if}
						{#if code.maxDiscountAmount}
							<div>
								<p class="text-[8px] tracking-wider text-ash/60 uppercase">Max Discount</p>
								<p class="mt-0.5 font-medium text-bone">{formatMoney(code.maxDiscountAmount)}</p>
							</div>
						{/if}
					</div>

					<div
						class="mt-4 flex items-center justify-between border-t border-charcoal/50 pt-3 font-mono text-[9px]"
					>
						<span class="text-ash/60">{formatValidity(code.startsAt, code.expiresAt)}</span>
						<div class="flex items-center gap-2">
							<form method="POST" action="?/reconcileCode" use:reconcileCodeEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<button
									class="cursor-pointer font-bold tracking-wider text-ash uppercase hover:text-volt"
									>Rec</button
								>
							</form>
							<button
								onclick={() => startEdit(code)}
								class="cursor-pointer font-bold tracking-wider text-ash uppercase hover:text-bone"
							>
								Edit
							</button>
							<form method="POST" action="?/setActive" use:setActiveEnhance>
								<input type="hidden" name="promoCodeId" value={code.id} />
								<input type="hidden" name="isActive" value={code.isActive ? 'false' : 'true'} />
								<button
									class="cursor-pointer font-bold tracking-wider uppercase {code.isActive
										? 'text-volt hover:text-red-400'
										: 'text-ash/70 hover:text-volt'}"
								>
									{code.isActive ? 'Pause' : 'Live'}
								</button>
							</form>
						</div>
					</div>
				</AdminCard>
			{:else}
				{@const usage = item}
				<AdminCard>
					<div class="flex items-start justify-between gap-4 font-mono">
						<div>
							<p class="text-[8px] tracking-wider text-ash/60 uppercase">Log ID</p>
							<p class="mt-0.5 text-[10px] text-ash/60">{usage.id}</p>
						</div>
						<span class="font-mono text-xs font-bold text-volt">
							-{formatMoney(usage.discountAmount)}
						</span>
					</div>

					<div
						class="mt-4 grid grid-cols-2 gap-2 border-t border-charcoal/50 pt-3 font-mono text-[10px]"
					>
						<div>
							<p class="text-[8px] tracking-wider text-ash/60 uppercase">Promo Code</p>
							<p class="mt-0.5 font-medium text-bone">{usage.promoCode?.code ?? 'UNKNOWN'}</p>
						</div>
						<div>
							<p class="text-[8px] tracking-wider text-ash/60 uppercase">Customer ID</p>
							<p class="mt-0.5 max-w-[120px] truncate font-medium text-bone">
								{usage.userId ?? 'Guest User'}
							</p>
						</div>
						<div class="col-span-2">
							<p class="text-[8px] tracking-wider text-ash/60 uppercase">Order ID</p>
							<a
								href={resolve(`/app/orders/${usage.orderId}`)}
								class="mt-0.5 block font-medium text-bone hover:underline"
							>
								{usage.orderId}
							</a>
						</div>
					</div>
				</AdminCard>
			{/if}
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
		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Code *</span
			>
			<input
				name="code"
				bind:value={$createForm.code}
				oninput={(e) =>
					($createForm.code = e.currentTarget.value
						.toUpperCase()
						.replace(/[^A-Z0-9_-]/g, ''))}
				placeholder="e.g. CARO20"
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			/>
			{#if $createErrors.code}
				<span class="mt-0.5 font-sans text-xs text-red-400"
					>{$createErrors.code[0]}</span
				>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Description</span
			>
			<textarea
				name="description"
				bind:value={$createForm.description}
				placeholder="Internal campaign details..."
				class="min-h-16 w-full border border-ash/30 bg-void px-3 py-2 font-sans text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
			></textarea>
			{#if $createErrors.description}
				<span class="mt-0.5 font-sans text-xs text-red-400"
					>{$createErrors.description[0]}</span
				>
			{/if}
		</label>

		<div class="grid grid-cols-2 gap-4">
			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Discount Type *</span
				>
				<select
					name="discountType"
					bind:value={$createForm.discountType}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt animate-none"
					required
				>
					<option value="percentage">Percentage (%)</option>
					<option value="fixed">Fixed (LKR)</option>
				</select>
				{#if $createErrors.discountType}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$createErrors.discountType[0]}</span
					>
				{/if}
			</label>

			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Value *</span
				>
				<input
					name="discountValue"
					type="number"
					min="1"
					max={$createForm.discountType === 'percentage' ? 100 : undefined}
					bind:value={$createForm.discountValue}
					placeholder={$createForm.discountType === 'percentage'
						? 'e.g. 20'
						: 'e.g. 1000'}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					required
				/>
				{#if $createForm.discountType === 'percentage'}
					<span class="mt-0.5 font-sans text-[10px] text-ash/60 normal-case"
						>Percentage must be 1-100%</span
					>
				{/if}
				{#if $createErrors.discountValue}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$createErrors.discountValue[0]}</span
					>
				{/if}
			</label>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Min Order (LKR)</span
				>
				<input
					name="minOrderAmount"
					type="number"
					min="0"
					bind:value={$createForm.minOrderAmount}
					placeholder="None"
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				/>
				{#if $createErrors.minOrderAmount}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$createErrors.minOrderAmount[0]}</span
					>
				{/if}
			</label>

			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Max Discount (LKR)</span
				>
				<input
					name="maxDiscountAmount"
					type="number"
					min="1"
					bind:value={$createForm.maxDiscountAmount}
					placeholder="None"
					disabled={$createForm.discountType !== 'percentage'}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:opacity-40"
				/>
				{#if $createErrors.maxDiscountAmount}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$createErrors.maxDiscountAmount[0]}</span
					>
				{/if}
			</label>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Usage Limit</span
				>
				<input
					name="usageLimit"
					type="number"
					min="1"
					bind:value={$createForm.usageLimit}
					placeholder="Unlimited"
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				/>
				{#if $createErrors.usageLimit}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$createErrors.usageLimit[0]}</span
					>
				{/if}
			</label>

			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Per User Limit *</span
				>
				<input
					name="perUserLimit"
					type="number"
					min="1"
					bind:value={$createForm.perUserLimit}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					required
				/>
				{#if $createErrors.perUserLimit}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$createErrors.perUserLimit[0]}</span
					>
				{/if}
			</label>
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
		<AdminButton
			type="button"
			variant="outline"
			onclick={() => (createPromoModalOpen = false)}
		>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>			<!-- EDIT PROMO CODE DRAWER -->
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

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Code *</span
			>
			<input
				name="code"
				bind:value={$updateForm.code}
				class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				required
			/>
			{#if $updateErrors.code}
				<span class="mt-0.5 font-sans text-xs text-red-400"
					>{$updateErrors.code[0]}</span
				>
			{/if}
		</label>

		<label class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Description</span
			>
			<textarea
				class="min-h-16 w-full border border-ash/30 bg-void px-3 py-2 font-sans text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				name="description"
				bind:value={$updateForm.description}
				placeholder="Internal campaign details..."
			></textarea>
			{#if $updateErrors.description}
				<span class="mt-0.5 font-sans text-xs text-red-400"
					>{$updateErrors.description[0]}</span
				>
			{/if}
		</label>

		<div class="grid grid-cols-2 gap-4">
			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Discount Type *</span
				>
				<select
					name="discountType"
					bind:value={$updateForm.discountType}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt animate-none"
					required
				>
					<option value="percentage">Percentage (%)</option>
					<option value="fixed">Fixed (LKR)</option>
				</select>
				{#if $updateErrors.discountType}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$updateErrors.discountType[0]}</span
					>
				{/if}
			</label>

			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Value *</span
				>
				<input
					name="discountValue"
					type="number"
					min="1"
					max={$updateForm.discountType === 'percentage' ? 100 : undefined}
					bind:value={$updateForm.discountValue}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					required
				/>
				{#if $updateForm.discountType === 'percentage'}
					<span class="mt-0.5 font-sans text-[10px] text-ash/60 normal-case"
						>Percentage must be 1-100%</span
					>
				{/if}
				{#if $updateErrors.discountValue}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$updateErrors.discountValue[0]}</span
					>
				{/if}
			</label>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Min Order (LKR)</span
				>
				<input
					name="minOrderAmount"
					type="number"
					min="0"
					bind:value={$updateForm.minOrderAmount}
					placeholder="None"
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				/>
				{#if $updateErrors.minOrderAmount}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$updateErrors.minOrderAmount[0]}</span
					>
				{/if}
			</label>

			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Max Discount (LKR)</span
				>
				<input
					name="maxDiscountAmount"
					type="number"
					min="1"
					bind:value={$updateForm.maxDiscountAmount}
					placeholder="None"
					disabled={$updateForm.discountType !== 'percentage'}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:opacity-40"
				/>
				{#if $updateErrors.maxDiscountAmount}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$updateErrors.maxDiscountAmount[0]}</span
					>
				{/if}
			</label>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Usage Limit</span
				>
				<input
					name="usageLimit"
					type="number"
					min="1"
					bind:value={$updateForm.usageLimit}
					placeholder="Unlimited"
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
				/>
				{#if $updateErrors.usageLimit}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$updateErrors.usageLimit[0]}</span
					>
				{/if}
			</label>

			<label
				class="grid gap-1 font-mono text-[10px] tracking-widest text-ash uppercase"
			>
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
					>Per User Limit *</span
				>
				<input
					name="perUserLimit"
					type="number"
					min="1"
					bind:value={$updateForm.perUserLimit}
					class="w-full border border-ash/30 bg-void px-3 py-2 font-mono text-xs text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
					required
				/>
				{#if $updateErrors.perUserLimit}
					<span class="mt-0.5 font-sans text-xs text-red-400"
						>{$updateErrors.perUserLimit[0]}</span
					>
				{/if}
			</label>
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
				<span
					class="mt-0.5 font-sans text-[10px] leading-snug text-yellow-400/80 italic"
				>
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
		<AdminButton
			type="button"
			variant="outline"
			onclick={() => (editPromoModalOpen = false)}
		>
			Cancel
		</AdminButton>
	{/snippet}
</AdminDrawer>

<!-- RECONCILE MAINTENANCE CONFIRM DIALOG -->
<Dialog.Root bind:open={syncConfirmModalOpen}>
	{#if syncConfirmModalOpen}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-[100] bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<Dialog.Content
					class="w-full max-w-md rounded-[2px] border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
				>
					{#snippet child({ props })}
						<div {...props} transition:fade={{ duration: 150 }} class="space-y-6">
							<div>
								<div class="mb-2 flex items-center gap-3 text-volt">
									<Settings size={20} />
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										Sync Promo Usage Counts
									</Dialog.Title>
								</div>
								<Dialog.Description class="mt-2 font-sans text-xs leading-relaxed text-ash">
									Reconcile and synchronize all promo code usage counters against the append-only
									redemption audit trail.
								</Dialog.Description>
							</div>

							<form
								method="POST"
								action="?/reconcileCodes"
								use:reconcileCodesEnhance
								class="flex flex-col gap-4"
							>
								<input type="hidden" name="limit" value="100" />
								<input type="hidden" name="offset" value="0" />

								<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
									<AdminButton
										type="button"
										variant="charcoal"
										onclick={() => (syncConfirmModalOpen = false)}
									>
										Cancel
									</AdminButton>
									<AdminButton type="submit" variant="volt" disabled={$reconcileCodesSubmitting}>
										{#if $reconcileCodesSubmitting}Syncing...{:else}Confirm Sync{/if}
									</AdminButton>
								</div>
							</form>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
