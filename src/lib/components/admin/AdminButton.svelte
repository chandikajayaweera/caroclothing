<script lang="ts">
	import { Button } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		type = 'button',
		variant = 'volt',
		size = 'md',
		disabled = false,
		href,
		onclick,
		class: className = '',
		children,
		...rest
	}: {
		type?: 'button' | 'submit';
		variant?: 'volt' | 'charcoal' | 'outline' | 'danger';
		size?: 'sm' | 'md' | 'lg' | 'icon';
		disabled?: boolean;
		href?: string;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		children: Snippet;
		[key: string]: any;
	} = $props();

	// Style Maps
	const variantClasses = {
		volt: 'bg-volt text-void hover:bg-bone focus-visible:ring-volt',
		charcoal:
			'bg-charcoal text-bone hover:bg-ash/20 border border-charcoal hover:border-ash/30 focus-visible:ring-ash',
		outline:
			'border border-ash/30 bg-void text-bone hover:border-volt hover:text-volt focus-visible:ring-volt',
		danger:
			'border border-red-500/20 text-red-400 hover:border-red-400 hover:text-red-300 hover:bg-red-500/10 focus-visible:ring-red-400'
	};

	const sizeClasses = {
		sm: 'min-h-9 px-3 py-1.5 text-xs font-sans font-medium',
		md: 'min-h-11 px-5 py-3 text-xs tracking-widest font-mono uppercase font-bold',
		lg: 'min-h-12 px-6 py-3.5 text-sm tracking-widest font-mono uppercase font-bold',
		icon: 'min-h-0 h-7 w-7 p-0 flex-shrink-0'
	};

	const baseClasses =
		'inline-flex items-center justify-center gap-2 text-center transition-all duration-100 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:cursor-not-allowed disabled:opacity-40';

	const combinedClasses = $derived(
		`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
	);
</script>

{#if href}
	<Button.Root {href} {disabled} {onclick} class={combinedClasses} {...rest}>
		{@render children()}
	</Button.Root>
{:else}
	<Button.Root {type} {disabled} {onclick} class={combinedClasses} {...rest}>
		{@render children()}
	</Button.Root>
{/if}
