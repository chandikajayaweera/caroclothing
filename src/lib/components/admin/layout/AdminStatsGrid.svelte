<script lang="ts">
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';

	let {
		stats,
		metrics,
		loading = false
	}: {
		stats?: { total: number; active: number; inactive: number };
		metrics?: Array<{
			label: string;
			value: string | number;
			description?: string;
			tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
		}>;
		loading?: boolean;
	} = $props();

	const displayMetrics = $derived(
		metrics ??
			(stats
				? [
						{ label: 'Total', value: stats.total, tone: 'neutral' as const },
						{ label: 'Active', value: stats.active, tone: 'accent' as const },
						{ label: 'Inactive', value: stats.inactive, tone: 'neutral' as const }
					]
				: [])
	);

	const toneClasses = {
		neutral: 'text-bone',
		accent: 'text-volt',
		success: 'text-emerald-300',
		warning: 'text-amber-300',
		danger: 'text-red-300',
		info: 'text-sky-300'
	};

	const skeletonCount = $derived(metrics?.length ?? 3);
	const metricCount = $derived(
		loading || displayMetrics.length === 0 ? skeletonCount : displayMetrics.length
	);
	const columnClasses = $derived.by(() => {
		if (metricCount <= 1) return 'grid-cols-1';
		if (metricCount === 2) return 'grid-cols-2';
		if (metricCount === 3) return 'grid-cols-2 md:grid-cols-3';
		if (metricCount === 4) return 'grid-cols-2 lg:grid-cols-4';
		if (metricCount === 5) return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5';
		return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6';
	});
</script>

<div class="mt-6 grid gap-2 sm:gap-3 {columnClasses}">
	{#if loading || displayMetrics.length === 0}
		{#each Array.from({ length: skeletonCount }, (_, index) => index) as index (index)}
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<div class="h-2.5 w-16 animate-pulse bg-ash/10"></div>
				<div class="mt-3 h-8 w-12 animate-pulse bg-ash/10"></div>
			</AdminCard>
		{/each}
	{:else}
		{#each displayMetrics as metric (metric.label)}
			<AdminCard class="min-w-0" padding="p-3 sm:p-5">
				<p
					class="font-mono text-[8px] tracking-[0.08em] wrap-break-word text-ash uppercase sm:text-[9px] sm:tracking-[0.2em]"
				>
					{metric.label}
				</p>
				<p
					class="mt-2 font-display text-3xl leading-none wrap-break-word uppercase sm:text-4xl {toneClasses[
						metric.tone ?? 'neutral'
					]}"
				>
					{metric.value}
				</p>
				{#if metric.description}
					<p class="mt-2 font-sans text-[11px] leading-relaxed text-ash/70">
						{metric.description}
					</p>
				{/if}
			</AdminCard>
		{/each}
	{/if}
</div>
