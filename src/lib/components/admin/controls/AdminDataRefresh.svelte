<script lang="ts">
	import { onMount } from 'svelte';
	import { Radio, RefreshCw } from 'lucide-svelte';
	import AdminButton from './AdminButton.svelte';

	let {
		enabled = $bindable(true),
		refreshing = false,
		intervalMs = 30_000,
		lastRefreshedAt,
		label = 'data',
		onrefresh
	}: {
		enabled?: boolean;
		refreshing?: boolean;
		intervalMs?: number;
		lastRefreshedAt: Date | string | number;
		label?: string;
		onrefresh: () => Promise<void> | void;
	} = $props();

	const intervalSeconds = $derived(Math.max(1, Math.round(intervalMs / 1000)));

	onMount(() => {
		const interval = window.setInterval(() => {
			if (enabled && document.visibilityState === 'visible') {
				void onrefresh();
			}
		}, intervalMs);

		return () => window.clearInterval(interval);
	});

	function formatRefreshTime(value: Date | string | number): string {
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return 'Not synced';

		return new Intl.DateTimeFormat('en-LK', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		}).format(date);
	}

	async function toggleAutoRefresh(): Promise<void> {
		enabled = !enabled;
		if (enabled) await onrefresh();
	}
</script>

<div
	class="flex w-full min-w-0 items-center justify-between gap-2 border border-ash/20 bg-void p-1.5 sm:w-fit"
	aria-label={`${label} refresh controls`}
>
	<div
		class="grid shrink-0 gap-0 px-1 min-[430px]:flex min-[430px]:items-center min-[430px]:gap-1.5 sm:px-2"
		aria-live="polite"
	>
		<p class="shrink-0 font-mono text-[8px] tracking-widest text-ash/55 uppercase">Synced</p>
		<p class="font-mono text-[9px] whitespace-nowrap text-bone">
			{refreshing ? 'Refreshing…' : formatRefreshTime(lastRefreshedAt)}
		</p>
	</div>

	<div class="flex min-w-0 items-center gap-1.5">
		<AdminButton
			type="button"
			variant={enabled ? 'charcoal' : 'outline'}
			size="sm"
			aria-pressed={enabled}
			onclick={toggleAutoRefresh}
			class={enabled ? 'border-volt/40 text-volt' : ''}
		>
			<Radio size={14} class={enabled ? 'animate-pulse' : ''} aria-hidden="true" />
			<span>{enabled ? `Auto ${intervalSeconds}s` : 'Auto off'}</span>
		</AdminButton>

		<AdminButton
			type="button"
			variant="outline"
			size="icon"
			disabled={refreshing}
			onclick={onrefresh}
			aria-label={`Refresh ${label} now`}
			title={`Refresh ${label} now`}
		>
			<RefreshCw size={15} class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
		</AdminButton>
	</div>
</div>
