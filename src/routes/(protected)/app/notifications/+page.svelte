<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Mail, MessageSquare, AlertTriangle, Info, Lock, Eye } from 'lucide-svelte';
	import type { PageData } from './$types';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminConfirmDialog from '$lib/components/admin/AdminConfirmDialog.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminJsonViewer from '$lib/components/admin/data-display/AdminJsonViewer.svelte';
	import AdminNotificationPreview from '$lib/components/admin/notifications/AdminNotificationPreview.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import { formatAdminDateTime, formatAdminStatus } from '$lib/shared/admin/format';
	import { notificationStatusVariant } from '$lib/shared/admin/status';

	let { data }: { data: PageData } = $props();
	type NotificationLog = PageData['logs']['items'][number];

	let selectedLog = $state<NotificationLog | null>(null);
	let detailOpen = $state(false);
	let cancelConfirmOpen = $state(false);
	let cancelError = $state<string | null>(null);
	let toastMessage = $state<string | null>(null);
	let showFilters = $state(false);

	const byStatus = $derived(data.summary.byStatus);
	const tracked = $derived(data.summary.total);
	const unhealthy = $derived(data.summary.byStatus.failed ?? 0);
	const healthyPercent = $derived(
		tracked > 0 ? Math.round(((tracked - unhealthy) / tracked) * 100) : 100
	);
	const hasActiveFilters = $derived(
		Boolean(data.filters.status || data.filters.type || data.filters.channel)
	);

	$effect(() => {
		if (hasActiveFilters) showFilters = true;
	});

	function clearFilters() {
		goto(resolve('/app/notifications'));
	}

	function openDetails(log: NotificationLog) {
		selectedLog = log;
		cancelError = null;
		detailOpen = true;
	}

	function closeDetails() {
		detailOpen = false;
	}

	let cancellationSubmitting = $state(false);
	async function handleCancel() {
		if (!selectedLog) return;

		cancellationSubmitting = true;
		cancelError = null;
		const formData = new FormData();
		formData.set('id', selectedLog.id);

		try {
			const res = await fetch('?/cancel', {
				method: 'POST',
				body: formData
			});
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				cancelConfirmOpen = false;
				detailOpen = false;
				selectedLog = null;
				toastMessage = 'Notification cancelled.';
				await invalidateAll();
			} else if (result.type === 'failure') {
				const resultData = result.data as { message?: string } | undefined;
				cancelError = resultData?.message ?? 'Notification could not be cancelled.';
			} else {
				cancelError = 'Notification could not be cancelled.';
			}
		} catch {
			cancelError = 'Notification could not be cancelled. Check the connection and retry.';
		} finally {
			cancellationSubmitting = false;
		}
	}
</script>

