<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Clipboard, TriangleAlert } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';

	let {
		value,
		label = 'Copy',
		copiedLabel = 'Copied',
		variant = 'outline',
		size = 'sm',
		class: className = ''
	}: {
		value: string;
		label?: string;
		copiedLabel?: string;
		variant?: 'volt' | 'charcoal' | 'outline' | 'danger';
		size?: 'sm' | 'md' | 'lg' | 'icon';
		class?: string;
	} = $props();

	let state = $state<'idle' | 'copied' | 'error'>('idle');
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function copyValue() {
		if (timer) clearTimeout(timer);
		try {
			await navigator.clipboard.writeText(value);
			state = 'copied';
		} catch {
			state = 'error';
		}
		timer = setTimeout(() => (state = 'idle'), 2200);
	}

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<AdminButton type="button" {variant} {size} class={className} onclick={copyValue}>
	{#if state === 'copied'}
		<Check size={14} aria-hidden="true" />
		{copiedLabel}
	{:else if state === 'error'}
		<TriangleAlert size={14} aria-hidden="true" />
		Copy failed
	{:else}
		<Clipboard size={14} aria-hidden="true" />
		{label}
	{/if}
</AdminButton>
<span class="sr-only" aria-live="polite">
	{state === 'copied' ? copiedLabel : state === 'error' ? 'Copy failed' : ''}
</span>
