<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		cols = 3,
		ariaLabel,
		children
	}: {
		cols?: number;
		ariaLabel?: string;
		children: Snippet;
	} = $props();

	const colClasses = {
		2: 'grid-cols-2',
		3: 'grid-cols-3',
		4: 'grid-cols-4'
	};

	const combinedClasses = $derived(`grid gap-2 ${colClasses[cols as 2 | 3 | 4]}`);
</script>

<div class={combinedClasses} role="group" aria-label={ariaLabel}>
	{@render children()}
</div>