{#if toastMessage}
	<AdminToast message={toastMessage} type="success" onclose={() => (toastMessage = null)} />
{/if}

<AdminListLayout
	title="Notifications"
	kicker="Services"
	loading={false}
	query={data.filters.query}
	bind:showFilters
	{hasActiveFilters}
	metrics={[
		{
			label: 'Total Logs',
			value: data.logs.total,
			description: `${healthyPercent}% healthy`
		},
		{ label: 'Sent', value: byStatus.sent ?? 0, tone: 'success' },
		{ label: 'Failed', value: byStatus.failed ?? 0, tone: 'danger' },
		{
			label: 'Pending / Processing',
			value: (byStatus.pending ?? 0) + (byStatus.processing ?? 0),
			tone: 'warning'
		},
		{ label: 'Cancelled', value: byStatus.cancelled ?? 0 }
	]}
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
	{#snippet advancedFilters()}
		<AdminFilterBar cols={3}>
			<AdminSelect
				label="Status"
				name="status"
				value={data.filters.status}
				options={[
					{ value: '', label: 'All Statuses' },
					{ value: 'sent', label: 'Sent' },
					{ value: 'failed', label: 'Failed' },
					{ value: 'pending', label: 'Pending' },
					{ value: 'processing', label: 'Processing' },
					{ value: 'cancelled', label: 'Cancelled' }
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
		</AdminFilterBar>
	{/snippet}

	{#snippet card(log: NotificationLog)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<Mail size={12} class={log.channel === 'email' ? 'text-volt' : 'hidden'} />
							<MessageSquare
								size={12}
								class={log.channel === 'email' ? 'hidden' : 'text-sky-400'}
							/>
							<span
								class="font-mono text-[8px] tracking-widest uppercase {log.channel === 'email'
									? 'text-ash'
									: 'text-sky-400'}">{log.channel === 'email' ? 'Email' : 'SMS'}</span
							>
						</div>
						<p class="mt-1.5 truncate font-mono text-xs text-bone">{log.recipient}</p>
					</div>
					<AdminBadge variant={notificationStatusVariant(log.status)}>
						{formatAdminStatus(log.status)}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<AdminMetaGrid>
					<div>
						<p class="text-ash/60">Type</p>
						<p class="mt-0.5 text-bone capitalize">{formatAdminStatus(log.type)}</p>
					</div>
					<div>
						<p class="text-ash/60">Attempts</p>
						<p class="mt-0.5 text-bone">
							{log.attemptCount} / {log.maxAttempts}
						</p>
					</div>
					<div class="min-[430px]:col-span-2">
						<p class="text-ash/60">Created</p>
						<p class="mt-0.5 text-bone">{formatAdminDateTime(log.createdAt, '—')}</p>
					</div>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<AdminButton type="button" variant="outline" size="sm" onclick={() => openDetails(log)}>
					<Eye size={14} /> View Details
				</AdminButton>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(log: NotificationLog)}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<!-- Channel -->
			<td class="px-5 py-4">
				<div class="flex items-center gap-2">
					<Mail size={14} class={log.channel === 'email' ? 'text-volt' : 'hidden'} />
					<MessageSquare size={14} class={log.channel === 'email' ? 'hidden' : 'text-sky-400'} />
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase">
						{log.channel === 'email' ? 'Email' : 'SMS'}
					</span>
				</div>
			</td>

			<!-- Recipient -->
			<td class="px-5 py-4">
				<span class="font-mono text-xs text-bone">{log.recipient}</span>
			</td>

			<!-- Type -->
			<td class="px-5 py-4">
				<span class="font-mono text-[10px] tracking-wider text-bone capitalize">
					{formatAdminStatus(log.type)}
				</span>
			</td>

			<!-- Status Badge -->
			<td class="px-5 py-4">
				<AdminBadge variant={notificationStatusVariant(log.status)}>
					{formatAdminStatus(log.status)}
				</AdminBadge>
			</td>

			<!-- Attempts -->
			<td class="px-5 py-4 font-mono text-xs text-ash">
				{log.attemptCount} / {log.maxAttempts}
			</td>

			<!-- Date -->
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{formatAdminDateTime(log.createdAt, '—')}
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<AdminIconAction
					onclick={() => openDetails(log)}
					variant="neutral"
					title="View details"
					ariaLabel={`View notification ${log.id}`}
				>
					<Eye size={14} />
				</AdminIconAction>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState
			title="No notifications found"
			description="Adjust filters or query parameters."
		/>
	{/snippet}
</AdminListLayout>

<AdminDrawer
	bind:open={detailOpen}
	title="Notification Log"
	description="Inspect delivery state, payload, and retry metadata."
	onOpenChange={(open) => {
		if (!open) closeDetails();
	}}
>
	{#if selectedLog}
		<p class="mb-5 font-mono text-[10px] break-all text-ash">ID: {selectedLog.id}</p>
		<div class="space-y-6">
			<AdminNotificationPreview
				channel={selectedLog.channel}
				type={selectedLog.type}
				payload={selectedLog.payload}
				recipient={selectedLog.recipient}
				provider={selectedLog.provider}
			/>

			<AdminMetaGrid>
				<div>
					<p class="text-ash/60">Status</p>
					<AdminBadge variant={notificationStatusVariant(selectedLog.status)}>
						{formatAdminStatus(selectedLog.status)}
					</AdminBadge>
				</div>
				<div>
					<p class="text-ash/60">Template Type</p>
					<p class="mt-0.5 truncate text-bone capitalize">{formatAdminStatus(selectedLog.type)}</p>
				</div>
				<div>
					<p class="text-ash/60">Delivery Attempts</p>
					<p class="mt-0.5 text-bone">
						{selectedLog.attemptCount} / {selectedLog.maxAttempts}
					</p>
				</div>
				<div>
					<p class="text-ash/60">Idempotency Key</p>
					<p class="mt-0.5 truncate text-bone" title={selectedLog.idempotencyKey}>
						{selectedLog.idempotencyKey}
					</p>
				</div>
			</AdminMetaGrid>

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
							Locked by worker <strong>{selectedLog.lockedBy || 'unknown'}</strong> at {formatAdminDateTime(
								selectedLog.lockedAt,
								'—'
							)}.
						</p>
					</div>
				</div>
			{/if}

			<AdminJsonViewer
				value={selectedLog}
				label="Raw JSON payload and metadata"
				copyLabel="Copy raw data"
			/>

			{#if cancelError}
				<p
					class="border border-red-400/30 bg-red-950/20 p-3 font-sans text-sm text-red-300"
					role="alert"
				>
					{cancelError}
				</p>
			{/if}

			<!-- Actions block (Cancel Notification) -->
			{#if selectedLog.status !== 'sent' && selectedLog.status !== 'cancelled'}
				<div
					class="grid gap-3 border-t border-charcoal pt-4 sm:flex sm:items-center sm:justify-between"
				>
					<div class="flex items-center gap-2 font-mono text-[9px] text-ash">
						<Info size={12} class="text-amber-400" />
						<span>Cancelling stops retries and marks log as cancelled.</span>
					</div>

					<AdminButton
						type="button"
						variant="danger"
						disabled={cancellationSubmitting}
						onclick={() => (cancelConfirmOpen = true)}
					>
						Cancel Notification
					</AdminButton>
				</div>
			{/if}
		</div>
	{/if}
</AdminDrawer>

<AdminConfirmDialog
	bind:open={cancelConfirmOpen}
	title="Cancel notification"
	message="Stop future delivery attempts and mark this notification as cancelled?"
	confirmLabel="Cancel notification"
	loading={cancellationSubmitting}
	onconfirm={handleCancel}
/>
