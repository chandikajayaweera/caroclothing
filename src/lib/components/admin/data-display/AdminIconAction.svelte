<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';

	let {
		type = 'button',
		href,
		variant = 'neutral',
		disabled = false,
		onclick,
		title,
		ariaLabel,
		children
	}: {
		type?: 'button' | 'submit';
		href?: string;
		variant?: 'success' | 'danger' | 'neutral' | 'accent' | 'warning' | 'info';
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		title?: string;
		ariaLabel?: string;
		children: Snippet;
	} = $props();

	const variantClasses = {
		success: 'border border-volt/40 bg-volt/10 text-volt hover:bg-volt hover:text-void',
		accent: 'border border-volt/40 text-volt hover:bg-volt hover:text-void',
		danger: 'border border-red-400/40 text-red-300 hover:bg-red-400 hover:text-void',
		neutral: 'border border-ash/30 text-bone hover:border-volt hover:text-volt',
		warning:
			'border border-amber-300/50 bg-amber-300/10 text-amber-300 hover:bg-amber-300 hover:text-void',
		info: 'border border-sky-300/50 bg-sky-300/10 text-sky-300 hover:bg-sky-300 hover:text-void'
	};

	const baseClasses =
		'grid h-11 w-full place-items-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:cursor-not-allowed disabled:opacity-40 sm:h-10';

	const combinedClasses = $derived(`${baseClasses} ${variantClasses[variant]}`);
</script>

{#if href}
	<a href={resolve(href as '/')} class={combinedClasses} aria-label={ariaLabel} {title}>
		{@render children()}
	</a>
{:else}
	<button {type} {disabled} {onclick} class={combinedClasses} aria-label={ariaLabel} {title}>
		{@render children()}
	</button>
{/if}
