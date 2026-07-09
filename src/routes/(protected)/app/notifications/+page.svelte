<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';
	import { Mail, MessageSquare, AlertTriangle, X, Info, Lock, Eye, Settings2 } from 'lucide-svelte';
	import type {
		NotificationOutboxDTO,
		NotificationPayload
	} from '$lib/server/modules/notifications/outbox';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';

	let { data } = $props();

	let selectedLog = $state<NotificationOutboxDTO | null>(null);
	let detailOpen = $state(false);
	let searchQuery = $derived(data.filters.query ?? '');

	const byStatus = $derived(data.summary.byStatus);
	const tracked = $derived(data.summary.total);
	const unhealthy = $derived(data.summary.byStatus.failed ?? 0);
	const healthyPercent = $derived(
		tracked > 0 ? Math.round(((tracked - unhealthy) / tracked) * 100) : 100
	);

	function formatDate(date: Date | string | null | undefined) {
		if (!date) return '—';
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleString('en-LK', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatType(type: string) {
		return type
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function getEmailSubject(type: string, payload: NotificationPayload) {
		if (!payload) return 'No payload';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = payload as any;
		switch (type) {
			case 'auth_welcome':
				return 'Welcome to Caro Clothing';
			case 'auth_google_linked':
				return 'Google Account Linked';
			case 'order_confirmation':
				return `Order Confirmation - #${p.orderNumber || p.orderId}`;
			case 'shipping_update':
				return `Shipping Update - Order #${p.orderNumber || p.orderId}`;
			default:
				return 'System Notification';
		}
	}

	function getEmailHtmlSimulated(type: string, payload: NotificationPayload) {
		if (!payload) return 'No payload data available.';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = payload as any;
		switch (type) {
			case 'auth_welcome':
				return `
					<div style="font-family: sans-serif; color: #F8F5F0;">
						<h2 style="color: #C8FF00; font-family: sans-serif; text-transform: uppercase; margin-top: 0;">Welcome to CARO, ${p.name}!</h2>
						<p>Your account has been successfully created. We are excited to have you as part of our exclusive community.</p>
						<p>Explore our latest arrivals and core catalog now.</p>
						<p style="margin-top: 20px; font-size: 10px; color: #B4AFA8; border-top: 1px solid #1C1C1C; padding-top: 10px;">Email: ${p.email}</p>
					</div>
				`;
			case 'auth_google_linked':
				return `
					<div style="font-family: sans-serif; color: #F8F5F0;">
						<h2 style="color: #C8FF00; text-transform: uppercase; margin-top: 0;">Google Account Linked</h2>
						<p>Your CARO account has been successfully linked with Google. You can now log in seamlessly using Google One Tap.</p>
						<p style="margin-top: 20px; font-size: 10px; color: #B4AFA8; border-top: 1px solid #1C1C1C; padding-top: 10px;">Linked Email: ${p.email}</p>
					</div>
				`;
			case 'order_confirmation':
				return `
					<div style="font-family: sans-serif; color: #F8F5F0;">
						<h2 style="color: #C8FF00; text-transform: uppercase; margin-top: 0;">Order Confirmed!</h2>
						<p>Hi ${p.customerName || 'Customer'},</p>
						<p>Your order <strong>#${p.orderNumber || p.orderId}</strong> has been received and is being processed.</p>
						<div style="border: 1px solid #1C1C1C; padding: 12px; margin: 15px 0; background: #0A0A0A;">
							<p style="margin: 3px 0;"><strong>Order ID:</strong> ${p.orderId}</p>
							<p style="margin: 3px 0;"><strong>Date:</strong> ${p.orderDate || 'Today'}</p>
							<p style="margin: 3px 0; color: #C8FF00;"><strong>Total:</strong> ${p.total || '—'}</p>
						</div>
						<p style="font-size: 11px; color: #B4AFA8;">Shipping to: ${p.shippingAddress || 'Address snapshot'}</p>
					</div>
				`;
			case 'shipping_update':
				return `
					<div style="font-family: sans-serif; color: #F8F5F0;">
						<h2 style="color: #C8FF00; text-transform: uppercase; margin-top: 0;">Your Package is on the Way</h2>
						<p>Hi ${p.customerName || 'Customer'},</p>
						<p>Order <strong>#${p.orderNumber || p.orderId}</strong> has been shipped and handed over to carrier.</p>
						<div style="border: 1px solid #1C1C1C; padding: 12px; margin: 15px 0; background: #0A0A0A;">
							<p style="margin: 3px 0;"><strong>Carrier:</strong> ${p.carrier || 'Standard Courier'}</p>
							<p style="margin: 3px 0;"><strong>Tracking Number:</strong> ${p.trackingNumber || '—'}</p>
							<p style="margin: 3px 0;"><strong>Est. Delivery:</strong> ${p.estimatedDelivery || '—'}</p>
						</div>
						<p><a href="${p.trackingUrl || '#'}" target="_blank" style="color: #C8FF00; text-decoration: underline; font-weight: bold;">Click here to track shipment</a></p>
					</div>
				`;
			default:
				return `<pre style="font-family: monospace; white-space: pre-wrap; font-size: 10px; color: #B4AFA8;">${JSON.stringify(payload, null, 2)}</pre>`;
		}
	}

	function getSmsTextSimulated(type: string, payload: NotificationPayload) {
		if (!payload) return 'No payload data available.';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = payload as any;
		switch (type) {
			case 'order_confirmation':
				return `CARO: Your order #${p.orderNumber || p.orderId} is confirmed! Total: ${p.total || '—'}. View details: ${p.orderUrl || '—'}. Thank you!`;
			case 'shipping_update':
				return `CARO: Order #${p.orderNumber || p.orderId} has been shipped via ${p.carrier || 'courier'}. Tracking: ${p.trackingNumber}. Track link: ${p.trackingUrl || '—'}`;
			case 'payment_update':
				return `CARO: Payment of ${p.amount || '—'} received for order #${p.orderNumber || p.orderId}. Status: ${p.statusLabel || p.status}.`;
			case 'order_status_update':
				return `CARO: Order #${p.orderNumber || p.orderId} status updated: ${p.statusLabel || p.status}. Details: ${p.orderUrl || '—'}`;
			default:
				return p.message || `No message text parsed. Payload: ${JSON.stringify(payload)}`;
		}
	}

	function statusBadgeClass(status: string) {
		switch (status) {
			case 'sent':
				return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400';
			case 'failed':
				return 'border-rose-500/30 bg-rose-500/5 text-rose-400';
			case 'processing':
				return 'border-sky-500/30 bg-sky-500/5 text-sky-400';
			case 'pending':
				return 'border-amber-500/30 bg-amber-500/5 text-amber-400';
			case 'cancelled':
				return 'border-charcoal bg-void text-ash/60';
			default:
				return 'border-charcoal bg-void text-ash';
		}
	}

	function getFilterUrl(key: string, value: string | undefined): string {
		const url = new URL(page.url);
		if (value) {
			url.searchParams.set(key, value);
		} else {
			url.searchParams.delete(key);
		}
		url.searchParams.delete('offset'); // Reset paging
		return url.pathname + url.search;
	}

	function clearFilters() {
		goto('/app/notifications');
	}

	function openDetails(log: NotificationOutboxDTO) {
		selectedLog = log;
		detailOpen = true;
	}

	function closeDetails() {
		detailOpen = false;
	}

	let cancellationSubmitting = $state(false);
	async function handleCancel(e: SubmitEvent) {
		e.preventDefault();
		if (!selectedLog) return;

		cancellationSubmitting = true;
		const formData = new FormData();
		formData.set('id', selectedLog.id);

		try {
			const res = await fetch('?/cancel', {
				method: 'POST',
				body: formData
			});
			const result = (await res.json()) as { success?: boolean; status?: number; type?: string };
			if (result.type === 'success' || result.status === 200) {
				selectedLog.status = 'cancelled';
				selectedLog.cancelledAt = new Date();
				selectedLog.lastError = 'Cancelled via Admin Dashboard';
				// Reload page state silently
				const url = new URL(page.url);
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
			}
		} catch (err) {
			console.error('[admin:notifications] Failed to cancel notification:', err);
		} finally {
			cancellationSubmitting = false;
		}
	}
</script>

<AdminListLayout
	title="Notifications"
	kicker="Services"
	loading={false}
	query={data.filters.query}
	totalItems={data.logs.total}
	limit={data.filters.limit}
	offset={data.filters.offset}
	tableHeaders={[
		{ label: 'Channel' },
		{ label: 'Recipient' },
		{ label: 'Notification Type' },
		{ label: 'Status' },
		{ label: 'Attempts' },
		{ label: 'Date Created' },
		{ label: 'Actions', class: 'text-right' }
	]}
	items={data.logs.items}
	onclearfilters={clearFilters}
	searchPlaceholder="Search recipient, aggregate ID..."
>
	{#snippet statsSnippet()}
		<div class="mt-8 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<div class="flex items-start justify-between gap-1">
					<p
						class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
					>
						Total Logs
					</p>
					<span class="font-mono text-[8px] text-emerald-400 sm:text-[9px]"
						>{healthyPercent}% Healthy</span
					>
				</div>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{data.logs.total}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-emerald-500 uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Sent
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-emerald-400 uppercase sm:text-4xl">
					{byStatus.sent ?? 0}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-rose-500 uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Failed
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-rose-400 uppercase sm:text-4xl">
					{byStatus.failed ?? 0}
				</p>
			</AdminCard>
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-amber-500 uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Pending
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-amber-400 uppercase sm:text-4xl">
					{(byStatus.pending ?? 0) + (byStatus.processing ?? 0)}
				</p>
			</AdminCard>
			<AdminCard class="col-span-2 min-w-0 lg:col-span-1" padding="p-3 sm:p-5">
				<p
					class="truncate font-mono text-[8px] tracking-[0.08em] text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					Cancelled
				</p>
				<p class="mt-2 font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{byStatus.cancelled ?? 0}
				</p>
			</AdminCard>
		</div>
	{/snippet}

	{#snippet advancedFilters()}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<AdminSelect
				label="Status"
				name="status"
				value={data.filters.status}
				options={[
					{ value: '', label: 'All Statuses' },
					{ value: 'sent', label: 'Sent' },
					{ value: 'failed', label: 'Failed' },
					{ value: 'pending', label: 'Pending' }
				]}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>

			<AdminSelect
				label="Channel"
				name="channel"
				value={data.filters.channel}
				options={[
					{ value: '', label: 'All Channels' },
					{ value: 'email', label: 'Email' },
					{ value: 'sms', label: 'SMS' }
				]}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>

			<AdminSelect
				label="Type"
				name="type"
				value={data.filters.type}
				options={[
					{ value: '', label: 'All Types' },
					{ value: 'auth_welcome', label: 'Welcome Email' },
					{ value: 'auth_google_linked', label: 'Google Linked' },
					{ value: 'order_confirmation', label: 'Order Conf.' },
					{ value: 'shipping_update', label: 'Shipping Update' },
					{ value: 'payment_update', label: 'Payment Update' },
					{ value: 'order_status_update', label: 'Status Update' }
				]}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>
		</div>
	{/snippet}

	{#snippet card(log: any)}
		<article class="min-w-0 border border-charcoal bg-void p-3 sm:p-4">
			<div class="flex flex-col gap-3">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							{#if log.channel === 'email'}
								<Mail size={12} class="text-volt" />
								<span class="font-mono text-[8px] tracking-widest text-ash uppercase">Email</span>
							{:else}
								<MessageSquare size={12} class="text-sky-400" />
								<span class="font-mono text-[8px] tracking-widest text-sky-400 uppercase">SMS</span>
							{/if}
						</div>
						<p class="mt-1.5 truncate font-mono text-xs text-bone">{log.recipient}</p>
					</div>
					<span
						class="border px-2 py-0.5 font-mono text-[8px] tracking-widest uppercase {statusBadgeClass(
							log.status
						)}"
					>
						{log.status}
					</span>
				</div>

				<div class="font-mono text-[10px] text-ash">
					<p>Type: <span class="text-bone">{formatType(log.type)}</span></p>
					<p class="mt-1">
						Attempts: <span class="text-bone">{log.attemptCount} / {log.maxAttempts}</span>
					</p>
					<p class="mt-1 text-[9px] text-ash/60">{formatDate(log.createdAt)}</p>
				</div>

				<div class="mt-2 flex justify-end border-t border-charcoal pt-3">
					<button
						type="button"
						onclick={() => openDetails(log)}
						class="border border-ash/30 px-2 py-1 font-mono text-[9px] tracking-wider text-ash uppercase hover:border-volt hover:text-volt"
					>
						View Details
					</button>
				</div>
			</div>
		</article>
	{/snippet}

	{#snippet row(log: any)}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<!-- Channel -->
			<td class="px-5 py-4">
				<div class="flex items-center gap-2">
					{#if log.channel === 'email'}
						<Mail size={14} class="text-volt" />
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Email</span>
					{:else}
						<MessageSquare size={14} class="text-sky-400" />
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">SMS</span>
					{/if}
				</div>
			</td>

			<!-- Recipient -->
			<td class="px-5 py-4">
				<span class="font-mono text-xs text-bone">{log.recipient}</span>
			</td>

			<!-- Type -->
			<td class="px-5 py-4">
				<span class="font-mono text-[10px] tracking-wider text-bone">{formatType(log.type)}</span>
			</td>

			<!-- Status Badge -->
			<td class="px-5 py-4">
				<span
					class="border px-2 py-0.5 font-mono text-[9px] tracking-widest uppercase {statusBadgeClass(
						log.status
					)}"
				>
					{log.status}
				</span>
			</td>

			<!-- Attempts -->
			<td class="px-5 py-4 font-mono text-xs text-ash">
				{log.attemptCount} / {log.maxAttempts}
			</td>

			<!-- Date -->
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatDate(log.createdAt)}
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<button
					type="button"
					onclick={() => openDetails(log)}
					class="inline-flex items-center gap-1.5 border border-ash/30 px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
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
{#if detailOpen && selectedLog}
	<button
		type="button"
		class="fixed inset-0 z-[90] bg-void/70 backdrop-blur-sm transition-opacity"
		onclick={closeDetails}
		aria-label="Close log details"
		transition:fade={{ duration: 150 }}
	></button>

	<div
		class="fixed inset-y-0 right-0 z-[100] w-full max-w-2xl overflow-y-auto border-l border-charcoal bg-void p-6 shadow-2xl"
		transition:scale={{ duration: 150, start: 0.98, opacity: 0 }}
	>
		<!-- Detail view header -->
		<div class="mb-6 flex items-center justify-between border-b border-charcoal pb-4">
			<div>
				<p class="mb-0.5 font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Log Detail</p>
				<h2 class="max-w-md truncate font-mono text-sm font-bold text-bone">
					ID: {selectedLog.id}
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

		<!-- Main details split grid: visual mockup on top, stats below -->
		<div class="space-y-6">
			<!-- Visual Template Simulator Mockup -->
			<div>
				<p class="mb-3 font-mono text-[9px] tracking-[0.2em] text-ash/50 uppercase">
					Template Content Simulation
				</p>

				{#if selectedLog.channel === 'email'}
					<!-- Mock Email Visualizer -->
					<div class="overflow-hidden rounded-lg border border-charcoal bg-charcoal/10">
						<div
							class="space-y-1 border-b border-charcoal bg-charcoal/30 px-4 py-2 font-mono text-[10px] text-ash/80"
						>
							<div class="flex gap-2">
								<span class="min-w-[50px] text-ash/40">Subject:</span>
								<span class="font-medium text-bone"
									>{getEmailSubject(selectedLog.type, selectedLog.payload)}</span
								>
							</div>
							<div class="flex gap-2">
								<span class="min-w-[50px] text-ash/40">From:</span>
								<span class="text-ash">no-reply@caroclothing.lk</span>
							</div>
							<div class="flex gap-2">
								<span class="min-w-[50px] text-ash/40">To:</span>
								<span class="text-bone">{selectedLog.recipient}</span>
							</div>
						</div>
						<div class="bg-void p-6 text-bone">
							<div class="mx-auto max-w-md border border-charcoal/60 bg-charcoal/10 p-5">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html getEmailHtmlSimulated(selectedLog.type, selectedLog.payload)}
							</div>
						</div>
					</div>
				{:else}
					<!-- Mock SMS Speech Bubble -->
					<div
						class="flex flex-col items-center justify-center rounded-lg border border-charcoal bg-charcoal/10 p-6"
					>
						<div
							class="relative flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-charcoal bg-void p-4 shadow-xl"
						>
							<!-- Header phone interface -->
							<div
								class="mb-2 flex items-center justify-between border-b border-charcoal/50 pb-2 font-mono text-[9px] text-ash/30"
							>
								<span>CARO SMS GATEWAY</span>
								<span>Sender: {selectedLog.provider || 'text.lk'}</span>
							</div>

							<div
								class="max-w-[85%] self-end rounded-2xl rounded-tr-none bg-volt px-4 py-3 font-sans text-xs leading-relaxed font-medium text-void shadow-md"
							>
								{getSmsTextSimulated(selectedLog.type, selectedLog.payload)}
							</div>

							<div class="mt-1 text-right font-mono text-[8px] text-ash/30">
								Recipient: {selectedLog.recipient}
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Quick info stats grid -->
			<div class="grid grid-cols-2 gap-3">
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Status</span>
					<span class="mt-1 block font-mono text-xs font-bold text-bone uppercase">
						<span class="border px-2 py-0.5 {statusBadgeClass(selectedLog.status)}"
							>{selectedLog.status}</span
						>
					</span>
				</div>
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Template Type</span>
					<span class="mt-1 block truncate font-mono text-xs text-bone"
						>{formatType(selectedLog.type)}</span
					>
				</div>
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase"
						>Total Delivery Attempts</span
					>
					<span class="mt-1 block font-mono text-xs text-bone"
						>{selectedLog.attemptCount} / {selectedLog.maxAttempts}</span
					>
				</div>
				<div class="border border-charcoal bg-charcoal/10 p-3">
					<span class="block font-mono text-[8px] text-ash/50 uppercase">Idempotency Key</span>
					<span
						class="mt-1 block truncate font-mono text-xs text-bone"
						title={selectedLog.idempotencyKey}>{selectedLog.idempotencyKey}</span
					>
				</div>
			</div>

			<!-- Stale Locks/Failure Messages Block -->
			{#if selectedLog.lastError}
				<div class="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
					<AlertTriangle class="mt-0.5 shrink-0 text-rose-400" size={16} />
					<div>
						<p class="font-mono text-[9px] font-bold text-rose-300 uppercase">Last Error Logs</p>
						<p class="mt-1.5 font-mono text-[10px] leading-relaxed break-all text-rose-200/80">
							{selectedLog.lastError}
						</p>
					</div>
				</div>
			{/if}

			<!-- Lock metadata indicators -->
			{#if selectedLog.lockedAt}
				<div class="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
					<Lock class="mt-0.5 shrink-0 text-sky-400" size={16} />
					<div>
						<p class="font-mono text-[9px] font-bold text-sky-300 uppercase">
							Outbox Queue Lock State
						</p>
						<p class="mt-1 font-mono text-[10px] text-sky-200/80">
							Locked by worker <strong>{selectedLog.lockedBy || 'unknown'}</strong> at {formatDate(
								selectedLog.lockedAt
							)}.
						</p>
					</div>
				</div>
			{/if}

			<!-- Copyable Raw JSON Payload block -->
			<div>
				<div class="mb-2 flex items-center justify-between">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash/50 uppercase">
						Raw JSON Payload & Metadata
					</p>
					<button
						type="button"
						onclick={() => {
							navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
						}}
						class="font-mono text-[8px] text-volt uppercase hover:underline"
					>
						Copy Raw Data
					</button>
				</div>
				<pre
					class="max-h-60 overflow-y-auto border border-charcoal bg-void p-4 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-ash/80">{JSON.stringify(
						selectedLog,
						null,
						2
					)}</pre>
			</div>

			<!-- Actions block (Cancel Notification) -->
			{#if selectedLog.status !== 'sent' && selectedLog.status !== 'cancelled'}
				<div class="flex items-center justify-between gap-4 border-t border-charcoal pt-4">
					<div class="flex items-center gap-2 font-mono text-[9px] text-ash">
						<Info size={12} class="text-amber-400" />
						<span>Cancelling stops retries and marks log as cancelled.</span>
					</div>

					<form onsubmit={handleCancel}>
						<button
							type="submit"
							disabled={cancellationSubmitting}
							class="border border-rose-500/60 bg-rose-500/10 px-4 py-2 font-mono text-[10px] font-bold tracking-widest text-rose-400 uppercase transition-colors hover:bg-rose-500/25 disabled:opacity-50"
						>
							{cancellationSubmitting ? 'Cancelling...' : 'Cancel Notification'}
						</button>
					</form>
				</div>
			{/if}
		</div>
	</div>
{/if}
