<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'neutral',
		size = 'sm',
		class: className = '',
		children
	}: {
		variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';
		size?: 'xs' | 'sm';
		class?: string;
		children: Snippet;
	} = $props();

	const variantClasses = {
		success: 'border-volt/20 bg-volt/10 text-volt',
		accent: 'border-volt bg-volt/5 text-volt',
		warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
		danger: 'border-red-500/20 bg-red-500/10 text-red-400',
		info: 'border-sky-500/30 bg-sky-500/5 text-sky-400',
		neutral: 'border-charcoal bg-void text-ash/60'
	};

	const sizeClasses = {
		xs: 'px-1.5 py-0.5 text-[8px] font-semibold tracking-wider',
		sm: 'px-2 py-0.5 text-[9px] tracking-widest'
	};

	const baseClasses =
		'border inline-flex items-center justify-center font-mono uppercase font-medium';

	const combinedClasses = $derived(
		`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
	);
</script>

<span class={combinedClasses}>
	{@render children()}
</span>
