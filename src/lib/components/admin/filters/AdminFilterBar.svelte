<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		cols = 3,
		class: className = '',
		children
	}: {
		cols?: number;
		class?: string;
		children: Snippet;
	} = $props();

	const colClasses = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 md:grid-cols-2',
		3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
		4: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
	};

	const combinedClasses = $derived(`grid gap-4 ${colClasses[cols as 1 | 2 | 3 | 4]} ${className}`);
</script>

<div class={combinedClasses}>
	{@render children()}
</div>
