<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		size = 'normal',
		spacing = 'normal',
		class: className = '',
		children
	}: {
		size?: 'normal' | 'wide' | 'full';
		spacing?: 'normal' | 'compact';
		class?: string;
		children: Snippet;
	} = $props();

	const sizeClasses = {
		normal: 'max-w-7xl',
		wide: 'max-w-[1440px]',
		full: 'max-w-full'
	};

	const spacingClasses = {
		normal: 'pb-24 lg:pb-10',
		compact: 'pb-12 lg:pb-6'
	};

	const combinedClasses = $derived(
		`mx-auto w-full ${sizeClasses[size]} ${spacingClasses[spacing]} ${className}`
	);
</script>

<div class={combinedClasses}>
	{@render children()}
</div>
