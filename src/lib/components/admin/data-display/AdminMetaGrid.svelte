<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		cols = 2,
		class: className = '',
		children
	}: {
		cols?: number;
		class?: string;
		children: Snippet;
	} = $props();

	const colClasses = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 min-[430px]:grid-cols-2',
		3: 'grid-cols-1 min-[430px]:grid-cols-3',
		4: 'grid-cols-1 min-[430px]:grid-cols-2 md:grid-cols-4'
	};

	const combinedClasses = $derived(
		`mt-3 grid min-w-0 gap-x-3 gap-y-2 wrap-break-word font-mono text-[10px] uppercase ${colClasses[cols as 1 | 2 | 3 | 4]} ${className}`
	);
</script>

<div class={combinedClasses}>
	{@render children()}
</div>
