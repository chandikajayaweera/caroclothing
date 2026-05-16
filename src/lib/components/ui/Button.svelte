<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';

	interface Props {
		children: Snippet;
		variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
		class?: string;
		href?: string;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (e: MouseEvent) => void;
		[key: string]: any;
	}

	let {
		children,
		variant = 'primary',
		class: className = '',
		href = undefined,
		disabled = false,
		type = 'button',
		onclick,
		...rest
	}: Props = $props();

	const baseClasses =
		'inline-block font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-200 rounded-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none text-center';

	const variantClasses: Record<string, string> = {
		primary: 'bg-volt text-void px-5 py-3.5 hover:bg-bone',
		secondary: 'border border-ash text-ash px-5 py-3.5 hover:border-volt hover:text-volt',
		outline: 'border border-ash text-ash px-5 py-3.5 hover:border-volt hover:text-volt',
		ghost: 'text-ash hover:text-volt p-2'
	};

	let combinedClasses = $derived(
		`${baseClasses} ${variantClasses[variant] || variantClasses.primary} ${className}`
	);
</script>

{#if href}
	<a {href} class={combinedClasses} {...rest as HTMLAnchorAttributes}>
		{@render children()}
	</a>
{:else}
	<button {type} {disabled} {onclick} class={combinedClasses} {...rest as HTMLButtonAttributes}>
		{@render children()}
	</button>
{/if}
