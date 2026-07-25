<script lang="ts">
	import AdminCopyButton from './AdminCopyButton.svelte';

	let {
		value,
		label = 'JSON payload',
		copyLabel = 'Copy JSON',
		maxHeight = 'max-h-80'
	}: {
		value: unknown;
		label?: string;
		copyLabel?: string;
		maxHeight?: string;
	} = $props();

	const formatted = $derived(JSON.stringify(value, null, 2));
</script>

<section class="min-w-0 overflow-hidden border border-ash/15 bg-void" aria-label={label}>
	<div class="flex flex-wrap items-center justify-between gap-2 border-b border-ash/10 p-3">
		<h3 class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">{label}</h3>
		<AdminCopyButton value={formatted} label={copyLabel} copiedLabel="Copied" size="sm" />
	</div>
	<pre
		class="{maxHeight} overflow-auto overscroll-contain p-3 font-mono text-[10px] leading-relaxed whitespace-pre text-ash"><code
			>{formatted}</code
		></pre>
</section>
